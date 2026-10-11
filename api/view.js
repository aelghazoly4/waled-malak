'use strict';
/**
 * POST /api/view
 * body: { vid, event: "view" | "open" }
 * "view"  = the invitation page was loaded
 * "open"  = the guest pressed OPEN on the seal
 */
const { getDb, INVITE } = require('./_lib/db');
const { send, fail, readJson, clientIp, hashIp, rateLimit, cleanText, isVid, handler } = require('./_lib/http');

module.exports = handler(['POST'], async (req, res) => {
  const body = await readJson(req);
  const vid = body.vid;
  const event = body.event === 'open' ? 'open' : body.event === 'view' ? 'view' : null;
  if (!isVid(vid) || !event) return fail(res, 400, 'invalid_request');

  const db = await getDb();
  const ipHash = hashIp(clientIp(req));
  if (!(await rateLimit(db, 'view:' + ipHash, 120, 600))) return send(res, 200, { ok: true, limited: true });

  const now = new Date();
  const inc = event === 'open' ? { opens: 1 } : { views: 1 };
  const set = { lastSeen: now };
  if (event === 'open') set.lastOpened = now;

  const filter = { invite: INVITE, vid };
  const update = {
    $inc: inc,
    $set: set,
    $setOnInsert: {
      firstSeen: now,
      ipHash,
      ua: cleanText(String(req.headers['user-agent'] || ''), 200),
      referrer: cleanText(String(body.ref || ''), 200),
      lang: cleanText(String(req.headers['accept-language'] || ''), 40)
    }
  };
  try {
    await db.collection('visitors').updateOne(filter, update, { upsert: true });
  } catch (err) {
    if (err && err.code === 11000) await db.collection('visitors').updateOne(filter, update, { upsert: true });
    else throw err;
  }
  send(res, 200, { ok: true });
});
