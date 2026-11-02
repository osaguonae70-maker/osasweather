'use strict';
const settingsRepo = require('../repositories/settingsRepository');
const { withTransaction } = require('../config/database');

const DEFAULTS = { registrationsOpen: true, weatherCacheMinutes: 10 };
const KEYS = { registrationsOpen: 'registrations_open', weatherCacheMinutes: 'weather_cache_minutes' };
const MEMO_MS = 15 * 1000;

/** Admin-editable runtime settings, memoised briefly so hot paths don't hit the database. */
function createSettingsService({ pool }) {
  let memo = null; let at = 0;
  const load = async () => {
    if (memo && Date.now() - at < MEMO_MS) return memo;
    try {
      const rows = await settingsRepo.getAll(pool);
      memo = {
        registrationsOpen: rows[KEYS.registrationsOpen] ?? DEFAULTS.registrationsOpen,
        weatherCacheMinutes: rows[KEYS.weatherCacheMinutes] ?? DEFAULTS.weatherCacheMinutes,
      };
      at = Date.now();
    } catch { memo = memo || { ...DEFAULTS }; }
    return memo;
  };
  return {
    get: load,
    async update(patch) {
      await withTransaction(pool, async (db) => {
        for (const [k, v] of Object.entries(patch)) await settingsRepo.set(db, KEYS[k], v);
      });
      memo = null;
      return load();
    },
  };
}
module.exports = { createSettingsService, DEFAULTS };
