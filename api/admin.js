'use strict';
/**
 * Admin API — protected by the ADMIN_TOKEN environment variable.
 * Header:  Authorization: Bearer <ADMIN_TOKEN>
 *
 * GET    /api/admin                         → views, RSVPs, wishes, daily visitors
 * PATCH  /api/admin   { wishId, hidden }    → hide / show a wish on the invitation
 * DELETE /api/admin?type=wish|rsvp&id=...   → delete one record
 */
const crypto = require('crypto');
const { ObjectId } = require('mongodb');
const { getDb, INVITE } = require('./_lib/db');
const { send, fail, readJson, clientIp, hashIp, rateLimit, handler } = require('./_lib/http');

const TZ = process.env.EVENT_TZ || 'America/Chicago';

function tokenOk(req) {
  const expected = process.env.ADMIN_TOKEN || '';
  const auth = String(req.headers.authorization || '');
  const given = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!given) return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

async function blocked(db, ipHash) {
  const win = Math.floor(Date.now() / (900 * 1000));
  const doc = await db.collection('ratelimits').findOne({ _id: 'adminfail:' + ipHash + ':' + win });
  return !!doc && doc.n >= 10;
}

function toId(v) {
  return typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v) ? new ObjectId(v) : null;
}

module.exports = handler(['GET', 'PATCH', 'DELETE'], async (req, res) => {
  if (!process.env.ADMIN_TOKEN || process.env.ADMIN_TOKEN.length < 12) {
    return fail(res, 503, 'admin_disabled', 'Set ADMIN_TOKEN (12+ characters) to enable the dashboard');
  }
  const db = await getDb();
  const ipHash = hashIp(clientIp(req));
  if (await blocked(db, ipHash)) return fail(res, 429, 'too_many_attempts', 'Too many attempts, wait 15 minutes');
  if (!tokenOk(req)) {
    await rateLimit(db, 'adminfail:' + ipHash, 1000, 900);
    return fail(res, 401, 'unauthorized', 'Wrong password');
  }

  if (req.method === 'PATCH') {
    const body = await readJson(req);
    const id = toId(body.wishId);
    if (!id || typeof body.hidden !== 'boolean') return fail(res, 400, 'invalid_request');
    const r = await db.collection('wishes').updateOne({ _id: id, invite: INVITE }, { $set: { hidden: body.hidden } });
    if (!r.matchedCount) return fail(res, 404, 'not_found');
    return send(res, 200, { ok: true });
  }

  if (req.method === 'DELETE') {
    const url = new URL(req.url, 'http://x');
    const type = url.searchParams.get('type');
    const id = toId(url.searchParams.get('id'));
    const col = type === 'wish' ? 'wishes' : type === 'rsvp' ? 'rsvps' : null;
    if (!col || !id) return fail(res, 400, 'invalid_request');
    const r = await db.collection(col).deleteOne({ _id: id, invite: INVITE });
    if (!r.deletedCount) return fail(res, 404, 'not_found');
    return send(res, 200, { ok: true });
  }

  // GET — dashboard data
  const visitors = db.collection('visitors');
  const since = new Date(Date.now() - 45 * 86400000);
  const [vAgg, daily, rsvps, wishes] = await Promise.all([
    visitors.aggregate([
      { $match: { invite: INVITE } },
      { $group: {
        _id: null,
        unique: { $sum: 1 },
        views: { $sum: { $ifNull: ['$views', 0] } },
        opens: { $sum: { $ifNull: ['$opens', 0] } },
        openedVisitors: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$opens', 0] }, 0] }, 1, 0] } },
        lastSeen: { $max: '$lastSeen' }
      } }
    ]).toArray(),
    visitors.aggregate([
      { $match: { invite: INVITE, firstSeen: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$firstSeen', timezone: TZ } }, n: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]).toArray(),
    db.collection('rsvps').find({ invite: INVITE }, { projection: { name: 1, attend: 1, guests: 1, createdAt: 1, updatedAt: 1 } })
      .sort({ updatedAt: -1 }).limit(3000).toArray(),
    db.collection('wishes').find({ invite: INVITE }, { projection: { name: 1, text: 1, hidden: 1, createdAt: 1 } })
      .sort({ createdAt: -1 }).limit(3000).toArray()
  ]);

  const v = vAgg[0] || { unique: 0, views: 0, opens: 0, openedVisitors: 0, lastSeen: null };
  const yes = rsvps.filter((r) => r.attend === 'yes');
  send(res, 200, {
    ok: true,
    invite: INVITE,
    timezone: TZ,
    views: { total: v.views, unique: v.unique, opened: v.openedVisitors, opens: v.opens, lastSeen: v.lastSeen },
    daily: daily.map((d) => ({ day: d._id, visitors: d.n })),
    rsvp: {
      attendingGuests: yes.reduce((s, r) => s + (r.guests || 0), 0),
      yes: yes.length,
      no: rsvps.length - yes.length,
      list: rsvps.map((r) => ({ id: String(r._id), name: r.name, attend: r.attend, guests: r.guests, at: r.updatedAt || r.createdAt }))
    },
    wishes: wishes.map((w) => ({ id: String(w._id), name: w.name, text: w.text, hidden: !!w.hidden, at: w.createdAt }))
  });
});
