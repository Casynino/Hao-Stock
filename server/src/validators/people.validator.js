'use strict';

const { z } = require('zod');
const { id, paginationFields, boolQuery, money } = require('./common.validator');

// --- Users -----------------------------------------------------------------
const userCreate = {
  body: z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().email().max(160),
    password: z.string().min(8, 'Password must be at least 8 characters').max(100),
    phone: z.string().trim().max(40).optional().nullable(),
    roleId: id,
    warehouseId: id.optional().nullable(),
    isActive: z.boolean().optional(),
    // When the role is SALES_REP, an optional rep profile can be created.
    salesRep: z
      .object({
        code: z.string().trim().max(40).optional(),
        region: z.string().trim().max(120).optional().nullable(),
        phone: z.string().trim().max(40).optional().nullable(),
        monthlyTarget: money.optional().nullable(),
      })
      .optional(),
  }),
};

const userUpdate = {
  body: z.object({
    name: z.string().trim().min(1).max(120).optional(),
    email: z.string().email().max(160).optional(),
    password: z.string().min(8).max(100).optional(),
    phone: z.string().trim().max(40).optional().nullable(),
    roleId: id.optional(),
    warehouseId: id.optional().nullable(),
    isActive: z.boolean().optional(),
  }),
};

const userQuery = {
  query: z.object({ ...paginationFields, roleId: id.optional(), isActive: boolQuery }),
};

// --- Customers -------------------------------------------------------------
const customerCreate = {
  body: z.object({
    name: z.string().trim().min(1).max(160),
    phone: z.string().trim().max(40).optional().nullable(),
    region: z.string().trim().max(120).optional().nullable(),
    address: z.string().trim().max(300).optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable(),
    salesRepId: id.optional().nullable(),
    isActive: z.boolean().optional(),
  }),
};
const customerUpdate = { body: customerCreate.body.partial() };
const customerQuery = {
  query: z.object({
    ...paginationFields,
    salesRepId: id.optional(),
    region: z.string().optional(),
    isActive: boolQuery,
  }),
};

// --- Sales representatives --------------------------------------------------
const salesRepCreate = {
  body: z.object({
    userId: id,
    code: z.string().trim().max(40).optional(),
    region: z.string().trim().max(120).optional().nullable(),
    phone: z.string().trim().max(40).optional().nullable(),
    monthlyTarget: money.optional().nullable(),
    isActive: z.boolean().optional(),
  }),
};
const salesRepUpdate = {
  body: z.object({
    code: z.string().trim().max(40).optional(),
    region: z.string().trim().max(120).optional().nullable(),
    phone: z.string().trim().max(40).optional().nullable(),
    monthlyTarget: money.optional().nullable(),
    isActive: z.boolean().optional(),
  }),
};

// --- Warehouses ------------------------------------------------------------
const warehouseCreate = {
  body: z.object({
    name: z.string().trim().min(1).max(160),
    code: z.string().trim().min(1).max(40),
    region: z.string().trim().max(120).optional().nullable(),
    address: z.string().trim().max(300).optional().nullable(),
    isPrimary: z.boolean().optional(),
    isActive: z.boolean().optional(),
  }),
};
const warehouseUpdate = { body: warehouseCreate.body.partial() };

module.exports = {
  userCreate,
  userUpdate,
  userQuery,
  customerCreate,
  customerUpdate,
  customerQuery,
  salesRepCreate,
  salesRepUpdate,
  warehouseCreate,
  warehouseUpdate,
};
