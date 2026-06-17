'use strict';

const express = require('express');
const { z } = require('zod');
const { authenticate } = require('../middleware/auth');
const { requireRoles, ROLES } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/reorder.controller');

const router = express.Router();
const query = {
  query: z.object({
    lookbackDays: z.coerce.number().int().min(1).max(365).optional(),
    coverDays: z.coerce.number().int().min(1).max(365).optional(),
  }),
};

router.use(authenticate, requireRoles(ROLES.WAREHOUSE_STAFF));
router.get('/', validate(query), ctrl.analysis);
router.get('/low-stock', ctrl.lowStock);

module.exports = router;
