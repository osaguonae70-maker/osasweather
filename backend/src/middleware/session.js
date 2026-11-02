'use strict';
const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);

/**
 * Two completely separate session systems:
 *   - users:  cookie `osw_sid`       / table user_sessions          / SESSION_SECRET
 *   - admin:  cookie `osw_admin_sid` / table administrator_sessions / ADMIN_SESSION_SECRET
 * A user session can therefore never be read as an admin session or vice versa.
 */
function createSessions(config, pool) {
  const common = {
    resave: false,
    saveUninitialized: false,
    proxy: config.isProd || undefined,
  };
  const cookieBase = {
    httpOnly: true,
    secure: config.cookies.secure,
    sameSite: config.cookies.sameSite,
    path: '/', // host-only: no Domain attribute is ever set
  };
  const store = (tableName) => new PgStore({
    pool, tableName, createTableIfMissing: false,
    pruneSessionInterval: config.isTest ? false : 15 * 60,
    errorLog: () => {},
  });

  const userSession = session({
    ...common,
    name: config.cookies.userName,
    secret: config.sessionSecret,
    store: store('user_sessions'),
    cookie: { ...cookieBase, maxAge: config.session.userDefaultMs },
  });
  const adminSession = session({
    ...common,
    name: config.cookies.adminName,
    secret: config.adminSessionSecret,
    store: store('administrator_sessions'),
    rolling: true, // idle timeout
    cookie: { ...cookieBase, maxAge: config.session.adminIdleMs },
  });
  return { userSession, adminSession };
}

/** Regenerates the session id (prevents session fixation). */
const regenerate = (req) => new Promise((resolve, reject) =>
  req.session.regenerate((err) => (err ? reject(err) : resolve())));
const destroy = (req) => new Promise((resolve) =>
  (req.session ? req.session.destroy(() => resolve()) : resolve()));
const save = (req) => new Promise((resolve, reject) =>
  req.session.save((err) => (err ? reject(err) : resolve())));

module.exports = { createSessions, regenerate, destroy, save };
