'use strict';

// ===========================================================================
// BUSINESS FINANCE
//
// One ledger (FinanceTransaction) is the single source of truth. An account's
// balance = openingBalance + Σ(IN) − Σ(OUT). Auto-income posts when a settlement
// or a warehouse cash sale completes; expenses post OUT. Net business profit =
// gross profit − expenses.
// ===========================================================================

const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const reports = require('./reports.service');
const inventory = require('./inventory.service');
const commission = require('./commission.service');
const { nextDocNumber } = require('../utils/numbering');
const { toNumber, round2 } = require('../utils/money');
const { dayjs, resolveRange } = require('../utils/dates');

// Generic payment accounts — WHERE money sits. The brand a transaction belongs
// to is a separate dimension (FinanceTransaction.brandId), so any brand can be
// paid through any account and new accounts/brands never need a redesign.
const DEFAULT_ACCOUNTS = [
  { name: 'Cash', type: 'CASH', isDefault: true, sortOrder: 0, notes: 'Physical cash collected' },
  { name: 'M-Pesa', type: 'MOBILE_MONEY', sortOrder: 1, notes: '0766 790 794 · CASMIRY CHUWA · OHIS payments' },
  { name: 'Airtel Money', type: 'MOBILE_MONEY', sortOrder: 2, notes: '0788 734 003 · CASMIRY CHUWA · Civlily payments' },
];
const DEFAULT_CATEGORIES = [
  'Stock Purchase', 'Shipping', 'Freight', 'Customs', 'Warehouse', 'Transport',
  'Fuel', 'Marketing', 'Packaging', 'Salaries', 'Commission Payments', 'Internet',
  'Office Expenses', 'Utilities', 'Miscellaneous',
];

let ensured = false;
// Seed the default accounts + expense categories once (idempotent).
async function ensureDefaults() {
  if (ensured) return;
  if ((await prisma.businessAccount.count()) === 0) {
    for (const a of DEFAULT_ACCOUNTS) {
      await prisma.businessAccount.create({ data: { name: a.name, type: a.type, isDefault: !!a.isDefault, sortOrder: a.sortOrder, notes: a.notes || null } });
    }
  }
  if ((await prisma.expenseCategory.count()) === 0) {
    await prisma.expenseCategory.createMany({ data: DEFAULT_CATEGORIES.map((name) => ({ name, isDefault: true })), skipDuplicates: true });
  }
  ensured = true;
}

function periodRange(period) {
  const now = dayjs();
  if (period === 'today') return { start: now.startOf('day').toDate(), end: now.endOf('day').toDate() };
  if (period === 'week') return { start: now.startOf('week').toDate(), end: now.endOf('week').toDate() };
  if (period === 'month') return { start: now.startOf('month').toDate(), end: now.endOf('month').toDate() };
  if (period === 'year') return { start: now.startOf('year').toDate(), end: now.endOf('year').toDate() };
  return null; // all time
}

// --- Accounts --------------------------------------------------------------

async function accountBalances() {
  await ensureDefaults();
  const [accounts, grouped] = await Promise.all([
    prisma.businessAccount.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    prisma.financeTransaction.groupBy({ by: ['accountId', 'direction'], _sum: { amount: true } }),
  ]);
  const inMap = new Map();
  const outMap = new Map();
  grouped.forEach((g) => (g.direction === 'IN' ? inMap : outMap).set(g.accountId, toNumber(g._sum.amount)));
  return accounts.map((a) => {
    const moneyIn = round2(inMap.get(a.id) || 0);
    const moneyOut = round2(outMap.get(a.id) || 0);
    const opening = toNumber(a.openingBalance);
    return {
      id: a.id, name: a.name, type: a.type, currency: a.currency, isDefault: a.isDefault, notes: a.notes,
      brandId: a.brandId || null,
      openingBalance: opening, moneyIn, moneyOut, balance: round2(opening + moneyIn - moneyOut),
    };
  });
}

async function defaultAccount() {
  await ensureDefaults();
  return (
    (await prisma.businessAccount.findFirst({ where: { isDefault: true, isActive: true } })) ||
    (await prisma.businessAccount.findFirst({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }))
  );
}

async function createAccount(data) {
  const name = (data.name || '').trim();
  if (!name) throw ApiError.badRequest('Account name is required');
  const max = await prisma.businessAccount.aggregate({ _max: { sortOrder: true } });
  return prisma.businessAccount.create({
    data: {
      name,
      type: data.type || 'OTHER',
      brandId: data.brandId || null,
      openingBalance: round2(toNumber(data.openingBalance)),
      notes: data.notes || null,
      sortOrder: (max._max.sortOrder || 0) + 1,
    },
  });
}

async function updateAccount(id, data) {
  const existing = await prisma.businessAccount.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Account not found');
  const patch = {};
  ['name', 'type', 'notes'].forEach((k) => { if (data[k] !== undefined) patch[k] = data[k]; });
  if (data.brandId !== undefined) patch.brandId = data.brandId || null;
  if (data.openingBalance !== undefined) patch.openingBalance = round2(toNumber(data.openingBalance));
  if (data.isActive !== undefined) patch.isActive = data.isActive;
  return { updated: await prisma.businessAccount.update({ where: { id }, data: patch }), previous: existing };
}

// --- Historical backfill -----------------------------------------------------
// Rebuild the finance ledger from the REAL business records that already exist:
// every settled sale and direct warehouse CASH sale becomes an IN transaction
// (dated when the money actually arrived), every PAID commission withdrawal an
// OUT. Idempotent — keyed by refId — so it never double-counts and self-heals
// if an auto-post hook was ever missed. No fake data: only derived records.
async function backfillFromHistory() {
  await ensureDefaults();
  const acc = await defaultAccount();
  if (!acc) return { incomeCreated: 0, paymentsCreated: 0 };

  // Money in: settlement-linked sales (settled boxes = cash received) and
  // direct warehouse CASH sales (no rep).
  const [sales, existingSaleTxns] = await Promise.all([
    prisma.sale.findMany({
      where: {
        status: { not: 'CANCELLED' },
        type: 'CASH',
        OR: [{ settlementId: { not: null } }, { salesRepId: null }],
      },
      select: {
        id: true, saleNumber: true, total: true, soldAt: true, settlementId: true,
        salesRep: { select: { user: { select: { name: true } } } },
      },
      orderBy: { soldAt: 'asc' },
    }),
    prisma.financeTransaction.findMany({ where: { refType: 'Sale' }, select: { refId: true } }),
  ]);
  const have = new Set(existingSaleTxns.map((t) => t.refId));

  // Which brand each sale belongs to (single-brand sales only; mixed = null).
  const saleIds = sales.map((s) => s.id);
  const saleItems = saleIds.length
    ? await prisma.saleItem.findMany({
        where: { saleId: { in: saleIds } },
        select: { saleId: true, product: { select: { brandId: true } } },
      })
    : [];
  const brandsBySale = new Map();
  for (const it of saleItems) {
    const set = brandsBySale.get(it.saleId) || new Set();
    if (it.product?.brandId) set.add(it.product.brandId);
    brandsBySale.set(it.saleId, set);
  }
  const saleBrand = (saleId) => {
    const set = brandsBySale.get(saleId);
    return set && set.size === 1 ? [...set][0] : null;
  };

  let incomeCreated = 0;
  for (const s of sales) {
    if (have.has(s.id)) continue;
    const fromSettlement = !!s.settlementId;
    const txnNumber = await nextDocNumber(prisma.financeTransaction, 'txnNumber', 'FTX');
    await prisma.financeTransaction.create({
      data: {
        txnNumber,
        accountId: acc.id,
        direction: 'IN',
        type: fromSettlement ? 'SETTLEMENT' : 'WAREHOUSE_SALE',
        amount: round2(toNumber(s.total)),
        brandId: saleBrand(s.id),
        category: fromSettlement ? 'Settlement received' : 'Warehouse sale',
        description: fromSettlement
          ? `Settlement received${s.salesRep?.user?.name ? ` — ${s.salesRep.user.name}` : ''}`
          : 'Direct warehouse sale',
        reference: s.saleNumber,
        refType: 'Sale',
        refId: s.id,
        occurredAt: s.soldAt,
      },
    });
    incomeCreated++;
  }

  // Retro-tag brand on sale-income rows created before the brand dimension
  // existed (idempotent — only touches rows still missing a brand).
  const untagged = await prisma.financeTransaction.findMany({
    where: { refType: 'Sale', brandId: null, refId: { in: saleIds } },
    select: { id: true, refId: true },
  });
  let brandTagged = 0;
  for (const t of untagged) {
    const b = saleBrand(t.refId);
    if (!b) continue;
    await prisma.financeTransaction.update({ where: { id: t.id }, data: { brandId: b } });
    brandTagged++;
  }

  // Money out: commission withdrawals already PAID.
  const [paidWithdrawals, existingWTxns] = await Promise.all([
    prisma.commissionWithdrawal.findMany({
      where: { status: 'PAID' },
      include: { salesRep: { include: { user: { select: { name: true } } } } },
    }),
    prisma.financeTransaction.findMany({ where: { refType: 'CommissionWithdrawal' }, select: { refId: true } }),
  ]);
  const haveW = new Set(existingWTxns.map((t) => t.refId));
  let paymentsCreated = 0;
  for (const w of paidWithdrawals) {
    if (haveW.has(w.id)) continue;
    const txnNumber = await nextDocNumber(prisma.financeTransaction, 'txnNumber', 'FTX');
    await prisma.financeTransaction.create({
      data: {
        txnNumber,
        accountId: acc.id,
        direction: 'OUT',
        type: 'COMMISSION_PAYMENT',
        amount: round2(toNumber(w.amount)),
        category: 'Commission Payments',
        description: `Commission paid${w.salesRep?.user?.name ? ` — ${w.salesRep.user.name}` : ''}`,
        refType: 'CommissionWithdrawal',
        refId: w.id,
        occurredAt: w.paidAt || w.decidedAt || w.createdAt,
      },
    });
    paymentsCreated++;
  }

  return { incomeCreated, paymentsCreated, brandTagged };
}

// --- Transactions ----------------------------------------------------------

async function recordTransaction(data, actor) {
  const amount = round2(toNumber(data.amount));
  if (!(amount > 0)) throw ApiError.badRequest('Amount must be greater than zero');
  const account = await prisma.businessAccount.findUnique({ where: { id: data.accountId } });
  if (!account || !account.isActive) throw ApiError.badRequest('Select a valid account');
  const txnNumber = await nextDocNumber(prisma.financeTransaction, 'txnNumber', 'FTX');
  return prisma.financeTransaction.create({
    data: {
      txnNumber,
      accountId: data.accountId,
      direction: data.direction,
      type: data.type || (data.direction === 'IN' ? 'INCOME' : 'EXPENSE'),
      amount,
      brandId: data.brandId || null,
      category: data.category || null,
      description: data.description || null,
      reference: data.reference || null,
      refType: data.refType || null,
      refId: data.refId || null,
      receiptUrl: data.receiptUrl || null,
      notes: data.notes || null,
      occurredAt: data.occurredAt ? new Date(data.occurredAt) : new Date(),
      createdById: actor ? actor.id : null,
    },
  });
}

const recordExpense = (data, actor) => recordTransaction({ ...data, direction: 'OUT', type: 'EXPENSE' }, actor);
const recordIncome = (data, actor) => recordTransaction({ ...data, direction: 'IN', type: 'INCOME' }, actor);

// Automatic money-in for a completed cash sale (settlement or direct warehouse).
// `accountId` = the payment account the money actually went to (rep's choice on
// submission); falls back to the default (Cash). `brandId` tags whose money it
// is. Best-effort — never throws into the sale/settlement flow.
async function recordSaleIncome({ saleId, saleNumber, amount, fromSettlement, who, occurredAt, accountId, brandId }, actor) {
  try {
    const amt = round2(toNumber(amount));
    if (!(amt > 0)) return null;
    let account = null;
    if (accountId) account = await prisma.businessAccount.findFirst({ where: { id: accountId, isActive: true } });
    if (!account) account = await defaultAccount();
    if (!account) return null;
    return await recordTransaction(
      {
        accountId: account.id,
        direction: 'IN',
        type: fromSettlement ? 'SETTLEMENT' : 'WAREHOUSE_SALE',
        amount: amt,
        brandId: brandId || null,
        category: fromSettlement ? 'Settlement received' : 'Warehouse sale',
        description: fromSettlement ? `Settlement received${who ? ` — ${who}` : ''}` : 'Direct warehouse sale',
        reference: saleNumber || null,
        refType: 'Sale',
        refId: saleId || null,
        occurredAt,
      },
      actor,
    );
  } catch (e) {
    return null;
  }
}

// Automatic money-out when a commission withdrawal is paid.
async function recordCommissionPayment({ amount, who, reference, refId, occurredAt }, actor) {
  try {
    const amt = round2(toNumber(amount));
    if (!(amt > 0)) return null;
    const acc = await defaultAccount();
    if (!acc) return null;
    return await recordTransaction(
      {
        accountId: acc.id,
        direction: 'OUT',
        type: 'COMMISSION_PAYMENT',
        amount: amt,
        category: 'Commission Payments',
        description: `Commission paid${who ? ` — ${who}` : ''}`,
        reference: reference || null,
        refType: 'CommissionWithdrawal',
        refId: refId || null,
        occurredAt,
      },
      actor,
    );
  } catch (e) {
    return null;
  }
}

async function listTransactions(filters, pagination) {
  const where = {};
  if (filters.accountId) where.accountId = filters.accountId;
  if (filters.direction) where.direction = filters.direction;
  if (filters.type) where.type = filters.type;
  if (filters.category) where.category = filters.category;
  if (filters.brandId) where.brandId = filters.brandId === 'none' ? null : filters.brandId;
  if (filters.from || filters.to) {
    where.occurredAt = {};
    if (filters.from) where.occurredAt.gte = new Date(filters.from);
    if (filters.to) where.occurredAt.lte = new Date(filters.to);
  }
  if (filters.minAmount != null || filters.maxAmount != null) {
    where.amount = {};
    if (filters.minAmount != null) where.amount.gte = filters.minAmount;
    if (filters.maxAmount != null) where.amount.lte = filters.maxAmount;
  }
  const [items, total, brands] = await Promise.all([
    prisma.financeTransaction.findMany({
      where,
      include: { account: { select: { name: true, type: true } } },
      skip: pagination.skip,
      take: pagination.take,
      orderBy: pagination.orderBy,
    }),
    prisma.financeTransaction.count({ where }),
    prisma.brand.findMany({ select: { id: true, name: true } }),
  ]);
  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  return { items: items.map((t) => ({ ...t, brandName: t.brandId ? brandName.get(t.brandId) || null : null })), total };
}

async function updateTransaction(id, data) {
  const existing = await prisma.financeTransaction.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Transaction not found');
  const patch = {};
  ['category', 'description', 'notes', 'accountId', 'reference'].forEach((k) => { if (data[k] !== undefined) patch[k] = data[k]; });
  if (data.amount !== undefined) patch.amount = round2(toNumber(data.amount));
  if (data.occurredAt !== undefined) patch.occurredAt = new Date(data.occurredAt);
  const updated = await prisma.financeTransaction.update({ where: { id }, data: patch });
  return { updated, previous: existing };
}

async function deleteTransaction(id) {
  const existing = await prisma.financeTransaction.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Transaction not found');
  await prisma.financeTransaction.delete({ where: { id } });
  return existing;
}

// --- Categories ------------------------------------------------------------

async function listCategories() {
  await ensureDefaults();
  return prisma.expenseCategory.findMany({ where: { isActive: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] });
}
async function createCategory(name) {
  const n = (name || '').trim();
  if (!n) throw ApiError.badRequest('Category name is required');
  return prisma.expenseCategory.upsert({ where: { name: n }, create: { name: n }, update: { isActive: true } });
}

// --- Cash flow ----------------------------------------------------------------

// Resolve { period } or { from, to } into a date range (null = all time).
function rangeFor(opts = {}) {
  if (opts.from || opts.to) return resolveRange({ from: opts.from, to: opts.to });
  if (opts.period && opts.period !== 'all') return resolveRange({ period: opts.period });
  return null;
}

async function flowBetween(start, end) {
  const where = {};
  if (start || end) where.occurredAt = { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) };
  const [i, o] = await Promise.all([
    prisma.financeTransaction.aggregate({ where: { ...where, direction: 'IN' }, _sum: { amount: true } }),
    prisma.financeTransaction.aggregate({ where: { ...where, direction: 'OUT' }, _sum: { amount: true } }),
  ]);
  const moneyIn = round2(toNumber(i._sum.amount));
  const moneyOut = round2(toNumber(o._sum.amount));
  return { moneyIn, moneyOut, net: round2(moneyIn - moneyOut) };
}

// Cash-flow statement for a window: opening balance (all money before the
// window), money in/out, and the closing balance. All-time uses the accounts'
// opening balances as the opening figure.
async function cashflow(opts = {}) {
  await ensureDefaults();
  await backfillFromHistory().catch(() => {});
  const range = rangeFor(opts);
  const openAgg = await prisma.businessAccount.aggregate({ where: { isActive: true }, _sum: { openingBalance: true } });
  const baseOpening = round2(toNumber(openAgg._sum.openingBalance));
  const before = range ? await flowBetween(null, new Date(range.start.getTime() - 1)) : { net: 0 };
  const openingBalance = round2(baseOpening + before.net);
  const inPeriod = await flowBetween(range ? range.start : null, range ? range.end : null);
  return {
    period: opts.from || opts.to ? 'custom' : opts.period || 'all',
    range: range ? { start: range.start, end: range.end } : null,
    openingBalance,
    ...inPeriod,
    closingBalance: round2(openingBalance + inPeriod.net),
  };
}

// --- Financial report ----------------------------------------------------------

// One consolidated report for a period or custom date range: P&L, cash flow,
// supplier/commission payments, stock-purchase spend, top products & brands.
async function report(opts = {}) {
  await ensureDefaults();
  const profOpts = opts.from || opts.to ? { from: opts.from, to: opts.to } : { period: opts.period || 'all' };
  const [prof, cf] = await Promise.all([reports.profitOverview(profOpts), cashflow(opts)]);
  const range = rangeFor(opts);
  const base = range ? { occurredAt: { gte: range.start, lte: range.end } } : {};
  const sumOf = async (extra) =>
    round2(toNumber((await prisma.financeTransaction.aggregate({ where: { ...base, ...extra }, _sum: { amount: true } }))._sum.amount));
  const [expenses, supplierPayments, commissionPaid, otherIncome] = await Promise.all([
    sumOf({ direction: 'OUT', type: 'EXPENSE' }),
    sumOf({ direction: 'OUT', type: 'STOCK_PURCHASE' }),
    sumOf({ direction: 'OUT', type: 'COMMISSION_PAYMENT' }),
    sumOf({ direction: 'IN', type: 'INCOME' }),
  ]);
  return {
    range: range ? { start: range.start, end: range.end } : null,
    period: cf.period,
    revenue: prof.totals.revenue,
    cogs: prof.totals.cost,
    grossProfit: prof.totals.profit,
    margin: prof.totals.margin,
    boxesSold: prof.totals.boxes,
    expenses,
    netProfit: round2(prof.totals.profit - expenses),
    supplierPayments,
    commissionPaid,
    otherIncome,
    cashFlow: {
      openingBalance: cf.openingBalance,
      moneyIn: cf.moneyIn,
      moneyOut: cf.moneyOut,
      net: cf.net,
      closingBalance: cf.closingBalance,
    },
    topProducts: prof.byProduct.slice(0, 8),
    topBrands: prof.byBrand,
  };
}

// --- Suppliers (accounts payable) -----------------------------------------------

// Every supplier with their financial picture: total purchased (non-cancelled
// POs), total paid (ledger payments keyed to their POs), outstanding balance.
async function supplierSummaries() {
  await ensureDefaults();
  const [suppliers, pos, brands] = await Promise.all([
    prisma.supplier.findMany({ orderBy: { name: 'asc' } }),
    prisma.purchaseOrder.findMany({
      where: { status: { not: 'CANCELLED' } },
      select: { id: true, supplierId: true, totalCost: true, receivedAt: true, createdAt: true },
    }),
    prisma.brand.findMany({ select: { id: true, name: true } }),
  ]);
  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const poIds = pos.map((p) => p.id);
  const payRows = poIds.length
    ? await prisma.financeTransaction.groupBy({
        by: ['refId'],
        where: { refType: 'PurchaseOrder', refId: { in: poIds }, direction: 'OUT' },
        _sum: { amount: true },
      })
    : [];
  const paidByPo = new Map(payRows.map((p) => [p.refId, toNumber(p._sum.amount)]));

  const agg = new Map();
  for (const p of pos) {
    const cur = agg.get(p.supplierId) || { purchased: 0, paid: 0, poCount: 0, last: null };
    cur.purchased += toNumber(p.totalCost);
    cur.paid += paidByPo.get(p.id) || 0;
    cur.poCount += 1;
    const d = p.receivedAt || p.createdAt;
    if (!cur.last || d > cur.last) cur.last = d;
    agg.set(p.supplierId, cur);
  }
  return suppliers.map((s) => {
    const f = agg.get(s.id) || { purchased: 0, paid: 0, poCount: 0, last: null };
    return {
      id: s.id, name: s.name, country: s.country, contactName: s.contactName,
      phone: s.phone, email: s.email, isActive: s.isActive,
      brandId: s.brandId || null, brandName: s.brandId ? brandName.get(s.brandId) || null : null,
      totalPurchased: round2(f.purchased),
      totalPaid: round2(f.paid),
      outstanding: round2(f.purchased - f.paid),
      poCount: f.poCount,
      lastActivity: f.last,
    };
  });
}

// One supplier's purchase history + payments, with per-PO paid/outstanding.
async function supplierDetail(id) {
  const s = await prisma.supplier.findUnique({ where: { id } });
  if (!s) throw ApiError.notFound('Supplier not found');
  const pos = await prisma.purchaseOrder.findMany({
    where: { supplierId: id, status: { not: 'CANCELLED' } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, poNumber: true, status: true, totalCost: true, receivedAt: true, createdAt: true },
  });
  const poIds = pos.map((p) => p.id);
  const txns = poIds.length
    ? await prisma.financeTransaction.findMany({
        where: { refType: 'PurchaseOrder', refId: { in: poIds }, direction: 'OUT' },
        include: { account: { select: { name: true } } },
        orderBy: { occurredAt: 'desc' },
      })
    : [];
  const paidByPo = new Map();
  txns.forEach((t) => paidByPo.set(t.refId, (paidByPo.get(t.refId) || 0) + toNumber(t.amount)));

  const orders = pos.map((p) => {
    const total = toNumber(p.totalCost);
    const paid = round2(paidByPo.get(p.id) || 0);
    return {
      id: p.id, poNumber: p.poNumber, status: p.status,
      totalCost: round2(total), paid, outstanding: round2(total - paid),
      receivedAt: p.receivedAt, createdAt: p.createdAt,
    };
  });
  const purchased = round2(orders.reduce((x, o) => x + o.totalCost, 0));
  const paid = round2(orders.reduce((x, o) => x + o.paid, 0));
  return {
    supplier: s,
    orders,
    payments: txns.map((t) => ({
      id: t.id, txnNumber: t.txnNumber, amount: toNumber(t.amount), account: t.account?.name,
      reference: t.reference, occurredAt: t.occurredAt, notes: t.notes,
    })),
    totals: { purchased, paid, outstanding: round2(purchased - paid) },
  };
}

// Pay a supplier against a purchase order: posts a STOCK_PURCHASE OUT
// transaction from the chosen account (immediately reducing its balance) and
// tracks against the PO so the supplier's outstanding falls. Over-payment is
// blocked.
async function paySupplier({ purchaseOrderId, accountId, amount, notes, occurredAt }, actor) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    include: { supplier: { select: { name: true, brandId: true } } },
  });
  if (!po) throw ApiError.notFound('Purchase order not found');
  if (po.status === 'CANCELLED') throw ApiError.badRequest('This purchase order is cancelled');
  const paidAgg = await prisma.financeTransaction.aggregate({
    where: { refType: 'PurchaseOrder', refId: po.id, direction: 'OUT' },
    _sum: { amount: true },
  });
  const alreadyPaid = toNumber(paidAgg._sum.amount);
  const remaining = round2(toNumber(po.totalCost) - alreadyPaid);
  const amt = amount != null ? round2(toNumber(amount)) : remaining;
  if (!(amt > 0)) throw ApiError.badRequest('Payment amount must be greater than zero');
  if (amt > remaining + 0.001) {
    throw ApiError.badRequest(`Only TZS ${remaining.toLocaleString()} is outstanding on ${po.poNumber}`);
  }
  return recordTransaction(
    {
      accountId,
      direction: 'OUT',
      type: 'STOCK_PURCHASE',
      amount: amt,
      // Supplier's brand → this spend belongs to that brand's books.
      brandId: po.supplier?.brandId || null,
      category: 'Stock Purchase',
      description: `Supplier payment — ${po.supplier?.name || 'supplier'} (${po.poNumber})`,
      reference: po.poNumber,
      refType: 'PurchaseOrder',
      refId: po.id,
      notes,
      occurredAt,
    },
    actor,
  );
}

// --- Finance dashboard -----------------------------------------------------

async function overview(period = 'month') {
  await ensureDefaults();
  // Self-healing sync: fold any business activity not yet in the ledger
  // (historical or missed) into finance before computing. Idempotent by refId.
  await backfillFromHistory().catch(() => {});
  const [accounts, prof, inv, commSummary] = await Promise.all([
    accountBalances(),
    reports.profitOverview(period),
    inventory.valuation(),
    commission.summaryAllReps(),
  ]);

  const cashPosition = round2(accounts.reduce((s, a) => s + a.balance, 0));

  // Money in / out for each window.
  const flow = {};
  for (const p of ['today', 'week', 'month', 'all']) {
    const range = periodRange(p);
    const base = range ? { occurredAt: { gte: range.start, lte: range.end } } : {};
    const [inAgg, outAgg] = await Promise.all([
      prisma.financeTransaction.aggregate({ where: { ...base, direction: 'IN' }, _sum: { amount: true } }),
      prisma.financeTransaction.aggregate({ where: { ...base, direction: 'OUT' }, _sum: { amount: true } }),
    ]);
    const moneyIn = round2(toNumber(inAgg._sum.amount));
    const moneyOut = round2(toNumber(outAgg._sum.amount));
    flow[p] = { moneyIn, moneyOut, net: round2(moneyIn - moneyOut) };
  }

  // Expenses + breakdown for the selected period.
  const range = periodRange(period);
  const expWhere = { direction: 'OUT', type: 'EXPENSE', ...(range ? { occurredAt: { gte: range.start, lte: range.end } } : {}) };
  const [expAgg, byCat] = await Promise.all([
    prisma.financeTransaction.aggregate({ where: expWhere, _sum: { amount: true } }),
    prisma.financeTransaction.groupBy({ by: ['category'], where: expWhere, _sum: { amount: true }, _count: true }),
  ]);
  const expenses = round2(toNumber(expAgg._sum.amount));
  const expenseBreakdown = byCat
    .map((c) => ({ category: c.category || 'Uncategorised', amount: round2(toNumber(c._sum.amount)), count: c._count }))
    .sort((a, b) => b.amount - a.amount);

  const grossProfit = prof.totals.profit;
  const netProfit = round2(grossProfit - expenses);

  // ── Per-brand finance: each brand's P&L, cash movement and inventory value,
  // computed from real transactions/records only. Scales to any brand count.
  const [allBrands, brandTxnRows, products] = await Promise.all([
    prisma.brand.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    prisma.financeTransaction.groupBy({
      by: ['brandId', 'direction', 'type'],
      where: range ? { occurredAt: { gte: range.start, lte: range.end } } : {},
      _sum: { amount: true },
    }),
    prisma.product.findMany({ select: { id: true, brandId: true } }),
  ]);
  const productBrand = new Map(products.map((p) => [p.id, p.brandId]));
  const invByBrand = new Map();
  for (const it of inv.items) {
    const b = productBrand.get(it.productId);
    if (!b) continue;
    const cur = invByBrand.get(b) || { cost: 0, units: 0 };
    cur.cost += it.costValue;
    cur.units += it.totalBase;
    invByBrand.set(b, cur);
  }
  const profByBrand = new Map(prof.byBrand.map((b) => [b.brandId, b]));
  const brandFinance = allBrands.map((b) => {
    const p = profByBrand.get(b.id) || { revenue: 0, cost: 0, profit: 0, boxes: 0, margin: 0 };
    let moneyIn = 0;
    let moneyOut = 0;
    let brandExpenses = 0;
    for (const r of brandTxnRows) {
      if (r.brandId !== b.id) continue;
      const amt = toNumber(r._sum.amount);
      if (r.direction === 'IN') moneyIn += amt;
      else {
        moneyOut += amt;
        if (r.type === 'EXPENSE' || r.type === 'STOCK_PURCHASE') brandExpenses += amt;
      }
    }
    const invB = invByBrand.get(b.id) || { cost: 0, units: 0 };
    return {
      brandId: b.id,
      name: b.name,
      revenue: p.revenue,
      cogs: p.cost,
      grossProfit: p.profit,
      margin: p.margin,
      boxesSold: p.boxes,
      expenses: round2(brandExpenses),
      netProfit: round2(p.profit - brandExpenses),
      moneyIn: round2(moneyIn),
      moneyOut: round2(moneyOut),
      netCash: round2(moneyIn - moneyOut),
      inventoryValue: round2(invB.cost),
      inventoryUnits: invB.units,
    };
  });

  return {
    period,
    cashPosition,
    accounts,
    flow,
    brandFinance,
    revenue: prof.totals.revenue,
    cogs: prof.totals.cost,
    grossProfit,
    expenses,
    netProfit,
    expenseBreakdown,
    byBrand: prof.byBrand,
    outstandingCommission: round2(commSummary.totals.pending),
    inventoryValue: {
      cost: inv.totals.totalValue,
      selling: inv.totals.retailValue,
      potential: round2(inv.totals.retailValue - inv.totals.totalValue),
      units: inv.totals.totalBaseUnits,
    },
  };
}

module.exports = {
  ensureDefaults,
  backfillFromHistory,
  accountBalances,
  defaultAccount,
  createAccount,
  updateAccount,
  recordTransaction,
  recordExpense,
  recordIncome,
  recordSaleIncome,
  recordCommissionPayment,
  listTransactions,
  updateTransaction,
  deleteTransaction,
  listCategories,
  createCategory,
  overview,
  cashflow,
  report,
  supplierSummaries,
  supplierDetail,
  paySupplier,
};
