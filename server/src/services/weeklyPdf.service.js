'use strict';

// Bank-statement style weekly PDF for The Lab. Consumes the structured data
// from weeklyReport.buildWeeklyData() and renders a clean, printable A4
// statement: header band, financial summary, accounts, brand performance,
// stock & settlement summaries, and alerts.

const PDFDocument = require('pdfkit');

const INK = '#111827';
const MUTED = '#6b7280';
const LINE = '#e5e7eb';
const ACCENT = '#65a30d';
const BAND = '#0f172a';

const fmt = (n) => `TSh ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;

function weeklyStatementPdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 46 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;

    // ── Header band ──
    doc.rect(0, 0, doc.page.width, 92).fill(BAND);
    doc.fill('#ffffff').font('Helvetica-Bold').fontSize(20).text('THE LAB', left, 26);
    doc.font('Helvetica').fontSize(10).fillColor('#a3e635').text('Weekly Business Statement', left, 52);
    doc.fillColor('#cbd5e1').fontSize(9)
      .text(`Period: ${data.period.label}`, left, 66);
    doc.text(`Generated: ${data.generatedAt}`, right - 220, 26, { width: 220, align: 'right' });
    doc.text('hao-stock.vercel.app', right - 220, 40, { width: 220, align: 'right' });
    doc.y = 112;

    const sectionTitle = (t) => {
      const y = doc.y + 6;
      doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(t.toUpperCase(), left, y);
      doc.moveTo(left, doc.y + 3).lineTo(right, doc.y + 3).lineWidth(1).strokeColor(ACCENT).stroke();
      doc.y += 10;
    };

    // Two-column key/value rows, statement style.
    const kvRows = (rows, { bold = [] } = {}) => {
      rows.forEach(([k, v]) => {
        const isBold = bold.includes(k);
        const y = doc.y;
        doc.font(isBold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).fillColor(isBold ? INK : MUTED)
          .text(k, left, y, { width: width * 0.6 });
        doc.font(isBold ? 'Helvetica-Bold' : 'Helvetica').fillColor(INK)
          .text(v, left + width * 0.6, y, { width: width * 0.4, align: 'right' });
        doc.moveTo(left, doc.y + 2).lineTo(right, doc.y + 2).lineWidth(0.4).strokeColor(LINE).stroke();
        doc.y += 6;
      });
    };

    // Simple table with headers.
    const table = (headers, rows, weights) => {
      const totalW = weights.reduce((a, b) => a + b, 0);
      const xs = [];
      let x = left;
      weights.forEach((w) => { xs.push(x); x += (w / totalW) * width; });
      const y0 = doc.y;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MUTED);
      headers.forEach((h, i) => doc.text(h, xs[i], y0, { width: (weights[i] / totalW) * width - 6, align: i === 0 ? 'left' : 'right' }));
      doc.moveTo(left, doc.y + 2).lineTo(right, doc.y + 2).lineWidth(0.8).strokeColor(LINE).stroke();
      doc.y += 6;
      doc.font('Helvetica').fontSize(9.5).fillColor(INK);
      rows.forEach((r) => {
        const y = doc.y;
        r.forEach((cell, i) => doc.text(String(cell), xs[i], y, { width: (weights[i] / totalW) * width - 6, align: i === 0 ? 'left' : 'right' }));
        doc.moveTo(left, doc.y + 2).lineTo(right, doc.y + 2).lineWidth(0.4).strokeColor(LINE).stroke();
        doc.y += 6;
      });
    };

    // ── 1. Financial summary ──
    sectionTitle('Financial Summary');
    kvRows([
      ['Revenue (sales)', fmt(data.finance.revenue)],
      ['Cost of goods sold', `- ${fmt(data.finance.cogs)}`],
      ['Gross profit', fmt(data.finance.grossProfit)],
      ['Business expenses', `- ${fmt(data.finance.expenses)}`],
      ['Net profit', fmt(data.finance.netProfit)],
      ['Money in', fmt(data.finance.moneyIn)],
      ['Money out', `- ${fmt(data.finance.moneyOut)}`],
      ['Net cash flow', fmt(data.finance.netCash)],
      ['Boxes sold', String(data.finance.boxesSold)],
    ], { bold: ['Gross profit', 'Net profit', 'Net cash flow'] });

    // ── 2. Business accounts ──
    sectionTitle('Business Accounts (current balances)');
    kvRows([
      ...data.accounts.map((a) => [a.name, fmt(a.balance)]),
      ['Total available funds', fmt(data.cashPosition)],
    ], { bold: ['Total available funds'] });

    // ── 3. Brand performance ──
    sectionTitle('Brand Performance');
    if (data.brands.length === 0) {
      doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text('No brand sales in this period.', left);
      doc.y += 6;
    } else {
      table(
        ['Brand', 'Revenue', 'Cost', 'Profit', 'Margin', 'Boxes'],
        data.brands.map((b) => [b.name, fmt(b.revenue), fmt(b.cost), fmt(b.profit), `${b.margin}%`, b.boxes]),
        [2, 2, 2, 2, 1, 1],
      );
    }

    // ── 4. Stock summary ──
    sectionTitle('Stock Summary');
    kvRows([
      ['Inventory value (cost)', fmt(data.stock.costValue)],
      ['Inventory value (selling)', fmt(data.stock.retailValue)],
      ['Potential profit in stock', fmt(data.stock.potential)],
      ['Total boxes', String(data.stock.units)],
      ['In The Lab (warehouse)', `${data.stock.warehouseBoxes} boxes`],
      ['With sales reps', `${data.stock.repBoxes} boxes`],
    ], { bold: ['Potential profit in stock'] });

    // ── 5. Settlement summary ──
    sectionTitle('Settlement Summary');
    kvRows([
      ['Active orders (money owed by reps)', `${data.settlements.active} · ${fmt(data.settlements.activeValue)}`],
      ['Overdue orders', `${data.settlements.overdue} · ${fmt(data.settlements.overdueValue)}`],
      ['Settlements awaiting approval', String(data.settlements.pendingApprovals)],
    ], { bold: data.settlements.overdue > 0 ? ['Overdue orders'] : [] });

    // ── 6. Alerts ──
    sectionTitle('Alerts');
    if (data.attention.length === 0) {
      doc.font('Helvetica').fontSize(9.5).fillColor(ACCENT).text('All clear — nothing needs attention.', left);
    } else {
      data.attention.forEach((a) => {
        doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(`•  ${a}`, left);
        doc.y += 2;
      });
    }

    // ── Footer ──
    doc.fontSize(8).fillColor(MUTED)
      .text('Generated automatically by The Lab · Figures derive from recorded transactions from the Finance go-live onward.',
        left, doc.page.height - 60, { width, align: 'center' });

    doc.end();
  });
}

module.exports = { weeklyStatementPdf };
