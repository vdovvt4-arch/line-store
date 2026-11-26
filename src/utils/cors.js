const { AppError } = require('./http');

const DEFAULT_ORIGINS = [
  'https://vdovvt4-arch.github.io',
];

function getAllowedOrigins() {
  const configured = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ORIGINS, ...configured]);
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return;
  if (!getAllowedOrigins().has(origin)) {
    throw new AppError(403, 'مصدر الواجهة غير مسموح له بالاتصال بالخادم');
  }
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Vary', 'Origin');
}

module.exports = { applyCors };
