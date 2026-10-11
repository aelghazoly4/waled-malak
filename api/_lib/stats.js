'use strict';
const { INVITE } = require('./db');

/** Total number of people confirmed as attending (sum of party sizes). */
async function attendingCount(db) {
  const r = await db.collection('rsvps').aggregate([
    { $match: { invite: INVITE, attend: 'yes' } },
    { $group: { _id: null, guests: { $sum: '$guests' } } }
  ]).toArray();
  return r.length ? r[0].guests : 0;
}

module.exports = { attendingCount };
