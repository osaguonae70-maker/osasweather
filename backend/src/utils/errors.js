'use strict';
class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = true;
  }
}
const E = {
  badRequest: (msg = 'Bad request', details) => new AppError(400, 'BAD_REQUEST', msg, details),
  validation: (details) => new AppError(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', details),
  unauthenticated: (msg = 'Authentication required.') => new AppError(401, 'UNAUTHENTICATED', msg),
  forbidden: (msg = 'You do not have permission to do that.', code = 'FORBIDDEN') => new AppError(403, code, msg),
  notFound: (msg = 'Not found.') => new AppError(404, 'NOT_FOUND', msg),
  conflict: (msg, code = 'CONFLICT') => new AppError(409, code, msg),
  upstream: (msg = 'The weather service is temporarily unavailable.', code = 'UPSTREAM_ERROR') => new AppError(502, code, msg),
  timeout: (msg = 'The weather service took too long to respond.') => new AppError(504, 'UPSTREAM_TIMEOUT', msg),
};
module.exports = { AppError, E };
