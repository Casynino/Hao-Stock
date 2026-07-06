'use strict';

function pad(n, width = 4) {
  return String(n).padStart(width, '0');
}

function compactDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

// Generate a human-readable, per-day sequential document number such as
// SALE-20260616-0007. `delegate` is a Prisma model delegate (e.g. tx.sale),
// `field` the unique column, `prefix` the document prefix. The surrounding
// unique constraint is the real guarantee; this just produces friendly values.
async function nextDocNumber(delegate, field, prefix) {
  const datePart = compactDate();
  const like = `${prefix}-${datePart}-`;
  const count = await delegate.count({
    where: { [field]: { startsWith: like } },
  });
  return `${like}${pad(count + 1)}`;
}

// Next sequential sales-rep code (REP-006). Derived from the HIGHEST existing
// code, not the row count — reps can be hard-deleted, so a count would reuse a
// number that is still taken (e.g. 4 reps left but REP-005 exists).
async function nextRepCode(client) {
  const rows = await client.salesRepresentative.findMany({ select: { code: true } });
  let max = 0;
  for (const r of rows) {
    const m = /^REP-(\d+)$/i.exec(r.code || '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `REP-${pad(max + 1, 3)}`;
}

// Short uppercase alphanumeric code, e.g. for SKUs or rep codes.
function randomCode(length = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

module.exports = { nextDocNumber, nextRepCode, randomCode, compactDate, pad };
