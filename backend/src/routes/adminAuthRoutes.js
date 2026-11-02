'use strict';
const express = require('express');
const { validate } = require('../validators/common');
const v = require('../validators/auth');

function createAdminAuthRoutes({ controller, requireOwnerAdmin, limiters }) {
  const r = express.Router();
  r.post('/login', limiters.adminLoginIp, limiters.adminLogin, validate(v.adminLogin), controller.login);
  r.post('/logout', requireOwnerAdmin, controller.logout);
  r.get('/me', requireOwnerAdmin, controller.me);
  r.post('/change-password', requireOwnerAdmin, validate(v.adminChangePassword), controller.changePassword);
  return r;
}
module.exports = { createAdminAuthRoutes };
