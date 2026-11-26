const crypto = require('crypto');
const { ADMIN_PASSWORD, SESSION_TTL_MS } = require('../config');
const db = require('../db/database');
const { AppError } = require('../utils/http');

const revokedTokens = new Set();

function getSigningSecret() {
  return process.env.SESSION_SECRET || `${ADMIN_PASSWORD}:line-store-session-key`;
}

function signPayload(payloadB64) {
  return crypto.createHmac('sha256', getSigningSecret()).update(payloadB64).digest('hex');
}

async function getActivePassword() {
  try {
    const row = await db.queryGet("SELECT value FROM settings WHERE key='admin_password'");
    if (row && row.value) return String(row.value);
  } catch {}
  return ADMIN_PASSWORD;
}

async function setAdminPassword(newPassword) {
  const clean = String(newPassword || '').trim();
  if (clean.length < 4) throw new AppError(400, 'كلمة المرور يجب أن تكون 4 أحرف على الأقل');
  await db.execute(
    `INSERT INTO settings(key, value) VALUES('admin_password', ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    [db.isPg ? JSON.stringify(clean) : clean]
  );
}

function extractToken(req) {
  return (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

async function createSession(password) {
  const expected = Buffer.from(await getActivePassword());
  const actual = Buffer.from(String(password || ''));
  const valid = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  if (!valid) throw new AppError(401, 'كلمة المرور غير صحيحة');

  const payload = { exp: Date.now() + SESSION_TTL_MS, n: crypto.randomBytes(8).toString('hex') };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = signPayload(payloadB64);
  return `${payloadB64}.${sig}`;
}

function isAdmin(req) {
  const token = extractToken(req);
  if (!token || revokedTokens.has(token)) return false;
  const dot = token.indexOf('.');
  if (dot === -1) return false;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expectedSig = signPayload(payloadB64);
  if (sig.length !== expectedSig.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return false;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    return Number(payload.exp) > Date.now();
  } catch {
    return false;
  }
}

function requireAdmin(req) {
  if (!isAdmin(req)) throw new AppError(401, 'غير مصرح، سجّل الدخول أولاً');
}

function revokeSession(req) {
  const token = extractToken(req);
  if (token) {
    revokedTokens.add(token);
    if (revokedTokens.size > 1000) revokedTokens.clear();
  }
}

module.exports = { createSession, isAdmin, requireAdmin, revokeSession, setAdminPassword };
