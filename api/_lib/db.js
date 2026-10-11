'use strict';
/**
 * MongoDB connection — cached across warm invocations of Vercel functions.
 */
const { MongoClient } = require('mongodb');

const INVITE = (process.env.INVITE_SLUG || 'walid-malak').trim();

const g = globalThis;
if (!g.__inviteMongo) g.__inviteMongo = { promise: null, indexes: null };
const cache = g.__inviteMongo;

function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    const err = new Error('MONGODB_URI is not configured');
    err.status = 500;
    throw err;
  }
  if (!cache.promise) {
    cache.promise = MongoClient.connect(uri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 8000,
      appName: 'wedding-invitation'
    }).catch((err) => {
      cache.promise = null; // allow a retry on the next request
      throw err;
    });
  }
  return cache.promise;
}

async function ensureIndexes(db) {
  await Promise.all([
    db.collection('visitors').createIndex({ invite: 1, vid: 1 }, { unique: true }),
    db.collection('visitors').createIndex({ invite: 1, firstSeen: -1 }),
    db.collection('rsvps').createIndex({ invite: 1, vid: 1 }, { unique: true }),
    db.collection('rsvps').createIndex({ invite: 1, updatedAt: -1 }),
    db.collection('wishes').createIndex({ invite: 1, vid: 1 }, { unique: true }),
    db.collection('wishes').createIndex({ invite: 1, hidden: 1, createdAt: -1 }),
    db.collection('ratelimits').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  ]);
}

async function getDb() {
  const client = await connect();
  const db = client.db(process.env.MONGODB_DB || 'wedding');
  if (!cache.indexes) {
    cache.indexes = ensureIndexes(db).catch((err) => {
      cache.indexes = null;
      console.error('[db] index creation failed:', err.message);
    });
  }
  await cache.indexes;
  return db;
}

module.exports = { getDb, INVITE };
