'use strict';
const { z, uuid } = require('./common');
const { password } = require('./common');

const idParam = z.object({ id: uuid });
const listUsers = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  sort: z.enum(['created_at', 'last_login_at', 'full_name', 'email']).optional().default('created_at'),
  dir: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().min(1).max(100000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});
const setStatus = z.object({ status: z.enum(['active', 'suspended']) }).strict();
const deleteUser = z.object({ confirmEmail: z.string().trim().min(3).max(254) }).strict();
const logs = z.object({
  page: z.coerce.number().int().min(1).max(100000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  action: z.string().trim().max(60).optional(),
});
const monitoring = z.object({ range: z.enum(['24h', '7d', '30d']).optional().default('24h') });
const settings = z.object({
  registrationsOpen: z.boolean(),
  weatherCacheMinutes: z.number().int().min(5, 'Minimum is 5 minutes').max(60, 'Maximum is 60 minutes'),
}).partial().strict().refine((v) => Object.keys(v).length > 0, 'Provide at least one setting');
const changePassword = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: password,
}).strict();

module.exports = { idParam, listUsers, setStatus, deleteUser, logs, monitoring, settings, changePassword };
