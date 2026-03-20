const AppError = require("../utils/AppError");

const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  let { statusCode = 500, message, isOperational } = err;

  // Supabase / PostgreSQL error codes
  if (err.code === "23505") {
    const field = err.detail?.match(/Key \((.+?)\)/)?.[1] || "field";
    statusCode   = 409;
    message      = `${field} already exists.`;
    isOperational = true;
  }
  if (err.code === "23503") {
    statusCode   = 404;
    message      = "Referenced resource not found.";
    isOperational = true;
  }
  if (err.code === "23502") {
    statusCode   = 400;
    message      = "Required field is missing.";
    isOperational = true;
  }

  // JWT / auth errors
  if (err.name === "JsonWebTokenError") {
    statusCode   = 401;
    message      = "Invalid token.";
    isOperational = true;
  }
  if (err.name === "TokenExpiredError") {
    statusCode   = 401;
    message      = "Token has expired.";
    isOperational = true;
  }

  // Payload too large
  if (err.type === "entity.too.large") {
    statusCode   = 413;
    message      = "Request body is too large.";
    isOperational = true;
  }

  const safeMessage = isOperational
    ? message
    : "Something went wrong. Please try again.";

  if (process.env.NODE_ENV !== "production") {
    console.error(`[${statusCode}] ${req.method} ${req.originalUrl} —`, message);
    if (!isOperational) console.error(err.stack);
  }

  res.status(statusCode).json({
    success: false,
    message: safeMessage,
    ...(process.env.NODE_ENV === "development" && !isOperational && { stack: err.stack }),
  });
};

module.exports = errorHandler;
