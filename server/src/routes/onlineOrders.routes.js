'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRoles, ROLES } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/onlineOrders.controller');
const {
  onlineOrderCreate, onlineOrderStatus, onlineOrderPayment, onlineOrderQuery,
} = require('../validators/phase2.validator');
const { idParam } = require('../validators/common.validator');

const router = express.Router();
const staff = requireRoles(ROLES.WAREHOUSE_STAFF);

router.use(authenticate, staff);
router.get('/', validate(onlineOrderQuery), ctrl.list);
router.get('/:id', validate(idParam), ctrl.get);
router.post('/', validate(onlineOrderCreate), ctrl.create);
router.post('/:id/status', validate({ ...idParam, ...onlineOrderStatus }), ctrl.updateStatus);
router.post('/:id/payment', validate({ ...idParam, ...onlineOrderPayment }), ctrl.updatePayment);

module.exports = router;
