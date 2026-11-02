'use strict';
const { E } = require('../utils/errors');
const { hashPassword, verifyPassword, verifyAgainstDummy } = require('../utils/password');
const { randomToken, sha256 } = require('../utils/crypto');
const { withTransaction } = require('../config/database');
const logger = require('../utils/logger');
const userRepo = require('../repositories/userRepository');
const resetRepo = require('../repositories/resetTokenRepository');
const sessionRepo = require('../repositories/sessionRepository');

function createAuthService({ pool, config, emailService, settingsService }) {
  return {
    async register({ fullName, email, password }) {
      if (!(await settingsService.get()).registrationsOpen) {
        throw E.forbidden('New registrations are currently closed.', 'REGISTRATIONS_CLOSED');
      }
      const passwordHash = await hashPassword(password);
      try {
        return await withTransaction(pool, (db) => userRepo.create(db, { fullName, email, passwordHash }));
      } catch (err) {
        if (err.code === '23505') throw E.conflict('An account with this email already exists.', 'EMAIL_TAKEN');
        throw err;
      }
    },

    /** Returns the user on success. Same generic error for unknown email and wrong password. */
    async authenticate(email, password) {
      const user = await userRepo.findByEmail(pool, email);
      if (!user) {
        await verifyAgainstDummy(password);
        throw E.unauthenticated('Incorrect email or password.');
      }
      const valid = await verifyPassword(user.password_hash, password);
      if (!valid) throw E.unauthenticated('Incorrect email or password.');
      // Only reveal suspension after the credentials were proven correct.
      if (user.account_status !== 'active') throw E.forbidden('This account has been suspended.', 'ACCOUNT_SUSPENDED');
      await userRepo.touchLogin(pool, user.id);
      return user;
    },

    /** Always resolves; callers must respond identically whether or not the email exists. */
    async requestPasswordReset(email) {
      const user = await userRepo.findByEmail(pool, email);
      if (!user || user.account_status !== 'active') return;
      const token = randomToken(32);
      await resetRepo.replaceForUser(pool, user.id, sha256(token), new Date(Date.now() + config.resetTokenTtlMs));
      // Token travels in the URL fragment so it is never sent to servers or Referer headers.
      const url = `${config.frontendUrl}/reset-password.html#token=${token}`;
      // Fire-and-forget so response timing doesn't reveal whether the email exists.
      emailService.sendPasswordReset(user.email, url)
        .catch((err) => logger.error('reset_email_failed', { message: err.message }));
    },

    isResetTokenValid: (token) => resetRepo.isValid(pool, sha256(token)),

    async resetPassword(token, newPassword) {
      const passwordHash = await hashPassword(newPassword);
      return withTransaction(pool, async (db) => {
        const userId = await resetRepo.consume(db, sha256(token));
        if (!userId) throw E.badRequest('This reset link is invalid or has expired.', { code: 'INVALID_RESET_TOKEN' });
        await userRepo.updatePassword(db, userId, passwordHash);
        await sessionRepo.destroyUserSessions(db, userId); // sign out everywhere
        return userId;
      });
    },

    /** Always resolves identically; a link is only sent if the new address is free. */
    async requestEmailChange(user, newEmail, password) {
      if (!(await verifyPassword(user.password_hash, password))) throw E.validation({ password: 'Password is incorrect' });
      if (newEmail === String(user.email).toLowerCase()) return;
      if (await userRepo.findByEmail(pool, newEmail)) return;
      const token = randomToken(32);
      await pool.query('DELETE FROM email_change_tokens WHERE user_id = $1 AND used_at IS NULL', [user.id]);
      await pool.query(
        'INSERT INTO email_change_tokens (user_id, new_email, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
        [user.id, newEmail, sha256(token), new Date(Date.now() + 60 * 60 * 1000)]);
      emailService.sendEmailChange(newEmail, `${config.frontendUrl}/confirm-email.html#token=${token}`)
        .catch((err) => logger.error('email_change_email_failed', { message: err.message }));
    },

    async confirmEmailChange(token) {
      return withTransaction(pool, async (db) => {
        const { rows } = await db.query(
          `UPDATE email_change_tokens SET used_at = now()
            WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id, new_email`, [sha256(token)]);
        if (!rows[0]) throw E.badRequest('This confirmation link is invalid or has expired.');
        try {
          await db.query('UPDATE users SET email = $2, email_verified_at = now() WHERE id = $1', [rows[0].user_id, rows[0].new_email]);
        } catch (err) {
          if (err.code === '23505') throw E.conflict('That email address is already in use.', 'EMAIL_TAKEN');
          throw err;
        }
      });
    },

    async changePassword(user, currentPassword, newPassword, currentSid) {
      if (!(await verifyPassword(user.password_hash, currentPassword))) {
        throw E.validation({ currentPassword: 'Current password is incorrect' });
      }
      const passwordHash = await hashPassword(newPassword);
      await withTransaction(pool, async (db) => {
        await userRepo.updatePassword(db, user.id, passwordHash);
        await sessionRepo.destroyUserSessions(db, user.id, currentSid); // keep only this session
      });
    },
  };
}
module.exports = { createAuthService };
