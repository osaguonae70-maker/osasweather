'use strict';
const insert = (db, { provider, endpoint, statusCode = null, success, cacheHit = false, durationMs = null, errorCode = null, errorMessage = null }) =>
  db.query(
    `INSERT INTO api_request_logs (provider, endpoint, status_code, success, cache_hit, duration_ms, error_code, error_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [provider, endpoint, statusCode, success, cacheHit, durationMs, errorCode, errorMessage]);
module.exports = { insert };
