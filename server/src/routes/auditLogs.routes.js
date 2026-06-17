'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/auditLogs.controller');
const { auditQuery } = require('../validators/misc.validator');

const router = express.Router();

router.use(authenticate, requireAdmin);
router.get('/', validate(auditQuery), ctrl.list);

module.exports = router;
