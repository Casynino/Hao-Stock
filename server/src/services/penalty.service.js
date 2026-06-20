'use strict';

const prisma = require('../config/prisma');
const notification = require('./notification.service');
const { round2 } = require('../utils/money');

const PENALTY_PER_DAY = 10000; // TZS
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Live penalty calculation for a rep — always authoritative for commission balance.
// Exemptions: settlement already closed; pending return on that settlement.
// Days overdue = full 24h periods since deadlineAt (first penalty after 24h past deadline).
async function computePenaltiesForRep(salesRepId) {
  const now = Date.now();

  const overdue = await prisma.settlement.findMany({
    where: {
      salesRepId,
      status: { in: ['OPEN', 'PARTIAL', 'OVERDUE'] },
      deadlineAt: { lt: new Date(now) },
    },
    select: { id: true, settlementNumber: true, deadlineAt: true },
  });

  if (overdue.length === 0) return { total: 0, breakdown: [] };

  let total = 0;
  const breakdown = [];

  for (const s of overdue) {
    const pendingReturns = await prisma.return.count({
      where: { settlementId: s.id, status: 'PENDING' },
    });

    const msOverdue = now - new Date(s.deadlineAt).getTime();
    const daysOverdue = Math.floor(msOverdue / MS_PER_DAY);

    const penalty = daysOverdue * PENALTY_PER_DAY;
    total += penalty;
    breakdown.push({
      settlementId: s.id,
      settlementNumber: s.settlementNumber,
      daysOverdue,
      penaltyPerDay: PENALTY_PER_DAY,
      totalPenalty: penalty,
      exemptPendingReturn: pendingReturns > 0,
    });
  }

  return { total: round2(total), breakdown };
}

// Apply today's penalty audit records and send rep notifications.
// Safe to call multiple times — skips settlements already penalised today.
async function applyDailyPenalties() {
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const overdue = await prisma.settlement.findMany({
    where: {
      status: { in: ['OPEN', 'PARTIAL', 'OVERDUE'] },
      deadlineAt: { lt: now },
    },
    include: {
      salesRep: { include: { user: { select: { id: true, name: true } } } },
    },
  });

  let applied = 0;
  let skipped = 0;

  for (const s of overdue) {
    const msOverdue = now.getTime() - new Date(s.deadlineAt).getTime();
    const daysOverdue = Math.floor(msOverdue / MS_PER_DAY);
    if (daysOverdue < 1) { skipped++; continue; }

    const existing = await prisma.settlementPenalty.findFirst({
      where: { settlementId: s.id, appliedAt: { gte: todayUtc } },
    });
    if (existing) { skipped++; continue; }

    const pendingReturns = await prisma.return.count({
      where: { settlementId: s.id, status: 'PENDING' },
    });
    if (pendingReturns > 0) { skipped++; continue; }

    await prisma.settlementPenalty.create({
      data: {
        salesRepId: s.salesRepId,
        settlementId: s.id,
        amount: PENALTY_PER_DAY,
        daysOverdue,
        notes: `Day ${daysOverdue} overdue — ${s.settlementNumber}`,
      },
    });

    const repUserId = s.salesRep?.user?.id;
    const repName = s.salesRep?.user?.name || 'A rep';

    if (repUserId) {
      notification.notifyUser(repUserId, {
        type: 'GENERAL',
        severity: 'WARNING',
        title: 'Overdue penalty applied',
        message: `TZS 10,000 has been deducted from your commission — order ${s.settlementNumber} is ${daysOverdue} day(s) overdue. Settle immediately to stop penalties.`,
        entityType: 'Settlement',
        entityId: s.id,
      }).catch(() => {});
    }

    notification.notifyAdmins({
      type: 'GENERAL',
      severity: 'INFO',
      title: 'Settlement penalty applied',
      message: `TZS 10,000 penalty applied to ${repName} for ${s.settlementNumber} (day ${daysOverdue} overdue).`,
      entityType: 'Settlement',
      entityId: s.id,
    }).catch(() => {});

    applied++;
  }

  return { applied, skipped };
}

// Send approaching-deadline notifications (< 24h remaining, not yet overdue).
// Safe to call multiple times — createIfAbsent deduplicates by entityId while unread.
async function checkApproachingDeadlines() {
  const now = new Date();
  const in24h = new Date(now.getTime() + MS_PER_DAY);

  const approaching = await prisma.settlement.findMany({
    where: {
      status: { in: ['OPEN', 'PARTIAL'] },
      deadlineAt: { gt: now, lte: in24h },
    },
    include: {
      salesRep: { include: { user: { select: { id: true, name: true } } } },
    },
  });

  let notified = 0;

  for (const s of approaching) {
    const repUserId = s.salesRep?.user?.id;
    if (!repUserId) continue;

    await notification.createIfAbsent({
      type: 'GENERAL',
      severity: 'WARNING',
      title: 'Settlement deadline in under 24 hours',
      message: `Order ${s.settlementNumber} must be settled by ${new Date(s.deadlineAt).toLocaleString('en-TZ', { timeZone: 'Africa/Dar_es_Salaam' })}. Unsettled orders incur TZS 10,000/day penalties.`,
      entityType: 'Settlement',
      entityId: `${s.id}_approaching`,
      userId: repUserId,
    });

    notified++;
  }

  return { notified };
}

// Stored penalty audit records for a rep (most recent first).
async function listPenalties({ salesRepId, settlementId, page = 1, limit = 20 }) {
  const where = {};
  if (salesRepId) where.salesRepId = salesRepId;
  if (settlementId) where.settlementId = settlementId;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.settlementPenalty.findMany({
      where,
      include: {
        salesRep: { include: { user: { select: { name: true } } } },
        settlement: { select: { settlementNumber: true } },
      },
      orderBy: { appliedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.settlementPenalty.count({ where }),
  ]);

  return { items, total };
}

module.exports = { computePenaltiesForRep, applyDailyPenalties, checkApproachingDeadlines, listPenalties, PENALTY_PER_DAY };
