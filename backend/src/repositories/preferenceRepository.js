'use strict';
const COLS = 'temperature_unit, wind_speed_unit, default_location, theme';

const get = async (db, userId) =>
  (await db.query(`SELECT ${COLS} FROM user_preferences WHERE user_id = $1`, [userId])).rows[0] || null;

/** Partial update; only whitelisted columns are ever interpolated (never user input). */
async function update(db, userId, patch) {
  const map = { temperatureUnit: 'temperature_unit', windSpeedUnit: 'wind_speed_unit', defaultLocation: 'default_location', theme: 'theme' };
  const sets = []; const vals = [userId];
  for (const [k, col] of Object.entries(map)) {
    if (!(k in patch)) continue;
    vals.push(k === 'defaultLocation' && patch[k] !== null ? JSON.stringify(patch[k]) : patch[k]);
    sets.push(`${col} = $${vals.length}${k === 'defaultLocation' ? '::jsonb' : ''}`);
  }
  if (!sets.length) return get(db, userId);
  await db.query(
    `INSERT INTO user_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [userId]);
  return (await db.query(`UPDATE user_preferences SET ${sets.join(', ')} WHERE user_id = $1 RETURNING ${COLS}`, vals)).rows[0];
}
module.exports = { get, update };
