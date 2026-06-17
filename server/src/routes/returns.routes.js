'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRoles, ROLES } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/returns.controller');
const { returnCreate, returnQuery } = require('../validators/inventory.validator');
const { idParam } = require('../validators/common.validator');

const router = express.Router();
const handlers = requireRoles(ROLES.SALES_REP, ROLES.WAREHOUSE_STAFF);

router.use(authenticate);
router.get('/', validate(returnQuery), ctrl.list);
router.get('/:id', validate(idParam), ctrl.get);
router.post('/', handlers, validate(returnCreate), ctrl.create);

module.exports = router;
