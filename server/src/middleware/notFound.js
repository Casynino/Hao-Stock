'use strict';

const ApiError = require('../utils/ApiError');

// Terminal 404 for unmatched API routes.
module.exports = function notFound(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};
