'use strict';
const { AppError } = require('../utils/errors');
const logger = require('../utils/logger');
const systemLogRepo = require('../repositories/systemLogRepository');

const notFound = (req, res) => res.status(404).json({
  success: false, error: { code: 'NOT_FOUND', message: 'Route not found.' },
});

// eslint-disable-next-line no-unused-vars
const createErrorHandler = (pool) => (err, req, res, _next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' } });
  }
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
    return res.status(400).json({ success: false, error: { code: 'BAD_JSON', message: 'Malformed JSON body.' } });
  }
  // Unknown error: log server-side (message + route only), never leak details.
  logger.error('unhandled_error', { method: req.method, path: req.path, message: err && err.message, stack: err && err.stack });
  if (pool) systemLogRepo.insert(pool, { method: req.method, path: req.path, message: err && err.message }).catch(() => {});
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
};
module.exports = { notFound, createErrorHandler };
