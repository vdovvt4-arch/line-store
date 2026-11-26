process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.ADMIN_PASSWORD = 'test-admin-password';
process.env.CORS_ORIGINS = 'https://store.example';

const assert = require('node:assert/strict');
const http = require('node:http');
const { test } = require('node:test');
const { createApp } = require('../src/app');

function response(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(data),
  };
}

function requestServer(server, path, { method = 'GET', headers = {}, body } = {}) {
  const address = server.address();
  const bodyText = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port: address.port,
      path,
      method,
      headers: {
        Origin: 'https://store.example',
        ...(bodyText === undefined ? {} : {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyText),
        }),
        ...headers,
      },
    }, res => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: raw ? JSON.parse(raw) : null,
        });
      });
    });
    request.on('error', reject);
    if (bodyText !== undefined) request.write(bodyText);
    request.end();
  });
}

async function withFetch(mockFetch, callback) {
  const originalFetch = global.fetch;
  global.fetch = mockFetch;
  try {
    return await callback();
  } finally {
    global.fetch = originalFetch;
  }
}

test('admin auth protects media and backend CRUD uses the configured service', async () => {
  const calls = [];
  const app = createApp();
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  try {
    await withFetch(async (url, options) => {
      const endpoint = new URL(String(url));
      calls.push({ endpoint, options });
      if (endpoint.pathname.endsWith('/storage/v1/object/line-store-media/products')) return response({});
      if (endpoint.pathname.endsWith('/storage/v1/object/line-store-media')) return response({});
      if (endpoint.pathname.endsWith('/rest/v1/products') && options.method === 'POST') {
        return response([{ ...JSON.parse(options.body), id: 21, created_at: '2026-01-01T00:00:00Z' }]);
      }
      if (endpoint.pathname.endsWith('/rest/v1/products') && options.method === 'PATCH') {
        return response([{ ...JSON.parse(options.body), id: 21 }]);
      }
      return response([]);
    }, async () => {
      const denied = await requestServer(app, '/api/admin/media', {
        method: 'POST',
        body: { folder: 'products', image: `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString('base64')}` },
      });
      assert.equal(denied.status, 401);

      const login = await requestServer(app, '/api/admin/login', {
        method: 'POST',
        body: { password: 'test-admin-password' },
      });
      assert.equal(login.status, 200);
      assert.equal(login.headers['access-control-allow-origin'], 'https://store.example');
      const token = login.body.token;

      const bootstrap = await requestServer(app, '/api/admin/bootstrap', {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(bootstrap.status, 200);
      assert.deepEqual(bootstrap.body.products, []);

      const created = await requestServer(app, '/api/admin/products', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: { name: 'Test product', price: 100, images: [] },
      });
      assert.equal(created.status, 201);
      assert.equal(created.body.id, 21);

      const updated = await requestServer(app, '/api/admin/products/21', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: { name: 'Updated product', price: 125, images: [] },
      });
      assert.equal(updated.status, 200);
      assert.equal(updated.body.name, 'Updated product');

      const uploaded = await requestServer(app, '/api/admin/media', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: { folder: 'products', image: `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString('base64')}` },
      });
      assert.equal(uploaded.status, 201);
      assert.match(uploaded.body.url, /line-store-media\/products\//);

      const deleted = await requestServer(app, '/api/admin/media', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        body: { urls: [uploaded.body.url] },
      });
      assert.equal(deleted.status, 200, JSON.stringify(deleted));
      assert.equal(deleted.body.deleted, 1);
      const requestKeys = calls.map(call => call.options.headers.apikey);
      assert.ok(requestKeys.includes('test-service-role-key'));
      assert.ok(requestKeys.every(key => ['test-service-role-key', 'test-anon-key'].includes(key)));
    });
  } finally {
    await new Promise((resolve, reject) => app.close(error => error ? reject(error) : resolve()));
  }
});

test('public store reads use the anon role and include only published product data', async () => {
  const app = createApp();
  const requestKeys = [];
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  try {
    await withFetch(async (url, options) => {
      const endpoint = new URL(String(url));
      requestKeys.push(options.headers.apikey);
      if (endpoint.pathname.endsWith('/rest/v1/products')) {
        return response([{
          id: 8,
          name: 'Public product',
          category: 'Shirts',
          description: '',
          price: 100,
          discount_type: 'none',
          discount_value: 0,
          stock: 2,
          low_stock_threshold: 1,
          colors: [],
          sizes: [],
          images: [],
          published: true,
          sold_out: false,
        }]);
      }
      if (endpoint.pathname.endsWith('/rest/v1/settings')) {
        return response([{ key: 'store', value: { hide_sold_out: true } }]);
      }
      assert.equal(options.headers.apikey, 'test-anon-key');
      return response([]);
    }, async () => {
      const store = await requestServer(app, '/api/store');
      assert.equal(store.status, 200);
      assert.equal(store.body.products.length, 1);
      assert.equal(store.body.products[0].name, 'Public product');
      assert.equal(store.body.products[0].cost_price, 0);
      assert.ok(requestKeys.length > 0);
      assert.ok(requestKeys.every(key => key === 'test-anon-key'));
    });
  } finally {
    await new Promise((resolve, reject) => app.close(error => error ? reject(error) : resolve()));
  }
});

test('health fails clearly when Supabase service credentials are missing', async () => {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const app = createApp();
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  try {
    const health = await requestServer(app, '/api/health');
    assert.equal(health.status, 503);
    assert.equal(health.body.ok, false);
    assert.match(health.body.error, /قاعدة البيانات/);
  } finally {
    process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;
    await new Promise((resolve, reject) => app.close(error => error ? reject(error) : resolve()));
  }
});
