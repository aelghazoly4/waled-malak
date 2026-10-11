'use strict';
/**
 * Local development server — mimics Vercel: static files + /api/* functions.
 *   1) copy .env.example to .env and fill MONGODB_URI / ADMIN_TOKEN
 *   2) npm install && npm run dev  →  http://localhost:3000
 * Not used on Vercel.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;

// tiny .env loader (no dependency)
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
} catch (e) { /* no .env */ }

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon'
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let p = decodeURIComponent(url.pathname);

  if (p === '/' || p === '/index.html') p = '/api/page'; // same rewrite as vercel.json
  if (p.startsWith('/api/')) {
    const name = p.slice(5).replace(/\/$/, '');
    if (!/^[a-z-]+$/.test(name)) { res.statusCode = 404; return res.end('Not found'); }
    const file = path.join(ROOT, 'api', name + '.js');
    if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('Not found'); }
    try { return await require(file)(req, res); }
    catch (e) { console.error(e); res.statusCode = 500; return res.end('Function crashed'); }
  }

  if (!path.extname(p) && fs.existsSync(path.join(ROOT, p + '.html'))) p += '.html'; // cleanUrls
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT) || /[\\/](api|node_modules)[\\/]|[\\/]\./.test(file.slice(ROOT.length))) {
    res.statusCode = 404; return res.end('Not found');
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.statusCode = 404; return res.end('Not found'); }
    const type = TYPES[path.extname(file)] || 'application/octet-stream';
    const range = req.headers.range;
    if (range && /^bytes=\d*-\d*$/.test(range)) { // needed for audio/video seeking
      let [s, e] = range.slice(6).split('-');
      s = s ? parseInt(s, 10) : 0; e = e ? parseInt(e, 10) : st.size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${s}-${e}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1 });
      return fs.createReadStream(file, { start: s, end: e }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(file).pipe(res);
  });
}).listen(PORT, () => console.log('Invitation running on http://localhost:' + PORT));
