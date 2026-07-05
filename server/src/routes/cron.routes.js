'use strict';

// Scheduled-task endpoints, hit by Vercel Cron (which can't send a JWT, so this
// router is NOT behind `authenticate`). When CRON_SECRET is configured, Vercel
// automatically sends `Authorization: Bearer <CRON_SECRET>` and we require it;
// if it's unset the endpoint still works (it only refreshes overdue flags and
// sends already-deduplicated reminders, so there's nothing to abuse).

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const settlement = require('../services/settlement.service');
const penalty = require('../services/penalty.service');

const router = express.Router();

function guard(req, res, next) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
  }
  return next();
}

// Flip past-deadline orders to OVERDUE (so penalties apply) and send any due
// 24h/6h/1h settlement reminders. Safe to call repeatedly — fully idempotent.
router.get(
  '/settlement-sweep',
  guard,
  asyncHandler(async (_req, res) => {
    const overdue = await settlement.refreshOverdue();
    const reminders = await settlement.sendDueReminders();
    const penalties = await penalty.applyDuePenalties();
    return res.json({ success: true, data: { overdue, reminders, penalties, at: new Date().toISOString() } });
  }),
);

// Weekly WhatsApp business report (Vercel cron, Mondays). ?force=1 resends
// even if this week's report already went out (for testing).
router.get(
  '/weekly-report',
  guard,
  asyncHandler(async (req, res) => {
    const weekly = require('../services/weeklyReport.service');
    const result = await weekly.sendWeeklyReport({ force: req.query.force === '1' });
    return res.json({ success: true, data: result });
  }),
);

module.exports = router;
