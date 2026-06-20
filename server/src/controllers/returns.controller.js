'use strict';

const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, paginated } = require('../utils/response');
const { parsePagination } = require('../utils/pagination');
const returnsService = require('../services/returns.service');
const audit = require('../services/audit.service');
const { ROLES } = require('../middleware/authorize');

const create = asyncHandler(async (req, res) => {
  const payload = { ...req.body };
  if (req.user.role === ROLES.SALES_REP) {
    if (!req.user.salesRepId) throw ApiError.forbidden('Your account has no sales-rep profile');
    payload.salesRepId = req.user.salesRepId;
  }
  const ret = await returnsService.createReturn(payload, req.user);
  await audit.record(req, {
    action: 'CREATE',
    entityType: 'Return',
    entityId: ret.id,
    newValues: { returnNumber: ret.returnNumber, type: ret.type, items: ret.items.length },
  });
  return created(res, ret);
});

const list = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const pagination = parsePagination(q, { defaultSortBy: 'processedAt', defaultSortDir: 'desc', allowedSortFields: ['processedAt', 'createdAt'] });
  const filters = { ...q };
  if (req.user.role === ROLES.SALES_REP) filters.salesRepId = req.user.salesRepId;
  const { items, total } = await returnsService.listReturns(filters, pagination);
  return paginated(res, items, { page: pagination.page, limit: pagination.limit, total });
});

const get = asyncHandler(async (req, res) => {
  const ret = await returnsService.getReturn(req.params.id);
  if (req.user.role === ROLES.SALES_REP && ret.salesRepId !== req.user.salesRepId) {
    throw ApiError.forbidden('This return does not belong to you');
  }
  return ok(res, ret);
});

const approve = asyncHandler(async (req, res) => {
  const ret = await returnsService.approveReturn(req.params.id, req.user);
  await audit.record(req, {
    action: 'APPROVE',
    entityType: 'Return',
    entityId: req.params.id,
    newValues: { status: 'APPROVED' },
  });
  return ok(res, ret);
});

const reject = asyncHandler(async (req, res) => {
  const reason = req.body?.reason;
  const ret = await returnsService.rejectReturn(req.params.id, req.user, reason);
  await audit.record(req, {
    action: 'REJECT',
    entityType: 'Return',
    entityId: req.params.id,
    newValues: { status: 'REJECTED', reason: reason || null },
  });
  return ok(res, ret);
});

module.exports = { create, list, get, approve, reject };
