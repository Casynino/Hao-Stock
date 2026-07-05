'use strict';

// ===========================================================================
// WEEKLY WHATSAPP BUSINESS REPORT
//
// Composes a compact weekly summary (money, P&L, brands, attention items) from
// the same Finance sources as the dashboard and sends it to The Doctor's
// WhatsApp via CallMeBot. Configuration lives in Settings:
//   whatsapp.phone   — full international number, e.g. +2557XXXXXXXX
//   whatsapp.apikey  — CallMeBot API key (user authorizes once from the phone)
// Triggered by the weekly Vercel cron (/api/cron/weekly-report).
// ===========================================================================

const prisma = require('../config/prisma');
const finance = require('./finance.service');
const reorder = require('./reorder.service');
const { dayjs } = require('../utils/dates');

const fmt = (n) => `TSh ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;

async function getSetting(key) {
  const row = await prisma.setting.findUnique({ where: { key } }).catch(() => null);
  return row?.value || null;
}

async function setSetting(key, value, group = 'whatsapp') {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value, group },
    update: { value },
  });
}

// The week this report covers: on Mondays (cron day) that's the COMPLETED
// Mon–Sun week that just ended; any other day (manual/test sends) it's the
// current ISO week to date.
function reportWeek() {
  const now = dayjs();
  const start = now.isoWeekday() === 1 ? now.startOf('isoWeek').subtract(7, 'day') : now.startOf('isoWeek');
  const end = now.isoWeekday() === 1 ? now.startOf('isoWeek').subtract(1, 'day') : now;
  return { start, end };
}

// Build the WhatsApp-formatted weekly report text from real business data.
async function buildWeeklyReportText() {
  const { start, end } = reportWeek();
  const from = start.format('YYYY-MM-DD');
  const to = end.format('YYYY-MM-DD');

  const inventory = require('./inventory.service');
  const [rep, accounts, val, suppliers, low, pending] = await Promise.all([
    finance.report({ from, to }),
    finance.accountBalances(),
    inventory.valuation(prisma),
    finance.supplierSummaries(),
    reorder.lowStock(),
    prisma.$transaction([
      prisma.stockRequest.count({ where: { status: 'PENDING' } }),
      prisma.settlementSubmission.count({ where: { status: 'PENDING' } }),
      prisma.return.count({ where: { status: 'PENDING' } }),
      prisma.settlement.count({ where: { status: { in: ['OPEN', 'PARTIAL', 'OVERDUE'] }, deadlineAt: { lt: new Date() } } }),
    ]),
  ]);

  const supplierDue = suppliers.reduce((s, x) => s + x.outstanding, 0);
  const cashPosition = accounts.reduce((s, a) => s + a.balance, 0);

  const lines = [
    '📊 *The Lab — Weekly Report*',
    `_${start.format('D MMM')} – ${end.format('D MMM YYYY')}_`,
    '',
    '💰 *Where the money is*',
    ...accounts.map((a) => `${a.name}: ${fmt(a.balance)}`),
    `*Total: ${fmt(cashPosition)}*`,
    '',
    '📈 *This week*',
    `Revenue: ${fmt(rep.revenue)}`,
    `Gross profit: ${fmt(rep.grossProfit)}`,
    `Expenses: ${fmt(rep.expenses)}`,
    `*Net profit: ${fmt(rep.netProfit)}*`,
    `Cash flow: in ${fmt(rep.cashFlow.moneyIn)} / out ${fmt(rep.cashFlow.moneyOut)}`,
    `Boxes sold: ${rep.boxesSold}`,
  ];

  if ((rep.topBrands || []).length > 0) {
    lines.push('', '🏷️ *By brand (week)*');
    for (const b of rep.topBrands) {
      lines.push(`${b.name}: ${fmt(b.revenue)} rev · ${fmt(b.profit)} profit · ${b.boxes} boxes`);
    }
  }

  lines.push('', '📦 *Inventory*',
    `Value: ${fmt(val.totals.totalValue)} (${val.totals.totalBaseUnits} boxes)`,
    `Potential profit in stock: ${fmt(val.totals.retailValue - val.totals.totalValue)}`);

  const attention = [];
  if (pending[0]) attention.push(`${pending[0]} stock request(s) waiting`);
  if (pending[1]) attention.push(`${pending[1]} settlement(s) to approve`);
  if (pending[2]) attention.push(`${pending[2]} return(s) to approve`);
  if (pending[3]) attention.push(`${pending[3]} order(s) OVERDUE`);
  if (low.length) attention.push(`${low.length} product(s) low on stock`);
  if (supplierDue > 0) attention.push(`Owed to suppliers: ${fmt(supplierDue)}`);
  lines.push('', attention.length ? '⚠️ *Needs your attention*' : '✅ *All clear — nothing pending*');
  attention.forEach((a) => lines.push(`• ${a}`));

  lines.push('', '— The Lab · automatic weekly report');
  return lines.join('\n');
}

// Send a text to The Doctor's WhatsApp via CallMeBot.
async function sendWhatsApp(text) {
  const phone = await getSetting('whatsapp.phone');
  const apikey = await getSetting('whatsapp.apikey');
  if (!phone || !apikey) {
    return { sent: false, reason: 'WhatsApp not configured — set whatsapp.phone and whatsapp.apikey in Settings' };
  }
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&apikey=${encodeURIComponent(apikey)}&text=${encodeURIComponent(text)}`;
  const res = await fetch(url, { method: 'GET' });
  const body = await res.text().catch(() => '');
  const okBody = /message queued|sent|will be delivered/i.test(body);
  return { sent: res.ok && okBody, status: res.status, provider: body.slice(0, 160) };
}

// Compose + send the weekly report. Guarded so a retried cron never sends the
// same week's report twice.
async function sendWeeklyReport({ force = false } = {}) {
  const { start } = reportWeek();
  const weekKey = `${start.isoWeekYear()}-W${String(start.isoWeek()).padStart(2, '0')}`; // week the report covers
  const lastKey = await getSetting('whatsapp.lastWeeklySent');
  if (!force && lastKey === weekKey) {
    return { sent: false, reason: `Already sent for ${weekKey}` };
  }
  const text = await buildWeeklyReportText();
  const result = await sendWhatsApp(text);
  if (result.sent) await setSetting('whatsapp.lastWeeklySent', weekKey);
  return { ...result, weekKey, chars: text.length };
}

module.exports = { buildWeeklyReportText, sendWhatsApp, sendWeeklyReport };
