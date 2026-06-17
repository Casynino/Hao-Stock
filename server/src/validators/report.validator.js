'use strict';

const { z } = require('zod');
const { id, dateRangeFields } = require('./common.validator');
const { TX_TYPES } = require('./inventory.validator');

// One flexible query schema for the report endpoints; each controller reads the
// subset of fields it needs. `format` selects JSON (default), PDF or Excel.
const reportQuery = {
  query: z.object({
    ...dateRangeFields,
    groupBy: z.enum(['day', 'week', 'month']).optional(),
    salesRepId: id.optional(),
    warehouseId: id.optional(),
    productId: id.optional(),
    region: z.string().optional(),
    type: z.enum(['CASH', 'CREDIT']).optional(),
    movementType: z.enum(TX_TYPES).optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional(),
    format: z.enum(['json', 'pdf', 'excel']).optional(),
  }),
};

module.exports = { reportQuery };
