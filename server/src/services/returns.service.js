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
  decidedBy: { select: { id: true, name: true } },
};

// ── Shared validation helpers ────────────────────────────────────────────────

// Validate that the items being returned are legal for a settlement-linked
// return: the products must have been issued on that order and the quantities
// must not exceed what is still outstanding (issued − settled − returned).
// `client` is either prisma or a transaction client.
async function validateSettlementLines(client, settlementId, salesRepId, lines, productMap) {
  const stl = await client.settlement.findUnique({
    where: { id: settlementId },
    select: { status: true, transferId: true, salesRepId: true, settlementNumber: true },
  });
  if (!stl) throw ApiError.badRequest('The order for this return was not found');
  if (stl.status === 'SETTLED') throw ApiError.badRequest('This order is already closed');
  if (salesRepId && stl.salesRepId !== salesRepId) {
    throw ApiError.badRequest("This return does not belong to the order's sales rep");
  }

  const transfer = stl.transferId
    ? await client.stockTransfer.findUnique({ where: { id: stl.transferId }, include: { items: true } })
    : null;
  const issuedMap = new Map();
  (transfer?.items || []).forEach((it) => issuedMap.set(it.productId, (issuedMap.get(it.productId) || 0) + it.baseQuantity));

  const [settledRows, retRows] = await Promise.all([
    client.saleItem.groupBy({ by: ['productId'], where: { sale: { settlementId, status: { not: 'CANCELLED' } } }, _sum: { baseQuantity: true } }),
    // Count only APPROVED + COMPLETED returns (PENDING returns don't yet affect the balance).
    client.returnItem.groupBy({ by: ['productId'], where: { return: { settlementId, status: { in: ['APPROVED', 'COMPLETED'] } } }, _sum: { baseQuantity: true } }),
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

// ── Create (PENDING — no inventory moves yet) ─────────────────────────────────

async function createReturn(payload, actor) {
  const { type, customerId, salesRepId, settlementId, warehouseId, items, reason, notes, processedAt } = payload;

  if (!items || items.length === 0) {
    throw ApiError.badRequest('A return must contain at least one item');
  }
  if (type === 'CUSTOMER_RETURN' && !salesRepId && !warehouseId) {
    throw ApiError.badRequest('A customer return needs a destination: salesRepId or warehouseId');
  }
  if (type === 'SALES_RETURN' && (!salesRepId || !warehouseId)) {
    throw ApiError.badRequest('A sales return needs both salesRepId (from) and warehouseId (to)');
  }

  const result = await prisma.$transaction(async (tx) => {
    const productIds = [...new Set(items.map((i) => i.productId))];
    const products = await tx.product.findMany({ where: { id: { in: productIds } } });
    const productMap = new Map(products.map((p) => [p.id, p]));
    if (productMap.size !== productIds.length) {
      throw ApiError.badRequest('One or more products were not found');
    }

    const lines = [];
    for (const input of items) {
      const { baseQuantity } = await inventory.convertToBase(tx, input.productId, input.packagingUnitId, input.quantity);
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

    // Validate settlement-linked returns (quantities + ownership).
    if (settlementId) {
      await validateSettlementLines(tx, settlementId, salesRepId, lines, productMap);
    }

    const returnNumber = await nextDocNumber(tx.return, 'returnNumber', 'RET');
    const ret = await tx.return.create({
      data: {
        returnNumber,
        type,
        status: 'PENDING',
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
      include: RETURN_INCLUDE,
    });
    return ret;
  }, { timeout: 30000 });

  // Notify admins and warehouse staff that a return needs approval.
  const submitterName = result.salesRep?.user?.name || actor?.name || 'A rep';
  const totalBoxes = (result.items || []).reduce((s, i) => s + i.quantity, 0);
  const itemList = result.items.map((i) => `${i.product?.name} × ${i.quantity}`).join(', ');
  notification.notifyAdmins({
    type: 'GENERAL',
    severity: 'INFO',
    title: 'Return approval required',
    message: `${submitterName} submitted a return of ${totalBoxes} box(es): ${itemList}. Please verify and approve.`,
    entityType: 'Return',
    entityId: result.id,
  }).catch(() => {});

  return result;
}

// ── Approve — execute inventory moves and close settlement if possible ────────

async function approveReturn(id, actor) {
  const ret = await prisma.return.findUnique({ where: { id }, include: RETURN_INCLUDE });
  if (!ret) throw ApiError.notFound('Return not found');
  if (ret.status !== 'PENDING') throw ApiError.badRequest(`Cannot approve a return with status ${ret.status}`);

  await prisma.$transaction(async (tx) => {
    const commonRef = { referenceType: 'RETURN', referenceId: ret.id, userId: actor ? actor.id : null };

    for (const l of ret.items) {
      const line = {
        productId: l.productId,
        packagingUnitId: l.packagingUnitId,
        quantity: l.quantity,
        baseQuantity: l.baseQuantity,
        condition: l.condition,
        unitCost: toNumber(l.product?.purchasePrice ?? 0),
      };

      if (ret.type === 'CUSTOMER_RETURN') {
        const dest = ret.salesRepId
          ? { type: inventory.LOCATION.SALES_REP, salesRepId: ret.salesRepId }
          : { type: inventory.LOCATION.WAREHOUSE, warehouseId: ret.warehouseId };

        await inventory.increaseStock(tx, {
          ...commonRef,
          productId: line.productId,
          packagingUnitId: line.packagingUnitId,
          quantity: line.quantity,
          baseQuantity: line.baseQuantity,
          type: 'CUSTOMER_RETURN',
          location: dest,
          unitCost: line.unitCost,
          notes: `Customer return ${ret.returnNumber}`,
          occurredAt: ret.processedAt,
        });

        if (line.condition === 'DAMAGED') {
          await inventory.decreaseStock(tx, {
            ...commonRef,
            productId: line.productId,
            packagingUnitId: line.packagingUnitId,
            quantity: line.quantity,
            baseQuantity: line.baseQuantity,
            type: 'DAMAGE',
            location: dest,
            unitCost: line.unitCost,
            notes: `Damaged on return ${ret.returnNumber}`,
            occurredAt: ret.processedAt,
          });
        }
      } else {
        // SALES_RETURN: rep → warehouse
        await inventory.transferStock(tx, {
          productId: line.productId,
          packagingUnitId: line.packagingUnitId,
          quantity: line.quantity,
          baseQuantity: line.baseQuantity,
          from: { type: inventory.LOCATION.SALES_REP, salesRepId: ret.salesRepId },
          to: { type: inventory.LOCATION.WAREHOUSE, warehouseId: ret.warehouseId },
          outType: 'SALES_RETURN',
          inType: 'TRANSFER_IN',
          ...commonRef,
          unitCost: line.unitCost,
          notes: `Sales return ${ret.returnNumber}`,
          occurredAt: ret.processedAt,
        });

        if (line.condition === 'DAMAGED') {
          await inventory.decreaseStock(tx, {
            ...commonRef,
            productId: line.productId,
            packagingUnitId: line.packagingUnitId,
            quantity: line.quantity,
            baseQuantity: line.baseQuantity,
            type: 'DAMAGE',
            location: { type: inventory.LOCATION.WAREHOUSE, warehouseId: ret.warehouseId },
            unitCost: line.unitCost,
            notes: `Damaged on sales return ${ret.returnNumber}`,
            occurredAt: ret.processedAt,
          });
        }
      }
    }

    // Mark approved
    await tx.return.update({
      where: { id },
      data: { status: 'APPROVED', decidedById: actor ? actor.id : null, decidedAt: new Date() },
    });

    // Sync the linked settlement (if any)
    if (ret.settlementId) {
      await settlement.recomputeStatus(tx, ret.settlementId);
    }
  }, { timeout: 30000 });

  // Notify the rep
  const repUserId = ret.salesRep?.user?.id;
  if (repUserId) {
    const totalBoxes = (ret.items || []).reduce((s, i) => s + i.quantity, 0);
    notification.notifyUser(repUserId, {
      type: 'GENERAL',
      severity: 'INFO',
      title: 'Return approved',
      message: `Your return of ${totalBoxes} box(es) (${ret.returnNumber}) has been approved and added to inventory.`,
      entityType: 'Return',
      entityId: id,
    }).catch(() => {});
  }

  return prisma.return.findUnique({ where: { id }, include: RETURN_INCLUDE });
}

// ── Reject — no inventory changes ─────────────────────────────────────────────

async function rejectReturn(id, actor, reason) {
  const ret = await prisma.return.findUnique({ where: { id }, include: RETURN_INCLUDE });
  if (!ret) throw ApiError.notFound('Return not found');
  if (ret.status !== 'PENDING') throw ApiError.badRequest(`Cannot reject a return with status ${ret.status}`);

  const updated = await prisma.return.update({
    where: { id },
    data: {
      status: 'REJECTED',
      decidedById: actor ? actor.id : null,
      decidedAt: new Date(),
      rejectionReason: reason || null,
    },
    include: RETURN_INCLUDE,
  });

  const repUserId = updated.salesRep?.user?.id;
  if (repUserId) {
    const totalBoxes = (updated.items || []).reduce((s, i) => s + i.quantity, 0);
    notification.notifyUser(repUserId, {
      type: 'GENERAL',
      severity: 'WARNING',
      title: 'Return rejected',
      message: `Your return of ${totalBoxes} box(es) (${updated.returnNumber}) was not accepted.${reason ? ` Reason: ${reason}` : ' Please contact the administrator.'}`,
      entityType: 'Return',
      entityId: id,
    }).catch(() => {});
  }

  return updated;
}

// ── List / get ────────────────────────────────────────────────────────────────

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
    prisma.return.findMany({ where, include: RETURN_INCLUDE, skip: pagination.skip, take: pagination.take, orderBy: pagination.orderBy }),
    prisma.return.count({ where }),
  ]);
  return { items, total };
}

async function getReturn(id) {
  const ret = await prisma.return.findUnique({ where: { id }, include: RETURN_INCLUDE });
  if (!ret) throw ApiError.notFound('Return not found');
  return ret;
}

module.exports = { createReturn, approveReturn, rejectReturn, listReturns, getReturn, RETURN_INCLUDE };
