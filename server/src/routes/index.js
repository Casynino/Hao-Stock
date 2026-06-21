'use strict';

const express = require('express');

const router = express.Router();

// Each feature router is mounted here. Routers are added as their modules are
// implemented; see ./*.routes.js.
router.use('/auth', require('./auth.routes'));
router.use('/users', require('./users.routes'));
router.use('/roles', require('./roles.routes'));
router.use('/brands', require('./brands.routes'));
router.use('/categories', require('./categories.routes'));
router.use('/packaging-units', require('./packagingUnits.routes'));
router.use('/products', require('./products.routes'));
router.use('/warehouses', require('./warehouses.routes'));
router.use('/sales-reps', require('./salesReps.routes'));
router.use('/customers', require('./customers.routes'));
router.use('/inventory', require('./inventory.routes'));
router.use('/transfers', require('./transfers.routes'));
router.use('/sales', require('./sales.routes'));
router.use('/credit', require('./credit.routes'));
router.use('/returns', require('./returns.routes'));
router.use('/reports', require('./reports.routes'));
router.use('/reorder', require('./reorder.routes'));
router.use('/notifications', require('./notifications.routes'));
router.use('/audit-logs', require('./auditLogs.routes'));
router.use('/dashboard', require('./dashboard.routes'));
router.use('/settings', require('./settings.routes'));

// Phase 2: imports, requests, settlements, commissions, online orders, etc.
router.use('/suppliers', require('./suppliers.routes'));
router.use('/purchase-orders', require('./purchaseOrders.routes'));
router.use('/stock-requests', require('./stockRequests.routes'));
router.use('/settlements', require('./settlements.routes'));
router.use('/commissions', require('./commissions.routes'));
router.use('/penalties', require('./penalties.routes'));
router.use('/online-orders', require('./onlineOrders.routes'));
router.use('/daily-reports', require('./dailyReports.routes'));
router.use('/activity', require('./activity.routes'));

module.exports = router;
