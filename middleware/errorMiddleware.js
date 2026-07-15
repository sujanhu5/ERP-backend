const ApiError = require('../utils/ApiError');

/**
 * Catches unmatched routes and forwards a 404 ApiError.
 */
const notFound = (req, res, next) => {
  next(new ApiError(404, `Route not found: ${req.originalUrl}`));
};

/**
 * Centralized error handler. All thrown errors (ApiError or otherwise)
 * end up here via asyncHandler / Express's default error propagation.
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Postgres unique violation
  if (err.code === '23505') {
    statusCode = 409;
    message = 'Duplicate entry. This record already exists.';
  }
  // Postgres foreign key violation
  if (err.code === '23503') {
    statusCode = 400;
    message = 'Invalid reference. Related record does not exist.';
  }

  if (process.env.NODE_ENV !== 'production') {
    console.error(err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    details: err.details || undefined,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  });
};

module.exports = { notFound, errorHandler };
