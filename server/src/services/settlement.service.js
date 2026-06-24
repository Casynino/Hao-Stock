'use strict';

const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const commission = require('./commission.service');
const sales = require('./sales.service');
const inventory = require('./inventory.service');
const notification = require('./notification.service');
const { nextDocNumber } = require('../utils/numbering');
const { toNumber, round2, formatCurrency } = require('../utils/money');
const { dayjs } = require('../utils/dates');

const SETTLEMENT_WINDOW_HOURS = 72;
const APPROACHING_HOURS = 12; // flag as "approaching" within this many hours of deadline

const INCLUDE = {
  salesRep: { include: { user: { select: { id: true, name: true } } } },
};

// Effective status: stored SETTLED wins; otherwise OVERDUE once past deadline.
function effectiveStatus(s) {
  if (s.status === 'SETTLED') return 'SETTLED';
  if (new Date() > new Date(s.deadlineAt)) return 'OVERDUE';
  return s.status; // OPEN or PARTIAL
}

function decorate(s) {
  const status = effectiveStatus(s);
  // Time tracking only applies to LIVE orders. Once an order is settled it's a
  // finalized state — no countdown, no overdue, no "approaching". This is the
  // single source of truth every screen reads from.
  const settled = status === 'SETTLED';
  const hoursRemaining = settled ? null : round2(dayjs(s.deadlineAt).diff(dayjs(), 'hour', true));
  const paid = round2(toNumber(s.settledValue));
  const returned = round2(toNumber(s.returnedValue));
  // Outstanding = order value minus what's been settled AND returned. Returns
  // discharge the rep's liability just like settlement does.
  const balance = round2(Math.max(0, toNumber(s.assignedValue) - paid - returned));
  return {
    ...s,
    status,
    hoursRemaining,
    approaching: !settled && status !== 'OVERDUE' && hoursRemaining <= APPROACHING_HOURS,
    paid,
    returned,
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

  // Active orders (still owed — settledAt is null) always sit above completed
  // ones (NULLS FIRST is independent of sort direction). Within the active
  // group, settledAt ties so the requested sort applies — default deadline asc,
  // surfacing overdue/approaching at the very top. Settled orders fall to the
  // bottom, most-recently-settled first. Done at the DB level so the grouping
  // holds across pages.
  const orderBy = [
    { settledAt: { sort: 'desc', nulls: 'first' } },
    pagination.orderBy,
  ];

  const [rows, total] = await Promise.all([
    prisma.settlement.findMany({ where, include: INCLUDE, skip: pagination.skip, take: pagination.take, orderBy }),
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
    client.returnItem.groupBy({ by: ['productId'], where: { return: { settlementId: s.id, status: { in: ['APPROVED', 'COMPLETED'] } } }, _sum: { baseQuantity: true } }),
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
  // Pending returns on this order — surfaced with their line items so staff can
  // approve/reject them straight from the order detail.
  const pendingReturnRecords = await prisma.return.findMany({
    where: { settlementId: id, status: 'PENDING' },
    include: { items: { include: { product: { select: { name: true } }, packagingUnit: { select: { name: true } } } } },
    orderBy: { processedAt: 'desc' },
  });
  decorated.pendingReturns = pendingReturnRecords.length;
  decorated.pendingReturnsList = pendingReturnRecords.map((r) => ({
    id: r.id,
    returnNumber: r.returnNumber,
    reason: r.reason,
    processedAt: r.processedAt,
    items: r.items.map((i) => ({ productName: i.product?.name, quantity: i.quantity, unitName: i.packagingUnit?.name })),
  }));
  return decorated;
}

// Recompute a settlement's stored returnedValue + status from its linked sales
// (settled) and returns. AUTO-CLOSES (status SETTLED) the moment every issued
// box is accounted for — settled or returned. Call after any settle or return.
async function recomputeStatus(client, id) {
  const s = await client.settlement.findUnique({ where: { id } });
  if (!s) return null;
  const bd = await orderBreakdown(s, client);
  const fullyAccounted = bd.totals.remainingBoxes <= 0;
  const status = fullyAccounted
    ? 'SETTLED'
    : new Date() > new Date(s.deadlineAt)
      ? 'OVERDUE'
      : toNumber(s.settledValue) > 0 || bd.totals.returnedValue > 0
        ? 'PARTIAL'
        : 'OPEN';
  return client.settlement.update({
    where: { id },
    data: {
      returnedValue: round2(bd.totals.returnedValue),
      status,
      settledAt: fullyAccounted && !s.settledAt ? new Date() : s.settledAt,
    },
  });
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

  const result = await prisma.$transaction(
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
        tx.returnItem.aggregate({ where: { productId, return: { settlementId: id, status: { in: ['APPROVED', 'COMPLETED'] } } }, _sum: { baseQuantity: true } }),
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

      // Record the settled value, then recompute status (auto-closes the order
      // when every issued box is now settled or returned).
      const newSettled = round2(toNumber(s.settledValue) + toNumber(sale.total));
      await tx.settlement.update({ where: { id }, data: { settledValue: newSettled } });
      await recomputeStatus(tx, id);

      const updated = await tx.settlement.findUnique({ where: { id }, include: { ...INCLUDE, sales: SALES_INCLUDE } });
      const dec = decorate(updated);
      dec.order = await orderBreakdown(updated, tx);
      return dec;
    },
    { timeout: 30000 },
  );

  const repName = result.salesRep?.user?.name || 'A rep';
  const repUserId = result.salesRep?.user?.id;

  if (result.status === 'SETTLED') {
    notification.notifyAdmins({
      type: 'GENERAL',
      severity: 'INFO',
      title: `Order closed: ${result.settlementNumber}`,
      message: `${repName} fully settled order ${result.settlementNumber}. All boxes accounted for.`,
      entityType: 'Settlement',
      entityId: id,
    }).catch(() => {});
    notification.notifyUser(repUserId, {
      type: 'GENERAL',
      severity: 'INFO',
      title: `Order closed: ${result.settlementNumber}`,
      message: `All boxes on order ${result.settlementNumber} are accounted for. Your order is now closed.`,
      entityType: 'Settlement',
      entityId: id,
    }).catch(() => {});
  } else {
    notification.notifyAdmins({
      type: 'GENERAL',
      severity: 'INFO',
      title: `Payment received: ${result.settlementNumber}`,
      message: `${repName} settled ${payload.boxes} box(es) on order ${result.settlementNumber}.`,
      entityType: 'Settlement',
      entityId: id,
    }).catch(() => {});
    notification.notifyUser(repUserId, {
      type: 'GENERAL',
      severity: 'INFO',
      title: `Settlement updated: ${result.settlementNumber}`,
      message: `${payload.boxes} box(es) settled on order ${result.settlementNumber}.`,
      entityType: 'Settlement',
      entityId: id,
    }).catch(() => {});
  }

  return result;
}

// Admin issues additional boxes to a rep, OUT of The Lab's warehouse. If the
// rep already has an active (unsettled) order the boxes are appended to that
// order: the stock moves warehouse→rep, the order's linked transfer records the
// extra boxes (so the box-by-box breakdown stays exact), the order value grows,
// and status/outstanding recompute. If the rep has no active order a fresh
// warehouse→rep issuance opens a new 72h settlement. Notifies ONLY the rep.
// Both sides (warehouse balance, rep stock held, order, settlement) move in the
// SAME db transaction, so admin and rep can never see divergent numbers.
async function addStockToRep(salesRepId, payload, actor) {
  const { productId, warehouseId, reason } = payload;
  const boxes = Math.trunc(Number(payload.boxes));
  if (!productId) throw ApiError.badRequest('Select a product to add');
  if (!Number.isInteger(boxes) || boxes <= 0) throw ApiError.badRequest('Boxes must be a positive whole number');
  if (!warehouseId) throw ApiError.badRequest('No warehouse available to issue from');

  const result = await prisma.$transaction(
    async (tx) => {
      const rep = await tx.salesRepresentative.findUnique({
        where: { id: salesRepId },
        include: { user: { select: { id: true, name: true } } },
      });
      if (!rep) throw ApiError.notFound('Sales rep not found');
      if (!rep.isActive) throw ApiError.badRequest('This rep account is suspended');

      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { id: true, name: true, sellingPrice: true, purchasePrice: true },
      });
      if (!product) throw ApiError.badRequest('Product not found');
      const pkg = await tx.productPackaging.findFirst({ where: { productId, isBaseUnit: true } });
      if (!pkg) throw ApiError.badRequest(`${product.name} has no base (Box) packaging configured`);

      const { baseQuantity } = await inventory.convertToBase(tx, productId, pkg.packagingUnitId, boxes);
      const addedValue = round2(baseQuantity * toNumber(product.sellingPrice));
      const unitCost = toNumber(product.purchasePrice);

      const from = { type: inventory.LOCATION.WAREHOUSE, warehouseId };
      const to = { type: inventory.LOCATION.SALES_REP, salesRepId };

      // Latest active (unsettled) order for this rep, if one is still open.
      const active = await tx.settlement.findFirst({
        where: { salesRepId, status: { not: 'SETTLED' }, transferId: { not: null } },
        orderBy: { issuedAt: 'desc' },
      });

      let settlementId;
      let settlementNumber;
      let mode;

      if (active) {
        // Move the boxes warehouse→rep (asserts The Lab actually has them),
        // tied to the order's existing transfer.
        await inventory.transferStock(tx, {
          productId,
          packagingUnitId: pkg.packagingUnitId,
          quantity: boxes,
          baseQuantity,
          from,
          to,
          referenceType: 'STOCK_TRANSFER',
          referenceId: active.transferId,
          userId: actor ? actor.id : null,
          unitCost,
          notes: `Added to order ${active.settlementNumber}${reason ? ` — ${reason}` : ''}`,
        });
        // Append to the order's transfer so the box-by-box breakdown reflects it.
        await tx.stockTransferItem.create({
          data: { transferId: active.transferId, productId, packagingUnitId: pkg.packagingUnitId, quantity: boxes, baseQuantity },
        });
        // Grow the order value, then recompute status/outstanding.
        await tx.settlement.update({
          where: { id: active.id },
          data: { assignedValue: round2(toNumber(active.assignedValue) + addedValue) },
        });
        await recomputeStatus(tx, active.id);
        settlementId = active.id;
        settlementNumber = active.settlementNumber;
        mode = 'attached';
      } else {
        // No active order — open a fresh warehouse→rep issuance + 72h settlement.
        const transferNumber = await nextDocNumber(tx.stockTransfer, 'transferNumber', 'TRF');
        const transfer = await tx.stockTransfer.create({
          data: {
            transferNumber,
            direction: 'WAREHOUSE_TO_REP',
            status: 'COMPLETED',
            fromWarehouseId: warehouseId,
            toRepId: salesRepId,
            notes: reason || 'Stock added by The Doctor',
            dispatchedAt: new Date(),
            dispatchedById: actor ? actor.id : null,
            items: { create: [{ productId, packagingUnitId: pkg.packagingUnitId, quantity: boxes, baseQuantity }] },
          },
        });
        await inventory.transferStock(tx, {
          productId,
          packagingUnitId: pkg.packagingUnitId,
          quantity: boxes,
          baseQuantity,
          from,
          to,
          referenceType: 'STOCK_TRANSFER',
          referenceId: transfer.id,
          userId: actor ? actor.id : null,
          unitCost,
          notes: `Transfer ${transferNumber}`,
          occurredAt: transfer.dispatchedAt,
        });
        const fresh = await createForIssuance(tx, {
          salesRepId,
          assignedValue: addedValue,
          transferId: transfer.id,
          issuedAt: transfer.dispatchedAt,
        });
        settlementId = fresh.id;
        settlementNumber = fresh.settlementNumber;
        mode = 'created';
      }

      const updated = await tx.settlement.findUnique({ where: { id: settlementId }, include: { ...INCLUDE, sales: SALES_INCLUDE } });
      const dec = decorate(updated);
      dec.order = await orderBreakdown(updated, tx);
      return { mode, settlement: dec, rep, productName: product.name, boxes, addedValue, settlementNumber };
    },
    { timeout: 30000 },
  );

  // Notify ONLY this rep — the stock landed on their order.
  notification.notifyUser(result.rep.user?.id, {
    type: 'GENERAL',
    severity: 'INFO',
    title: '📦 New stock added',
    message:
      result.mode === 'attached'
        ? `The Doctor added ${result.boxes} box(es) of ${result.productName} to your active order ${result.settlementNumber}. Your settlement has been updated.`
        : `The Doctor issued ${result.boxes} box(es) of ${result.productName} to you — new order ${result.settlementNumber}.`,
    entityType: 'Settlement',
    entityId: result.settlement.id,
  }).catch(() => {});

  return result;
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

  notification.notifyAdmins({
    type: 'GENERAL',
    severity: 'INFO',
    title: `Order closed: ${s.settlementNumber}`,
    message: `${updated.salesRep?.user?.name || 'A rep'} fully settled order ${s.settlementNumber}. All boxes accounted for.`,
    entityType: 'Settlement',
    entityId: id,
  }).catch(() => {});
  notification.notifyUser(updated.salesRep?.user?.id, {
    type: 'GENERAL',
    severity: 'INFO',
    title: `Order closed: ${s.settlementNumber}`,
    message: `Order ${s.settlementNumber} is fully settled. All boxes accounted for.`,
    entityType: 'Settlement',
    entityId: id,
  }).catch(() => {});

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

// --- Automated settlement-deadline reminders --------------------------------
// Three escalating reminders fire as an ACTIVE order nears its 72h deadline:
// 24h (info) → 6h (warning) → 1h (urgent). Each stage fires ONCE — tracked by
// Settlement.reminderStage (0=none,1=24h,2=6h,3=1h) — so repeated sweeps never
// re-notify. Settled/closed orders are never touched.
const REMINDER_DEFS = {
  1: {
    severity: 'INFO',
    title: 'Settlement due in 24 hours',
    msg: (n) => `Order ${n} is due for settlement in 24 hours. Please complete settlement or return process.`,
  },
  2: {
    severity: 'WARNING',
    title: 'Final reminder — settle soon',
    msg: (n) => `Final reminder: Order ${n} will be auto-processed soon. Settle or return immediately.`,
  },
  3: {
    severity: 'CRITICAL',
    title: 'Urgent — settlement deadline near',
    msg: (n) => `Urgent: Order ${n} settlement deadline is almost reached. Immediate action required.`,
  },
};

// Which reminder stage a given hours-to-deadline falls in (0 = none).
function reminderStageFor(hoursRemaining) {
  if (hoursRemaining > 0 && hoursRemaining <= 1) return 3;
  if (hoursRemaining > 1 && hoursRemaining <= 6) return 2;
  if (hoursRemaining > 6 && hoursRemaining <= 24) return 1;
  return 0;
}

// Send any due 24h/6h/1h reminders to reps. Idempotent: a per-settlement atomic
// claim (reminderStage < stage) guarantees each reminder goes out exactly once
// even if two sweeps race. Only active orders are considered.
async function sendDueReminders() {
  const now = Date.now();
  const active = await prisma.settlement.findMany({
    where: { status: { in: ['OPEN', 'PARTIAL', 'OVERDUE'] } },
    select: { id: true, settlementNumber: true, deadlineAt: true, reminderStage: true, salesRep: { select: { user: { select: { id: true } } } } },
  });

  let sent = 0;
  for (const s of active) {
    const hrs = (new Date(s.deadlineAt).getTime() - now) / 3_600_000;
    const stage = reminderStageFor(hrs);
    if (stage === 0 || stage <= (s.reminderStage || 0)) continue;

    // Atomically claim this stage so concurrent sweeps can't double-send.
    const claim = await prisma.settlement.updateMany({
      where: { id: s.id, reminderStage: { lt: stage } },
      data: { reminderStage: stage },
    });
    if (claim.count !== 1) continue;

    const def = REMINDER_DEFS[stage];
    const uid = s.salesRep?.user?.id;
    if (uid && def) {
      await notification.notifyUser(uid, {
        type: 'GENERAL',
        severity: def.severity,
        title: def.title,
        message: def.msg(s.settlementNumber),
        entityType: 'Settlement',
        entityId: s.id,
      }).catch(() => {});
      sent += 1;
    }
  }
  return { checked: active.length, sent };
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

// Extend (or set) the deadline for an open order. Admins use this when a rep
// needs more time. If the order is OVERDUE it reverts to OPEN/PARTIAL once
// the new deadline is in the future.
async function extendDeadline(id, { deadlineAt, additionalHours }) {
  const s = await prisma.settlement.findUnique({ where: { id } });
  if (!s) throw ApiError.notFound('Settlement not found');
  if (s.status === 'SETTLED') throw ApiError.badRequest('This order is already closed');

  let newDeadline;
  if (deadlineAt) {
    newDeadline = new Date(deadlineAt);
  } else if (additionalHours) {
    const base = new Date(s.deadlineAt) > new Date() ? new Date(s.deadlineAt) : new Date();
    newDeadline = new Date(base.getTime() + Number(additionalHours) * 3_600_000);
  } else {
    throw ApiError.badRequest('Provide deadlineAt or additionalHours');
  }

  if (newDeadline <= new Date()) throw ApiError.badRequest('New deadline must be in the future');

  // If it was overdue, revive it to OPEN or PARTIAL
  let newStatus = s.status;
  if (s.status === 'OVERDUE') {
    newStatus = toNumber(s.settledValue) > 0 || toNumber(s.returnedValue) > 0 ? 'PARTIAL' : 'OPEN';
  }

  const updated = await prisma.settlement.update({
    where: { id },
    // Re-arm reminders for the new window (24h/6h/1h fire again).
    data: { deadlineAt: newDeadline, status: newStatus, reminderStage: 0 },
    include: INCLUDE,
  });
  return decorate(updated);
}

module.exports = {
  SETTLEMENT_WINDOW_HOURS,
  createForIssuance,
  list,
  get,
  orderBreakdown,
  settle,
  settleBoxes,
  addStockToRep,
  recomputeStatus,
  refreshOverdue,
  sendDueReminders,
  summary,
  decorate,
  extendDeadline,
};
