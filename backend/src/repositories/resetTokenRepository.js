'use strict';

async function replaceForUser(db, userId, tokenHash, expiresAt) {
  // Only the newest link works: older unused tokens are removed.
  await db.query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL', [userId]);
  await db.query(
    'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, tokenHash, expiresAt],
  );
}

/** Atomically claims a valid token (single use). Returns user_id or null. */
async function consume(db, tokenHash) {
  const { rows } = await db.query(
    `UPDATE password_reset_tokens SET used_at = now()
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
      RETURNING user_id`,
    [tokenHash],
  );
  return rows[0] ? rows[0].user_id : null;
}

async function isValid(db, tokenHash) {
  const { rowCount } = await db.query(
    'SELECT 1 FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()',
    [tokenHash],
  );
  return rowCount > 0;
}
module.exports = { replaceForUser, consume, isValid };
