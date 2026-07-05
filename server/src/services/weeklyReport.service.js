'use strict';

// ===========================================================================
// WEEKLY BUSINESS REPORT — WhatsApp summary + PDF statement
//
// buildWeeklyData() assembles one structured snapshot (finance, accounts,
// brands, stock, settlements, alerts) from the same sources as the dashboard.
// The WhatsApp message is the quick health check; the PDF (served from a
// signed public link, generated on demand) is the full bank-statement-style
// report. Configured via Settings: whatsapp.phone / whatsapp.apikey.
// ===========================================================================

const crypto = require('crypto');
const prisma = require('../config/prisma');
const env = require('../config/env');
const finance = require('./finance.service');
const reports = require('./reports.service');
const inventory = require('./inventory.service');
const reorder = require('./reorder.service');
const settlement = require('./settlement.service');
const { dayjs } = require('../utils/dates');

const APP_URL = process.env.PUBLIC_APP_URL || 'https://hao-stock.vercel.app';
const fmt = (n) => `TSh ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;

async function getSetting(key) {
  const row = await prisma.setting.findUnique({ where: { key } }).catch(() => null);
  return row?.value || null;
}
async function setSetting(key, value, group = 'whatsapp') {
  await prisma.setting.upsert({ where: { key }, create: { key, value, group }, update: { value } });
}

// The week a report covers: on Mondays (cron day) the COMPLETED Mon–Sun week
// that just ended; other days (manual sends) the current ISO week to date.
// A weekKey like "2026-W27" pins an exact week (used by the PDF link).
function reportWeek(weekKey) {
  if (weekKey) {
    const m = /^(\d{4})-W(\d{2})$/.exec(weekKey);
    if (m) {
      // Jan 4 is always inside ISO week 1 of its year (isoWeekYear has no setter).
      const start = dayjs(`${m[1]}-01-04`).isoWeek(Number(m[2])).startOf('isoWeek');
      return { start, end: start.add(6, 'day') };
    }
  }
  const now = dayjs();
  const start = now.isoWeekday() === 1 ? now.startOf('isoWeek').subtract(7, 'day') : now.startOf('isoWeek');
  const end = now.isoWeekday() === 1 ? now.startOf('isoWeek').subtract(1, 'day') : now;
  return { start, end };
}

const weekKeyOf = (start) => `${start.isoWeekYear()}-W${String(start.isoWeek()).padStart(2, '0')}`;

// Signature so the PDF link opens without a login but can't be guessed.
function signWeek(weekKey) {
  return crypto.createHmac('sha256', env.jwt.secret).update(`weekly-statement:${weekKey}`).digest('hex').slice(0, 32);
}
function pdfLink(weekKey) {
  return `${APP_URL}/api/public/weekly-statement.pdf?week=${weekKey}&sig=${signWeek(weekKey)}`;
}

// ── One structured snapshot consumed by both outputs ─────────────────────────
async function buildWeeklyData(weekKey) {
  const { start, end } = reportWeek(weekKey);
  const from = start.format('YYYY-MM-DD');
  const to = end.format('YYYY-MM-DD');

  const [rep, prof, accounts, val, stlSummary, suppliers, low, pending] = await Promise.all([
    finance.report({ from, to }),
    reports.profitOverview({ from, to }),
    finance.accountBalances(),
    inventory.valuation(prisma),
    settlement.summary(),
    finance.supplierSummaries(),
    reorder.lowStock(),
    prisma.$transaction([
      prisma.stockRequest.count({ where: { status: 'PENDING' } }),
      prisma.settlementSubmission.count({ where: { status: 'PENDING' } }),
      prisma.return.count({ where: { status: 'PENDING' } }),
    ]),
  ]);

  const supplierDue = suppliers.reduce((s, x) => s + x.outstanding, 0);
  const outOfStock = val.items.filter((i) => i.totalBase <= 0).length;

  // Top sales rep for the period (by approved sales value).
  let topRep = null;
  const topRepRows = await prisma.sale.groupBy({
    by: ['salesRepId'],
    where: { soldAt: { gte: start.startOf('day').toDate(), lte: end.endOf('day').toDate() }, status: { not: 'CANCELLED' }, salesRepId: { not: null } },
    _sum: { total: true },
    orderBy: { _sum: { total: 'desc' } },
    take: 1,
  }).catch(() => []);
  if (topRepRows.length) {
    const r = await prisma.salesRepresentative.findUnique({
      where: { id: topRepRows[0].salesRepId },
      include: { user: { select: { name: true } } },
    }).catch(() => null);
    if (r) topRep = { name: r.user?.name || r.code, revenue: Number(topRepRows[0]._sum.total) || 0 };
  }

  const attention = [];
  if (pending[0]) attention.push(`${pending[0]} stock request(s) waiting for approval`);
  if (pending[1]) attention.push(`${pending[1]} settlement(s) waiting for approval`);
  if (pending[2]) attention.push(`${pending[2]} return(s) waiting for approval`);
  if (stlSummary.overdueCount) attention.push(`${stlSummary.overdueCount} order(s) OVERDUE worth ${fmt(stlSummary.overdueValue)}`);
  if (low.length) attention.push(`${low.length} product(s) low on stock (${low.slice(0, 3).map((l) => l.name).join(', ')})`);
  if (supplierDue > 0) attention.push(`Owed to suppliers: ${fmt(supplierDue)}`);

  return {
    period: {
      start,
      end,
      label: `${start.format('D MMM')} – ${end.format('D MMM YYYY')}`,
      weekKey: weekKeyOf(start),
    },
    generatedAt: dayjs().format('D MMM YYYY, HH:mm [UTC]'),
    accounts: accounts.map((a) => ({ name: a.name, balance: a.balance })),
    cashPosition: accounts.reduce((s, a) => s + a.balance, 0),
    finance: {
      revenue: rep.revenue,
      cogs: rep.cogs,
      grossProfit: rep.grossProfit,
      expenses: rep.expenses,
      netProfit: rep.netProfit,
      moneyIn: rep.cashFlow.moneyIn,
      moneyOut: rep.cashFlow.moneyOut,
      netCash: rep.cashFlow.net,
      boxesSold: rep.boxesSold,
    },
    brands: (prof.byBrand || []).map((b) => ({
      name: b.name, revenue: b.revenue, cost: b.cost, profit: b.profit, margin: b.margin, boxes: b.boxes,
    })),
    topProducts: (rep.topProducts || []).slice(0, 3).map((p) => ({ name: p.name, revenue: p.revenue })),
    topRep,
    stock: {
      costValue: val.totals.totalValue,
      retailValue: val.totals.retailValue,
      potential: Math.round((val.totals.retailValue - val.totals.totalValue) * 100) / 100,
      units: val.totals.totalBaseUnits,
      warehouseBoxes: val.items.reduce((s, i) => s + i.warehouseBase, 0),
      repBoxes: val.items.reduce((s, i) => s + i.repBase, 0),
      lowCount: low.length,
      outOfStock,
    },
    settlements: {
      active: stlSummary.outstandingCount,
      activeValue: stlSummary.outstandingValue,
      overdue: stlSummary.overdueCount,
      overdueValue: stlSummary.overdueValue,
      pendingApprovals: pending[1],
    },
    attention,
    supplierDue,
  };
}

// ── WhatsApp message: the quick, sectioned business health check ─────────────
// Formatting is deliberately conservative: CallMeBot sits behind a scoring
// firewall that 403s messages accumulating too many "suspicious" tokens.
// Divider runs (━━━ / ---) and an https:// link were enough to tip it, so
// sections separate with blank lines and the PDF link is scheme-less
// (WhatsApp still makes bare domains tappable).
function buildWhatsAppText(d) {
  const lines = [
    '📊 *THE LAB — WEEKLY REPORT*',
    `_${d.period.label}_`,
    '',
    '💰 *FINANCE*',
    `Revenue: ${fmt(d.finance.revenue)}`,
    `Gross profit: ${fmt(d.finance.grossProfit)}`,
    `Expenses: ${fmt(d.finance.expenses)}`,
    `*Net profit: ${fmt(d.finance.netProfit)}*`,
    `Cash flow: in ${fmt(d.finance.moneyIn)} / out ${fmt(d.finance.moneyOut)}`,
    '',
    '🏦 *ACCOUNTS*',
    ...d.accounts.map((a) => `${a.name}: ${fmt(a.balance)}`),
    `*Total funds: ${fmt(d.cashPosition)}*`,
    '',
    '🏷️ *PERFORMANCE*',
    ...(d.brands.length
      ? d.brands.map((b) => `${b.name}: ${fmt(b.revenue)} rev / ${fmt(b.profit)} profit / ${b.boxes} boxes`)
      : ['No sales this week']),
    `Boxes sold: ${d.finance.boxesSold}`,
    ...((d.topProducts || []).length || d.topRep
      ? [
          '',
          '🏆 *HIGHLIGHTS*',
          ...(d.topProducts || []).map((p, i) => `${i + 1}. ${p.name}: ${fmt(p.revenue)}`),
          ...(d.topRep ? [`Top rep: ${d.topRep.name} (${fmt(d.topRep.revenue)})`] : []),
        ]
      : []),
    '',
    '📦 *STOCK*',
    `Value: ${fmt(d.stock.costValue)} (${d.stock.units} boxes)`,
    `The Lab: ${d.stock.warehouseBoxes} / With reps: ${d.stock.repBoxes}`,
    `Potential profit in stock: ${fmt(d.stock.potential)}`,
    '',
    d.attention.length ? '⚠️ *ALERTS*' : '✅ *ALL CLEAR*',
    ...d.attention.map((a) => `• ${a}`),
    '',
    '📄 *Full statement (PDF):*',
    pdfLink(d.period.weekKey).replace(/^https:\/\//, ''),
  ];
  return lines.join('\n');
}

// ── Delivery ──────────────────────────────────────────────────────────────────
// One raw sender for the whole app lives in whatsappNotify.service; this
// re-export keeps older callers working.
const sendWhatsApp = (text) => require('./whatsappNotify.service').sendRaw(text);

// Compose + queue through the notification log (dedupe per reported week, so a
// retried cron never double-sends; failed sends are retried by flush()).
// `force` bypasses the dedupe for tests.
async function sendWeeklyReport({ force = false } = {}) {
  const wa = require('./whatsappNotify.service');
  const data = await buildWeeklyData();
  const weekKey = data.period.weekKey;
  // Legacy dedupe guard (pre-dated the notification log) — still honored so
  // weeks sent before the log existed can't repeat.
  if (!force && (await getSetting('whatsapp.lastWeeklySent')) === weekKey) {
    return { sent: false, reason: `Already sent for ${weekKey}`, weekKey };
  }
  const text = buildWhatsAppText(data);
  const result = await wa.queue('WEEKLY_REPORT', {
    dedupeKey: force ? `weekly:${weekKey}:${Date.now()}` : `weekly:${weekKey}`,
    refType: 'WeeklyReport',
    refId: weekKey,
    text,
  });
  if (result.reason === 'duplicate') return { sent: false, reason: `Already sent for ${weekKey}`, weekKey };
  if (result.sent) await setSetting('whatsapp.lastWeeklySent', weekKey);
  return { ...result, weekKey, pdf: pdfLink(weekKey), chars: text.length };
}

module.exports = { buildWeeklyData, buildWhatsAppText, sendWhatsApp, sendWeeklyReport, signWeek, pdfLink };
