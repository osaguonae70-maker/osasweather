'use strict';
const { hashPassword } = require('../utils/password');
const adminRepo = require('../repositories/adminRepository');
const { withTransaction } = require('../config/database');

const MIN_PASSWORD = 12;
function assertStrongPassword(pw) {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) {
    throw new Error(`Owner password must be at least ${MIN_PASSWORD} characters and include a letter and a number.`);
  }
}

/**
 * Idempotent one-time creation of the single owner administrator.
 * - If an administrator already exists nothing is changed (returns created:false).
 * - The database's single-owner unique index is the final guard against races.
 */
async function bootstrapOwner(pool, { email, password }) {
  assertStrongPassword(password);
  if (await adminRepo.count(pool)) return { created: false, reason: 'owner_exists' };
  const passwordHash = await hashPassword(password);
  try {
    const admin = await withTransaction(pool, (db) => adminRepo.createOwner(db, { email: email.trim().toLowerCase(), passwordHash }));
    return { created: true, id: admin.id };
  } catch (err) {
    if (err.code === '23505') return { created: false, reason: 'owner_exists' };
    throw err;
  }
}

/** Owner-verified recovery path (CLI only, requires the bootstrap secret). */
async function resetOwnerPassword(pool, { password }) {
  assertStrongPassword(password);
  const passwordHash = await hashPassword(password);
  return withTransaction(pool, async (db) => {
    const { rows } = await db.query('SELECT id FROM administrators LIMIT 1');
    if (!rows[0]) throw new Error('No owner exists yet. Run bootstrap-owner first.');
    await adminRepo.updatePassword(db, rows[0].id, passwordHash);
    await db.query('DELETE FROM administrator_sessions'); // force re-login everywhere
    await adminRepo.logActivity(db, rows[0].id, 'admin.password_reset_cli', { targetType: 'administrator', targetId: rows[0].id });
    return rows[0].id;
  });
}
module.exports = { bootstrapOwner, resetOwnerPassword, assertStrongPassword };
