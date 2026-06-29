'use strict';

const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, paginated } = require('../utils/response');
const { parsePagination } = require('../utils/pagination');
const settlement = require('../services/settlement.service');
const submission = require('../services/settlementSubmission.service');
const penalty = require('../services/penalty.service');
const audit = require('../services/audit.service');
const { ROLES } = require('../middleware/authorize');

const list = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const pagination = parsePagination(q, { defaultSortBy: 'deadlineAt', defaultSortDir: 'asc', allowedSortFields: ['deadlineAt', 'createdAt', 'assignedValue'] });
  const filters = { ...q };
  if (req.user.role === ROLES.SALES_REP) filters.salesRepId = req.user.salesRepId;
  const { items, total } = await settlement.list(filters, pagination);
  return paginated(res, items, { page: pagination.page, limit: pagination.limit, total });
});

const summary = asyncHandler(async (_req, res) => {
  // Fire-and-forget: keep reminders + real penalty deductions current.
  settlement.sendDueReminders().catch(() => {});
  penalty.applyDuePenalties().catch(() => {});
  return ok(res, await settlement.summary());
});

const get = asyncHandler(async (req, res) => {
  const s = await settlement.get(req.params.id);
  if (req.user.role === ROLES.SALES_REP && s.salesRepId !== req.user.salesRepId) {
    throw ApiError.forbidden('This order is not yours');
  }
  return ok(res, s);
});

const settle = asyncHandler(async (req, res) => {
  const result = await settlement.settle(req.params.id, req.user, req.body);
  await audit.record(req, { action: 'SETTLE', entityType: 'Settlement', entityId: req.params.id });
  return ok(res, result);
});

// Submit a settlement for approval — PENDING, no business impact until The
// Doctor approves. (Ownership is enforced in the service for reps.)
const submitSettlement = asyncHandler(async (req, res) => {
  const sub = await submission.submit(req.params.id, req.body, req.user);
  await audit.record(req, {
    action: 'SUBMIT_SETTLEMENT',
    entityType: 'SettlementSubmission',
    entityId: sub.id,
    newValues: { settlementId: req.params.id, productId: req.body.productId, boxes: sub.boxes, amount: sub.amount },
  });
  return created(res, sub);
});

// Admin approval center: all settlements awaiting verification.
const pendingApprovals = asyncHandler(async (_req, res) => ok(res, await submission.listPending()));

const approveSubmission = asyncHandler(async (req, res) => {
  const result = await submission.approve(req.params.id, req.user);
  await audit.record(req, { action: 'APPROVE_SETTLEMENT', entityType: 'SettlementSubmission', entityId: req.params.id });
  return ok(res, result);
});

const rejectSubmission = asyncHandler(async (req, res) => {
  const result = await submission.reject(req.params.id, req.user, req.body.reason);
  await audit.record(req, { action: 'REJECT_SETTLEMENT', entityType: 'SettlementSubmission', entityId: req.params.id });
  return ok(res, result);
});

const refreshOverdue = asyncHandler(async (_req, res) => ok(res, await settlement.refreshOverdue()));

const extendDeadline = asyncHandler(async (req, res) => {
  const result = await settlement.extendDeadline(req.params.id, req.body);
  await audit.record(req, {
    action: 'EXTEND_DEADLINE',
    entityType: 'Settlement',
    entityId: req.params.id,
    newValues: { deadlineAt: result.deadlineAt },
  });
  return ok(res, result);
});

module.exports = {
  list, summary, get, settle, refreshOverdue, extendDeadline,
  submitSettlement, pendingApprovals, approveSubmission, rejectSubmission,
};
