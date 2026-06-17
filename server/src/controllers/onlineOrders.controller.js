'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok, created, paginated } = require('../utils/response');
const { parsePagination } = require('../utils/pagination');
const onlineOrder = require('../services/onlineOrder.service');
const audit = require('../services/audit.service');

const list = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const pagination = parsePagination(q, { defaultSortBy: 'placedAt', defaultSortDir: 'desc', allowedSortFields: ['placedAt', 'createdAt', 'total'] });
  const { items, total } = await onlineOrder.list(q, pagination);
  return paginated(res, items, { page: pagination.page, limit: pagination.limit, total });
});

const get = asyncHandler(async (req, res) => ok(res, await onlineOrder.get(req.params.id)));

const create = asyncHandler(async (req, res) => {
  const order = await onlineOrder.create(req.body, req.user);
  await audit.record(req, { action: 'CREATE', entityType: 'OnlineOrder', entityId: order.id, newValues: { orderNumber: order.orderNumber, total: order.total } });
  return created(res, order);
});

const updateStatus = asyncHandler(async (req, res) => {
  const order = await onlineOrder.updateStatus(req.params.id, req.body.status, req.user);
  await audit.record(req, { action: 'STATUS', entityType: 'OnlineOrder', entityId: req.params.id, newValues: { status: req.body.status } });
  return ok(res, order);
});

const updatePayment = asyncHandler(async (req, res) => {
  const order = await onlineOrder.updatePayment(req.params.id, req.body);
  await audit.record(req, { action: 'PAYMENT', entityType: 'OnlineOrder', entityId: req.params.id });
  return ok(res, order);
});

module.exports = { list, get, create, updateStatus, updatePayment };
