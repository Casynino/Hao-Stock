'use strict';

const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, paginated } = require('../utils/response');
const { parsePagination } = require('../utils/pagination');
const creditService = require('../services/credit.service');
const audit = require('../services/audit.service');
const { ROLES } = require('../middleware/authorize');

const list = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const pagination = parsePagination(q, { defaultSortBy: 'dueDate', defaultSortDir: 'asc', allowedSortFields: ['dueDate', 'balance', 'createdAt'] });
  const filters = { ...q };
  if (req.user.role === ROLES.SALES_REP) filters.salesRepId = req.user.salesRepId;
  const { items, total } = await creditService.listCredit(filters, pagination);
  return paginated(res, items, { page: pagination.page, limit: pagination.limit, total });
});

const summary = asyncHandler(async (_req, res) => {
  const data = await creditService.debtSummary();
  return ok(res, data);
});

const get = asyncHandler(async (req, res) => {
  const credit = await creditService.getCredit(req.params.id);
  if (req.user.role === ROLES.SALES_REP && credit.salesRepId !== req.user.salesRepId) {
    throw ApiError.forbidden('This debt does not belong to you');
  }
  return ok(res, credit);
});

const recordPayment = asyncHandler(async (req, res) => {
  const credit = await creditService.recordPayment(req.params.id, req.body, req.user);
  await audit.record(req, {
    action: 'CREDIT_PAYMENT',
    entityType: 'CreditSale',
    entityId: req.params.id,
    newValues: { amount: req.body.amount, balance: credit.balance },
  });
  return created(res, credit);
});

const refreshOverdue = asyncHandler(async (req, res) => {
  const result = await creditService.refreshOverdue();
  await audit.record(req, { action: 'REFRESH_OVERDUE', entityType: 'CreditSale' });
  return ok(res, result);
});

module.exports = { list, summary, get, recordPayment, refreshOverdue };
