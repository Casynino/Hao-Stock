'use strict';

const { z } = require('zod');

// Reusable primitives shared across module validators.
const id = z.string().min(1, 'id is required');
const idParam = { params: z.object({ id }) };

// Query boolean that respects the literal strings "true"/"false".
const boolQuery = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

const positiveInt = z.coerce.number().int().positive();
const nonNegativeInt = z.coerce.number().int().min(0);
const money = z.coerce.number().min(0);

// Standard pagination / sorting fields mixed into list query schemas.
const paginationFields = {
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  search: z.string().trim().optional(),
};

const dateRangeFields = {
  from: z.string().datetime().optional().or(z.string().date().optional()),
  to: z.string().datetime().optional().or(z.string().date().optional()),
  period: z.enum(['today', 'week', 'month', 'year']).optional(),
};

module.exports = {
  id,
  idParam,
  boolQuery,
  positiveInt,
  nonNegativeInt,
  money,
  paginationFields,
  dateRangeFields,
};
