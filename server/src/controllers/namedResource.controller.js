'use strict';

const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, paginated } = require('../utils/response');
const { parsePagination } = require('../utils/pagination');
const audit = require('../services/audit.service');

// Brand and Category share an identical CRUD surface. This factory builds the
// handlers for either, parameterised by the Prisma model and the foreign key
// that products use to reference it (so we can protect records in use).
function makeNamedController({ model, entityType, productFk }) {
  const delegate = prisma[model];

  const list = asyncHandler(async (req, res) => {
    const q = req.validatedQuery || req.query;
    const pagination = parsePagination(q, {
      allowedSortFields: ['name', 'createdAt', 'updatedAt'],
      defaultSortBy: 'name',
      defaultSortDir: 'asc',
    });
    const where = {};
    if (q.isActive !== undefined) where.isActive = q.isActive;
    if (q.search) where.name = { contains: q.search, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      delegate.findMany({
        where,
        include: { _count: { select: { products: true } } },
        skip: pagination.skip,
        take: pagination.take,
        orderBy: pagination.orderBy,
      }),
      delegate.count({ where }),
    ]);
    return paginated(res, items, { page: pagination.page, limit: pagination.limit, total });
  });

  const get = asyncHandler(async (req, res) => {
    const item = await delegate.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { products: true } } },
    });
    if (!item) throw ApiError.notFound(`${entityType} not found`);
    return ok(res, item);
  });

  const create = asyncHandler(async (req, res) => {
    const item = await delegate.create({ data: req.body });
    await audit.record(req, { action: 'CREATE', entityType, entityId: item.id, newValues: item });
    return created(res, item);
  });

  const update = asyncHandler(async (req, res) => {
    const existing = await delegate.findUnique({ where: { id: req.params.id } });
    if (!existing) throw ApiError.notFound(`${entityType} not found`);
    const item = await delegate.update({ where: { id: req.params.id }, data: req.body });
    await audit.record(req, {
      action: 'UPDATE',
      entityType,
      entityId: item.id,
      oldValues: existing,
      newValues: item,
    });
    return ok(res, item);
  });

  const remove = asyncHandler(async (req, res) => {
    const existing = await delegate.findUnique({ where: { id: req.params.id } });
    if (!existing) throw ApiError.notFound(`${entityType} not found`);

    const inUse = await prisma.product.count({ where: { [productFk]: req.params.id } });
    if (inUse > 0) {
      // Don't break product references — deactivate instead of deleting.
      const item = await delegate.update({ where: { id: req.params.id }, data: { isActive: false } });
      await audit.record(req, { action: 'DEACTIVATE', entityType, entityId: item.id });
      return ok(res, { ...item, deactivated: true, reason: 'in use by products' });
    }
    await delegate.delete({ where: { id: req.params.id } });
    await audit.record(req, { action: 'DELETE', entityType, entityId: req.params.id });
    return ok(res, { id: req.params.id, deleted: true });
  });

  return { list, get, create, update, remove };
}

module.exports = { makeNamedController };
