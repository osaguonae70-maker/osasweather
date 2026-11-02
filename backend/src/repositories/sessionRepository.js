'use strict';
// Helpers to invalidate server-side sessions in bulk (suspension, password change/reset).

/** Delete every session of a user, optionally keeping one (the current session). */
async function destroyUserSessions(db, userId, exceptSid = null) {
  const { rowCount } = await db.query(
    `DELETE FROM user_sessions WHERE sess ->> 'userId' = $1 AND ($2::text IS NULL OR sid <> $2)`,
    [String(userId), exceptSid],
  );
  return rowCount;
}

async function userSessionExists(db, sid) {
  const { rowCount } = await db.query(
    'SELECT 1 FROM user_sessions WHERE sid = $1 AND expire > now()', [sid]);
  return rowCount > 0;
}
async function userSessionHasUser(db, sid) {
  const { rows } = await db.query(
    `SELECT sess ->> 'userId' AS user_id FROM user_sessions WHERE sid = $1 AND expire > now()`, [sid]);
  return Boolean(rows[0] && rows[0].user_id);
}
module.exports = { destroyUserSessions, userSessionExists, userSessionHasUser };
