'use strict';

const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const { ROLES } = require('../middleware/authorize');

const INCLUDE = {
  settlement: { select: { id: true, settlementNumber: true, status: true } },
  salesRep: { include: { user: { select: { name: true } } } },
  raisedBy: { select: { id: true, name: true } },
  resolvedBy: { select: { id: true, name: true } },
};

// A rep (or staff) raises a correction request against an order. Reps may only
// raise against their own orders. Nothing is mutated — this just flags the
// issue for an admin to resolve with the admin tools.
async function create({ settlementId, message }, actor) {
  if (!message || !message.trim()) throw ApiError.badRequest('Describe what needs correcting');

  let salesRepId = actor?.salesRepId || null;
  if (settlementId) {
    const s = await prisma.settlement.findUnique({ where: { id: settlementId }, select: { salesRepId: true } });
    if (!s) throw ApiError.notFound('Order not found');
    if (actor?.role === ROLES.SALES_REP && s.salesRepId !== actor.salesRepId) {
      throw ApiError.forbidden('This order is not yours');
    }
    salesRepId = salesRepId || s.salesRepId;
  }

  return prisma.correctionRequest.create({
    data: {
      settlementId: settlementId || null,
      salesRepId,
      raisedById: actor ? actor.id : null,
      message: message.trim(),
      status: 'PENDING',
    },
    include: INCLUDE,
  });
}

async function list(filters, pagination) {
  const where = {};
  if (filters.status) where.status = filters.status;
  if (filters.salesRepId) where.salesRepId = filters.salesRepId;
  if (filters.settlementId) where.settlementId = filters.settlementId;

  const [items, total] = await Promise.all([
    prisma.correctionRequest.findMany({ where, include: INCLUDE, skip: pagination.skip, take: pagination.take, orderBy: pagination.orderBy }),
    prisma.correctionRequest.count({ where }),
  ]);
  return { items, total };
}

// Admin resolves (or dismisses) a request after making any needed correction
// with the admin tools. The actual data fix is done separately and audited.
async function resolve(id, { status, resolution }, actor) {
  const c = await prisma.correctionRequest.findUnique({ where: { id } });
  if (!c) throw ApiError.notFound('Correction request not found');
  if (c.status !== 'PENDING') throw ApiError.badRequest(`This request is already ${c.status.toLowerCase()}`);

  const next = status === 'DISMISSED' ? 'DISMISSED' : 'RESOLVED';
  return prisma.correctionRequest.update({
    where: { id },
    data: { status: next, resolution: resolution || null, resolvedById: actor ? actor.id : null, resolvedAt: new Date() },
    include: INCLUDE,
  });
}

async function pendingCount() {
  return prisma.correctionRequest.count({ where: { status: 'PENDING' } });
}

module.exports = { create, list, resolve, pendingCount };
