'use strict';
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

/**
 * Sends transactional email through SMTP when EMAIL_* variables are set.
 * Without a configured provider NOTHING is sent. In development you may set
 * DEV_LOG_RESET_LINKS=true to print the reset link to the console so the
 * flow can be tested locally; that option is ignored in production.
 */
function createEmailService(config, env = process.env) {
  const c = config.email;
  const isResend = Boolean(c.resendApiKey);
  const configured = isResend || Boolean(c.host && c.user && c.password && c.from);
  const transport = !isResend && configured
    ? nodemailer.createTransport({ host: c.host, port: c.port, secure: c.secure, auth: { user: c.user, pass: c.password } })
    : null;
  const devLog = !config.isProd && env.DEV_LOG_RESET_LINKS === 'true';

  const sendViaResend = async (to, subject, text, html) => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${c.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: c.from, to, subject, text, html }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(`Resend error: ${err.message || res.statusText}`);
    }
  };

  return {
    isConfigured: configured,
    async sendEmailChange(to, confirmUrl) {
      if (!configured) {
        if (devLog) logger.info('dev_email_change_link', { to, confirmUrl });
        else logger.warn('email_not_configured: email-change confirmation was NOT sent');
        return false;
      }
      const subject = 'Confirm your new OsasWeather email address';
      const text = `Confirm this address for your OsasWeather account (valid for 1 hour):\n${confirmUrl}\n\nIf you did not request this, ignore this email.`;
      const html = `<p><a href="${confirmUrl}">Confirm your new email address</a> (valid for 1 hour).</p><p>If you did not request this, ignore this email.</p>`;

      if (isResend) {
        await sendViaResend(to, subject, text, html);
      } else {
        await transport.sendMail({ from: c.from, to, subject, text, html });
      }
      return true;
    },
    async sendPasswordReset(to, resetUrl) {
      if (!configured) {
        if (devLog) logger.info('dev_reset_link', { to, resetUrl });
        else logger.warn('email_not_configured: password reset email was NOT sent');
        return false;
      }
      const subject = 'Reset your OsasWeather password';
      const text = `We received a request to reset your OsasWeather password.\n\nOpen this link within 30 minutes to choose a new one:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`;
      const html = `<p>We received a request to reset your OsasWeather password.</p><p><a href="${resetUrl}">Choose a new password</a> (valid for 30 minutes).</p><p>If you did not request this, you can ignore this email.</p>`;

      if (isResend) {
        await sendViaResend(to, subject, text, html);
      } else {
        await transport.sendMail({ from: c.from, to, subject, text, html });
      }
      return true;
    },
  };
}
module.exports = { createEmailService };
