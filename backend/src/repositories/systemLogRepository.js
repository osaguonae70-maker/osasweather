'use strict';
const insert = (db, { method, path, message }) => db.query(
  'INSERT INTO system_error_logs (method, path, message) VALUES ($1, $2, $3)',
  [String(method || '').slice(0, 10), String(path || '').slice(0, 200), String(message || 'unknown').slice(0, 300)]);
const recent = async (db, limit = 20) =>
  (await db.query('SELECT method, path, message, created_at FROM system_error_logs ORDER BY created_at DESC LIMIT $1', [limit])).rows;
const count24h = async (db) =>
  Number((await db.query(`SELECT count(*) AS n FROM system_error_logs WHERE created_at > now() - interval '24 hours'`)).rows[0].n);
module.exports = { insert, recent, count24h };
