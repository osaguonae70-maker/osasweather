'use strict';
const argon2 = require('argon2');

// OWASP-recommended Argon2id parameters (19 MiB, t=2, p=1).
const OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

const hashPassword = (plain) => argon2.hash(plain, OPTIONS);

async function verifyPassword(hash, plain) {
  try { return await argon2.verify(hash, plain); } catch { return false; }
}

// Used to keep response time similar when an account does not exist,
// so login timing doesn't reveal which emails are registered.
let dummyHashPromise;
const dummyHash = () => (dummyHashPromise ||= argon2.hash('osasweather-dummy-password', OPTIONS));
async function verifyAgainstDummy(plain) { await verifyPassword(await dummyHash(), plain); }

module.exports = { hashPassword, verifyPassword, verifyAgainstDummy };
