'use strict';
// Tiny structured logger. Never pass secrets, cookies or tokens to it.
const isTest = process.env.NODE_ENV === 'test';
const emit = (level, msg, meta) => {
  if (isTest && level !== 'error') return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...meta });
  (level === 'error' ? console.error : console.log)(line);
};
module.exports = {
  info: (m, x) => emit('info', m, x),
  warn: (m, x) => emit('warn', m, x),
  error: (m, x) => emit('error', m, x),
};
