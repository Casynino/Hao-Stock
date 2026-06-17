'use strict';

const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const audit = require('../services/audit.service');

const list = asyncHandler(async (_req, res) => {
  const units = await prisma.packagingUnit.findMany({
    orderBy: { level: 'asc' },
    include: { _count: { select: { productPackagings: true } } },
  });
  return ok(res, units);
});

const get = asyncHandler(async (req, res) => {
  const unit = await prisma.packagingUnit.findUnique({ where: { id: req.params.id } });
  if (!unit) throw ApiError.notFound('Packaging unit not found');
  return ok(res, unit);
});

const create = asyncHandler(async (req, res) => {
  const unit = await prisma.packagingUnit.create({ data: req.body });
  await audit.record(req, { action: 'CREATE', entityType: 'PackagingUnit', entityId: unit.id, newValues: unit });
  return created(res, unit);
});

const update = asyncHandler(async (req, res) => {
  const existing = await prisma.packagingUnit.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('Packaging unit not found');
  const unit = await prisma.packagingUnit.update({ where: { id: req.params.id }, data: req.body });
  await audit.record(req, {
    action: 'UPDATE',
    entityType: 'PackagingUnit',
    entityId: unit.id,
    oldValues: existing,
    newValues: unit,
  });
  return ok(res, unit);
});

const remove = asyncHandler(async (req, res) => {
  const inUse = await prisma.productPackaging.count({ where: { packagingUnitId: req.params.id } });
  if (inUse > 0) {
    throw ApiError.conflict('This packaging unit is used by products and cannot be deleted');
  }
  await prisma.packagingUnit.delete({ where: { id: req.params.id } });
  await audit.record(req, { action: 'DELETE', entityType: 'PackagingUnit', entityId: req.params.id });
  return ok(res, { id: req.params.id, deleted: true });
});

module.exports = { list, get, create, update, remove };
