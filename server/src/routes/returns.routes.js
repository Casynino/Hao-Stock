'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRoles, ROLES } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/returns.controller');
const { returnCreate, returnQuery } = require('../validators/inventory.validator');
const { idParam } = require('../validators/common.validator');

const router = express.Router();

// Who can submit a return
const canCreate = requireRoles(ROLES.SALES_REP, ROLES.WAREHOUSE_STAFF);
// Who can approve or reject a return (warehouse operators and admins)
const canDecide = requireRoles(ROLES.WAREHOUSE_STAFF);

router.use(authenticate);
router.get('/', validate(returnQuery), ctrl.list);
router.get('/summary', ctrl.summary); // must precede /:id
router.get('/:id', validate(idParam), ctrl.get);
router.post('/', canCreate, validate(returnCreate), ctrl.create);
router.post('/:id/cancel', validate(idParam), ctrl.cancel); // rep (own) or staff
router.post('/:id/approve', canDecide, validate(idParam), ctrl.approve);
router.post('/:id/reject', canDecide, validate(idParam), ctrl.reject);

module.exports = router;
