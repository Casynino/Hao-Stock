'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRoles, ROLES } = require('../middleware/authorize');
const ctrl = require('../controllers/finance.controller');

const router = express.Router();

// Finance is staff/admin only (The Doctor's money) — reps have no access.
router.use(authenticate, requireRoles(ROLES.WAREHOUSE_STAFF));

router.get('/overview', ctrl.overview);
router.post('/sync', ctrl.sync); // rebuild ledger from existing records (idempotent)
router.get('/cashflow', ctrl.cashflow);
router.get('/report', ctrl.report);
router.get('/suppliers', ctrl.suppliers);
router.get('/suppliers/:id', ctrl.supplierDetail);
router.post('/supplier-payments', ctrl.paySupplier);
router.get('/accounts', ctrl.accounts);
router.post('/accounts', ctrl.createAccount);
router.put('/accounts/:id', ctrl.updateAccount);
router.get('/categories', ctrl.categories);
router.post('/categories', ctrl.createCategory);
router.get('/transactions', ctrl.transactions);
router.post('/income', ctrl.recordIncome);
router.post('/expenses', ctrl.recordExpense);
router.put('/transactions/:id', ctrl.updateTransaction);
router.delete('/transactions/:id', ctrl.deleteTransaction);

module.exports = router;
