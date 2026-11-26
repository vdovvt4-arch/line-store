const fs = require('fs');
const path = require('path');

// تحميل متغيرات .env إن وجدت بدون مكتبات خارجية
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
}

const { PORT } = require('./src/config');
const { createApp } = require('./src/app');
const { closeDatabase } = require('./src/db/database');

const HOST = process.env.HOST || '0.0.0.0';

(async () => {
  const server = await createApp();

  server.listen(PORT, HOST, () => {
    console.log(`Admin dashboard running at http://localhost:${PORT}/`);
    console.log(`Customer store running at http://localhost:${PORT}/store/line`);
  });

  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      server.close(async () => {
        await closeDatabase();
        process.exit(0);
      });
    });
  }
})().catch(err => {
  console.error('[Startup Error]', err);
  process.exit(1);
});
