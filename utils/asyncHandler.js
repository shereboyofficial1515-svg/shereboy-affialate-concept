// utils/asyncHandler.js
// Express 4 doesn't automatically catch rejected promises from async route
// handlers. Since every controller now talks to Supabase over the network
// (instead of synchronous SQLite calls), wrapping each handler in this
// keeps a thrown/rejected error from crashing the process — it's passed
// to the central error handler in server.js instead.

module.exports = function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
};
