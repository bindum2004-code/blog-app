const rateLimit = require("express-rate-limit");

const make = (windowMs, max, message) =>
  rateLimit({ windowMs, max, message: { success: false, message }, standardHeaders: true, legacyHeaders: false });

exports.globalLimiter  = make(15 * 60 * 1000, 200,  "Too many requests.");
exports.authLimiter    = make(15 * 60 * 1000, 10,   "Too many auth attempts. Try again in 15 minutes.");
exports.uploadLimiter  = make(60  * 60 * 1000, 30,  "Upload limit reached. Try again in an hour.");
exports.commentLimiter = make(60  * 1000,       5,  "Slow down — max 5 comments per minute.");

exports.forgotPasswordLimiter = make(60 * 60 * 1000, 3, "Too many password reset requests. Please wait an hour before trying again.");
