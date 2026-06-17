'use strict';

const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const { dayjs } = require('../utils/dates');

const INCLUDE = { salesRep: { include: { user: { select: { name: true } } } } };

// Upsert a rep's opening or closing report for a given day (one of each/day).
async function submit(salesRepId, payload) {
  const reportDate = dayjs(payload.reportDate || new Date()).startOf('day').toDate();
  const type = payload.type;
  const data = {
    cashOnHand: payload.cashOnHand ?? null,
    customersToVisit: payload.customersToVisit ?? null,
    openingNote: payload.openingNote ?? null,
    salesAmount: payload.salesAmount ?? null,
    cashCollected: payload.cashCollected ?? null,
    debtsCreated: payload.debtsCreated ?? null,
    debtsCollected: payload.debtsCollected ?? null,
    closingNote: payload.closingNote ?? null,
    notes: payload.notes ?? null,
  };
  return prisma.dailyReport.upsert({
    where: { salesRepId_reportDate_type: { salesRepId, reportDate, type } },
    create: { salesRepId, reportDate, type, ...data },
    update: data,
    include: INCLUDE,
  });
}

async function list(filters, pagination) {
  const where = {};
  if (filters.salesRepId) where.salesRepId = filters.salesRepId;
  if (filters.type) where.type = filters.type;
  if (filters.from || filters.to) {
    where.reportDate = {};
    if (filters.from) where.reportDate.gte = dayjs(filters.from).startOf('day').toDate();
    if (filters.to) where.reportDate.lte = dayjs(filters.to).endOf('day').toDate();
  }
  const [items, total] = await Promise.all([
    prisma.dailyReport.findMany({ where, include: INCLUDE, skip: pagination.skip, take: pagination.take, orderBy: { reportDate: 'desc' } }),
    prisma.dailyReport.count({ where }),
  ]);
  return { items, total };
}

async function get(id) {
  const r = await prisma.dailyReport.findUnique({ where: { id }, include: INCLUDE });
  if (!r) throw ApiError.notFound('Daily report not found');
  return r;
}

module.exports = { submit, list, get };
