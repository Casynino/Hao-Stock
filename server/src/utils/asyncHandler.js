'use strict';

// Wrap an async Express handler so rejected promises flow to next(err) and the
// central error handler, instead of crashing as unhandled rejections.
module.exports = function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
