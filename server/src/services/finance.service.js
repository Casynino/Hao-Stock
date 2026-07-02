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
const { dayjs } = require('../utils/dates');

const DEFAULT_ACCOUNTS = [
  { name: 'Cash', type: 'CASH', isDefault: true, sortOrder: 0 },
  { name: 'CRDB Bank', type: 'BANK', sortOrder: 1 },
  { name: 'NMB Bank', type: 'BANK', sortOrder: 2 },
  { name: 'Airtel Money', type: 'MOBILE_MONEY', sortOrder: 3 },
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
      await prisma.businessAccount.create({ data: { name: a.name, type: a.type, isDefault: !!a.isDefault, sortOrder: a.sortOrder } });
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
      id: a.id, name: a.name, type: a.type, currency: a.currency, isDefault: a.isDefault,
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

  return { incomeCreated, paymentsCreated };
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
// Best-effort — never throws into the sale/settlement flow.
async function recordSaleIncome({ saleId, saleNumber, amount, fromSettlement, who, occurredAt }, actor) {
  try {
    const amt = round2(toNumber(amount));
    if (!(amt > 0)) return null;
    const acc = await defaultAccount();
    if (!acc) return null;
    return await recordTransaction(
      {
        accountId: acc.id,
        direction: 'IN',
        type: fromSettlement ? 'SETTLEMENT' : 'WAREHOUSE_SALE',
        amount: amt,
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
  const [items, total] = await Promise.all([
    prisma.financeTransaction.findMany({
      where,
      include: { account: { select: { name: true, type: true } } },
      skip: pagination.skip,
      take: pagination.take,
      orderBy: pagination.orderBy,
    }),
    prisma.financeTransaction.count({ where }),
  ]);
  return { items, total };
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

  return {
    period,
    cashPosition,
    accounts,
    flow,
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
};
