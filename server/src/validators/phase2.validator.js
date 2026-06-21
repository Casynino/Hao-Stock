'use strict';

const { z } = require('zod');
const { id, paginationFields, dateRangeFields, boolQuery, money } = require('./common.validator');

// Lenient date string (accepts "2026-06-16" or full ISO); services wrap in Date.
const dateStr = z.string().min(4).optional().nullable();

// --- Suppliers -------------------------------------------------------------
const supplierCreate = {
  body: z.object({
    name: z.string().trim().min(1).max(160),
    country: z.string().trim().max(80).optional(),
    contactName: z.string().trim().max(120).optional().nullable(),
    phone: z.string().trim().max(40).optional().nullable(),
    email: z.string().email().max(160).optional().nullable().or(z.literal('')),
    address: z.string().trim().max(300).optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable(),
    isActive: z.boolean().optional(),
  }),
};
const supplierUpdate = { body: supplierCreate.body.partial() };
const supplierQuery = { query: z.object({ ...paginationFields, isActive: boolQuery }) };

// --- Purchase orders -------------------------------------------------------
const poItem = z.object({
  productId: id,
  packagingUnitId: id,
  quantity: z.number().int().positive(),
  unitCost: money.optional(),
});
const poCreate = {
  body: z.object({
    supplierId: id,
    currency: z.string().trim().max(8).optional(),
    items: z.array(poItem).min(1),
    shippingCost: money.optional(),
    clearingCost: money.optional(),
    otherCost: money.optional(),
    warehouseId: id.optional().nullable(),
    orderedAt: dateStr,
    expectedArrival: dateStr,
    notes: z.string().max(1000).optional().nullable(),
  }),
};
const poUpdate = {
  body: z.object({
    status: z.enum(['DRAFT', 'ORDERED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED']).optional(),
    currency: z.string().trim().max(8).optional(),
    notes: z.string().max(1000).optional().nullable(),
    warehouseId: id.optional().nullable(),
    orderedAt: dateStr,
    expectedArrival: dateStr,
    shippingCost: money.optional(),
    clearingCost: money.optional(),
    otherCost: money.optional(),
  }),
};
const poReceive = { body: z.object({ actualArrival: dateStr }) };
const poQuery = {
  query: z.object({
    ...paginationFields,
    status: z.enum(['DRAFT', 'ORDERED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED']).optional(),
    supplierId: id.optional(),
  }),
};

// --- Stock requests --------------------------------------------------------
const stockRequestCreate = {
  body: z.object({
    warehouseId: id.optional().nullable(),
    notes: z.string().max(500).optional().nullable(),
    items: z.array(z.object({ productId: id, packagingUnitId: id, quantity: z.number().int().positive() })).min(1),
  }),
};
const stockRequestUpdate = {
  body: z.object({
    warehouseId: id.optional().nullable(),
    notes: z.string().max(500).optional().nullable(),
    items: z.array(z.object({ productId: id, packagingUnitId: id, quantity: z.number().int().positive() })).min(1),
  }),
};
const stockRequestApprove = {
  body: z.object({
    approvals: z.array(z.object({ itemId: id, quantityApproved: z.number().int().min(0) })).optional(),
  }),
};
const stockRequestReject = { body: z.object({ notes: z.string().max(500).optional() }) };
const stockRequestQuery = {
  query: z.object({
    ...paginationFields,
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'FULFILLED', 'CANCELLED']).optional(),
    salesRepId: id.optional(),
  }),
};

// --- Settlements -----------------------------------------------------------
const settlementQuery = {
  query: z.object({
    ...paginationFields,
    status: z.enum(['OPEN', 'PARTIAL', 'SETTLED', 'OVERDUE']).optional(),
    salesRepId: id.optional(),
    open: boolQuery,
  }),
};
const settlementSettle = { body: z.object({ notes: z.string().max(500).optional() }) };
const settlementSettleBoxes = {
  body: z.object({
    productId: id,
    boxes: z.number().int().positive(),
    method: z.enum(['CASH', 'MOBILE_MONEY', 'BANK', 'OTHER']).optional(),
    reference: z.string().max(120).optional().nullable(),
    notes: z.string().max(500).optional().nullable(),
    paidAt: dateStr,
  }),
};

// --- Commissions -----------------------------------------------------------
const withdrawRequest = { body: z.object({ amount: money, notes: z.string().max(500).optional() }) };
const withdrawDecide = { body: z.object({ action: z.enum(['APPROVE', 'REJECT', 'PAY']) }) };
const withdrawalQuery = {
  query: z.object({
    ...paginationFields,
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'PAID']).optional(),
    salesRepId: id.optional(),
  }),
};

// --- Online orders ---------------------------------------------------------
const onlineOrderItem = z.object({
  productId: id,
  packagingUnitId: id,
  quantity: z.number().int().positive(),
  unitPrice: money.optional(),
});
const onlineOrderCreate = {
  body: z.object({
    customerName: z.string().trim().min(1).max(160),
    customerPhone: z.string().trim().max(40).optional().nullable(),
    customerEmail: z.string().trim().max(160).optional().nullable(),
    customerId: id.optional().nullable(),
    region: z.string().trim().max(120).optional().nullable(),
    address: z.string().trim().max(300).optional().nullable(),
    courierName: z.string().trim().max(120).optional().nullable(),
    trackingNumber: z.string().trim().max(120).optional().nullable(),
    discount: money.optional(),
    amountPaid: money.optional(),
    warehouseId: id.optional().nullable(),
    notes: z.string().max(500).optional().nullable(),
    items: z.array(onlineOrderItem).min(1),
  }),
};
const onlineOrderStatus = {
  body: z.object({ status: z.enum(['PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED']) }),
};
const onlineOrderPayment = {
  body: z.object({ amountPaid: money.optional(), paymentStatus: z.enum(['UNPAID', 'PARTIAL', 'PAID']).optional() }),
};
const onlineOrderQuery = {
  query: z.object({
    ...paginationFields,
    status: z.enum(['PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED']).optional(),
    paymentStatus: z.enum(['UNPAID', 'PARTIAL', 'PAID']).optional(),
  }),
};

// --- Daily reports ---------------------------------------------------------
const dailyReportSubmit = {
  body: z.object({
    type: z.enum(['OPENING', 'CLOSING']),
    reportDate: dateStr,
    cashOnHand: money.optional().nullable(),
    customersToVisit: z.number().int().min(0).optional().nullable(),
    openingNote: z.string().max(1000).optional().nullable(),
    salesAmount: money.optional().nullable(),
    cashCollected: money.optional().nullable(),
    debtsCreated: money.optional().nullable(),
    debtsCollected: money.optional().nullable(),
    closingNote: z.string().max(1000).optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
  }),
};
const dailyReportQuery = {
  query: z.object({ ...paginationFields, ...dateRangeFields, salesRepId: id.optional(), type: z.enum(['OPENING', 'CLOSING']).optional() }),
};

module.exports = {
  supplierCreate, supplierUpdate, supplierQuery,
  poCreate, poUpdate, poReceive, poQuery,
  stockRequestCreate, stockRequestUpdate, stockRequestApprove, stockRequestReject, stockRequestQuery,
  settlementQuery, settlementSettle, settlementSettleBoxes,
  withdrawRequest, withdrawDecide, withdrawalQuery,
  onlineOrderCreate, onlineOrderStatus, onlineOrderPayment, onlineOrderQuery,
  dailyReportSubmit, dailyReportQuery,
};
