'use strict';
/**
 * Small HTTP helpers shared by the API functions (no framework needed).
 */
const crypto = require('crypto');

const MAX_BODY = 16 * 1024; // 16 KB is plenty for an RSVP

function send(res, status, data, extraHeaders) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (extraHeaders) for (const k of Object.keys(extraHeaders)) res.setHeader(k, extraHeaders[k]);
  res.end(data === undefined ? '' : JSON.stringify(data));
}

function fail(res, status, code, message) {
  send(res, status, { ok: false, error: code, message: message || code });
}

/** Reads a JSON body whether or not the platform already parsed it. */
async function readJson(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body);
    if (raw.length > MAX_BODY) throw httpError(413, 'payload_too_large');
    return parse(raw);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw httpError(413, 'payload_too_large');
    chunks.push(chunk);
  }
  return parse(Buffer.concat(chunks).toString('utf8'));
}

function parse(raw) {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object');
    return v;
  } catch (e) {
    throw httpError(400, 'invalid_json');
  }
}

function httpError(status, code, message) {
  const e = new Error(message || code);
  e.status = status;
  e.code = code;
  return e;
}

function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || '0.0.0.0';
}

function hashIp(ip) {
  const salt = process.env.IP_SALT || process.env.ADMIN_TOKEN || 'invite';
  return crypto.createHash('sha256').update(salt + '|' + ip).digest('hex').slice(0, 32);
}

/**
 * Allows same-origin requests, plus any origin listed in ALLOWED_ORIGINS
 * (comma separated). Returns false when a cross-site browser request
 * should be rejected.
 */
function checkOrigin(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin navigations / server-to-server
  let host;
  try { host = new URL(origin).host; } catch (e) { return false; }
  const allowed = String(process.env.ALLOWED_ORIGINS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    return true;
  }
  const fwdHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  return host === req.headers.host || (fwdHost && host === fwdHost);
}

/**
 * Fixed-window rate limit stored in MongoDB (auto-expired by a TTL index).
 * Returns true when the request is allowed.
 */
async function rateLimit(db, key, limit, windowSec) {
  const now = Date.now();
  const windowStart = Math.floor(now / (windowSec * 1000));
  const id = key + ':' + windowStart;
  const r = await db.collection('ratelimits').findOneAndUpdate(
    { _id: id },
    { $inc: { n: 1 }, $setOnInsert: { expiresAt: new Date((windowStart + 1) * windowSec * 1000 + 60000) } },
    { upsert: true, returnDocument: 'after', includeResultMetadata: false }
  );
  const doc = r && r.value !== undefined && r.ok !== undefined ? r.value : r;
  return !doc || doc.n <= limit;
}

/* ---------- input cleaning ---------- */
const CONTROL = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u200B\\u2028\\u2029\\uFEFF]', 'g');

function cleanText(v, max) {
  if (typeof v !== 'string') return '';
  return v.replace(CONTROL, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

function isVid(v) {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v);
}

/** Wraps a handler with method checks, origin checks and error handling. */
function handler(methods, fn) {
  return async (req, res) => {
    try {
      if (!checkOrigin(req, res)) return fail(res, 403, 'forbidden_origin');
      if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
      if (!methods.includes(req.method)) {
        res.setHeader('Allow', methods.join(', '));
        return fail(res, 405, 'method_not_allowed');
      }
      await fn(req, res);
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error('[api]', req.method, req.url, err);
      fail(res, status, err.code || 'server_error', status >= 500 ? 'Something went wrong' : err.message);
    }
  };
}

module.exports = { send, fail, readJson, httpError, clientIp, hashIp, rateLimit, cleanText, isVid, handler };
