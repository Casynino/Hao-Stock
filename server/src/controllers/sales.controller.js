'use strict';

const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, paginated } = require('../utils/response');
const { parsePagination } = require('../utils/pagination');
const salesService = require('../services/sales.service');
const audit = require('../services/audit.service');
const { ROLES } = require('../middleware/authorize');

const create = asyncHandler(async (req, res) => {
  const payload = { ...req.body };

  // A sales rep can only sell from their own van stock.
  if (req.user.role === ROLES.SALES_REP) {
    if (!req.user.salesRepId) throw ApiError.forbidden('Your account has no sales-rep profile');
    payload.salesRepId = req.user.salesRepId;
    payload.warehouseId = null;
  }

  const sale = await salesService.createSale(payload, req.user);
  await audit.record(req, {
    action: 'CREATE',
    entityType: 'Sale',
    entityId: sale.id,
    newValues: { saleNumber: sale.saleNumber, type: sale.type, total: sale.total },
  });
  return created(res, sale);
});

const list = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const pagination = parsePagination(q, { defaultSortBy: 'soldAt', defaultSortDir: 'desc', allowedSortFields: ['soldAt', 'total', 'createdAt'] });
  const filters = { ...q };
  if (req.user.role === ROLES.SALES_REP) filters.salesRepId = req.user.salesRepId;
  const { items, total } = await salesService.listSales(filters, pagination);
  return paginated(res, items, { page: pagination.page, limit: pagination.limit, total });
});

const get = asyncHandler(async (req, res) => {
  const sale = await salesService.getSale(req.params.id);
  if (req.user.role === ROLES.SALES_REP && sale.salesRepId !== req.user.salesRepId) {
    throw ApiError.forbidden('This sale does not belong to you');
  }
  return ok(res, sale);
});

const cancel = asyncHandler(async (req, res) => {
  const sale = await salesService.cancelSale(req.params.id, req.user, req.body.reason);
  await audit.record(req, { action: 'CANCEL', entityType: 'Sale', entityId: req.params.id, newValues: { reason: req.body.reason } });
  return ok(res, sale);
});

module.exports = { create, list, get, cancel };
