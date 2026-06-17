'use strict';

const { ZodError } = require('zod');
const ApiError = require('../utils/ApiError');

// Build a middleware that validates and COERCES req.body/query/params against
// the provided Zod schemas. Parsed values replace the originals so downstream
// handlers receive clean, typed data (numbers, dates, defaults applied).
function validate(schemas = {}) {
  return (req, _res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query ?? {});
        // req.query can be a read-only getter in some setups; expose a copy.
        req.validatedQuery = parsed;
        try {
          req.query = parsed;
        } catch {
          /* fall back to req.validatedQuery */
        }
      }
      if (schemas.params) req.params = schemas.params.parse(req.params ?? {});
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        }));
        return next(ApiError.unprocessable('Validation failed', details));
      }
      return next(err);
    }
  };
}

module.exports = validate;
