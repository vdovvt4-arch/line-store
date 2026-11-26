const http = require('http');
const { handlePublicRoutes } = require('./routes/publicRoutes');
const { handleAdminRoutes } = require('./routes/adminRoutes');
const { serveStatic } = require('./middleware/static');
const { AppError, json } = require('./utils/http');
const { isSupabaseConfigured, checkConnection } = require('./db/supabase');
const { applyCors } = require('./utils/cors');

function createApp() {
  return http.createServer(async (req, res) => {
    try {
      applyCors(req, res);
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
      }

      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = url.pathname;
      const method = req.method;

      if (method === 'GET' && pathname === '/api/health') {
        if (!isSupabaseConfigured()) {
          return json(res, 503, { ok: false, error: 'إعدادات قاعدة البيانات غير مكتملة على الخادم' });
        }
        try {
          await checkConnection();
          return json(res, 200, { ok: true, uptime: Math.round(process.uptime()) });
        } catch (error) {
          console.error('[Supabase health check failed]', error);
          return json(res, 503, { ok: false, error: 'تعذر الاتصال بقاعدة البيانات أو لم تُطبق migration بعد' });
        }
      }

      if (await handlePublicRoutes(req, res, method, pathname, url) !== false) return;
      if (await handleAdminRoutes(req, res, method, pathname) !== false) return;

      if (method === 'GET') return serveStatic(pathname, res);
      json(res, 405, { error: 'Method Not Allowed' });
    } catch (err) {
      if (err instanceof AppError) {
        return json(res, err.status, { error: err.message });
      }
      console.error('[Server Error]', err);
      json(res, 500, { error: 'حدث خطأ في الخادم' });
    }
  });
}

module.exports = { createApp };
