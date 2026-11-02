'use strict';
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

function createLimiters(config) {
  const { windowMs } = config.rateLimit;
  const handler = (_req, res) => res.status(429).json({
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a while and try again.' },
  });
  const make = (limit, extra = {}) => rateLimit({
    windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false, handler, ...extra,
  });
  // Brute-force protection keys on IP *and* the targeted email.
  const ipEmailKey = (req) => `${ipKeyGenerator(req.ip)}|${String((req.body && req.body.email) || '').toLowerCase()}`;
  return {
    global: make(config.rateLimit.global),
    login: make(config.rateLimit.login, { keyGenerator: ipEmailKey, skipSuccessfulRequests: true }),
    adminLogin: make(config.rateLimit.adminLogin, { keyGenerator: ipEmailKey, skipSuccessfulRequests: true }),
    // admin login is additionally limited per IP regardless of email
    adminLoginIp: make(config.rateLimit.adminLogin * 4, { skipSuccessfulRequests: true }),
    register: make(config.rateLimit.register, { windowMs: 60 * 60 * 1000 }),
    forgot: make(config.rateLimit.forgot, { windowMs: 60 * 60 * 1000 }),
    weather: make(config.rateLimit.weather, { windowMs: 60 * 1000 }),
  };
}
module.exports = { createLimiters };
