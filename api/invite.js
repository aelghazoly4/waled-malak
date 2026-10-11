'use strict';
/**
 * GET /api/invite
 * Public data shown on the invitation: number of attending guests + visible wishes.
 */
const { getDb, INVITE } = require('./_lib/db');
const { send, handler } = require('./_lib/http');
const { attendingCount } = require('./_lib/stats');

module.exports = handler(['GET'], async (req, res) => {
  const db = await getDb();
  const [attending, wishes] = await Promise.all([
    attendingCount(db),
    db.collection('wishes')
      .find({ invite: INVITE, hidden: { $ne: true } }, { projection: { text: 1 } })
      .sort({ createdAt: -1 })
      .limit(150)
      .toArray()
  ]);
  send(res, 200, {
    ok: true,
    attending,
    wishes: wishes.map((w) => ({ id: String(w._id), text: w.text }))
  }, {
    // short CDN cache keeps the page fast under load, still feels live
    'Cache-Control': 'public, max-age=0, s-maxage=10, stale-while-revalidate=30'
  });
});
