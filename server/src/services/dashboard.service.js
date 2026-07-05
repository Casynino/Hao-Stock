'use strict';

const prisma = require('../config/prisma');
const inventory = require('./inventory.service');
const credit = require('./credit.service');
const reports = require('./reports.service');
const reorder = require('./reorder.service');
const stockCount = require('./stockCount.service');
const settlement = require('./settlement.service');
const { toNumber, round2 } = require('../utils/money');
const { resolveRange } = require('../utils/dates');

async function periodSales(period) {
  const r = await reports.salesReport({ period });
  return { revenue: r.totals.revenue, profit: r.totals.grossProfit, orders: r.totals.orders };
}

// Money windows on the dashboard start at the finance epoch — pre-go-live
// activity stays in the database but never counts as money.
async function epochRange(period) {
  const range = resolveRange({ period });
  const epoch = await reports.financeEpoch();
  if (epoch && range.start < epoch) return { ...range, start: epoch };
  return range;
}

async function paymentsCollected(period) {
  const range = await epochRange(period);
  const [credits, cash] = await Promise.all([
    prisma.creditPayment.aggregate({
      where: { paidAt: { gte: range.start, lte: range.end } },
      _sum: { amount: true },
    }),
    prisma.sale.aggregate({
      where: { type: 'CASH', status: { not: 'CANCELLED' }, soldAt: { gte: range.start, lte: range.end } },
      _sum: { amountPaid: true },
    }),
  ]);
  return {
    creditPayments: round2(toNumber(credits._sum.amount)),
    cashCollected: round2(toNumber(cash._sum.amountPaid)),
    total: round2(toNumber(credits._sum.amount) + toNumber(cash._sum.amountPaid)),
  };
}

// Reps still holding stock — "outstanding salesperson stock" alert source.
async function outstandingRepStock() {
  const rows = await inventory.repBalances(prisma);
  const positive = rows.filter((r) => r.baseQuantity > 0);
  const byRep = new Map();
  positive.forEach((r) => byRep.set(r.salesRepId, (byRep.get(r.salesRepId) || 0) + r.baseQuantity));

  const reps = await prisma.salesRepresentative.findMany({
    where: { id: { in: [...byRep.keys()] } },
    include: { user: { select: { name: true } } },
  });
  return reps
    .map((rep) => ({
      salesRepId: rep.id,
      name: rep.user?.name,
      code: rep.code,
      region: rep.region,
      heldBaseUnits: byRep.get(rep.id) || 0,
    }))
    .sort((a, b) => b.heldBaseUnits - a.heldBaseUnits);
}

async function recentActivity(limit = 12) {
  const rows = await prisma.inventoryTransaction.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      product: { select: { name: true } },
      packagingUnit: { select: { name: true } },
      warehouse: { select: { name: true } },
      salesRep: { include: { user: { select: { name: true } } } },
      user: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    product: r.product.name,
    quantity: r.quantity,
    unit: r.packagingUnit?.name,
    baseQuantity: r.baseQuantity,
    location: r.locationType === 'WAREHOUSE' ? r.warehouse?.name : r.salesRep?.user?.name,
    by: r.user?.name,
    at: r.createdAt,
    notes: r.notes,
  }));
}

// One call powering the whole admin dashboard.
async function overview() {
  const [
    valuation,
    daily,
    weekly,
    monthly,
    debt,
    collected,
    profit,
    performance,
    regional,
    reorderData,
    low,
    missing,
    repStock,
    activity,
    counts,
    settlements,
  ] = await Promise.all([
    inventory.valuation(prisma),
    periodSales('today'),
    periodSales('week'),
    periodSales('month'),
    credit.debtSummary(),
    paymentsCollected('month'),
    reports.profitOverview('month'),
    reports.productPerformance({ period: 'month', limit: 5 }),
    reports.regionalPerformance({ period: 'month' }),
    reorder.reorderAnalysis(),
    reorder.lowStock(),
    stockCount.missingStockReport({}),
    outstandingRepStock(),
    recentActivity(12),
    prisma.$transaction([
      prisma.product.count({ where: { isActive: true } }),
      prisma.customer.count({ where: { isActive: true } }),
      prisma.salesRepresentative.count({ where: { isActive: true } }),
      prisma.warehouse.count({ where: { isActive: true } }),
    ]),
    settlement.summary(),
  ]);

  return {
    inventory: {
      totalValue: valuation.totals.totalValue,
      warehouseValue: valuation.totals.warehouseValue,
      repValue: valuation.totals.repValue,
      retailValue: valuation.totals.retailValue,
      totalBaseUnits: valuation.totals.totalBaseUnits,
      productCount: valuation.totals.productCount,
    },
    sales: { daily, weekly, monthly },
    profit: {
      grossProfit: profit.totals.profit,
      netProfit: profit.totals.profit,
      grossMargin: profit.totals.margin,
      revenue: profit.totals.revenue,
    },
    debt: {
      totalOutstanding: debt.totalOutstanding,
      overdueAmount: debt.overdueAmount,
      overdueAccounts: debt.overdueAccounts,
      openAccounts: debt.openAccounts,
      topDebtors: debt.topDebtors.slice(0, 5),
    },
    paymentsCollected: collected,
    topSelling: performance.topSelling,
    slowMoving: performance.slowMoving,
    regional: regional.items,
    alerts: {
      lowStock: { count: low.length, items: low.slice(0, 8) },
      reorder: {
        count: reorderData.summary.reorderCount,
        critical: reorderData.summary.criticalCount,
        items: reorderData.recommendations.slice(0, 8),
      },
      missingStock: { count: missing.totals.count, value: missing.totals.totalValue, items: missing.items.slice(0, 8) },
      outstandingRepStock: { count: repStock.length, items: repStock.slice(0, 8) },
      overdueDebts: { count: debt.overdueAccounts, amount: debt.overdueAmount },
      settlements: {
        outstanding: settlements.outstandingCount,
        approaching: settlements.approachingCount,
        overdue: settlements.overdueCount,
        overdueValue: settlements.overdueValue,
        items: settlements.items,
      },
    },
    counts: {
      products: counts[0],
      customers: counts[1],
      salesReps: counts[2],
      warehouses: counts[3],
    },
    recentActivity: activity,
  };
}

// Per-brand split (OHIS vs CIVILLY): stock on hand + this month's/today's sales.
// Everything is grouped by the product's brand, so no brand is ever mixed.
async function brandBreakdown() {
  const month = await epochRange('month');
  const today = await epochRange('today');
  const [brands, products, val, monthItems, todayItems] = await Promise.all([
    prisma.brand.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    prisma.product.findMany({ select: { id: true, brandId: true, purchasePrice: true } }),
    inventory.valuation(prisma),
    prisma.saleItem.groupBy({ by: ['productId'], where: { sale: { status: { not: 'CANCELLED' }, soldAt: { gte: month.start, lte: month.end } } }, _sum: { lineTotal: true, baseQuantity: true } }),
    prisma.saleItem.groupBy({ by: ['productId'], where: { sale: { status: { not: 'CANCELLED' }, soldAt: { gte: today.start, lte: today.end } } }, _sum: { lineTotal: true } }),
  ]);

  const brandOf = new Map(products.map((p) => [p.id, p.brandId]));
  const costOf = new Map(products.map((p) => [p.id, toNumber(p.purchasePrice)]));
  const mk = (b) => ({ brandId: b.id, name: b.name, stockValue: 0, stockUnits: 0, warehouseUnits: 0, salesMonth: 0, costMonth: 0, unitsSoldMonth: 0, salesToday: 0 });
  const byBrand = new Map(brands.map((b) => [b.id, mk(b)]));

  for (const it of val.items) {
    const b = byBrand.get(brandOf.get(it.productId));
    if (!b) continue;
    b.stockValue += it.costValue;
    b.stockUnits += it.totalBase;
    b.warehouseUnits += it.warehouseBase;
  }
  for (const r of monthItems) {
    const b = byBrand.get(brandOf.get(r.productId));
    if (!b) continue;
    b.salesMonth += toNumber(r._sum.lineTotal);
    b.costMonth += (r._sum.baseQuantity || 0) * (costOf.get(r.productId) || 0);
    b.unitsSoldMonth += r._sum.baseQuantity || 0;
  }
  for (const r of todayItems) {
    const b = byBrand.get(brandOf.get(r.productId));
    if (!b) continue;
    b.salesToday += toNumber(r._sum.lineTotal);
  }

  const items = [...byBrand.values()]
    .map((b) => {
      const profitMonth = round2(b.salesMonth - b.costMonth);
      return {
        ...b,
        stockValue: round2(b.stockValue),
        salesMonth: round2(b.salesMonth),
        salesToday: round2(b.salesToday),
        profitMonth,
        marginMonth: b.salesMonth > 0 ? round2((profitMonth / b.salesMonth) * 100) : 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const sum = (k) => round2(items.reduce((t, b) => t + b[k], 0));
  return {
    brands: items,
    totals: { stockValue: sum('stockValue'), stockUnits: items.reduce((t, b) => t + b.stockUnits, 0), salesMonth: sum('salesMonth'), salesToday: sum('salesToday'), profitMonth: sum('profitMonth') },
  };
}

module.exports = { overview, recentActivity, outstandingRepStock, paymentsCollected, brandBreakdown };
