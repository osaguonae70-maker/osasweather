'use strict';
const { asyncHandler, ok } = require('../utils/http');
const { regenerate, destroy, save } = require('../middleware/session');
const { publicUser, publicPreferences } = require('../models/serializers');
const preferenceRepo = require('../repositories/preferenceRepository');

function createAuthController({ pool, config, authService, csrf }) {
  const sessionPayload = async (req, user) => ({
    user: publicUser(user),
    preferences: publicPreferences(await preferenceRepo.get(pool, user.id)),
    csrfToken: csrf.tokenFor(req),
  });

  return {
    register: asyncHandler(async (req, res) => {
      const user = await authService.register(req.body);
      ok(res, { user: publicUser(user) }, 201); // registration does not log in; user proceeds to login
    }),

    login: asyncHandler(async (req, res) => {
      const { email, password, rememberMe } = req.body;
      const user = await authService.authenticate(email, password);
      await regenerate(req); // new session id on privilege change
      req.session.userId = user.id;
      req.session.cookie.maxAge = rememberMe ? config.session.userRememberMs : config.session.userDefaultMs;
      await save(req);
      ok(res, await sessionPayload(req, user));
    }),

    logout: asyncHandler(async (req, res) => {
      await destroy(req);
      res.clearCookie(config.cookies.userName, {
        httpOnly: true, secure: config.cookies.secure, sameSite: config.cookies.sameSite, path: '/',
      });
      ok(res, { loggedOut: true });
    }),

    me: asyncHandler(async (req, res) => ok(res, await sessionPayload(req, req.user))),

    forgotPassword: asyncHandler(async (req, res) => {
      await authService.requestPasswordReset(req.body.email);
      ok(res, { message: 'If an account exists for that email, a reset link has been sent.' });
    }),

    validateResetToken: asyncHandler(async (req, res) => {
      const valid = await authService.isResetTokenValid(req.body.token);
      ok(res, { valid });
    }),

    resetPassword: asyncHandler(async (req, res) => {
      await authService.resetPassword(req.body.token, req.body.password);
      ok(res, { message: 'Your password has been updated. Please log in.' });
    }),

    changePassword: asyncHandler(async (req, res) => {
      await authService.changePassword(req.user, req.body.currentPassword, req.body.newPassword, req.sessionID);
      ok(res, { message: 'Password updated. Other devices have been signed out.' });
    }),
  };
}
module.exports = { createAuthController };
