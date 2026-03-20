// Wraps an async route handler and forwards any thrown errors to Express
const catchAsync = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
module.exports = catchAsync;
