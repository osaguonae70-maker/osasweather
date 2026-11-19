'use strict';
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { loadConfig } = require('../src/config');
const { createPool } = require('../src/config/database');

async function checkLogs() {
  const config = loadConfig();
  const pool = createPool(config);

  try {
    const res = await pool.query(`
      SELECT provider, endpoint, status_code, success, error_code, error_message, created_at 
      FROM api_request_logs 
      WHERE created_at > now() - interval '1 hour'
      ORDER BY created_at DESC 
      LIMIT 20
    `);
    
    console.log('API Logs (Last 1 Hour):');
    if (res.rows.length === 0) {
      console.log('No logs found in the last hour.');
    } else {
      console.table(res.rows);
    }
  } catch (err) {
    console.error('Failed to query logs:', err.message);
  } finally {
    await pool.end();
  }
}

checkLogs();
