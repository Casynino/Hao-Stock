'use strict';

const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, paginated } = require('../utils/response');
const { parsePagination } = require('../utils/pagination');
const inventory = require('../services/inventory.service');
const stockCount = require('../services/stockCount.service');
const commission = require('../services/commission.service');
const settlement = require('../services/settlement.service');
const { toNumber, round2 } = require('../utils/money');
const { pad } = require('../utils/numbering');
const audit = require('../services/audit.service');

async function repStockList(salesRepId) {
  const balances = (await inventory.repBalances(prisma, salesRepId)).filter((b) => b.baseQuantity !== 0);
  const products = await prisma.product.findMany({
    where: { id: { in: balances.map((b) => b.productId) } },
    select: { id: true, name: true, sku: true, baseUnitName: true, purchasePrice: true, sellingPrice: true },
  });
  const pMap = new Map(products.map((p) => [p.id, p]));
  let value = 0;
  const stock = balances
    .map((b) => {
      const p = pMap.get(b.productId);
      const v = round2(b.baseQuantity * toNumber(p?.purchasePrice));
      value += v;
      return {
        productId: b.productId,
        name: p?.name,
        sku: p?.sku,
        baseUnitName: p?.baseUnitName,
        baseQuantity: b.baseQuantity,
        value: v,
      };
    })
    .sort((a, b) => b.value - a.value);
  return { stock, value: round2(value) };
}

const list = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const pagination = parsePagination(q, { defaultSortBy: 'createdAt', defaultSortDir: 'asc' });
  const where = {};
  if (q.isActive !== undefined) where.isActive = q.isActive;
  if (q.search) {
    where.OR = [
      { code: { contains: q.search, mode: 'insensitive' } },
      { region: { contains: q.search, mode: 'insensitive' } },
      { user: { name: { contains: q.search, mode: 'insensitive' } } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.salesRepresentative.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, isActive: true } },
        _count: { select: { customers: true, sales: true } },
      },
      skip: pagination.skip,
      take: pagination.take,
      orderBy: pagination.orderBy,
    }),
    prisma.salesRepresentative.count({ where }),
  ]);

  // Enrich each card with held-stock value, total sales and outstanding debt
  // using a few grouped aggregates (not one query per rep).
  const ids = items.map((r) => r.id);
  const [heldRows, debtRows, salesRows] = await Promise.all([
    inventory.repBalances(prisma).then((rows) => rows.filter((r) => ids.includes(r.salesRepId) && r.baseQuantity > 0)),
    prisma.creditSale.groupBy({ by: ['salesRepId'], where: { salesRepId: { in: ids }, balance: { gt: 0 } }, _sum: { balance: true } }),
    prisma.sale.groupBy({ by: ['salesRepId'], where: { salesRepId: { in: ids }, status: { not: 'CANCELLED' } }, _sum: { total: true } }),
  ]);
  const prodIds = [...new Set(heldRows.map((r) => r.productId))];
  const prods = await prisma.product.findMany({ where: { id: { in: prodIds } }, select: { id: true, purchasePrice: true } });
  const costMap = new Map(prods.map((p) => [p.id, toNumber(p.purchasePrice)]));
  const heldValue = new Map();
  const heldUnits = new Map();
  heldRows.forEach((r) => {
    heldValue.set(r.salesRepId, (heldValue.get(r.salesRepId) || 0) + r.baseQuantity * (costMap.get(r.productId) || 0));
    heldUnits.set(r.salesRepId, (heldUnits.get(r.salesRepId) || 0) + r.baseQuantity);
  });
  const debtMap = new Map(debtRows.map((d) => [d.salesRepId, toNumber(d._sum.balance)]));
  const salesMap = new Map(salesRows.map((s) => [s.salesRepId, toNumber(s._sum.total)]));

  const enriched = items.map((r) => ({
    ...r,
    heldStockValue: round2(heldValue.get(r.id) || 0),
    heldUnits: heldUnits.get(r.id) || 0,
    outstandingDebt: round2(debtMap.get(r.id) || 0),
    totalSales: round2(salesMap.get(r.id) || 0),
  }));

  return paginated(res, enriched, { page: pagination.page, limit: pagination.limit, total });
});

const get = asyncHandler(async (req, res) => {
  const rep = await prisma.salesRepresentative.findUnique({
    where: { id: req.params.id },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, isActive: true } },
      _count: { select: { customers: true } },
    },
  });
  if (!rep) throw ApiError.notFound('Sales representative not found');

  const [{ stock, value }, debtAgg, salesAgg] = await Promise.all([
    repStockList(rep.id),
    prisma.creditSale.aggregate({ where: { salesRepId: rep.id, balance: { gt: 0 } }, _sum: { balance: true } }),
    prisma.sale.aggregate({ where: { salesRepId: rep.id, status: { not: 'CANCELLED' } }, _sum: { total: true }, _count: true }),
  ]);

  return ok(res, {
    ...rep,
    heldStockValue: value,
    heldStock: stock,
    outstandingDebt: round2(toNumber(debtAgg._sum.balance)),
    totalSales: round2(toNumber(salesAgg._sum.total)),
    orderCount: salesAgg._count,
  });
});

// Lifetime box flow for a rep: received (issued in), sold (settled), returned.
async function repPerformance(salesRepId, boxesSold) {
  const [recv, ret] = await Promise.all([
    prisma.stockTransferItem.aggregate({
      where: { transfer: { is: { direction: 'WAREHOUSE_TO_REP', toRepId: salesRepId, status: { not: 'CANCELLED' } } } },
      _sum: { baseQuantity: true },
    }),
    prisma.returnItem.aggregate({
      where: { return: { is: { salesRepId, status: { in: ['APPROVED', 'COMPLETED'] } } } },
      _sum: { baseQuantity: true },
    }),
  ]);
  const received = recv._sum.baseQuantity || 0;
  const returned = ret._sum.baseQuantity || 0;
  const sold = boxesSold || 0;
  return {
    received,
    sold,
    returned,
    net: received - sold - returned,
    conversion: received > 0 ? round2((sold / received) * 100) : 0,
  };
}

// A merged, timestamped timeline from the rep's domain records — more meaningful
// (and reliable) than raw audit rows. Newest first.
async function repActivity(salesRepId) {
  const [requests, issues, sales, returns, withdrawals] = await Promise.all([
    prisma.stockRequest.findMany({ where: { salesRepId }, select: { requestNumber: true, status: true, requestedAt: true }, orderBy: { requestedAt: 'desc' }, take: 12 }),
    prisma.stockTransfer.findMany({ where: { direction: 'WAREHOUSE_TO_REP', toRepId: salesRepId }, select: { transferNumber: true, status: true, dispatchedAt: true }, orderBy: { dispatchedAt: 'desc' }, take: 12 }),
    prisma.sale.findMany({ where: { salesRepId, settlementId: { not: null }, status: { not: 'CANCELLED' } }, select: { saleNumber: true, total: true, soldAt: true }, orderBy: { soldAt: 'desc' }, take: 12 }),
    prisma.return.findMany({ where: { salesRepId }, select: { returnNumber: true, status: true, processedAt: true }, orderBy: { processedAt: 'desc' }, take: 12 }),
    prisma.commissionWithdrawal.findMany({ where: { salesRepId }, select: { amount: true, status: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 12 }),
  ]);
  const ev = [];
  for (const r of requests) ev.push({ at: r.requestedAt, type: 'STOCK_REQUEST', title: `Stock request ${r.requestNumber}`, status: r.status });
  for (const t of issues) ev.push({ at: t.dispatchedAt, type: 'ISSUE', title: `Stock issued · ${t.transferNumber}`, status: t.status });
  for (const s of sales) ev.push({ at: s.soldAt, type: 'SETTLEMENT', title: `Boxes settled · ${s.saleNumber}`, amount: toNumber(s.total) });
  for (const r of returns) ev.push({ at: r.processedAt, type: 'RETURN', title: `Return ${r.returnNumber}`, status: r.status });
  for (const w of withdrawals) ev.push({ at: w.createdAt, type: 'COMMISSION', title: 'Commission withdrawal', status: w.status, amount: toNumber(w.amount) });
  ev.sort((a, b) => new Date(b.at) - new Date(a.at));
  return ev.slice(0, 40);
}

// Full control-center profile: identity, live stock, active settlements (with
// box breakdown), commission + eligibility, penalties, performance, activity.
const getProfile = asyncHandler(async (req, res) => {
  const rep = await prisma.salesRepresentative.findUnique({
    where: { id: req.params.id },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, isActive: true, createdAt: true } },
      _count: { select: { customers: true } },
    },
  });
  if (!rep) throw ApiError.notFound('Sales representative not found');

  const [{ stock, value }, comm, settlementsRes] = await Promise.all([
    repStockList(rep.id),
    commission.computeForRep(rep.id),
    settlement.list({ salesRepId: rep.id }, { skip: 0, take: 200, orderBy: { deadlineAt: 'asc' } }),
  ]);
  const performance = await repPerformance(rep.id, comm.boxesSettled);
  const activity = await repActivity(rep.id);

  // Active (unsettled) settlements, with box breakdown + pending-return flags.
  const active = settlementsRes.items.filter((s) => s.status !== 'SETTLED');
  const activeIds = active.map((s) => s.id);
  const pendingRetRows = activeIds.length
    ? await prisma.return.groupBy({ by: ['settlementId'], where: { settlementId: { in: activeIds }, status: 'PENDING' }, _count: { _all: true } })
    : [];
  const pendingMap = new Map(pendingRetRows.map((r) => [r.settlementId, r._count._all]));

  const activeSettlements = [];
  for (const s of active) {
    const bd = await settlement.orderBreakdown(s);
    activeSettlements.push({
      id: s.id,
      settlementNumber: s.settlementNumber,
      status: s.status,
      deadlineAt: s.deadlineAt,
      hoursRemaining: s.hoursRemaining,
      assignedValue: toNumber(s.assignedValue),
      balance: s.balance,
      pendingReturns: pendingMap.get(s.id) || 0,
      products: bd.lines.map((l) => l.name),
      boxesTaken: bd.totals.assignedBoxes,
      boxesSettled: bd.totals.settledBoxes,
      boxesReturned: bd.totals.returnedBoxes,
      boxesRemaining: bd.totals.remainingBoxes,
    });
  }

  const threshold = comm.rule.amountPerThreshold;
  return ok(res, {
    rep: {
      id: rep.id,
      code: rep.code,
      name: rep.user?.name,
      email: rep.user?.email,
      phone: rep.phone || rep.user?.phone || null,
      region: rep.region,
      isActive: rep.isActive,
      joinDate: rep.createdAt,
      monthlyTarget: rep.monthlyTarget ? toNumber(rep.monthlyTarget) : null,
      customers: rep._count?.customers ?? 0,
    },
    stock: { items: stock, value },
    commission: {
      earned: comm.earned,
      paid: comm.paid,
      available: comm.available,
      pending: comm.pending,
      pendingRequests: comm.pendingRequests,
      penalties: comm.penalties,
      penaltyBreakdown: comm.penaltyBreakdown,
      boxesSettled: comm.boxesSettled,
      perBox: comm.rule.perBox,
      threshold,
      eligible: comm.available >= threshold,
    },
    settlements: { active: activeSettlements, activeCount: active.length, total: settlementsRes.total },
    performance,
    activity,
  });
});

const getStock = asyncHandler(async (req, res) => {
  const rep = await prisma.salesRepresentative.findUnique({ where: { id: req.params.id } });
  if (!rep) throw ApiError.notFound('Sales representative not found');
  const result = await repStockList(rep.id);
  return ok(res, result);
});

const getReconciliation = asyncHandler(async (req, res) => {
  const rep = await prisma.salesRepresentative.findUnique({ where: { id: req.params.id } });
  if (!rep) throw ApiError.notFound('Sales representative not found');
  const items = await stockCount.repReconciliation(rep.id);
  return ok(res, { salesRepId: rep.id, items });
});

const create = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.body.userId }, include: { salesRep: true } });
  if (!user) throw ApiError.badRequest('User not found');
  if (user.salesRep) throw ApiError.conflict('This user is already a sales representative');

  let code = req.body.code;
  if (!code) {
    const count = await prisma.salesRepresentative.count();
    code = `REP-${pad(count + 1, 3)}`;
  }

  const rep = await prisma.salesRepresentative.create({
    data: {
      userId: req.body.userId,
      code,
      region: req.body.region || null,
      phone: req.body.phone || null,
      monthlyTarget: req.body.monthlyTarget ?? null,
      isActive: req.body.isActive ?? true,
    },
    include: { user: { select: { name: true, email: true } } },
  });
  await audit.record(req, { action: 'CREATE', entityType: 'SalesRepresentative', entityId: rep.id, newValues: { code } });
  return created(res, rep);
});

const update = asyncHandler(async (req, res) => {
  const existing = await prisma.salesRepresentative.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('Sales representative not found');
  const rep = await prisma.salesRepresentative.update({
    where: { id: req.params.id },
    data: req.body,
    include: { user: { select: { name: true, email: true } } },
  });
  await audit.record(req, { action: 'UPDATE', entityType: 'SalesRepresentative', entityId: rep.id, oldValues: existing, newValues: req.body });
  return ok(res, rep);
});

const remove = asyncHandler(async (req, res) => {
  const movements = await prisma.inventoryTransaction.count({ where: { salesRepId: req.params.id } });
  if (movements > 0) {
    const rep = await prisma.salesRepresentative.update({ where: { id: req.params.id }, data: { isActive: false } });
    await audit.record(req, { action: 'DEACTIVATE', entityType: 'SalesRepresentative', entityId: rep.id });
    return ok(res, { ...rep, deactivated: true, reason: 'has inventory history' });
  }
  await prisma.salesRepresentative.delete({ where: { id: req.params.id } });
  await audit.record(req, { action: 'DELETE', entityType: 'SalesRepresentative', entityId: req.params.id });
  return ok(res, { id: req.params.id, deleted: true });
});

// DANGER: wipe ALL business activity for a rep (used to reset a test account),
// keeping the rep + user account intact. Deletes settlements, sales, returns,
// stock requests, transfers, withdrawals, penalties, stock counts, the rep's
// inventory ledger entries, and notifications — then rebuilds caches. Warehouse-
// side ledger entries are left untouched, so warehouse stock does NOT change.
const resetData = asyncHandler(async (req, res) => {
  const repId = req.params.id;
  const rep = await prisma.salesRepresentative.findUnique({
    where: { id: repId },
    include: { user: { select: { id: true } } },
  });
  if (!rep) throw ApiError.notFound('Sales representative not found');
  // Safety: caller must echo the rep code (e.g. "REP-001") to confirm.
  if (req.body.confirm !== rep.code) {
    throw ApiError.badRequest(`To confirm, send { "confirm": "${rep.code}" }`);
  }

  const summary = await prisma.$transaction(async (tx) => {
    const settlements = await tx.settlement.findMany({ where: { salesRepId: repId }, select: { id: true } });
    const settlementIds = settlements.map((s) => s.id);
    const transfers = await tx.stockTransfer.findMany({ where: { OR: [{ toRepId: repId }, { fromRepId: repId }] }, select: { id: true } });
    const requests = await tx.stockRequest.findMany({ where: { salesRepId: repId }, select: { id: true } });
    const sales = await tx.sale.findMany({ where: { OR: [{ salesRepId: repId }, { settlementId: { in: settlementIds } }] }, select: { id: true } });
    const returns = await tx.return.findMany({ where: { OR: [{ salesRepId: repId }, { settlementId: { in: settlementIds } }] }, select: { id: true } });
    const withdrawals = await tx.commissionWithdrawal.findMany({ where: { salesRepId: repId }, select: { id: true } });
    const entityIds = [
      ...settlementIds,
      ...transfers.map((t) => t.id),
      ...requests.map((r) => r.id),
      ...sales.map((s) => s.id),
      ...returns.map((r) => r.id),
      ...withdrawals.map((w) => w.id),
    ];

    // Rep-side ledger only -> rep stock becomes 0; warehouse entries stay.
    const invDel = await tx.inventoryTransaction.deleteMany({ where: { salesRepId: repId } });
    await tx.repStock.deleteMany({ where: { salesRepId: repId } });

    // Business records (children cascade from their parents).
    await tx.sale.deleteMany({ where: { OR: [{ salesRepId: repId }, { settlementId: { in: settlementIds } }] } });
    await tx.creditSale.deleteMany({ where: { salesRepId: repId } });
    await tx.return.deleteMany({ where: { OR: [{ salesRepId: repId }, { settlementId: { in: settlementIds } }] } });
    await tx.settlementPenalty.deleteMany({ where: { OR: [{ salesRepId: repId }, { settlementId: { in: settlementIds } }] } });
    await tx.commissionWithdrawal.deleteMany({ where: { salesRepId: repId } });
    await tx.settlement.deleteMany({ where: { salesRepId: repId } });
    await tx.stockRequest.deleteMany({ where: { salesRepId: repId } });
    await tx.stockTransfer.deleteMany({ where: { OR: [{ toRepId: repId }, { fromRepId: repId }] } });
    await tx.stockCount.deleteMany({ where: { salesRepId: repId } });

    // Notifications: the rep's own + any admin alerts pointing at deleted records.
    await tx.notification.deleteMany({ where: { OR: [{ userId: rep.user.id }, { entityId: { in: entityIds } }] } });

    return {
      settlements: settlementIds.length,
      sales: sales.length,
      returns: returns.length,
      stockRequests: requests.length,
      transfers: transfers.length,
      withdrawals: withdrawals.length,
      inventoryTransactions: invDel.count,
    };
  }, { timeout: 120000 });

  // Rebuild stock caches from the remaining ledger (rep -> 0, warehouse same).
  // Done AFTER the transaction — recomputeAllCaches opens its own transaction
  // and can't run nested inside an interactive one.
  await inventory.recomputeAllCaches();

  await audit.record(req, { action: 'DELETE', entityType: 'SalesRepresentative', entityId: repId, newValues: { reset: true, ...summary } });
  return ok(res, { repId, code: rep.code, reset: true, ...summary });
});

module.exports = { list, get, getProfile, getStock, getReconciliation, create, update, remove, resetData };
