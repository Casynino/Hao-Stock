'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok, created, paginated } = require('../utils/response');
const { parsePagination } = require('../utils/pagination');
const finance = require('../services/finance.service');
const audit = require('../services/audit.service');

const overview = asyncHandler(async (req, res) => ok(res, await finance.overview(req.query.period || 'month')));

const accounts = asyncHandler(async (_req, res) => ok(res, await finance.accountBalances()));

const createAccount = asyncHandler(async (req, res) => {
  const acc = await finance.createAccount(req.body);
  await audit.record(req, { action: 'CREATE', entityType: 'BusinessAccount', entityId: acc.id, newValues: { name: acc.name, type: acc.type, openingBalance: acc.openingBalance } });
  return created(res, acc);
});

const updateAccount = asyncHandler(async (req, res) => {
  const { updated, previous } = await finance.updateAccount(req.params.id, req.body);
  await audit.record(req, {
    action: 'UPDATE',
    entityType: 'BusinessAccount',
    entityId: updated.id,
    oldValues: { name: previous.name, openingBalance: previous.openingBalance, isActive: previous.isActive },
    newValues: req.body,
  });
  return ok(res, updated);
});

const categories = asyncHandler(async (_req, res) => ok(res, await finance.listCategories()));

const createCategory = asyncHandler(async (req, res) => {
  const cat = await finance.createCategory(req.body.name);
  await audit.record(req, { action: 'CREATE', entityType: 'ExpenseCategory', entityId: cat.id, newValues: { name: cat.name } });
  return created(res, cat);
});

const transactions = asyncHandler(async (req, res) => {
  const q = req.query;
  const pagination = parsePagination(q, { defaultSortBy: 'occurredAt', defaultSortDir: 'desc', allowedSortFields: ['occurredAt', 'amount', 'createdAt'] });
  const filters = {
    accountId: q.accountId,
    direction: q.direction,
    type: q.type,
    category: q.category,
    from: q.from,
    to: q.to,
    minAmount: q.minAmount != null && q.minAmount !== '' ? Number(q.minAmount) : null,
    maxAmount: q.maxAmount != null && q.maxAmount !== '' ? Number(q.maxAmount) : null,
  };
  const { items, total } = await finance.listTransactions(filters, pagination);
  return paginated(res, items, { page: pagination.page, limit: pagination.limit, total });
});

const recordExpense = asyncHandler(async (req, res) => {
  const txn = await finance.recordExpense(req.body, req.user);
  await audit.record(req, { action: 'CREATE', entityType: 'FinanceTransaction', entityId: txn.id, newValues: { kind: 'EXPENSE', amount: txn.amount, category: txn.category, accountId: txn.accountId } });
  return created(res, txn);
});

const recordIncome = asyncHandler(async (req, res) => {
  const txn = await finance.recordIncome(req.body, req.user);
  await audit.record(req, { action: 'CREATE', entityType: 'FinanceTransaction', entityId: txn.id, newValues: { kind: 'INCOME', amount: txn.amount, accountId: txn.accountId } });
  return created(res, txn);
});

const updateTransaction = asyncHandler(async (req, res) => {
  const { updated, previous } = await finance.updateTransaction(req.params.id, req.body);
  await audit.record(req, {
    action: 'UPDATE',
    entityType: 'FinanceTransaction',
    entityId: updated.id,
    oldValues: { amount: previous.amount, category: previous.category, description: previous.description, occurredAt: previous.occurredAt },
    newValues: { amount: req.body.amount, category: req.body.category, description: req.body.description, reason: req.body.reason || null },
  });
  return ok(res, updated);
});

const deleteTransaction = asyncHandler(async (req, res) => {
  const removed = await finance.deleteTransaction(req.params.id);
  await audit.record(req, {
    action: 'DELETE',
    entityType: 'FinanceTransaction',
    entityId: req.params.id,
    oldValues: { amount: removed.amount, direction: removed.direction, type: removed.type, category: removed.category, description: removed.description },
    newValues: { reason: req.body.reason || null },
  });
  return ok(res, { deleted: true, id: req.params.id });
});

module.exports = {
  overview, accounts, createAccount, updateAccount, categories, createCategory,
  transactions, recordExpense, recordIncome, updateTransaction, deleteTransaction,
};
