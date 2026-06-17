'use strict';

const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, paginated } = require('../utils/response');
const { parsePagination } = require('../utils/pagination');
const inventory = require('../services/inventory.service');
const { toNumber, round2 } = require('../utils/money');
const audit = require('../services/audit.service');

const list = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const pagination = parsePagination(q, {
    allowedSortFields: ['name', 'code', 'createdAt'],
    defaultSortBy: 'name',
    defaultSortDir: 'asc',
  });
  const where = {};
  if (q.isActive !== undefined) where.isActive = q.isActive;
  if (q.search) {
    where.OR = [
      { name: { contains: q.search, mode: 'insensitive' } },
      { code: { contains: q.search, mode: 'insensitive' } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.warehouse.findMany({ where, skip: pagination.skip, take: pagination.take, orderBy: pagination.orderBy }),
    prisma.warehouse.count({ where }),
  ]);
  return paginated(res, items, { page: pagination.page, limit: pagination.limit, total });
});

const get = asyncHandler(async (req, res) => {
  const warehouse = await prisma.warehouse.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { staff: true } } },
  });
  if (!warehouse) throw ApiError.notFound('Warehouse not found');

  // On-hand valuation for this warehouse, from the ledger.
  const balances = await inventory.warehouseBalances(prisma, warehouse.id);
  const productIds = balances.map((b) => b.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, sku: true, baseUnitName: true, purchasePrice: true },
  });
  const pMap = new Map(products.map((p) => [p.id, p]));
  let value = 0;
  const stock = balances
    .filter((b) => b.baseQuantity !== 0)
    .map((b) => {
      const p = pMap.get(b.productId);
      const v = round2(b.baseQuantity * toNumber(p?.purchasePrice));
      value += v;
      return { productId: b.productId, name: p?.name, sku: p?.sku, baseUnitName: p?.baseUnitName, baseQuantity: b.baseQuantity, value: v };
    })
    .sort((a, b) => b.value - a.value);

  return ok(res, { ...warehouse, stockValue: round2(value), stock });
});

const create = asyncHandler(async (req, res) => {
  const warehouse = await prisma.warehouse.create({ data: req.body });
  await audit.record(req, { action: 'CREATE', entityType: 'Warehouse', entityId: warehouse.id, newValues: warehouse });
  return created(res, warehouse);
});

const update = asyncHandler(async (req, res) => {
  const existing = await prisma.warehouse.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('Warehouse not found');
  const warehouse = await prisma.warehouse.update({ where: { id: req.params.id }, data: req.body });
  await audit.record(req, { action: 'UPDATE', entityType: 'Warehouse', entityId: warehouse.id, oldValues: existing, newValues: warehouse });
  return ok(res, warehouse);
});

const remove = asyncHandler(async (req, res) => {
  const movements = await prisma.inventoryTransaction.count({ where: { warehouseId: req.params.id } });
  if (movements > 0) {
    const warehouse = await prisma.warehouse.update({ where: { id: req.params.id }, data: { isActive: false } });
    await audit.record(req, { action: 'DEACTIVATE', entityType: 'Warehouse', entityId: warehouse.id });
    return ok(res, { ...warehouse, deactivated: true, reason: 'has inventory history' });
  }
  await prisma.warehouse.delete({ where: { id: req.params.id } });
  await audit.record(req, { action: 'DELETE', entityType: 'Warehouse', entityId: req.params.id });
  return ok(res, { id: req.params.id, deleted: true });
});

module.exports = { list, get, create, update, remove };
