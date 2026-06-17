'use strict';

const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const commission = require('./commission.service');
const sales = require('./sales.service');
const { nextDocNumber } = require('../utils/numbering');
const { toNumber, round2, formatCurrency } = require('../utils/money');
const { dayjs } = require('../utils/dates');

const SETTLEMENT_WINDOW_HOURS = 72;
const APPROACHING_HOURS = 12; // flag as "approaching" within this many hours of deadline

const INCLUDE = {
  salesRep: { include: { user: { select: { name: true } } } },
};

// Effective status: stored SETTLED wins; otherwise OVERDUE once past deadline.
function effectiveStatus(s) {
  if (s.status === 'SETTLED') return 'SETTLED';
  if (new Date() > new Date(s.deadlineAt)) return 'OVERDUE';
  return s.status; // OPEN or PARTIAL
}

function decorate(s) {
  const hoursRemaining = round2(dayjs(s.deadlineAt).diff(dayjs(), 'hour', true));
  const status = effectiveStatus(s);
  const paid = round2(toNumber(s.settledValue));
  const balance = round2(toNumber(s.assignedValue) - paid);
  return {
    ...s,
    status,
    hoursRemaining,
    approaching: status !== 'SETTLED' && status !== 'OVERDUE' && hoursRemaining <= APPROACHING_HOURS,
    paid,
    balance,
  };
}

// Create a settlement cycle for stock issued to a rep. Call inside the same
// transaction that issues the stock so the two are atomic.
async function createForIssuance(client, { salesRepId, assignedValue, transferId, stockRequestId, issuedAt }) {
  const issued = issuedAt ? new Date(issuedAt) : new Date();
  const deadlineAt = dayjs(issued).add(SETTLEMENT_WINDOW_HOURS, 'hour').toDate();
  const settlementNumber = await nextDocNumber(client.settlement, 'settlementNumber', 'STL');
  return client.settlement.create({
    data: {
      settlementNumber,
      salesRepId,
      assignedValue: round2(assignedValue),
      issuedAt: issued,
      deadlineAt,
      status: 'OPEN',
      transferId: transferId || null,
      stockRequestId: stockRequestId || null,
    },
  });
}

async function list(filters, pagination) {
  const where = {};
  if (filters.salesRepId) where.salesRepId = filters.salesRepId;
  if (filters.status === 'OVERDUE') {
    where.status = { in: ['OPEN', 'PARTIAL'] };
    where.deadlineAt = { lt: new Date() };
  } else if (filters.status) {
    where.status = filters.status;
  }
  if (filters.open === true) where.status = { in: ['OPEN', 'PARTIAL'] };

  const [rows, total] = await Promise.all([
    prisma.settlement.findMany({ where, include: INCLUDE, skip: pagination.skip, take: pagination.take, orderBy: pagination.orderBy }),
    prisma.settlement.count({ where }),
  ]);
  return { items: rows.map(decorate), total };
}

// Per-order breakdown — box by box. For each product: issued (assigned) vs
// settled (boxes the rep has paid for) vs returned vs remaining (still owed).
// The money picture follows from the boxes: order value, settled value,
// returned value, outstanding. `client` lets callers read uncommitted writes
// from inside a transaction.
async function orderBreakdown(s, client = prisma) {
  const [transfer, settledRows, retRows, rule] = await Promise.all([
    s.transferId ? client.stockTransfer.findUnique({ where: { id: s.transferId }, include: { items: true } }) : null,
    client.saleItem.groupBy({ by: ['productId'], where: { sale: { settlementId: s.id, status: { not: 'CANCELLED' } } }, _sum: { baseQuantity: true } }),
    client.returnItem.groupBy({ by: ['productId'], where: { return: { settlementId: s.id } }, _sum: { baseQuantity: true } }),
    commission.getRule(),
  ]);

  const assignedMap = new Map();
  (transfer?.items || []).forEach((it) => assignedMap.set(it.productId, (assignedMap.get(it.productId) || 0) + it.baseQuantity));
  const settledMap = new Map(settledRows.map((r) => [r.productId, r._sum.baseQuantity || 0]));
  const retMap = new Map(retRows.map((r) => [r.productId, r._sum.baseQuantity || 0]));

  const productIds = [...new Set([...assignedMap.keys(), ...settledMap.keys(), ...retMap.keys()])];
  const products = await client.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, sku: true, sellingPrice: true } });
  const pMap = new Map(products.map((p) => [p.id, p]));

  let assignedBoxes = 0;
  let settledBoxes = 0;
  let returnedBoxes = 0;
  let remainingBoxes = 0;
  let returnedValue = 0;
  let remainingValue = 0;
  const lines = productIds.map((pid) => {
    const p = pMap.get(pid) || {};
    const assigned = assignedMap.get(pid) || 0;
    const settled = settledMap.get(pid) || 0;
    const returned = retMap.get(pid) || 0;
    const remaining = Math.max(0, assigned - settled - returned);
    assignedBoxes += assigned;
    settledBoxes += settled;
    returnedBoxes += returned;
    remainingBoxes += remaining;
    returnedValue += returned * toNumber(p.sellingPrice);
    remainingValue += remaining * toNumber(p.sellingPrice);
    return { productId: pid, name: p.name, sku: p.sku, sellingPrice: toNumber(p.sellingPrice), assigned, settled, returned, remaining };
  });

  const orderValue = toNumber(s.assignedValue);
  const settledValue = toNumber(s.settledValue);
  const outstanding = Math.max(0, round2(orderValue - settledValue - returnedValue));

  return {
    lines: lines.sort((a, b) => b.assigned - a.assigned),
    totals: {
      assignedBoxes,
      settledBoxes,
      returnedBoxes,
      remainingBoxes,
      orderValue,
      settledValue,
      returnedValue: round2(returnedValue),
      remainingValue: round2(remainingValue),
      commission: round2(settledBoxes * rule.perBox), // earned from settled boxes
      outstanding,
    },
  };
}

// The settlement history is the list of linked sales — each settled box is a
// CASH sale, so this is also what feeds revenue and product performance.
const SALES_INCLUDE = {
  where: { status: { not: 'CANCELLED' } },
  orderBy: { soldAt: 'desc' },
  include: { items: { include: { product: { select: { name: true } } } }, createdBy: { select: { name: true } } },
};

async function get(id) {
  const s = await prisma.settlement.findUnique({
    where: { id },
    include: { ...INCLUDE, sales: SALES_INCLUDE },
  });
  if (!s) throw ApiError.notFound('Settlement not found');
  const decorated = decorate(s);
  decorated.order = await orderBreakdown(s);
  return decorated;
}

// Settle boxes against an order: the rep accounts for `boxes` of a product by
// paying for them. Each settle creates a CASH sale (so the value flows into
// revenue, today's sales and product performance), the boxes leave the rep's
// stock, and the order auto-closes once every issued box is settled or returned.
async function settleBoxes(id, payload, actor) {
  const productId = payload.productId;
  const boxes = Math.trunc(Number(payload.boxes));
  if (!productId) throw ApiError.badRequest('Select a product to settle');
  if (!Number.isInteger(boxes) || boxes <= 0) throw ApiError.badRequest('Boxes settled must be a positive whole number');

  return prisma.$transaction(
    async (tx) => {
      const s = await tx.settlement.findUnique({ where: { id } });
      if (!s) throw ApiError.notFound('Settlement not found');
      if (s.status === 'SETTLED') throw ApiError.badRequest('This order is already settled');

      const product = await tx.product.findUnique({ where: { id: productId }, select: { id: true, name: true } });
      if (!product) throw ApiError.badRequest('Product not found');
      const pkg = await tx.productPackaging.findFirst({ where: { productId, isBaseUnit: true } });
      if (!pkg) throw ApiError.badRequest(`${product.name} has no base (Box) packaging configured`);

      // Boxes of this product still outstanding on the order (issued − settled − returned).
      const transfer = s.transferId
        ? await tx.stockTransfer.findUnique({ where: { id: s.transferId }, include: { items: { where: { productId } } } })
        : null;
      const assigned = (transfer?.items || []).reduce((n, it) => n + it.baseQuantity, 0);
      const [settledAgg, retAgg] = await Promise.all([
        tx.saleItem.aggregate({ where: { productId, sale: { settlementId: id, status: { not: 'CANCELLED' } } }, _sum: { baseQuantity: true } }),
        tx.returnItem.aggregate({ where: { productId, return: { settlementId: id } }, _sum: { baseQuantity: true } }),
      ]);
      const remaining = assigned - (settledAgg._sum.baseQuantity || 0) - (retAgg._sum.baseQuantity || 0);
      if (boxes > remaining) {
        throw ApiError.badRequest(`Only ${remaining} box(es) of ${product.name} are still outstanding on this order`);
      }

      // Each settled box becomes a CASH sale from the rep's stock. This is the
      // single path that records inventory-out AND business revenue.
      const sale = await sales.createSaleTx(
        tx,
        {
          type: 'CASH',
          salesRepId: s.salesRepId,
          settlementId: id,
          items: [{ productId, packagingUnitId: pkg.packagingUnitId, quantity: boxes }],
          notes: `Settlement ${s.settlementNumber}${payload.method ? ` · ${payload.method}` : ''}`,
        },
        actor,
      );

      // Recompute settled value + status. Fully settled when nothing remains.
      const newSettled = round2(toNumber(s.settledValue) + toNumber(sale.total));
      const bd = await orderBreakdown({ ...s, settledValue: newSettled }, tx);
      const fullySettled = bd.totals.remainingBoxes <= 0;
      const status = fullySettled ? 'SETTLED' : new Date() > new Date(s.deadlineAt) ? 'OVERDUE' : 'PARTIAL';

      await tx.settlement.update({
        where: { id },
        data: { settledValue: newSettled, status, settledAt: fullySettled ? new Date() : s.settledAt },
      });

      const updated = await tx.settlement.findUnique({ where: { id }, include: { ...INCLUDE, sales: SALES_INCLUDE } });
      const dec = decorate(updated);
      dec.order = await orderBreakdown(updated, tx);
      return dec;
    },
    { timeout: 30000 },
  );
}

// Close an order. Enforces the core rule: every issued box must be accounted
// for — settled (paid) or returned — before the request can be closed. Since
// settled value + returned value = order value when no boxes remain, this also
// guarantees the balance is fully cleared.
async function settle(id, actor, { notes } = {}) {
  const s = await prisma.settlement.findUnique({ where: { id } });
  if (!s) throw ApiError.notFound('Settlement not found');
  if (s.status === 'SETTLED') throw ApiError.badRequest('This order is already settled');

  const bd = await orderBreakdown(s);
  if (bd.totals.remainingBoxes > 0) {
    throw ApiError.badRequest(
      `Cannot close yet — ${bd.totals.remainingBoxes} box(es) are still unaccounted. Every box must be settled or returned (outstanding ${formatCurrency(bd.totals.outstanding)}).`,
    );
  }

  const updated = await prisma.settlement.update({
    where: { id },
    data: { status: 'SETTLED', settledAt: new Date(), notes: notes || s.notes },
    include: INCLUDE,
  });
  return decorate(updated);
}

// Flip OPEN/PARTIAL past-deadline settlements to OVERDUE (stored flag).
async function refreshOverdue() {
  const res = await prisma.settlement.updateMany({
    where: { status: { in: ['OPEN', 'PARTIAL'] }, deadlineAt: { lt: new Date() } },
    data: { status: 'OVERDUE' },
  });
  return { updated: res.count };
}

// Dashboard summary: who is outstanding, approaching the 72h deadline, overdue.
async function summary() {
  const open = await prisma.settlement.findMany({
    where: { status: { in: ['OPEN', 'PARTIAL', 'OVERDUE'] } },
    include: INCLUDE,
    orderBy: { deadlineAt: 'asc' },
  });
  const decorated = open.map(decorate).filter((s) => s.status !== 'SETTLED');

  const overdue = decorated.filter((s) => s.status === 'OVERDUE');
  const approaching = decorated.filter((s) => s.approaching);

  return {
    outstandingCount: decorated.length,
    outstandingValue: round2(decorated.reduce((acc, s) => acc + toNumber(s.assignedValue), 0)),
    approachingCount: approaching.length,
    overdueCount: overdue.length,
    overdueValue: round2(overdue.reduce((acc, s) => acc + toNumber(s.assignedValue), 0)),
    items: decorated.slice(0, 10).map((s) => ({
      id: s.id,
      settlementNumber: s.settlementNumber,
      salesRep: s.salesRep?.user?.name,
      assignedValue: toNumber(s.assignedValue),
      deadlineAt: s.deadlineAt,
      hoursRemaining: s.hoursRemaining,
      status: s.status,
      approaching: s.approaching,
    })),
  };
}

module.exports = {
  SETTLEMENT_WINDOW_HOURS,
  createForIssuance,
  list,
  get,
  settle,
  settleBoxes,
  refreshOverdue,
  summary,
  decorate,
};
