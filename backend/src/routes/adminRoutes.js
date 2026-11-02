'use strict';
const express = require('express');
const { validate } = require('../validators/common');
const v = require('../validators/admin');

/** Every route here sits behind requireOwnerAdmin. */
function createAdminRoutes({ controller, requireOwnerAdmin }) {
  const r = express.Router();
  r.use(requireOwnerAdmin);
  r.get('/dashboard', controller.dashboard);
  r.get('/users', validate(v.listUsers, 'query'), controller.listUsers);
  r.get('/users/:id', validate(v.idParam, 'params'), controller.getUser);
  r.patch('/users/:id/status', validate(v.idParam, 'params'), validate(v.setStatus), controller.setUserStatus);
  r.delete('/users/:id', validate(v.idParam, 'params'), validate(v.deleteUser), controller.deleteUser);
  r.get('/api-monitoring', validate(v.monitoring, 'query'), controller.apiMonitoring);
  r.get('/system-health', controller.systemHealth);
  r.get('/activity-logs', validate(v.logs, 'query'), controller.activityLogs);
  r.get('/reports', controller.reports);
  r.get('/settings', controller.getSettings);
  r.patch('/settings', validate(v.settings), controller.updateSettings);
  return r;
}
module.exports = { createAdminRoutes };
