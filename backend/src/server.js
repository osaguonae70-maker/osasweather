'use strict';
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env'), quiet: true });
const { loadConfig } = require('./config');
const { createApp } = require('./app');
const logger = require('./utils/logger');

const config = loadConfig();
const app = createApp(config);
const server = app.listen(config.port, () => {
  logger.info('server_started', { port: config.port, env: config.nodeEnv });
});

function shutdown(signal) {
  logger.info('shutdown', { signal });
  server.close(async () => {
    await app.locals.pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => logger.error('unhandled_rejection', { message: err && err.message }));
