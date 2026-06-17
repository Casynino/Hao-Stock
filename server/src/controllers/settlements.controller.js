'use strict';

const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, paginated } = require('../utils/response');
const { parsePagination } = require('../utils/pagination');
const settlement = require('../services/settlement.service');
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

const summary = asyncHandler(async (_req, res) => ok(res, await settlement.summary()));

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

const settleBoxes = asyncHandler(async (req, res) => {
  // Reps may only settle against their own orders.
  if (req.user.role === ROLES.SALES_REP) {
    const s = await settlement.get(req.params.id);
    if (s.salesRepId !== req.user.salesRepId) throw ApiError.forbidden('This order is not yours');
  }
  const result = await settlement.settleBoxes(req.params.id, req.body, req.user);
  await audit.record(req, {
    action: 'SETTLE_BOXES',
    entityType: 'Settlement',
    entityId: req.params.id,
    newValues: { productId: req.body.productId, boxes: req.body.boxes, balance: result.balance },
  });
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

module.exports = { list, summary, get, settle, settleBoxes, refreshOverdue, extendDeadline };
