'use strict';

const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, paginated } = require('../utils/response');
const { parsePagination } = require('../utils/pagination');
const inventory = require('../services/inventory.service');
const stockCount = require('../services/stockCount.service');
const { toNumber, round2 } = require('../utils/money');
const { pad } = require('../utils/numbering');
const audit = require('../services/audit.service');

async function repStockList(salesRepId) {
  const balances = (await inventory.repBalances(prisma, salesRepId)).filter((b) => b.baseQuantity !== 0);
  const products = await prisma.product.findMany({
    where: { id: { in: balances.map((b) => b.productId) } },
    select: { id: true, name: true, sku: true, baseUnitName: true, purchasePrice: true, sellingPrice: true },
  });
  const pMap = new Map(products.map((p) => [p.id, p]));
  let value = 0;
  const stock = balances
    .map((b) => {
      const p = pMap.get(b.productId);
      const v = round2(b.baseQuantity * toNumber(p?.purchasePrice));
      value += v;
      return {
        productId: b.productId,
        name: p?.name,
        sku: p?.sku,
        baseUnitName: p?.baseUnitName,
        baseQuantity: b.baseQuantity,
        value: v,
      };
    })
    .sort((a, b) => b.value - a.value);
  return { stock, value: round2(value) };
}

const list = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const pagination = parsePagination(q, { defaultSortBy: 'createdAt', defaultSortDir: 'asc' });
  const where = {};
  if (q.isActive !== undefined) where.isActive = q.isActive;
  if (q.search) {
    where.OR = [
      { code: { contains: q.search, mode: 'insensitive' } },
      { region: { contains: q.search, mode: 'insensitive' } },
      { user: { name: { contains: q.search, mode: 'insensitive' } } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.salesRepresentative.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, isActive: true } },
        _count: { select: { customers: true, sales: true } },
      },
      skip: pagination.skip,
      take: pagination.take,
      orderBy: pagination.orderBy,
    }),
    prisma.salesRepresentative.count({ where }),
  ]);

  // Enrich each card with held-stock value, total sales and outstanding debt
  // using a few grouped aggregates (not one query per rep).
  const ids = items.map((r) => r.id);
  const [heldRows, debtRows, salesRows] = await Promise.all([
    inventory.repBalances(prisma).then((rows) => rows.filter((r) => ids.includes(r.salesRepId) && r.baseQuantity > 0)),
    prisma.creditSale.groupBy({ by: ['salesRepId'], where: { salesRepId: { in: ids }, balance: { gt: 0 } }, _sum: { balance: true } }),
    prisma.sale.groupBy({ by: ['salesRepId'], where: { salesRepId: { in: ids }, status: { not: 'CANCELLED' } }, _sum: { total: true } }),
  ]);
  const prodIds = [...new Set(heldRows.map((r) => r.productId))];
  const prods = await prisma.product.findMany({ where: { id: { in: prodIds } }, select: { id: true, purchasePrice: true } });
  const costMap = new Map(prods.map((p) => [p.id, toNumber(p.purchasePrice)]));
  const heldValue = new Map();
  const heldUnits = new Map();
  heldRows.forEach((r) => {
    heldValue.set(r.salesRepId, (heldValue.get(r.salesRepId) || 0) + r.baseQuantity * (costMap.get(r.productId) || 0));
    heldUnits.set(r.salesRepId, (heldUnits.get(r.salesRepId) || 0) + r.baseQuantity);
  });
  const debtMap = new Map(debtRows.map((d) => [d.salesRepId, toNumber(d._sum.balance)]));
  const salesMap = new Map(salesRows.map((s) => [s.salesRepId, toNumber(s._sum.total)]));

  const enriched = items.map((r) => ({
    ...r,
    heldStockValue: round2(heldValue.get(r.id) || 0),
    heldUnits: heldUnits.get(r.id) || 0,
    outstandingDebt: round2(debtMap.get(r.id) || 0),
    totalSales: round2(salesMap.get(r.id) || 0),
  }));

  return paginated(res, enriched, { page: pagination.page, limit: pagination.limit, total });
});

const get = asyncHandler(async (req, res) => {
  const rep = await prisma.salesRepresentative.findUnique({
    where: { id: req.params.id },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, isActive: true } },
      _count: { select: { customers: true } },
    },
  });
  if (!rep) throw ApiError.notFound('Sales representative not found');

  const [{ stock, value }, debtAgg, salesAgg] = await Promise.all([
    repStockList(rep.id),
    prisma.creditSale.aggregate({ where: { salesRepId: rep.id, balance: { gt: 0 } }, _sum: { balance: true } }),
    prisma.sale.aggregate({ where: { salesRepId: rep.id, status: { not: 'CANCELLED' } }, _sum: { total: true }, _count: true }),
  ]);

  return ok(res, {
    ...rep,
    heldStockValue: value,
    heldStock: stock,
    outstandingDebt: round2(toNumber(debtAgg._sum.balance)),
    totalSales: round2(toNumber(salesAgg._sum.total)),
    orderCount: salesAgg._count,
  });
});

const getStock = asyncHandler(async (req, res) => {
  const rep = await prisma.salesRepresentative.findUnique({ where: { id: req.params.id } });
  if (!rep) throw ApiError.notFound('Sales representative not found');
  const result = await repStockList(rep.id);
  return ok(res, result);
});

const getReconciliation = asyncHandler(async (req, res) => {
  const rep = await prisma.salesRepresentative.findUnique({ where: { id: req.params.id } });
  if (!rep) throw ApiError.notFound('Sales representative not found');
  const items = await stockCount.repReconciliation(rep.id);
  return ok(res, { salesRepId: rep.id, items });
});

const create = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.body.userId }, include: { salesRep: true } });
  if (!user) throw ApiError.badRequest('User not found');
  if (user.salesRep) throw ApiError.conflict('This user is already a sales representative');

  let code = req.body.code;
  if (!code) {
    const count = await prisma.salesRepresentative.count();
    code = `REP-${pad(count + 1, 3)}`;
  }

  const rep = await prisma.salesRepresentative.create({
    data: {
      userId: req.body.userId,
      code,
      region: req.body.region || null,
      phone: req.body.phone || null,
      monthlyTarget: req.body.monthlyTarget ?? null,
      isActive: req.body.isActive ?? true,
    },
    include: { user: { select: { name: true, email: true } } },
  });
  await audit.record(req, { action: 'CREATE', entityType: 'SalesRepresentative', entityId: rep.id, newValues: { code } });
  return created(res, rep);
});

const update = asyncHandler(async (req, res) => {
  const existing = await prisma.salesRepresentative.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('Sales representative not found');
  const rep = await prisma.salesRepresentative.update({
    where: { id: req.params.id },
    data: req.body,
    include: { user: { select: { name: true, email: true } } },
  });
  await audit.record(req, { action: 'UPDATE', entityType: 'SalesRepresentative', entityId: rep.id, oldValues: existing, newValues: req.body });
  return ok(res, rep);
});

const remove = asyncHandler(async (req, res) => {
  const movements = await prisma.inventoryTransaction.count({ where: { salesRepId: req.params.id } });
  if (movements > 0) {
    const rep = await prisma.salesRepresentative.update({ where: { id: req.params.id }, data: { isActive: false } });
    await audit.record(req, { action: 'DEACTIVATE', entityType: 'SalesRepresentative', entityId: rep.id });
    return ok(res, { ...rep, deactivated: true, reason: 'has inventory history' });
  }
  await prisma.salesRepresentative.delete({ where: { id: req.params.id } });
  await audit.record(req, { action: 'DELETE', entityType: 'SalesRepresentative', entityId: req.params.id });
  return ok(res, { id: req.params.id, deleted: true });
});

module.exports = { list, get, getStock, getReconciliation, create, update, remove };
