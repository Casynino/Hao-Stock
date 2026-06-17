'use strict';

const { Prisma } = require('@prisma/client');
const { ZodError } = require('zod');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const env = require('../config/env');

// Map Prisma's known request errors onto friendly HTTP responses.
function fromPrisma(err) {
  switch (err.code) {
    case 'P2002': {
      const target = Array.isArray(err.meta?.target)
        ? err.meta.target.join(', ')
        : err.meta?.target;
      return ApiError.conflict(`A record with this ${target || 'value'} already exists`);
    }
    case 'P2025':
      return ApiError.notFound(err.meta?.cause || 'Record not found');
    case 'P2003':
      return ApiError.badRequest('Related record constraint failed (foreign key)');
    case 'P2014':
      return ApiError.badRequest('The change violates a required relation');
    default:
      return null;
  }
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let error = err;

  if (err instanceof ZodError) {
    error = ApiError.unprocessable(
      'Validation failed',
      err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    error = fromPrisma(err) || ApiError.badRequest('Database request error');
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    error = ApiError.badRequest('Invalid database query');
  } else if (!(err instanceof ApiError)) {
    // Unknown / programming error — surface generically but log fully.
    error = new ApiError(err.statusCode || 500, err.message || 'Internal server error');
  }

  if (error.statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} ->`, err.stack || err);
  } else {
    logger.warn(`${req.method} ${req.originalUrl} -> ${error.statusCode} ${error.message}`);
  }

  const body = {
    success: false,
    error: {
      message: error.statusCode >= 500 && env.isProd ? 'Internal server error' : error.message,
      code: error.statusCode,
    },
  };
  if (error.details) body.error.details = error.details;
  if (!env.isProd && error.statusCode >= 500) body.error.stack = err.stack;

  return res.status(error.statusCode || 500).json(body);
}

module.exports = errorHandler;
