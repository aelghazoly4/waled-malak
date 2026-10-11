'use strict';
/**
 * GET /  → the invitation page.
 * Served by a function only to write the site's own address into the
 * link-preview tags (WhatsApp / Facebook / Instagram need full https:// URLs),
 * so previews work on *.vercel.app and on any custom domain with no setup.
 */
const fs = require('fs');
const path = require('path');

let template = null;
function load() {
  if (!template || process.env.NODE_ENV === 'development') {
    template = fs.readFileSync(path.join(__dirname, '_page.html'), 'utf8');
  }
  return template;
}

function origin(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) return '';
  return (proto === 'http' ? 'http' : 'https') + '://' + host;
}

module.exports = (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405; res.setHeader('Allow', 'GET, HEAD'); return res.end();
  }
  const html = load().split('__ORIGIN__').join(origin(req));
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(req.method === 'HEAD' ? '' : html);
};
