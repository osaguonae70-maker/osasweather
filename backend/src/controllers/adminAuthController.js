'use strict';
const { asyncHandler, ok } = require('../utils/http');
const { regenerate, destroy, save } = require('../middleware/session');
const { publicAdmin } = require('../models/serializers');
const adminRepo = require('../repositories/adminRepository');
const { E } = require('../utils/errors');
const { withTransaction } = require('../config/database');
const { hashPassword, verifyPassword } = require('../utils/password');

function createAdminAuthController({ pool, config, adminAuthService, csrf }) {
  return {
    login: asyncHandler(async (req, res) => {
      const admin = await adminAuthService.authenticate(req.body.email, req.body.password);
      await regenerate(req);
      req.session.adminId = admin.id;
      await save(req);
      ok(res, { admin: publicAdmin(admin), csrfToken: csrf.tokenFor(req) });
    }),

    logout: asyncHandler(async (req, res) => {
      await adminRepo.logActivity(pool, req.admin.id, 'admin.logout', { targetType: 'administrator', targetId: req.admin.id });
      await destroy(req);
      res.clearCookie(config.cookies.adminName, {
        httpOnly: true, secure: config.cookies.secure, sameSite: config.cookies.sameSite, path: '/',
      });
      ok(res, { loggedOut: true });
    }),

    changePassword: asyncHandler(async (req, res) => {
      if (!(await verifyPassword(req.admin.password_hash, req.body.currentPassword))) {
        throw E.validation({ currentPassword: 'Current password is incorrect' });
      }
      const hash = await hashPassword(req.body.newPassword);
      await withTransaction(pool, async (db) => {
        await adminRepo.updatePassword(db, req.admin.id, hash);
        await db.query('DELETE FROM administrator_sessions WHERE sid <> $1', [req.sessionID]);
        await adminRepo.logActivity(db, req.admin.id, 'admin.password_change', { targetType: 'administrator', targetId: req.admin.id });
      });
      ok(res, { message: 'Password updated. Other admin sessions were signed out.' });
    }),

    me: asyncHandler(async (req, res) => ok(res, { admin: publicAdmin(req.admin), csrfToken: csrf.tokenFor(req) })),
  };
}
module.exports = { createAdminAuthController };
