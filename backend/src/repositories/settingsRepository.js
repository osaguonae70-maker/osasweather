'use strict';
const getAll = async (db) =>
  Object.fromEntries((await db.query('SELECT key, value FROM app_settings')).rows.map((r) => [r.key, r.value]));

const set = (db, key, value) => db.query(
  `INSERT INTO app_settings (key, value) VALUES ($1, $2::jsonb)
   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
  [key, JSON.stringify(value)]);
module.exports = { getAll, set };
