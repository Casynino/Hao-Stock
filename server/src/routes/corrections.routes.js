'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRoles, ROLES } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/corrections.controller');
const { correctionCreate, correctionResolve, correctionQuery } = require('../validators/phase2.validator');
const { idParam } = require('../validators/common.validator');

const router = express.Router();
const raisers = requireRoles(ROLES.SALES_REP, ROLES.WAREHOUSE_STAFF);
const resolvers = requireRoles(ROLES.WAREHOUSE_STAFF); // ADMIN always allowed

router.use(authenticate);
router.get('/', validate(correctionQuery), ctrl.list); // reps scoped to their own in the controller
router.post('/', raisers, validate(correctionCreate), ctrl.create);
router.post('/:id/resolve', resolvers, validate({ ...idParam, ...correctionResolve }), ctrl.resolve);

module.exports = router;
