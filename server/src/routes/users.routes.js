'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/users.controller');
const { userCreate, userUpdate, userQuery } = require('../validators/people.validator');
const { idParam } = require('../validators/common.validator');

const router = express.Router();

router.use(authenticate, requireAdmin);
router.get('/', validate(userQuery), ctrl.list);
router.get('/:id', validate(idParam), ctrl.get);
router.post('/', validate(userCreate), ctrl.create);
router.put('/:id', validate({ ...idParam, ...userUpdate }), ctrl.update);
router.delete('/:id', validate(idParam), ctrl.remove);

module.exports = router;
