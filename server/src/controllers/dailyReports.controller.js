'use strict';

const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, paginated } = require('../utils/response');
const { parsePagination } = require('../utils/pagination');
const dailyReport = require('../services/dailyReport.service');
const audit = require('../services/audit.service');
const { ROLES } = require('../middleware/authorize');

const submit = asyncHandler(async (req, res) => {
  if (!req.user.salesRepId) throw ApiError.forbidden('Only sales representatives submit daily reports');
  const report = await dailyReport.submit(req.user.salesRepId, req.body);
  await audit.record(req, { action: 'SUBMIT', entityType: 'DailyReport', entityId: report.id, newValues: { type: report.type } });
  return created(res, report);
});

const list = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const pagination = parsePagination(q, { defaultLimit: 30 });
  const filters = { ...q };
  if (req.user.role === ROLES.SALES_REP) filters.salesRepId = req.user.salesRepId;
  const { items, total } = await dailyReport.list(filters, pagination);
  return paginated(res, items, { page: pagination.page, limit: pagination.limit, total });
});

const get = asyncHandler(async (req, res) => ok(res, await dailyReport.get(req.params.id)));

module.exports = { submit, list, get };
