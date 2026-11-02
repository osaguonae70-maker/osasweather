'use strict';
const cookieParser = require('cookie-parser');
const { E } = require('../utils/errors');
const userRepo = require('../repositories/userRepository');
const adminRepo = require('../repositories/adminRepository');
const sessionRepo = require('../repositories/sessionRepository');
const { destroy } = require('./session');

/**
 * Every protected request is re-verified against the database. Nothing about
 * identity or role is ever taken from the client. Because the user is
 * re-loaded each request, suspension takes effect immediately.
 */
const requireUser = (pool) => async (req, _res, next) => {
  try {
    const id = req.session && req.session.userId;
    if (!id) throw E.unauthenticated();
    const user = await userRepo.findById(pool, id);
    if (!user) { await destroy(req); throw E.unauthenticated('Session is no longer valid.'); }
    if (user.account_status !== 'active') {
      await destroy(req);
      throw E.forbidden('This account has been suspended.', 'ACCOUNT_SUSPENDED');
    }
    req.user = user;
    next();
  } catch (err) { next(err); }
};

/**
 * Owner-only gate for /api/admin/*.
 *  - no admin session, no user session  -> 401
 *  - no admin session, valid user session -> 403 (authenticated but not permitted)
 *  - admin session but admin row missing/inactive -> 401 and session destroyed
 */
const requireOwnerAdmin = (config, pool) => async (req, _res, next) => {
  try {
    const adminId = req.session && req.session.adminId;
    if (adminId) {
      const admin = await adminRepo.findActiveById(pool, adminId);
      if (!admin) { await destroy(req); throw E.unauthenticated('Session is no longer valid.'); }
      req.admin = admin;
      return next();
    }
    // Is the caller at least a logged-in ordinary user? Then 403, not 401.
    const raw = req.cookies && req.cookies[config.cookies.userName];
    const sid = raw ? cookieParser.signedCookie(raw, config.sessionSecret) : false;
    if (sid && (await sessionRepo.userSessionHasUser(pool, sid))) {
      throw E.forbidden('Administrator access is required.', 'ADMIN_REQUIRED');
    }
    throw E.unauthenticated();
  } catch (err) { next(err); }
};

module.exports = { requireUser, requireOwnerAdmin };
