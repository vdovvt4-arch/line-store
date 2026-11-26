const fs = require('fs');
const path = require('path');
const { PUBLIC_DIR, MIME_TYPES } = require('../config');
const settingsRepo = require('../db/repositories/settingsRepo');

async function serveStatic(reqPath, res) {
  const cleanPath = reqPath.length > 1 ? reqPath.replace(/\/+$/, '') : reqPath;
  const st = await settingsRepo.get();
  const slug = st.store_slug || 'line';
  let rel;
  if (cleanPath === '/' || cleanPath === '/admin' || cleanPath === '/index.html') {
    rel = 'index.html';
  } else if (
    cleanPath === '/store' ||
    cleanPath === '/shop' ||
    cleanPath === '/store.html' ||
    cleanPath === `/store/${slug}` ||
    cleanPath === `/${slug}`
  ) {
    rel = 'store.html';
  } else {
    rel = cleanPath.replace(/^\/+/, '');
  }

  const full = path.resolve(PUBLIC_DIR, rel);
  if (!full.startsWith(PUBLIC_DIR + path.sep) && full !== PUBLIC_DIR) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Forbidden');
  }

  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not Found');
    }
    const ext = path.extname(full).toLowerCase();
    const fileName = path.basename(full);
    const cacheControl = fileName === 'sw.js'
      ? 'no-cache, no-store, must-revalidate'
      : 'public, max-age=300';
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': cacheControl,
    });
    res.end(data);
  });
}

module.exports = { serveStatic };
