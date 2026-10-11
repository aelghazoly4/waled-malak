'use strict';
/**
 * POST /api/rsvp
 * body: { vid, name, attend: "yes"|"no", guests: 1-10, wish?, website? (honeypot) }
 * One RSVP per device (vid) — sending again updates the previous answer.
 */
const { getDb, INVITE } = require('./_lib/db');
const { send, fail, readJson, clientIp, hashIp, rateLimit, cleanText, isVid, handler } = require('./_lib/http');
const { attendingCount } = require('./_lib/stats');

async function upsert(col, filter, update) {
  try {
    return await col.updateOne(filter, update, { upsert: true });
  } catch (err) {
    if (err && err.code === 11000) return col.updateOne(filter, update, { upsert: true }); // race: retry once
    throw err;
  }
}

module.exports = handler(['POST'], async (req, res) => {
  const body = await readJson(req);

  // bots fill every field — pretend success, store nothing
  if (body.website) return send(res, 200, { ok: true, attending: null, wish: null });

  const vid = body.vid;
  const name = cleanText(body.name, 60).replace(/\n/g, ' ');
  const attend = body.attend === 'no' ? 'no' : body.attend === 'yes' ? 'yes' : null;
  const guestsRaw = parseInt(body.guests, 10);
  const guests = attend === 'yes' ? Math.min(10, Math.max(1, Number.isFinite(guestsRaw) ? guestsRaw : 1)) : 0;
  const wish = cleanText(body.wish, 300);

  if (!isVid(vid)) return fail(res, 400, 'invalid_vid', 'Invalid device id');
  if (name.length < 2) return fail(res, 400, 'invalid_name', 'Name is required');
  if (!attend) return fail(res, 400, 'invalid_attend', 'attend must be yes or no');

  const db = await getDb();
  const ipHash = hashIp(clientIp(req));
  if (!(await rateLimit(db, 'rsvp:' + ipHash, 10, 600))) {
    return fail(res, 429, 'too_many_requests', 'Too many requests, try again later');
  }

  const now = new Date();
  const ua = cleanText(String(req.headers['user-agent'] || ''), 200);

  await upsert(db.collection('rsvps'),
    { invite: INVITE, vid },
    { $set: { name, attend, guests, ipHash, ua, updatedAt: now }, $setOnInsert: { createdAt: now } });

  let wishOut = null;
  if (wish) {
    const wishes = db.collection('wishes');
    await upsert(wishes,
      { invite: INVITE, vid },
      { $set: { name, text: wish, ipHash, updatedAt: now }, $setOnInsert: { createdAt: now, hidden: false } });
    const doc = await wishes.findOne({ invite: INVITE, vid }, { projection: { text: 1, hidden: 1 } });
    if (doc && !doc.hidden) wishOut = { id: String(doc._id), text: doc.text };
  }

  send(res, 200, { ok: true, attending: await attendingCount(db), wish: wishOut });
});
