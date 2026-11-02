'use strict';
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const { createPool } = require('./config/database');
const { createSessions } = require('./middleware/session');
const { createCsrf } = require('./middleware/csrf');
const { requireUser, requireOwnerAdmin } = require('./middleware/auth');
const { createLimiters } = require('./middleware/rateLimit');
const { notFound, createErrorHandler } = require('./middleware/errorHandler');
const { createEmailService } = require('./services/emailService');
const { createAuthService } = require('./services/authService');
const { createAdminAuthService } = require('./services/adminAuthService');
const { createAuthController } = require('./controllers/authController');
const { createAdminAuthController } = require('./controllers/adminAuthController');
const { createAuthRoutes } = require('./routes/authRoutes');
const { createAdminAuthRoutes } = require('./routes/adminAuthRoutes');
const { createHealthRoutes } = require('./routes/healthRoutes');
const { createSettingsService } = require('./services/settingsService');
const { createWeatherService } = require('./services/weatherService');
const { createWeatherController } = require('./controllers/weatherController');
const { createWeatherRoutes } = require('./routes/weatherRoutes');
const { createUserController } = require('./controllers/userController');
const { createFavouriteRoutes, createPreferenceRoutes } = require('./routes/userRoutes');
const { createAdminController } = require('./controllers/adminController');
const { createAdminRoutes } = require('./routes/adminRoutes');
const v = require('./validators/user');
const { validate } = require('./validators/common');

/**
 * Builds the Express app. Dependencies (pool, email service) are injectable so
 * tests can run against an isolated database and capture outgoing email.
 */
function createApp(config, deps = {}) {
  const pool = deps.pool || createPool(config);
  const emailService = deps.emailService || createEmailService(config);
  const limiters = createLimiters(config);
  const { userSession, adminSession } = createSessions(config, pool);
  const userCsrf = createCsrf(config, 'user');
  const adminCsrf = createCsrf(config, 'admin');

  const settingsService = deps.settingsService || createSettingsService({ pool });
  const weatherService = deps.weatherService || createWeatherService({ pool, config, settingsService, fetchImpl: deps.fetchImpl });
  const authService = createAuthService({ pool, config, emailService, settingsService });
  const adminAuthService = createAdminAuthService({ pool });

  const app = express();
  app.disable('x-powered-by');
  if (config.isProd) app.set('trust proxy', 1); // Render terminates TLS in front of us

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cors({
    origin(origin, cb) {
      // No Origin header = same-origin / server-to-server (health checks, curl): allow.
      if (!origin || config.allowedOrigins.includes(origin)) return cb(null, true);
      return cb(null, false); // no CORS headers -> the browser blocks the response
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    maxAge: 600,
  }));
  app.use(limiters.global);
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());

  // Health check is mounted before sessions: it must stay cheap and cookie-free.
  app.use('/api/health', createHealthRoutes({ pool }));

  // ---------------------------------------------------------- admin realm
  const adminApi = express.Router();
  adminApi.use(adminSession, adminCsrf.protect);
  adminApi.get('/csrf-token', adminCsrf.tokenHandler);
  adminApi.use('/auth', createAdminAuthRoutes({
    controller: createAdminAuthController({ pool, config, adminAuthService, csrf: adminCsrf }),
    requireOwnerAdmin: requireOwnerAdmin(config, pool),
    limiters,
  }));
  adminApi.use('/', createAdminRoutes({
    controller: createAdminController({ pool, config, settingsService }),
    requireOwnerAdmin: requireOwnerAdmin(config, pool),
  }));
  adminApi.use(notFound); // never fall through into the user realm
  app.use('/api/admin', adminApi);

  // ----------------------------------------------------------- user realm
  const userApi = express.Router();
  userApi.use(userSession, userCsrf.protect);
  userApi.get('/csrf-token', userCsrf.tokenHandler);
  userApi.use('/auth', createAuthRoutes({
    controller: createAuthController({ pool, config, authService, csrf: userCsrf }),
    requireUser: requireUser(pool),
    limiters,
  }));
  const requireUserMw = requireUser(pool);
  const userController = createUserController({ pool, authService });
  userApi.use('/weather', createWeatherRoutes({ controller: createWeatherController({ weatherService }), limiters }));
  userApi.use('/favourites', createFavouriteRoutes({ controller: userController, requireUser: requireUserMw }));
  userApi.use('/preferences', createPreferenceRoutes({ controller: userController, requireUser: requireUserMw }));
  userApi.patch('/auth/profile', requireUserMw, validate(v.profile), userController.updateProfile);
  userApi.post('/auth/email-change', limiters.forgot, requireUserMw, validate(v.emailChange), userController.requestEmailChange);
  userApi.post('/auth/email-change/confirm', limiters.forgot, validate(v.tokenOnly), userController.confirmEmailChange);
  app.use('/api', userApi);

  app.use(notFound);
  app.use(createErrorHandler(pool));

  app.locals.pool = pool;
  app.locals.weatherService = weatherService;
  return app;
}
module.exports = { createApp };
