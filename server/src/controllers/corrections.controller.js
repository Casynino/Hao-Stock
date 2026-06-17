'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok, created, paginated } = require('../utils/response');
const { parsePagination } = require('../utils/pagination');
const correction = require('../services/correction.service');
const audit = require('../services/audit.service');
const { ROLES } = require('../middleware/authorize');

const create = asyncHandler(async (req, res) => {
  const result = await correction.create(req.body, req.user);
  await audit.record(req, {
    action: 'CORRECTION_REQUESTED',
    entityType: 'CorrectionRequest',
    entityId: result.id,
    newValues: { settlementId: req.body.settlementId || null, message: req.body.message },
  });
  return created(res, result);
});

const list = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const pagination = parsePagination(q, { defaultSortBy: 'createdAt', defaultSortDir: 'desc', allowedSortFields: ['createdAt', 'status'] });
  const filters = { ...q };
  // Reps only ever see their own correction requests.
  if (req.user.role === ROLES.SALES_REP) filters.salesRepId = req.user.salesRepId;
  const { items, total } = await correction.list(filters, pagination);
  return paginated(res, items, { page: pagination.page, limit: pagination.limit, total });
});

const resolve = asyncHandler(async (req, res) => {
  const result = await correction.resolve(req.params.id, req.body, req.user);
  await audit.record(req, {
    action: 'CORRECTION_RESOLVED',
    entityType: 'CorrectionRequest',
    entityId: req.params.id,
    newValues: { status: result.status, resolution: req.body.resolution || null },
  });
  return ok(res, result);
});

module.exports = { create, list, resolve };
