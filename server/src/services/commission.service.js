'use strict';

const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const notification = require('./notification.service');
const { penaltyBreakdownForRep } = require('./penalty.service');
const { toNumber, round2, formatCurrency } = require('../utils/money');

// Commission rule is configurable via settings:
//   commission.boxThreshold        (default 50)
//   commission.amountPerThreshold  (default 250000 TZS)
// Commission is PROPORTIONAL: rate per box = amount / threshold. So 120 boxes
// at 250,000 per 50 boxes = 120 * 5,000 = 600,000 (matches the spec example).
async function getRule() {
  const rows = await prisma.setting.findMany({
    where: { key: { in: ['commission.boxThreshold', 'commission.amountPerThreshold'] } },
  });
  const map = new Map(rows.map((r) => [r.key, Number(r.value)]));
  const boxThreshold = map.get('commission.boxThreshold') || 50;
  const amountPerThreshold = map.get('commission.amountPerThreshold') || 250000;
  return { boxThreshold, amountPerThreshold, perBox: round2(amountPerThreshold / boxThreshold) };
}

// Boxes a rep has SETTLED (paid for) across all their orders. Each settlement
// records a CASH sale linked to the order, so settled boxes = base units sold
// on settlement-linked sales (the base unit is the Box). Commission is earned
// on settled boxes only — not on stock issued, and not on returns.
async function boxesSettledByRep(salesRepId) {
  const agg = await prisma.saleItem.aggregate({
    where: { sale: { is: { salesRepId, settlementId: { not: null }, status: { not: 'CANCELLED' } } } },
    _sum: { baseQuantity: true },
  });
  return agg._sum.baseQuantity || 0;
}

async function withdrawalTotals(salesRepId) {
  const grouped = await prisma.commissionWithdrawal.groupBy({
    by: ['status'],
    where: { salesRepId },
    _sum: { amount: true },
  });
  const m = new Map(grouped.map((g) => [g.status, toNumber(g._sum.amount)]));
  const paid = round2((m.get('APPROVED') || 0) + (m.get('PAID') || 0));
  const pendingRequests = round2(m.get('PENDING') || 0);
  return { paid, pendingRequests };
}

async function computeForRep(salesRepId) {
  const [rule, boxes, wt, penaltyData] = await Promise.all([
    getRule(),
    boxesSettledByRep(salesRepId),
    withdrawalTotals(salesRepId),
    penaltyBreakdownForRep(salesRepId),
  ]);
  const earned = round2(boxes * rule.perBox);
  // Penalties are REAL applied deductions (persisted transactions). The balance
  // is earned − paid − pending withdrawals − penalties, and is NOT clamped, so a
  // rep with more fines than earnings goes negative (owes The Lab). Future
  // earnings raise `earned`, automatically offsetting the debt.
  const penalties = penaltyData.total;
  const pending = round2(earned - wt.paid);
  const available = round2(earned - wt.paid - wt.pendingRequests - penalties);
  return {
    rule,
    boxesSettled: round2(boxes),
    earned,
    paid: wt.paid,
    pending,
    pendingRequests: wt.pendingRequests,
    penalties,
    penaltyBreakdown: penaltyData.breakdown,
    available, // can be negative when penalties exceed remaining balance
  };
}

async function summaryAllReps() {
  const reps = await prisma.salesRepresentative.findMany({
    where: { isActive: true },
    include: { user: { select: { name: true } } },
  });
  const items = [];
  for (const rep of reps) {
    const c = await computeForRep(rep.id);
    items.push({ salesRepId: rep.id, name: rep.user?.name, code: rep.code, ...c });
  }
  items.sort((a, b) => b.earned - a.earned);
  return {
    totals: {
      earned: round2(items.reduce((s, i) => s + i.earned, 0)),
      paid: round2(items.reduce((s, i) => s + i.paid, 0)),
      pending: round2(items.reduce((s, i) => s + i.pending, 0)),
      penalties: round2(items.reduce((s, i) => s + i.penalties, 0)),
    },
    items,
  };
}

const WITHDRAWAL_INCLUDE = {
  salesRep: { include: { user: { select: { name: true } } } },
  decidedBy: { select: { id: true, name: true } },
};

async function requestWithdrawal(salesRepId, amount, notes, actor) {
  const amt = round2(amount);
  if (amt <= 0) throw ApiError.badRequest('Amount must be greater than zero');
  const c = await computeForRep(salesRepId);
  const minWithdrawal = c.rule.amountPerThreshold;
  if (c.available < minWithdrawal) {
    throw ApiError.badRequest(`Minimum withdrawal is TZS ${minWithdrawal.toLocaleString()}. Your available balance is TZS ${c.available.toLocaleString()}.`);
  }
  if (amt > c.available + 0.001) {
    throw ApiError.badRequest(`Amount exceeds available commission (${c.available})`);
  }
  const w = await prisma.commissionWithdrawal.create({
    data: { salesRepId, amount: amt, notes: notes || null, status: 'PENDING' },
    include: WITHDRAWAL_INCLUDE,
  });

  const repName = w.salesRep?.user?.name || 'A rep';
  notification.notifyAdmins({
    type: 'GENERAL',
    severity: 'INFO',
    title: 'Commission withdrawal requested',
    message: `${repName} requested a commission withdrawal of ${formatCurrency(amt)}.`,
    entityType: 'CommissionWithdrawal',
    entityId: w.id,
  }).catch(() => {});
  if (actor?.id) {
    notification.notifyUser(actor.id, {
      type: 'GENERAL',
      severity: 'INFO',
      title: 'Withdrawal request submitted',
      message: `Your withdrawal request of ${formatCurrency(amt)} has been submitted and is pending approval.`,
      entityType: 'CommissionWithdrawal',
      entityId: w.id,
    }).catch(() => {});
  }

  return w;
}

async function listWithdrawals(filters, pagination) {
  const where = {};
  if (filters.salesRepId) where.salesRepId = filters.salesRepId;
  if (filters.status) where.status = filters.status;
  const [items, total] = await Promise.all([
    prisma.commissionWithdrawal.findMany({ where, include: WITHDRAWAL_INCLUDE, skip: pagination.skip, take: pagination.take, orderBy: pagination.orderBy }),
    prisma.commissionWithdrawal.count({ where }),
  ]);
  return { items, total };
}

async function decideWithdrawal(id, action, actor) {
  const w = await prisma.commissionWithdrawal.findUnique({ where: { id } });
  if (!w) throw ApiError.notFound('Withdrawal request not found');

  const transitions = {
    APPROVE: { from: ['PENDING'], to: 'APPROVED' },
    REJECT: { from: ['PENDING'], to: 'REJECTED' },
    PAY: { from: ['PENDING', 'APPROVED'], to: 'PAID' },
  };
  const t = transitions[action];
  if (!t) throw ApiError.badRequest('Unknown action');
  if (!t.from.includes(w.status)) {
    throw ApiError.badRequest(`Cannot ${action.toLowerCase()} a ${w.status} request`);
  }

  const updated = await prisma.commissionWithdrawal.update({
    where: { id },
    data: {
      status: t.to,
      decidedAt: new Date(),
      decidedById: actor ? actor.id : null,
      paidAt: t.to === 'PAID' ? new Date() : w.paidAt,
    },
    include: WITHDRAWAL_INCLUDE,
  });

  const repUserId = updated.salesRep?.user?.id;
  const decisionMsgs = {
    APPROVED: { title: 'Withdrawal approved', message: `Your commission withdrawal of ${formatCurrency(updated.amount)} has been approved.`, severity: 'INFO' },
    REJECTED: { title: 'Withdrawal rejected', message: `Your commission withdrawal of ${formatCurrency(updated.amount)} was not approved.`, severity: 'WARNING' },
    PAID: { title: 'Commission payment received', message: `Your commission withdrawal of ${formatCurrency(updated.amount)} has been paid out.`, severity: 'INFO' },
  };
  const dm = decisionMsgs[t.to];
  if (dm && repUserId) {
    notification.notifyUser(repUserId, {
      type: 'GENERAL',
      severity: dm.severity,
      title: dm.title,
      message: dm.message,
      entityType: 'CommissionWithdrawal',
      entityId: id,
    }).catch(() => {});
  }

  return updated;
}

module.exports = {
  getRule,
  computeForRep,
  summaryAllReps,
  requestWithdrawal,
  listWithdrawals,
  decideWithdrawal,
};
