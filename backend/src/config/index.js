'use strict';
const path = require('node:path');

/**
 * Builds a validated configuration object from an env map.
 * Exported as a function so tests can build isolated configs.
 */
function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProd = nodeEnv === 'production';
  const isTest = nodeEnv === 'test';

  const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
  const list = (v) => (v || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);

  const cfg = {
    nodeEnv, isProd, isTest,
    port: num(env.PORT, 5000),
    databaseUrl: env.DATABASE_URL,
    databaseSsl: env.DATABASE_SSL === 'true',

    sessionSecret: env.SESSION_SECRET,
    adminSessionSecret: env.ADMIN_SESSION_SECRET,
    csrfSecret: env.CSRF_SECRET,

    frontendUrl: (env.FRONTEND_URL || 'http://localhost:5500').replace(/\/$/, ''),
    adminFrontendUrl: (env.ADMIN_FRONTEND_URL || 'http://localhost:5501').replace(/\/$/, ''),

    weatherApiBaseUrl: env.WEATHER_API_BASE_URL || 'https://api.open-meteo.com/v1/forecast',
    geocodingApiUrl: env.GEOCODING_API_URL || 'https://geocoding-api.open-meteo.com/v1/search',
    weatherTimeoutMs: num(env.WEATHER_TIMEOUT_MS, 8000),

    email: {
      host: env.EMAIL_HOST, port: num(env.EMAIL_PORT, 587),
      user: env.EMAIL_USER, password: env.EMAIL_PASSWORD, from: env.EMAIL_FROM,
      secure: env.EMAIL_SECURE === 'true',
    },

    cookies: {
      // Same-site deployments (osasweather.com / admin.osasweather.com / api.osasweather.com)
      // work with 'lax'. Only use 'none' if the frontends are on a different site.
      sameSite: env.COOKIE_SAMESITE || 'lax',
      secure: isProd,
      userName: 'osw_sid',
      adminName: 'osw_admin_sid',
    },

    session: {
      userRememberMs: 30 * 24 * 3600 * 1000,
      userDefaultMs: 12 * 3600 * 1000,
      adminIdleMs: 2 * 3600 * 1000,
    },
    resetTokenTtlMs: 30 * 60 * 1000,

    // Rate limits (per window). Overridable by tests.
    rateLimit: {
      windowMs: 15 * 60 * 1000,
      global: num(env.RL_GLOBAL, 600),
      login: num(env.RL_LOGIN, 10),
      adminLogin: num(env.RL_ADMIN_LOGIN, 5),
      register: num(env.RL_REGISTER, 10),
      forgot: num(env.RL_FORGOT, 5),
      weather: num(env.RL_WEATHER, 120),
    },

    ownerAdminEmail: env.OWNER_ADMIN_EMAIL,
    migrationsDir: path.join(__dirname, '..', '..', 'migrations'),
  };

  const errors = [];
  if (!cfg.databaseUrl) errors.push('DATABASE_URL is required');
  for (const [k, v] of [['SESSION_SECRET', cfg.sessionSecret], ['ADMIN_SESSION_SECRET', cfg.adminSessionSecret], ['CSRF_SECRET', cfg.csrfSecret]]) {
    if (!v) errors.push(`${k} is required`);
    else if (isProd && v.length < 32) errors.push(`${k} must be at least 32 characters in production`);
  }
  if (cfg.sessionSecret && cfg.sessionSecret === cfg.adminSessionSecret) {
    errors.push('SESSION_SECRET and ADMIN_SESSION_SECRET must be different');
  }
  if (isProd) {
    for (const [k, v] of [['FRONTEND_URL', cfg.frontendUrl], ['ADMIN_FRONTEND_URL', cfg.adminFrontendUrl]]) {
      if (!v.startsWith('https://')) errors.push(`${k} must be an https:// URL in production`);
    }
  }
  if (errors.length) {
    throw new Error(`Invalid configuration:\n - ${errors.join('\n - ')}`);
  }

  cfg.allowedOrigins = [...new Set([
    cfg.frontendUrl,
    cfg.adminFrontendUrl,
    'https://osasweather-weather-di9zi465i-osaguonae70-4339s-projects.vercel.app',
    'https://osasweather-weather-4suy1ouno-osaguonae70-4339s-projects.vercel.app',
    ...list(env.EXTRA_ALLOWED_ORIGINS)
  ])];
  return cfg;
}

module.exports = { loadConfig };
