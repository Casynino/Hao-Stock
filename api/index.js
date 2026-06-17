'use strict';

// Vercel serverless entry point. The whole Express API is exported as a single
// request handler; vercel.json rewrites every /api/* request to this function.
// (app.js builds the Express app but does NOT call listen, so it works both as
// a long-running server via server.js and as a serverless handler here.)
module.exports = require('../server/src/app');
