'use strict';

const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, paginated } = require('../utils/response');
const { parsePagination } = require('../utils/pagination');
const commission = require('../services/commission.service');
const finance = require('../services/finance.service');
const audit = require('../services/audit.service');
const { ROLES } = require('../middleware/authorize');

const me = asyncHandler(async (req, res) => {
  if (!req.user.salesRepId) throw ApiError.forbidden('Only sales representatives have commissions');
  return ok(res, await commission.computeForRep(req.user.salesRepId));
});

const getForRep = asyncHandler(async (req, res) => ok(res, await commission.computeForRep(req.params.salesRepId)));

const summary = asyncHandler(async (_req, res) => ok(res, await commission.summaryAllReps()));

const rule = asyncHandler(async (_req, res) => ok(res, await commission.getRule()));

const listWithdrawals = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const pagination = parsePagination(q, { defaultSortBy: 'requestedAt', defaultSortDir: 'desc', allowedSortFields: ['requestedAt', 'createdAt', 'amount'] });
  const filters = { ...q };
  if (req.user.role === ROLES.SALES_REP) filters.salesRepId = req.user.salesRepId;
  const { items, total } = await commission.listWithdrawals(filters, pagination);
  return paginated(res, items, { page: pagination.page, limit: pagination.limit, total });
});

const requestWithdrawal = asyncHandler(async (req, res) => {
  if (!req.user.salesRepId) throw ApiError.forbidden('Only sales representatives can request withdrawals');
  const w = await commission.requestWithdrawal(req.user.salesRepId, req.body.amount, req.body.notes, req.user);
  await audit.record(req, { action: 'CREATE', entityType: 'CommissionWithdrawal', entityId: w.id, newValues: { amount: w.amount } });
  return created(res, w);
});

const decideWithdrawal = asyncHandler(async (req, res) => {
  const w = await commission.decideWithdrawal(req.params.id, req.body.action, req.user);
  // Paying a withdrawal is real money out of a business account.
  if (w.status === 'PAID') {
    finance.recordCommissionPayment({ amount: w.amount, who: w.salesRep?.user?.name, refId: w.id, occurredAt: w.paidAt || new Date() }, req.user).catch(() => {});
  }
  await audit.record(req, { action: req.body.action, entityType: 'CommissionWithdrawal', entityId: req.params.id });
  return ok(res, w);
});

module.exports = { me, getForRep, summary, rule, listWithdrawals, requestWithdrawal, decideWithdrawal };
