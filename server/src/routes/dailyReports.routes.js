'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRoles, ROLES } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/dailyReports.controller');
const { dailyReportSubmit, dailyReportQuery } = require('../validators/phase2.validator');
const { idParam } = require('../validators/common.validator');

const router = express.Router();
const reps = requireRoles(ROLES.SALES_REP);

router.use(authenticate);
router.get('/', validate(dailyReportQuery), ctrl.list);
router.get('/:id', validate(idParam), ctrl.get);
router.post('/', reps, validate(dailyReportSubmit), ctrl.submit);

module.exports = router;
