'use strict';
const { hmac, safeEqual } = require('../utils/crypto');
const { E } = require('../utils/errors');
const { ok } = require('../utils/http');

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Session-bound CSRF protection. The token is an HMAC of the session id, so it
 * is useless without the matching HTTP-only session cookie and needs no extra
 * storage. SPAs fetch it from the token endpoint (and from login responses)
 * and send it in the `X-CSRF-Token` header on every state-changing request.
 *
 * Defence in depth: browsers also send an Origin header on cross-origin
 * unsafe requests; if present it must equal the one allowed origin for the realm.
 */
function createCsrf(config, realm) {
  const secret = `${config.csrfSecret}:${realm}`;
  const allowedOrigin = realm === 'admin' ? config.adminFrontendUrl : config.frontendUrl;
  const tokenFor = (req) => hmac(secret, req.sessionID);

  const tokenHandler = (req, res) => {
    req.session.csrfInit = true; // forces the (anonymous) session to be persisted
    res.set('Cache-Control', 'no-store');
    ok(res, { csrfToken: tokenFor(req) });
  };

  const protect = (req, _res, next) => {
    if (SAFE.has(req.method)) return next();
    const origin = req.get('origin');
    if (origin && origin.replace(/\/$/, '') !== allowedOrigin) {
      return next(E.forbidden('Request origin is not allowed.', 'ORIGIN_NOT_ALLOWED'));
    }
    const sent = req.get('x-csrf-token');
    if (!sent || !safeEqual(sent, tokenFor(req))) {
      return next(E.forbidden('Invalid or missing CSRF token.', 'CSRF_INVALID'));
    }
    next();
  };
  return { tokenFor, tokenHandler, protect };
}
module.exports = { createCsrf };
