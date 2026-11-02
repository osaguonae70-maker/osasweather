'use strict';
const { z } = require('zod');
const { E } = require('../utils/errors');

const email = z.string().trim().toLowerCase().max(254, 'Email is too long')
  .pipe(z.email('Enter a valid email address'));

const password = z.string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be 128 characters or fewer')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Password must include at least one letter and one number');

const fullName = z.string().trim()
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name must be 100 characters or fewer')
  .refine((v) => !/[<>\u0000-\u001f]/.test(v), 'Name contains invalid characters');

const uuid = z.uuid('Invalid identifier');

/** Express middleware: validates req[source] against a zod schema and replaces it with parsed data. */
function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source] ?? {});
    if (!result.success) {
      const details = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || '_';
        if (!details[key]) details[key] = issue.message;
      }
      return next(E.validation(details));
    }
    // req.query is a getter in Express 5-style envs; assign defensively.
    if (source === 'query') Object.defineProperty(req, 'validatedQuery', { value: result.data, configurable: true });
    else req[source] = result.data;
    next();
  };
}
module.exports = { email, password, fullName, uuid, validate, z };
