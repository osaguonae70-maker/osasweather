'use strict';
const { E } = require('../utils/errors');
const { verifyPassword, verifyAgainstDummy } = require('../utils/password');
const adminRepo = require('../repositories/adminRepository');

function createAdminAuthService({ pool }) {
  return {
    async authenticate(email, password) {
      const admin = await adminRepo.findByEmail(pool, email);
      if (!admin) {
        await verifyAgainstDummy(password);
        throw E.unauthenticated('Incorrect email or password.');
      }
      const valid = await verifyPassword(admin.password_hash, password);
      if (!valid || !admin.is_active || admin.role !== 'owner') {
        // Failed attempts against the real owner account are auditable.
        await adminRepo.logActivity(pool, admin.id, 'admin.login_failed', { targetType: 'administrator', targetId: admin.id });
        throw E.unauthenticated('Incorrect email or password.');
      }
      await adminRepo.touchLogin(pool, admin.id);
      await adminRepo.logActivity(pool, admin.id, 'admin.login', { targetType: 'administrator', targetId: admin.id });
      return admin;
    },
  };
}
module.exports = { createAdminAuthService };
