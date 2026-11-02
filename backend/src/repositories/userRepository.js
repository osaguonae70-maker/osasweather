'use strict';
// All SQL is parameterized. Repositories accept a `db` (pool or transaction client).

const USER_COLS = `id, full_name, email, password_hash, account_status, email_verified_at, created_at`;

const findByEmail = async (db, email) =>
  (await db.query(`SELECT ${USER_COLS} FROM users WHERE email = $1`, [email])).rows[0] || null;

const findById = async (db, id) =>
  (await db.query(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [id])).rows[0] || null;

async function create(db, { fullName, email, passwordHash }) {
  const { rows } = await db.query(
    `INSERT INTO users (full_name, email, password_hash, terms_accepted_at)
     VALUES ($1, $2, $3, now()) RETURNING ${USER_COLS}`,
    [fullName, email, passwordHash],
  );
  await db.query('INSERT INTO user_preferences (user_id) VALUES ($1)', [rows[0].id]);
  return rows[0];
}

const touchLogin = (db, id) => db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [id]);
const updatePassword = (db, id, hash) => db.query('UPDATE users SET password_hash = $2 WHERE id = $1', [id, hash]);

module.exports = { findByEmail, findById, create, touchLogin, updatePassword };
