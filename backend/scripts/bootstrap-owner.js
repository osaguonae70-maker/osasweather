'use strict';
/**
 * One-time owner administrator bootstrap.
 *
 *   npm run bootstrap-owner                  create the owner (idempotent)
 *   npm run bootstrap-owner -- --reset-password   owner-verified password reset
 *
 * Required environment: DATABASE_URL, OWNER_ADMIN_EMAIL, OWNER_BOOTSTRAP_SECRET (>= 24 chars).
 * You are prompted for the bootstrap secret (proof you control the deployment)
 * and for the owner password (hidden input). For non-interactive use, supply
 * OWNER_INITIAL_PASSWORD instead of the prompts, then REMOVE both
 * OWNER_BOOTSTRAP_SECRET and OWNER_INITIAL_PASSWORD from the environment.
 * No credentials are stored in source code and none are printed.
 */
const path = require('node:path');
const readline = require('node:readline');
const { Writable } = require('node:stream');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const { safeEqual } = require('../src/utils/crypto');
const { bootstrapOwner, resetOwnerPassword } = require('../src/services/ownerBootstrap');

function ask(question, hidden = true) {
  return new Promise((resolve) => {
    let muted = false;
    const out = new Writable({ write(chunk, _e, cb) { if (!muted) process.stdout.write(chunk); cb(); } });
    const rl = readline.createInterface({ input: process.stdin, output: out, terminal: true });
    rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer); });
    muted = hidden;
  });
}

async function main() {
  const reset = process.argv.includes('--reset-password');
  const { DATABASE_URL, OWNER_ADMIN_EMAIL, OWNER_BOOTSTRAP_SECRET, OWNER_INITIAL_PASSWORD } = process.env;
  if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');
  if (!OWNER_BOOTSTRAP_SECRET || OWNER_BOOTSTRAP_SECRET.length < 24) {
    throw new Error('OWNER_BOOTSTRAP_SECRET must be set to a random value of at least 24 characters.');
  }
  if (!reset && !OWNER_ADMIN_EMAIL) throw new Error('OWNER_ADMIN_EMAIL is not set');

  const nonInteractive = Boolean(OWNER_INITIAL_PASSWORD);
  if (!nonInteractive) {
    if (!process.stdin.isTTY) throw new Error('No TTY available. Provide OWNER_INITIAL_PASSWORD for non-interactive use.');
    const secret = await ask('Bootstrap secret: ');
    if (!safeEqual(secret, OWNER_BOOTSTRAP_SECRET)) throw new Error('Bootstrap secret does not match.');
  }
  const password = nonInteractive ? OWNER_INITIAL_PASSWORD : await ask('Owner password: ');
  if (!nonInteractive && !reset && (await ask('Confirm password: ')) !== password) throw new Error('Passwords do not match.');

  const pool = new Pool({ connectionString: DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
  try {
    if (reset) {
      await resetOwnerPassword(pool, { password });
      console.log('Owner password updated and all admin sessions revoked.');
    } else {
      const result = await bootstrapOwner(pool, { email: OWNER_ADMIN_EMAIL, password });
      console.log(result.created ? 'Owner administrator created.' : 'An owner administrator already exists. Nothing changed.');
    }
  } finally { await pool.end(); }
}
main().catch((err) => { console.error(err.message); process.exit(1); });
