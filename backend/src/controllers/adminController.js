'use strict';
const { asyncHandler, ok } = require('../utils/http');
const { E } = require('../utils/errors');
const { withTransaction } = require('../config/database');
const stats = require('../repositories/adminStatsRepository');
const adminRepo = require('../repositories/adminRepository');
const sessionRepo = require('../repositories/sessionRepository');
const systemLogRepo = require('../repositories/systemLogRepository');

const pageInfo = (total, page, limit) => ({ total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });

function createAdminController({ pool, config, settingsService }) {
  const startedAt = Date.now();

  async function dbPing() {
    const t = process.hrtime.bigint();
    try { await pool.query('SELECT 1'); return { up: true, latencyMs: Number(process.hrtime.bigint() - t) / 1e6 }; }
    catch { return { up: false, latencyMs: null }; }
  }

  return {
    dashboard: asyncHandler(async (_req, res) => {
      const [users, trend, usage, db, errors24h] = await Promise.all([
        stats.userTotals(pool), stats.registrationTrend(pool, 30), stats.apiUsage(pool, '24h'), dbPing(), systemLogRepo.count24h(pool),
      ]);
      ok(res, {
        users, registrationTrend: trend, weatherApi24h: usage,
        health: { backend: 'up', database: db.up ? 'up' : 'down', dbLatencyMs: db.latencyMs && Math.round(db.latencyMs * 10) / 10, systemErrors24h: errors24h },
      });
    }),

    listUsers: asyncHandler(async (req, res) => {
      const q = req.validatedQuery;
      const { total, rows } = await stats.listUsers(pool, q);
      ok(res, {
        users: rows.map((u) => ({
          id: u.id, fullName: u.full_name, email: u.email, status: u.account_status, emailVerified: Boolean(u.email_verified_at),
          createdAt: u.created_at, lastLoginAt: u.last_login_at, favourites: u.favourites,
        })),
        pagination: pageInfo(total, q.page, q.limit),
      });
    }),

    getUser: asyncHandler(async (req, res) => {
      const d = await stats.userDetail(pool, req.params.id);
      if (!d) throw E.notFound('User not found.');
      const { u, prefs, favs, sessions } = d;
      ok(res, {
        user: {
          id: u.id, fullName: u.full_name, email: u.email, status: u.account_status, emailVerified: Boolean(u.email_verified_at),
          termsAcceptedAt: u.terms_accepted_at, createdAt: u.created_at, updatedAt: u.updated_at, lastLoginAt: u.last_login_at,
          activeSessions: sessions,
          preferences: prefs && { temperatureUnit: prefs.temperature_unit, windSpeedUnit: prefs.wind_speed_unit, theme: prefs.theme },
          favourites: favs.map((f) => ({ name: f.location_name, country: f.country })),
        },
      });
    }),

    setUserStatus: asyncHandler(async (req, res) => {
      const { status } = req.body;
      const result = await withTransaction(pool, async (db) => {
        const user = await stats.findUserBrief(db, req.params.id);
        if (!user) throw E.notFound('User not found.');
        const changed = await stats.setStatus(db, user.id, status);
        if (changed) {
          if (status === 'suspended') await sessionRepo.destroyUserSessions(db, user.id); // immediate lockout
          await adminRepo.logActivity(db, req.admin.id, status === 'suspended' ? 'user.suspend' : 'user.reactivate',
            { targetType: 'user', targetId: user.id, metadata: { email: user.email } });
        }
        return { id: user.id, status, changed };
      });
      ok(res, result);
    }),

    deleteUser: asyncHandler(async (req, res) => {
      await withTransaction(pool, async (db) => {
        const user = await stats.findUserBrief(db, req.params.id);
        if (!user) throw E.notFound('User not found.');
        // Destructive-action safeguard: the owner must retype the account's email.
        if (req.body.confirmEmail.toLowerCase() !== String(user.email).toLowerCase()) {
          throw E.validation({ confirmEmail: 'The email does not match this account' });
        }
        await sessionRepo.destroyUserSessions(db, user.id);
        await stats.deleteUser(db, user.id); // cascades preferences, favourites, reset/email tokens
        await adminRepo.logActivity(db, req.admin.id, 'user.delete', { targetType: 'user', targetId: user.id, metadata: { email: user.email } });
      });
      ok(res, { deleted: true });
    }),

    apiMonitoring: asyncHandler(async (req, res) => {
      const [usage, hourly, errors] = await Promise.all([
        stats.apiUsage(pool, req.validatedQuery.range), stats.apiHourlySeries(pool), stats.recentApiErrors(pool, 20),
      ]);
      ok(res, { usage, hourly, recentErrors: errors });
    }),

    systemHealth: asyncHandler(async (_req, res) => {
      const db = await dbPing();
      const mem = process.memoryUsage();
      ok(res, {
        backend: { status: 'up', uptimeSeconds: Math.round(process.uptime()), processStartedAt: new Date(startedAt).toISOString(), nodeEnv: config.nodeEnv },
        database: { status: db.up ? 'up' : 'down', latencyMs: db.latencyMs && Math.round(db.latencyMs * 10) / 10,
          pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount } },
        memory: { rssMb: Math.round(mem.rss / 1048576), heapUsedMb: Math.round(mem.heapUsed / 1048576) },
        services: { emailConfigured: Boolean(config.email.host && config.email.user && config.email.from) },
        recentErrors: (await systemLogRepo.recent(pool, 20)).map((e) => ({ method: e.method, path: e.path, message: e.message, createdAt: e.created_at })),
      });
    }),

    activityLogs: asyncHandler(async (req, res) => {
      const q = req.validatedQuery;
      const { total, rows } = await stats.activityLogs(pool, q);
      ok(res, {
        logs: rows.map((l) => ({ id: l.id, action: l.action, targetType: l.target_type, targetId: l.target_id, metadata: l.metadata, createdAt: l.created_at })),
        pagination: pageInfo(total, q.page, q.limit),
      });
    }),

    reports: asyncHandler(async (_req, res) => ok(res, await stats.reports(pool))),

    getSettings: asyncHandler(async (_req, res) => ok(res, { settings: await settingsService.get() })),
    updateSettings: asyncHandler(async (req, res) => {
      const settings = await settingsService.update(req.body);
      await adminRepo.logActivity(pool, req.admin.id, 'settings.update', { targetType: 'settings', metadata: req.body });
      ok(res, { settings });
    })
  };
}
module.exports = { createAdminController };
