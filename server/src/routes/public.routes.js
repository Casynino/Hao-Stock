'use strict';

// Publicly reachable, signature-guarded endpoints — used for links that must
// open from WhatsApp/a phone browser without a login. Each link carries an
// HMAC signature derived from the server secret, so URLs can't be guessed.

const express = require('express');
const crypto = require('crypto');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// The weekly bank-statement PDF, generated on demand from live records.
// /api/public/weekly-statement.pdf?week=2026-W27&sig=<hmac>
router.get(
  '/weekly-statement.pdf',
  asyncHandler(async (req, res) => {
    const weekly = require('../services/weeklyReport.service');
    const { weeklyStatementPdf } = require('../services/weeklyPdf.service');

    const week = String(req.query.week || '');
    const sig = String(req.query.sig || '');
    if (!/^\d{4}-W\d{2}$/.test(week)) return res.status(400).json({ success: false, error: { message: 'Bad week' } });
    const expected = weekly.signWeek(week);
    if (!sig || !crypto.timingSafeEqual(Buffer.from(sig.padEnd(expected.length).slice(0, expected.length)), Buffer.from(expected))) {
      return res.status(403).json({ success: false, error: { message: 'Invalid link' } });
    }

    const data = await weekly.buildWeeklyData(week);
    const pdf = await weeklyStatementPdf(data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="TheLab-Weekly-${week}.pdf"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.send(pdf);
  }),
);

module.exports = router;
