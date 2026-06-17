'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRoles, ROLES } = require('../middleware/authorize');
const ctrl = require('../controllers/activity.controller');

const router = express.Router();

router.use(authenticate, requireRoles(ROLES.WAREHOUSE_STAFF));
router.get('/', ctrl.feed);

module.exports = router;
