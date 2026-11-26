process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.ADMIN_PASSWORD = 'test-admin-password';
process.env.CORS_ORIGINS = 'https://store.example';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const db = require('../src/db/supabase');
const storage = require('../src/db/storage');
const { applyCors } = require('../src/utils/cors');
const { AppError } = require('../src/utils/http');
const orderRepo = require('../src/db/repositories/orderRepo');

function response(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(data),
  };
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

test('uses the anon key for public reads and service-role only for server operations', async () => {
  const calls = [];
  await withFetch(async (url, options) => {
    calls.push({ url: String(url), options });
    return response([]);
  }, async () => {
    await db.request('/rest/v1/products', { role: 'anon' });
    await db.request('/rest/v1/products', { method: 'POST', body: { name: 'Test' } });
  });

  assert.equal(calls[0].options.headers.apikey, 'test-anon-key');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-anon-key');
  assert.equal(calls[1].options.headers.apikey, 'test-service-role-key');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer test-service-role-key');
});

test('uploads media bytes server-side and returns only a public object URL', async () => {
  let call;
  const result = await withFetch(async (url, options) => {
    call = { url: String(url), options };
    return response({});
  }, () => storage.uploadMedia(`data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString('base64')}`, 'products'));

  assert.equal(call.options.headers.apikey, 'test-service-role-key');
  assert.equal(call.options.headers['Content-Type'], 'image/jpeg');
  assert.ok(Buffer.isBuffer(call.options.body));
  assert.match(call.url, /\/storage\/v1\/object\/line-store-media\/products\//);
  assert.match(result.url, /^https:\/\/test-project\.supabase\.co\/storage\/v1\/object\/public\/line-store-media\/products\//);
  assert.equal(result.url.includes('test-service-role-key'), false);
});

test('rejects non-image payloads before contacting Storage', async () => {
  let called = false;
  await withFetch(async () => {
    called = true;
    return response({});
  }, async () => {
    await assert.rejects(
      storage.uploadMedia(`data:image/jpeg;base64,${Buffer.from('not-an-image').toString('base64')}`, 'products'),
      error => error instanceof AppError && error.status === 400,
    );
  });
  assert.equal(called, false);
});

test('rejects media deletion URLs outside the configured project', async () => {
  await assert.rejects(
    storage.deleteMediaUrls(['https://attacker.example/storage/v1/object/public/line-store-media/products/image.jpg']),
    error => error instanceof AppError && error.status === 400,
  );
});

test('CORS allows only explicitly configured origins', () => {
  const headers = {};
  applyCors({ headers: { origin: 'https://store.example' } }, {
    setHeader: (name, value) => { headers[name] = value; },
  });
  assert.equal(headers['Access-Control-Allow-Origin'], 'https://store.example');
  assert.equal(headers['Vary'], 'Origin');

  assert.throws(
    () => applyCors({ headers: { origin: 'https://attacker.example' } }, { setHeader() {} }),
    error => error instanceof AppError && error.status === 403,
  );
});

test('creates orders through the transactional database RPC', async () => {
  let call;
  const orderId = await withFetch(async (url, options) => {
    call = { url: String(url), options };
    return response(42);
  }, () => orderRepo.create({
    product_id: 7,
    product_name: 'Test product',
    size: 'M',
    color: 'Black',
    items: [{ product_id: 7, qty: 1 }],
    customer_name: 'Test customer',
    phone: '07123456789',
    governorate: 'Baghdad',
    address: 'Test address',
    measurements: {},
    sketch: '',
    note: '',
    coupon_code: '',
    discount_amount: 0,
    price: 100,
    cost_total: 50,
    profit: 50,
    delivery_fee: 0,
    total: 100,
    customer: { phone: '07123456789', name: 'Test customer' },
    items_for_stock: [{ product_id: 7, size: 'M', qty: 1 }],
    coupon_id: null,
  }));

  assert.equal(orderId, 42);
  assert.match(call.url, /\/rest\/v1\/rpc\/place_order$/);
  const body = JSON.parse(call.options.body);
  assert.equal(body.p_order.product_id, 7);
  assert.equal(body.p_items[0].qty, 1);
});
