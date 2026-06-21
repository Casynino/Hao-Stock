'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRoles, ROLES } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/stockRequests.controller');
const {
  stockRequestCreate, stockRequestUpdate, stockRequestApprove, stockRequestReject, stockRequestQuery,
} = require('../validators/phase2.validator');
const { idParam } = require('../validators/common.validator');

const router = express.Router();
const staff = requireRoles(ROLES.WAREHOUSE_STAFF);
const reps = requireRoles(ROLES.SALES_REP);

router.use(authenticate);
router.get('/', validate(stockRequestQuery), ctrl.list);
router.get('/available-products', ctrl.availableProducts); // before /:id
router.get('/:id', validate(idParam), ctrl.get);
router.post('/', reps, validate(stockRequestCreate), ctrl.create);
router.put('/:id', validate({ ...idParam, ...stockRequestUpdate }), ctrl.update); // owner rep or staff; pending only (enforced in service/controller)
router.post('/:id/approve', staff, validate({ ...idParam, ...stockRequestApprove }), ctrl.approve);
router.post('/:id/reject', staff, validate({ ...idParam, ...stockRequestReject }), ctrl.reject);
router.post('/:id/cancel', validate(idParam), ctrl.cancel);

module.exports = router;
