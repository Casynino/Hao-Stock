'use strict';

const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const inventory = require('./inventory.service');
const transfers = require('./transfers.service');
const { nextDocNumber } = require('../utils/numbering');
const { toNumber, round2 } = require('../utils/money');

const INCLUDE = {
  salesRep: { include: { user: { select: { name: true } } } },
  warehouse: { select: { id: true, name: true } },
  decidedBy: { select: { id: true, name: true } },
  items: { include: { product: true, packagingUnit: true } },
};

async function resolveWarehouseId(requested) {
  if (requested) return requested;
  const wh = await prisma.warehouse.findFirst({
    where: { isActive: true },
    orderBy: { isPrimary: 'desc' },
  });
  if (!wh) throw ApiError.badRequest('No active warehouse available to fulfil from');
  return wh.id;
}

async function create(salesRepId, payload) {
  if (!payload.items || payload.items.length === 0) {
    throw ApiError.badRequest('A stock request needs at least one item');
  }

  return prisma.$transaction(async (tx) => {
    const productIds = [...new Set(payload.items.map((i) => i.productId))];
    const products = await tx.product.findMany({ where: { id: { in: productIds } } });
    const pMap = new Map(products.map((p) => [p.id, p]));
    if (pMap.size !== productIds.length) throw ApiError.badRequest('One or more products were not found');

    // Price every line at the selling price for its chosen unit (Box/Carton).
    const lines = [];
    let totalValue = 0;
    for (const i of payload.items) {
      const { packaging } = await inventory.convertToBase(tx, i.productId, i.packagingUnitId, i.quantity);
      const product = pMap.get(i.productId);
      const unitPrice =
        packaging.unitPrice != null
          ? toNumber(packaging.unitPrice)
          : round2(toNumber(product.sellingPrice) * packaging.baseQuantity);
      const lineTotal = round2(unitPrice * i.quantity);
      totalValue += lineTotal;
      lines.push({
        productId: i.productId,
        packagingUnitId: i.packagingUnitId,
        quantityRequested: i.quantity,
        unitPrice,
        lineTotal,
      });
    }

    const requestNumber = await nextDocNumber(tx.stockRequest, 'requestNumber', 'REQ');
    return tx.stockRequest.create({
      data: {
        requestNumber,
        salesRepId,
        warehouseId: payload.warehouseId || null,
        notes: payload.notes || null,
        status: 'PENDING',
        totalValue: round2(totalValue),
        items: { create: lines },
      },
      include: INCLUDE,
    });
  });
}

async function list(filters, pagination) {
  const where = {};
  if (filters.salesRepId) where.salesRepId = filters.salesRepId;
  if (filters.status) where.status = filters.status;
  const [items, total] = await Promise.all([
    prisma.stockRequest.findMany({ where, include: INCLUDE, skip: pagination.skip, take: pagination.take, orderBy: pagination.orderBy }),
    prisma.stockRequest.count({ where }),
  ]);
  return { items, total };
}

async function get(id) {
  const r = await prisma.stockRequest.findUnique({ where: { id }, include: INCLUDE });
  if (!r) throw ApiError.notFound('Stock request not found');
  return r;
}

// Approve a request: optionally adjust quantities, then dispatch a
// warehouse→rep transfer (which posts the ledger and opens a settlement).
async function approve(id, actor, approvals = []) {
  const request = await prisma.stockRequest.findUnique({ where: { id }, include: { items: true } });
  if (!request) throw ApiError.notFound('Stock request not found');
  if (request.status !== 'PENDING') throw ApiError.badRequest(`Request is already ${request.status}`);

  const approvalMap = new Map(approvals.map((a) => [a.itemId, a.quantityApproved]));
  const fromWarehouseId = await resolveWarehouseId(request.warehouseId);

  // Decide approved quantity per line (default: full requested amount).
  const decided = request.items.map((it) => {
    const qty = approvalMap.has(it.id) ? Number(approvalMap.get(it.id)) : it.quantityRequested;
    return { ...it, quantityApproved: Math.max(0, qty) };
  });
  const toIssue = decided.filter((d) => d.quantityApproved > 0);
  if (toIssue.length === 0) throw ApiError.badRequest('Nothing approved to issue');

  // Dispatch the transfer (posts ledger + creates the 72h settlement).
  const transfer = await transfers.createTransfer(
    {
      direction: 'WAREHOUSE_TO_REP',
      fromWarehouseId,
      toRepId: request.salesRepId,
      items: toIssue.map((d) => ({ productId: d.productId, packagingUnitId: d.packagingUnitId, quantity: d.quantityApproved })),
      notes: `Stock request ${request.requestNumber}`,
    },
    actor,
  );

  const settlement = await prisma.settlement.findFirst({ where: { transferId: transfer.id } });

  // Persist approved quantities and resolved base amounts on the request items.
  for (const d of decided) {
    let baseQuantity = 0;
    if (d.quantityApproved > 0) {
      const conv = await inventory.convertToBase(prisma, d.productId, d.packagingUnitId, d.quantityApproved);
      baseQuantity = conv.baseQuantity;
    }
    await prisma.stockRequestItem.update({
      where: { id: d.id },
      data: { quantityApproved: d.quantityApproved, baseQuantity },
    });
  }

  return prisma.stockRequest.update({
    where: { id },
    data: {
      status: 'FULFILLED',
      decidedAt: new Date(),
      decidedById: actor ? actor.id : null,
      warehouseId: fromWarehouseId,
      transferId: transfer.id,
      settlementId: settlement ? settlement.id : null,
    },
    include: INCLUDE,
  });
}

async function reject(id, actor, notes) {
  const request = await prisma.stockRequest.findUnique({ where: { id } });
  if (!request) throw ApiError.notFound('Stock request not found');
  if (request.status !== 'PENDING') throw ApiError.badRequest(`Request is already ${request.status}`);
  return prisma.stockRequest.update({
    where: { id },
    data: { status: 'REJECTED', decidedAt: new Date(), decidedById: actor ? actor.id : null, notes: notes || request.notes },
    include: INCLUDE,
  });
}

async function cancel(id, actor) {
  const request = await prisma.stockRequest.findUnique({ where: { id } });
  if (!request) throw ApiError.notFound('Stock request not found');
  if (request.status !== 'PENDING') throw ApiError.badRequest('Only pending requests can be cancelled');
  return prisma.stockRequest.update({ where: { id }, data: { status: 'CANCELLED' }, include: INCLUDE });
}

module.exports = { create, list, get, approve, reject, cancel };
