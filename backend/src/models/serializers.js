'use strict';
// Explicit allow-lists: password hashes and internal fields can never leak
// because only the fields named here are ever sent to a client.
const publicUser = (u) => u && ({
  id: u.id,
  fullName: u.full_name,
  email: u.email,
  accountStatus: u.account_status,
  emailVerified: Boolean(u.email_verified_at),
  createdAt: u.created_at,
});

const publicAdmin = (a) => a && ({
  id: a.id,
  email: a.email,
  fullName: a.full_name,
  role: a.role,
});

const publicPreferences = (p) => p && ({
  temperatureUnit: p.temperature_unit,
  windSpeedUnit: p.wind_speed_unit,
  defaultLocation: p.default_location,
  theme: p.theme,
});

module.exports = { publicUser, publicAdmin, publicPreferences };
