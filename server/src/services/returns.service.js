'use strict';

const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const inventory = require('./inventory.service');
const settlement = require('./settlement.service');
const notification = require('./notification.service');
const { nextDocNumber } = require('../utils/numbering');
const { toNumber } = require('../utils/money');

const RETURN_INCLUDE = {
  items: { include: { product: true, packagingUnit: true } },
  customer: true,
  salesRep: { include: { user: { select: { id: true, name: true } } } },
  warehouse: true,
  processedBy: { select: { id: true, name: true } },
};

async function createReturn(payload, actor) {
  const { type, customerId, salesRepId, settlementId, warehouseId, saleId, items, reason, notes, processedAt } =
    payload;

  if (!items || items.length === 0) {
    throw ApiError.badRequest('A return must contain at least one item');
  }

  // Validate endpoints per return type.
  if (type === 'CUSTOMER_RETURN' && !salesRepId && !warehouseId) {
    throw ApiError.badRequest('A customer return needs a destination: salesRepId or warehouseId');
  }
  if (type === 'SALES_RETURN' && (!salesRepId || !warehouseId)) {
    throw ApiError.badRequest('A sales return needs both salesRepId (from) and warehouseId (to)');
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const productIds = [...new Set(items.map((i) => i.productId))];
      const products = await tx.product.findMany({ where: { id: { in: productIds } } });
      const productMap = new Map(products.map((p) => [p.id, p]));
      if (productMap.size !== productIds.length) {
        throw ApiError.badRequest('One or more products were not found');
      }

      const lines = [];
      for (const input of items) {
        const { baseQuantity } = await inventory.convertToBase(
          tx,
          input.productId,
          input.packagingUnitId,
          input.quantity,
        );
        const product = productMap.get(input.productId);
        lines.push({
          productId: input.productId,
          packagingUnitId: input.packagingUnitId,
          quantity: input.quantity,
          baseQuantity,
          condition: input.condition || 'GOOD',
          unitPrice: toNumber(product.sellingPrice),
          unitCost: toNumber(product.purchasePrice),
        });
      }

      // A return tied to an order must reconcile against THAT order: only
      // products that were issued on the request, and never more than the boxes
      // still outstanding (issued − settled − already returned). This stops a rep
      // returning products they weren't issued, more than they received, or items
      // belonging to another request.
      if (settlementId) {
        const stl = await tx.settlement.findUnique({
          where: { id: settlementId },
          select: { status: true, transferId: true, salesRepId: true, settlementNumber: true },
        });
        if (!stl) throw ApiError.badRequest('The order for this return was not found');
        if (stl.status === 'SETTLED') throw ApiError.badRequest('This order is already closed');
        if (salesRepId && stl.salesRepId !== salesRepId) {
          throw ApiError.badRequest("This return does not belong to the order's sales rep");
        }
        const transfer = stl.transferId
          ? await tx.stockTransfer.findUnique({ where: { id: stl.transferId }, include: { items: true } })
          : null;
        const issuedMap = new Map();
        (transfer?.items || []).forEach((it) => issuedMap.set(it.productId, (issuedMap.get(it.productId) || 0) + it.baseQuantity));
        const [settledRows, retRows] = await Promise.all([
          tx.saleItem.groupBy({ by: ['productId'], where: { sale: { settlementId, status: { not: 'CANCELLED' } } }, _sum: { baseQuantity: true } }),
          tx.returnItem.groupBy({ by: ['productId'], where: { return: { settlementId } }, _sum: { baseQuantity: true } }),
        ]);
        const settledMap = new Map(settledRows.map((r) => [r.productId, r._sum.baseQuantity || 0]));
        const retMap = new Map(retRows.map((r) => [r.productId, r._sum.baseQuantity || 0]));
        for (const l of lines) {
          const name = productMap.get(l.productId)?.name || 'This product';
          const issued = issuedMap.get(l.productId) || 0;
          if (issued === 0) {
            throw ApiError.badRequest(`${name} was not issued on order ${stl.settlementNumber} — it can't be returned here`);
          }
          const remaining = issued - (settledMap.get(l.productId) || 0) - (retMap.get(l.productId) || 0);
          if (l.baseQuantity > remaining) {
            throw ApiError.badRequest(`Only ${remaining} box(es) of ${name} remain to return on order ${stl.settlementNumber}`);
          }
        }
      }

      const returnNumber = await nextDocNumber(tx.return, 'returnNumber', 'RET');

      const ret = await tx.return.create({
        data: {
          returnNumber,
          type,
          status: 'COMPLETED',
          customerId: customerId || null,
          salesRepId: salesRepId || null,
          settlementId: settlementId || null,
          warehouseId: warehouseId || null,
          reason: reason || null,
          notes: notes || null,
          processedAt: processedAt ? new Date(processedAt) : new Date(),
          processedById: actor ? actor.id : null,
          items: {
            create: lines.map((l) => ({
              productId: l.productId,
              packagingUnitId: l.packagingUnitId,
              quantity: l.quantity,
              baseQuantity: l.baseQuantity,
              condition: l.condition,
              unitPrice: l.unitPrice,
            })),
          },
        },
      });

      const commonRef = { referenceType: 'RETURN', referenceId: ret.id, userId: actor ? actor.id : null };

      for (const l of lines) {
        if (type === 'CUSTOMER_RETURN') {
          // Goods come back into a rep's or warehouse's stock.
          const dest = salesRepId
            ? { type: inventory.LOCATION.SALES_REP, salesRepId }
            : { type: inventory.LOCATION.WAREHOUSE, warehouseId };

          await inventory.increaseStock(tx, {
            ...commonRef,
            productId: l.productId,
            packagingUnitId: l.packagingUnitId,
            quantity: l.quantity,
            baseQuantity: l.baseQuantity,
            type: 'CUSTOMER_RETURN',
            location: dest,
            unitCost: l.unitCost,
            notes: `Customer return ${returnNumber}`,
            occurredAt: ret.processedAt,
          });

          // Damaged goods are written off immediately (not resellable).
          if (l.condition === 'DAMAGED') {
            await inventory.decreaseStock(tx, {
              ...commonRef,
              productId: l.productId,
              packagingUnitId: l.packagingUnitId,
              quantity: l.quantity,
              baseQuantity: l.baseQuantity,
              type: 'DAMAGE',
              location: dest,
              unitCost: l.unitCost,
              notes: `Damaged on return ${returnNumber}`,
              occurredAt: ret.processedAt,
            });
          }
        } else {
          // SALES_RETURN: rep -> warehouse.
          await inventory.transferStock(tx, {
            productId: l.productId,
            packagingUnitId: l.packagingUnitId,
            quantity: l.quantity,
            baseQuantity: l.baseQuantity,
            from: { type: inventory.LOCATION.SALES_REP, salesRepId },
            to: { type: inventory.LOCATION.WAREHOUSE, warehouseId },
            outType: 'SALES_RETURN', // leaves the rep
            inType: 'TRANSFER_IN', // arrives at the warehouse (inbound)
            ...commonRef,
            unitCost: l.unitCost,
            notes: `Sales return ${returnNumber}`,
            occurredAt: ret.processedAt,
          });

          if (l.condition === 'DAMAGED') {
            await inventory.decreaseStock(tx, {
              ...commonRef,
              productId: l.productId,
              packagingUnitId: l.packagingUnitId,
              quantity: l.quantity,
              baseQuantity: l.baseQuantity,
              type: 'DAMAGE',
              location: { type: inventory.LOCATION.WAREHOUSE, warehouseId },
              unitCost: l.unitCost,
              notes: `Damaged on sales return ${returnNumber}`,
              occurredAt: ret.processedAt,
            });
          }
        }
      }

      // Keep the linked order in sync: a return reduces the outstanding balance
      // and auto-closes the order once every issued box is settled or returned.
      if (settlementId) {
        await settlement.recomputeStatus(tx, settlementId);
      }

      return tx.return.findUnique({ where: { id: ret.id }, include: RETURN_INCLUDE });
    },
    { timeout: 30000 },
  );

  if (payload.type === 'SALES_RETURN') {
    const totalBoxes = (result.items || []).reduce((s, i) => s + i.quantity, 0);
    const repName = result.salesRep?.user?.name || 'A rep';
    const repUserId = result.salesRep?.user?.id;
    notification.notifyAdmins({
      type: 'GENERAL',
      severity: 'INFO',
      title: `Return received: ${result.returnNumber}`,
      message: `${repName} returned ${totalBoxes} box(es) to the warehouse (${result.returnNumber}).`,
      entityType: 'Return',
      entityId: result.id,
    }).catch(() => {});
    notification.notifyUser(repUserId, {
      type: 'GENERAL',
      severity: 'INFO',
      title: 'Return confirmed',
      message: `Your return of ${totalBoxes} box(es) has been confirmed (${result.returnNumber}).`,
      entityType: 'Return',
      entityId: result.id,
    }).catch(() => {});
  }

  return result;
}

async function listReturns(filters, pagination) {
  const where = {};
  if (filters.type) where.type = filters.type;
  if (filters.status) where.status = filters.status;
  if (filters.salesRepId) where.salesRepId = filters.salesRepId;
  if (filters.warehouseId) where.warehouseId = filters.warehouseId;
  if (filters.from || filters.to) {
    where.processedAt = {};
    if (filters.from) where.processedAt.gte = new Date(filters.from);
    if (filters.to) where.processedAt.lte = new Date(filters.to);
  }

  const [items, total] = await Promise.all([
    prisma.return.findMany({
      where,
      include: RETURN_INCLUDE,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: pagination.orderBy,
    }),
    prisma.return.count({ where }),
  ]);
  return { items, total };
}

async function getReturn(id) {
  const ret = await prisma.return.findUnique({ where: { id }, include: RETURN_INCLUDE });
  if (!ret) throw ApiError.notFound('Return not found');
  return ret;
}

module.exports = { createReturn, listReturns, getReturn, RETURN_INCLUDE };
