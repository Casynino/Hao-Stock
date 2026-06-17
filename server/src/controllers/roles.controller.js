'use strict';

const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const audit = require('../services/audit.service');

const ROLE_INCLUDE = {
  permissions: { select: { id: true, key: true, description: true } },
  _count: { select: { users: true } },
};

const list = asyncHandler(async (_req, res) => {
  const roles = await prisma.role.findMany({ include: ROLE_INCLUDE, orderBy: { name: 'asc' } });
  return ok(res, roles);
});

const listPermissions = asyncHandler(async (_req, res) => {
  const permissions = await prisma.permission.findMany({ orderBy: { key: 'asc' } });
  return ok(res, permissions);
});

const get = asyncHandler(async (req, res) => {
  const role = await prisma.role.findUnique({ where: { id: req.params.id }, include: ROLE_INCLUDE });
  if (!role) throw ApiError.notFound('Role not found');
  return ok(res, role);
});

async function connectPermissions(permissionKeys) {
  if (!permissionKeys) return undefined;
  const found = await prisma.permission.findMany({ where: { key: { in: permissionKeys } } });
  return found.map((p) => ({ id: p.id }));
}

const create = asyncHandler(async (req, res) => {
  const { name, description, permissionKeys } = req.body;
  const connect = await connectPermissions(permissionKeys);
  const role = await prisma.role.create({
    data: { name, description: description || null, permissions: connect ? { connect } : undefined },
    include: ROLE_INCLUDE,
  });
  await audit.record(req, { action: 'CREATE', entityType: 'Role', entityId: role.id, newValues: { name } });
  return created(res, role);
});

const update = asyncHandler(async (req, res) => {
  const existing = await prisma.role.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('Role not found');

  const data = {};
  if (req.body.description !== undefined) data.description = req.body.description;
  if (req.body.name && !existing.isSystem) data.name = req.body.name;

  if (req.body.permissionKeys) {
    const connect = await connectPermissions(req.body.permissionKeys);
    data.permissions = { set: connect || [] };
  }

  const role = await prisma.role.update({ where: { id: req.params.id }, data, include: ROLE_INCLUDE });
  await audit.record(req, { action: 'UPDATE', entityType: 'Role', entityId: role.id, newValues: req.body });
  return ok(res, role);
});

const remove = asyncHandler(async (req, res) => {
  const role = await prisma.role.findUnique({ where: { id: req.params.id }, include: { _count: { select: { users: true } } } });
  if (!role) throw ApiError.notFound('Role not found');
  if (role.isSystem) throw ApiError.badRequest('System roles cannot be deleted');
  if (role._count.users > 0) throw ApiError.conflict('Cannot delete a role that still has users');
  await prisma.role.delete({ where: { id: req.params.id } });
  await audit.record(req, { action: 'DELETE', entityType: 'Role', entityId: req.params.id });
  return ok(res, { id: req.params.id, deleted: true });
});

module.exports = { list, listPermissions, get, create, update, remove };
