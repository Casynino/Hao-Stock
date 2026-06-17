'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/auth.controller');
const {
  loginSchema,
  refreshSchema,
  changePasswordSchema,
} = require('../validators/auth.validator');

const router = express.Router();

// Tighter limiter for credential endpoints to slow brute-force attempts.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many login attempts, try again later' } },
});

router.post('/login', loginLimiter, validate(loginSchema), ctrl.login);
router.post('/refresh', validate(refreshSchema), ctrl.refresh);
router.get('/me', authenticate, ctrl.me);
router.post('/logout', authenticate, ctrl.logout);
router.post('/change-password', authenticate, validate(changePasswordSchema), ctrl.changePassword);

module.exports = router;
