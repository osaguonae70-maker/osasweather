'use strict';
process.env.NODE_ENV = 'test';
const request = require('supertest');
const { loadConfig } = require('../src/config');
const { createApp } = require('../src/app');
const { migrate } = require('../scripts/migrate');

const TEST_DB = process.env.TEST_DATABASE_URL || 'postgres://osas:osas_dev_pw@localhost:5432/osasweather_test';

function testConfig(overrides = {}) {
  const cfg = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DB,
    SESSION_SECRET: 'test-session-secret-0123456789abcdefghij',
    ADMIN_SESSION_SECRET: 'test-admin-secret-0123456789abcdefghijk',
    CSRF_SECRET: 'test-csrf-secret-0123456789abcdefghijkl',
    FRONTEND_URL: 'http://localhost:5500',
    ADMIN_FRONTEND_URL: 'http://localhost:5501',
    RL_GLOBAL: '100000', RL_LOGIN: '100000', RL_ADMIN_LOGIN: '100000', RL_REGISTER: '100000', RL_FORGOT: '100000',
  });
  Object.assign(cfg.rateLimit, overrides.rateLimit || {});
  return cfg;
}

async function setup(overrides = {}) {
  await migrate(TEST_DB, () => {});
  const sent = [];
  const emailService = {
    sendPasswordReset: async (to, url) => { sent.push({ to, url, kind: 'reset' }); return true; },
    sendEmailChange: async (to, url) => { sent.push({ to, url, kind: 'email-change' }); return true; },
  };
  const config = testConfig(overrides);
  const app = createApp(config, { emailService, fetchImpl: overrides.fetchImpl });
  const pool = app.locals.pool;
  return { app, pool, config, sent };
}

const resetDb = (pool) => pool.query(
  'TRUNCATE users, administrators, user_sessions, administrator_sessions, admin_activity_logs, api_request_logs, app_settings, system_error_logs RESTART IDENTITY CASCADE');

/** A cookie-keeping API client for one realm ('' for users, '/admin' for admin). */
function client(app, config, realm = '') {
  const agent = request.agent(app);
  const origin = realm === '/admin' ? config.adminFrontendUrl : config.frontendUrl;
  const prefix = `/api${realm}`;
  const state = { token: null };
  const api = {
    agent, state,
    async csrf() {
      const r = await agent.get(`${prefix}/csrf-token`).set('Origin', origin);
      state.token = r.body.data.csrfToken;
      return state.token;
    },
    get: (p) => agent.get(`${prefix}${p}`).set('Origin', origin),
    async send(method, p, body) {
      if (!state.token) await api.csrf();
      const r = await agent[method](`${prefix}${p}`).set('Origin', origin).set('X-CSRF-Token', state.token).send(body);
      if (r.body && r.body.data && r.body.data.csrfToken) state.token = r.body.data.csrfToken; // rotated on login
      return r;
    },
    post: (p, b) => api.send('post', p, b),
    patch: (p, b) => api.send('patch', p, b),
    del: (p, b) => api.send('delete', p, b),
  };
  return api;
}

const validUser = (n = 1) => ({
  fullName: `Test User ${n}`, email: `user${n}@example.com`,
  password: 'Sup3rSecret123', confirmPassword: 'Sup3rSecret123', acceptTerms: true,
});

async function registerAndLogin(c, n = 1, extra = {}) {
  const u = validUser(n);
  const reg = await c.post('/auth/register', u);
  const login = await c.post('/auth/login', { email: u.email, password: u.password, ...extra });
  return { u, reg, login };
}

module.exports = { setup, resetDb, client, validUser, registerAndLogin, TEST_DB };
