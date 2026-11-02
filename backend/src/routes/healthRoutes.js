'use strict';
const express = require('express');

// Public, minimal and secret-free. Detailed health is admin-only (/api/admin/system-health).
function createHealthRoutes({ pool }) {
  const r = express.Router();
  r.get('/', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ success: true, data: { status: 'ok', database: 'up', time: new Date().toISOString() } });
    } catch {
      res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable.' } });
    }
  });
  return r;
}
module.exports = { createHealthRoutes };
