'use strict';
const { z, email, fullName, uuid } = require('./common');

const location = z.object({
  name: z.string().trim().min(1).max(150),
  country: z.string().trim().max(100).nullable().optional().transform((v) => v || null),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
}).strict();

const favourite = location.transform((v) => ({
  ...v, latitude: Math.round(v.latitude * 1e4) / 1e4, longitude: Math.round(v.longitude * 1e4) / 1e4,
}));

const preferences = z.object({
  temperatureUnit: z.enum(['celsius', 'fahrenheit']),
  windSpeedUnit: z.enum(['kmh', 'mph', 'ms', 'kn']),
  defaultLocation: location.nullable(),
  theme: z.enum(['light', 'dark', 'system']),
}).partial().strict().refine((v) => Object.keys(v).length > 0, 'Provide at least one preference to update');

const idParam = z.object({ id: uuid });
const profile = z.object({ fullName }).strict();
const emailChange = z.object({ newEmail: email, password: z.string().min(1, 'Password is required').max(128) }).strict();
const tokenOnly = z.object({ token: z.string().min(20).max(200) }).strict();

module.exports = { favourite, preferences, idParam, profile, emailChange, tokenOnly };
