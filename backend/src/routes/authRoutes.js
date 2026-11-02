'use strict';
const express = require('express');
const { validate } = require('../validators/common');
const v = require('../validators/auth');

function createAuthRoutes({ controller, requireUser, limiters }) {
  const r = express.Router();
  r.post('/register', limiters.register, validate(v.register), controller.register);
  r.post('/login', limiters.login, validate(v.login), controller.login);
  r.post('/logout', controller.logout);
  r.get('/me', requireUser, controller.me);
  r.post('/forgot-password', limiters.forgot, validate(v.forgotPassword), controller.forgotPassword);
  r.post('/reset-password/validate', limiters.forgot, validate(v.resetTokenOnly), controller.validateResetToken);
  r.post('/reset-password', limiters.forgot, validate(v.resetPassword), controller.resetPassword);
  r.patch('/change-password', requireUser, validate(v.changePassword), controller.changePassword);
  return r;
}
module.exports = { createAuthRoutes };
