'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRoles, ROLES } = require('../middleware/authorize');
const ctrl = require('../controllers/penalties.controller');

const router = express.Router();

router.use(authenticate);
router.get('/', ctrl.list);
router.post('/apply', requireRoles(ROLES.ADMIN), ctrl.apply);
router.post('/adjust', requireRoles(ROLES.ADMIN), ctrl.adjust); // manual commission deduction
router.post('/:id/waive', requireRoles(ROLES.ADMIN), ctrl.waive);

module.exports = router;
