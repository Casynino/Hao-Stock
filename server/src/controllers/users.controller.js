'use strict';

const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, paginated } = require('../utils/response');
const { parsePagination } = require('../utils/pagination');
const { pad } = require('../utils/numbering');
const audit = require('../services/audit.service');

const PUBLIC_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  roleId: true,
  role: { select: { id: true, name: true } },
  warehouse: { select: { id: true, name: true } },
  salesRep: { select: { id: true, code: true, region: true } },
};

const list = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const pagination = parsePagination(q, { defaultSortBy: 'createdAt', defaultSortDir: 'desc' });
  const where = {};
  if (q.roleId) where.roleId = q.roleId;
  if (q.isActive !== undefined) where.isActive = q.isActive;
  if (q.search) {
    where.OR = [
      { name: { contains: q.search, mode: 'insensitive' } },
      { email: { contains: q.search, mode: 'insensitive' } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.user.findMany({ where, select: PUBLIC_SELECT, skip: pagination.skip, take: pagination.take, orderBy: pagination.orderBy }),
    prisma.user.count({ where }),
  ]);
  return paginated(res, items, { page: pagination.page, limit: pagination.limit, total });
});

const get = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: PUBLIC_SELECT });
  if (!user) throw ApiError.notFound('User not found');
  return ok(res, user);
});

const create = asyncHandler(async (req, res) => {
  const { name, email, password, phone, roleId, warehouseId, isActive, salesRep } = req.body;

  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw ApiError.badRequest('Role not found');

  const passwordHash = await bcrypt.hash(password, env.bcryptSaltRounds);
  const data = {
    name,
    email: email.toLowerCase().trim(),
    passwordHash,
    phone: phone || null,
    roleId,
    warehouseId: warehouseId || null,
    isActive: isActive ?? true,
  };

  // Auto-provision a sales-rep profile when creating a SALES_REP user.
  if (role.name === 'SALES_REP') {
    const count = await prisma.salesRepresentative.count();
    data.salesRep = {
      create: {
        code: salesRep?.code || `REP-${pad(count + 1, 3)}`,
        region: salesRep?.region || null,
        phone: salesRep?.phone || phone || null,
        monthlyTarget: salesRep?.monthlyTarget ?? null,
      },
    };
  }

  const user = await prisma.user.create({ data, select: PUBLIC_SELECT });
  await audit.record(req, { action: 'CREATE', entityType: 'User', entityId: user.id, newValues: { email: user.email, role: role.name } });
  return created(res, user);
});

const update = asyncHandler(async (req, res) => {
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('User not found');

  const data = {};
  ['name', 'phone', 'roleId', 'warehouseId', 'isActive'].forEach((f) => {
    if (req.body[f] !== undefined) data[f] = req.body[f];
  });
  if (req.body.email) data.email = req.body.email.toLowerCase().trim();
  if (req.body.password) data.passwordHash = await bcrypt.hash(req.body.password, env.bcryptSaltRounds);

  // Don't let an admin lock themselves out by self-deactivating.
  if (req.params.id === req.user.id && data.isActive === false) {
    throw ApiError.badRequest('You cannot deactivate your own account');
  }

  const user = await prisma.user.update({ where: { id: req.params.id }, data, select: PUBLIC_SELECT });
  await audit.record(req, { action: 'UPDATE', entityType: 'User', entityId: user.id, newValues: { ...data, passwordHash: undefined } });
  return ok(res, user);
});

const remove = asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) throw ApiError.badRequest('You cannot delete your own account');

  const user = await prisma.user.findUnique({ where: { id: req.params.id }, include: { role: true } });
  if (!user) throw ApiError.notFound('User not found');

  if (user.role.name === 'ADMIN') {
    const activeAdmins = await prisma.user.count({ where: { role: { name: 'ADMIN' }, isActive: true } });
    if (activeAdmins <= 1) throw ApiError.badRequest('Cannot remove the last active administrator');
  }

  // Deactivate (preserves audit trails and ledger actor references).
  const updated = await prisma.user.update({ where: { id: req.params.id }, data: { isActive: false }, select: PUBLIC_SELECT });
  await audit.record(req, { action: 'DEACTIVATE', entityType: 'User', entityId: req.params.id });
  return ok(res, { ...updated, deactivated: true });
});

module.exports = { list, get, create, update, remove };
