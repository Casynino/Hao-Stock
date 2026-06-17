'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const reports = require('../services/reports.service');
const exporter = require('../services/export.service');
const { formatCurrency } = require('../utils/money');

// Stream a report as PDF/Excel, or return JSON when no/unknown format given.
async function deliver(res, q, jsonData, exportConfig) {
  const format = q.format;
  if (format === 'excel') {
    const buffer = await exporter.excelBuffer(exportConfig);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${exportConfig.filename}.xlsx"`);
    return res.send(Buffer.from(buffer));
  }
  if (format === 'pdf') {
    const buffer = await exporter.pdfBuffer({
      title: exportConfig.title,
      subtitle: exportConfig.subtitle,
      columns: exportConfig.columns,
      rows: exportConfig.rows,
      totalsRow: exportConfig.totals,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${exportConfig.filename}.pdf"`);
    return res.send(buffer);
  }
  return ok(res, jsonData);
}

const sales = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const data = await reports.salesReport(q);
  return deliver(res, q, data, {
    filename: `sales-report-${data.range.label}`,
    sheetName: 'Sales',
    title: `Sales Report (${data.range.label})`,
    subtitle: `${new Date(data.range.start).toLocaleDateString()} – ${new Date(data.range.end).toLocaleDateString()}`,
    columns: [
      { header: 'Period', key: 'period', width: 18 },
      { header: 'Orders', key: 'orders', width: 10, align: 'right' },
      { header: 'Revenue', key: 'revenue', width: 16, align: 'right' },
      { header: 'Cost', key: 'cost', width: 16, align: 'right' },
      { header: 'Profit', key: 'profit', width: 16, align: 'right' },
    ],
    rows: data.series,
    totals: { period: 'TOTAL', orders: data.totals.orders, revenue: data.totals.revenue, cost: data.totals.cost, profit: data.totals.grossProfit },
  });
});

const products = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const data = await reports.productPerformance(q);
  return deliver(res, q, data, {
    filename: 'product-performance',
    sheetName: 'Products',
    title: 'Product Performance',
    columns: [
      { header: 'Product', key: 'name', width: 28 },
      { header: 'SKU', key: 'sku', width: 16 },
      { header: 'Units Sold', key: 'unitsSold', width: 12, align: 'right' },
      { header: 'Revenue', key: 'revenue', width: 16, align: 'right' },
      { header: 'Profit', key: 'profit', width: 16, align: 'right' },
      { header: 'Margin %', key: 'margin', width: 10, align: 'right' },
    ],
    rows: data.all,
  });
});

const regional = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const data = await reports.regionalPerformance(q);
  return deliver(res, q, data, {
    filename: 'regional-performance',
    sheetName: 'Regions',
    title: 'Regional Performance',
    columns: [
      { header: 'Region', key: 'region', width: 24 },
      { header: 'Orders', key: 'orders', width: 10, align: 'right' },
      { header: 'Revenue', key: 'revenue', width: 16, align: 'right' },
      { header: 'Profit', key: 'profit', width: 16, align: 'right' },
    ],
    rows: data.items,
  });
});

const salesReps = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const data = await reports.salesRepPerformance(q);
  return deliver(res, q, data, {
    filename: 'salesrep-performance',
    sheetName: 'Sales Reps',
    title: 'Sales Representative Performance',
    columns: [
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Code', key: 'code', width: 12 },
      { header: 'Region', key: 'region', width: 16 },
      { header: 'Orders', key: 'orders', width: 10, align: 'right' },
      { header: 'Revenue', key: 'revenue', width: 16, align: 'right' },
      { header: 'Profit', key: 'profit', width: 16, align: 'right' },
      { header: 'Outstanding Debt', key: 'outstandingDebt', width: 18, align: 'right' },
    ],
    rows: data.items,
  });
});

const profit = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const data = await reports.profitReport(q);
  return deliver(res, q, data, {
    filename: `profit-report-${data.range.label}`,
    sheetName: 'Profit',
    title: `Profit & Loss (${data.range.label})`,
    columns: [
      { header: 'Metric', key: 'metric', width: 28 },
      { header: 'Amount', key: 'amount', width: 20, align: 'right' },
    ],
    rows: [
      { metric: 'Revenue', amount: data.revenue },
      { metric: 'Cost of Goods Sold', amount: data.cogs },
      { metric: 'Gross Profit', amount: data.grossProfit },
      { metric: 'Gross Margin %', amount: data.grossMargin },
      { metric: 'Discounts Given', amount: data.discounts },
      { metric: 'Shrinkage & Damage', amount: data.shrinkageAndDamageValue },
      { metric: 'Net Profit', amount: data.netProfit },
    ],
  });
});

const inventoryValuation = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const data = await reports.inventoryValuationReport();
  return deliver(res, q, data, {
    filename: 'inventory-valuation',
    sheetName: 'Valuation',
    title: 'Inventory Valuation',
    subtitle: `Total cost value: ${formatCurrency(data.totals.totalValue)}`,
    columns: [
      { header: 'Product', key: 'name', width: 28 },
      { header: 'SKU', key: 'sku', width: 16 },
      { header: 'Warehouse', key: 'warehouseBase', width: 12, align: 'right' },
      { header: 'Reps', key: 'repBase', width: 10, align: 'right' },
      { header: 'Total Units', key: 'totalBase', width: 12, align: 'right' },
      { header: 'Cost Value', key: 'costValue', width: 16, align: 'right' },
      { header: 'Retail Value', key: 'retailValue', width: 16, align: 'right' },
    ],
    rows: data.items,
    totals: { name: 'TOTAL', totalBase: data.totals.totalBaseUnits, costValue: data.totals.totalValue, retailValue: data.totals.retailValue },
  });
});

const inventoryMovements = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const data = await reports.inventoryMovementReport({ ...q, type: q.movementType });
  return deliver(res, q, data, {
    filename: 'inventory-movements',
    sheetName: 'Movements',
    title: 'Inventory Movement Report',
    columns: [
      { header: 'Date', key: 'occurredAt', width: 18 },
      { header: 'Type', key: 'type', width: 16 },
      { header: 'Product', key: 'product', width: 26 },
      { header: 'Qty', key: 'quantity', width: 8, align: 'right' },
      { header: 'Unit', key: 'unit', width: 10 },
      { header: 'Base Δ', key: 'baseQuantity', width: 10, align: 'right' },
      { header: 'Location', key: 'location', width: 18 },
      { header: 'By', key: 'user', width: 16 },
    ],
    rows: data.movements.map((m) => ({ ...m, occurredAt: new Date(m.occurredAt).toLocaleString() })),
  });
});

const debts = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const data = await reports.debtReport();
  return deliver(res, q, data, {
    filename: 'debt-report',
    sheetName: 'Debts',
    title: 'Outstanding Debt Report',
    subtitle: `Total outstanding: ${formatCurrency(data.totalOutstanding)} • Overdue: ${formatCurrency(data.overdueAmount)}`,
    columns: [
      { header: 'Customer', key: 'name', width: 28 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Region', key: 'region', width: 16 },
      { header: 'Outstanding', key: 'outstanding', width: 16, align: 'right' },
    ],
    rows: data.topDebtors,
  });
});

module.exports = {
  sales,
  products,
  regional,
  salesReps,
  profit,
  inventoryValuation,
  inventoryMovements,
  debts,
};
