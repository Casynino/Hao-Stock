'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRoles, requireAdmin, ROLES } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/customers.controller');
const { customerCreate, customerUpdate, customerQuery } = require('../validators/people.validator');
const { idParam } = require('../validators/common.validator');

const router = express.Router();
const staffOrRep = requireRoles(ROLES.SALES_REP, ROLES.WAREHOUSE_STAFF);

router.use(authenticate);
router.get('/', validate(customerQuery), ctrl.list);
router.get('/:id', validate(idParam), ctrl.get);
router.post('/', staffOrRep, validate(customerCreate), ctrl.create);
router.put('/:id', staffOrRep, validate({ ...idParam, ...customerUpdate }), ctrl.update);
router.delete('/:id', requireAdmin, validate(idParam), ctrl.remove);

module.exports = router;
