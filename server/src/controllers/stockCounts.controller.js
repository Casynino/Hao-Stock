'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok, created, paginated } = require('../utils/response');
const { parsePagination } = require('../utils/pagination');
const stockCount = require('../services/stockCount.service');
const audit = require('../services/audit.service');

const create = asyncHandler(async (req, res) => {
  const count = await stockCount.createStockCount(req.body, req.user);
  await audit.record(req, {
    action: 'CREATE',
    entityType: 'StockCount',
    entityId: count.id,
    newValues: { countNumber: count.countNumber, items: count.items.length },
  });
  return created(res, count);
});

const list = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const pagination = parsePagination(q, { defaultSortBy: 'countedAt', defaultSortDir: 'desc', allowedSortFields: ['countedAt', 'createdAt'] });
  const { items, total } = await stockCount.listStockCounts(q, pagination);
  return paginated(res, items, { page: pagination.page, limit: pagination.limit, total });
});

const get = asyncHandler(async (req, res) => {
  const count = await stockCount.getStockCount(req.params.id);
  return ok(res, count);
});

const missing = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const report = await stockCount.missingStockReport(q);
  return ok(res, report);
});

module.exports = { create, list, get, missing };
