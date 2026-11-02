'use strict';
const COLS = 'id, email, full_name, password_hash, role, is_active';

const findByEmail = async (db, email) =>
  (await db.query(`SELECT ${COLS} FROM administrators WHERE email = $1`, [email])).rows[0] || null;

const findActiveById = async (db, id) =>
  (await db.query(`SELECT ${COLS} FROM administrators WHERE id = $1 AND is_active = TRUE AND role = 'owner'`, [id])).rows[0] || null;

const count = async (db) => Number((await db.query('SELECT count(*) AS n FROM administrators')).rows[0].n);

const touchLogin = (db, id) => db.query('UPDATE administrators SET last_login_at = now() WHERE id = $1', [id]);

async function createOwner(db, { email, passwordHash }) {
  const { rows } = await db.query(
    `INSERT INTO administrators (email, password_hash, role) VALUES ($1, $2, 'owner') RETURNING id, email`,
    [email, passwordHash],
  );
  return rows[0];
}
const updatePassword = (db, id, hash) => db.query('UPDATE administrators SET password_hash = $2 WHERE id = $1', [id, hash]);

async function logActivity(db, adminId, action, { targetType = null, targetId = null, metadata = {} } = {}) {
  await db.query(
    `INSERT INTO admin_activity_logs (administrator_id, action, target_type, target_id, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [adminId, action, targetType, targetId ? String(targetId) : null, JSON.stringify(metadata)],
  );
}
module.exports = { findByEmail, findActiveById, count, touchLogin, createOwner, updatePassword, logActivity };
