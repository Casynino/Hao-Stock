'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireAdmin, requireRoles, ROLES } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/salesReps.controller');
const { salesRepCreate, salesRepUpdate } = require('../validators/people.validator');
const { namedQuery } = require('../validators/catalog.validator');
const { idParam } = require('../validators/common.validator');

const router = express.Router();

router.use(authenticate);
router.get('/', validate(namedQuery), ctrl.list);
router.get('/:id', validate(idParam), ctrl.get);
router.get('/:id/profile', requireRoles(ROLES.WAREHOUSE_STAFF), validate(idParam), ctrl.getProfile);
router.get('/:id/stock', validate(idParam), ctrl.getStock);
router.get('/:id/reconciliation', validate(idParam), ctrl.getReconciliation);
router.post('/', requireAdmin, validate(salesRepCreate), ctrl.create);
router.put('/:id', requireAdmin, validate({ ...idParam, ...salesRepUpdate }), ctrl.update);
router.delete('/:id', requireAdmin, validate(idParam), ctrl.remove);

module.exports = router;
