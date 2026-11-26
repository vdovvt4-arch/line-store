const { AppError } = require('../utils/http');

const PAGE_SIZE = 1000;

function getConfig() {
  return {
    url: String(process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  };
}

function isSupabaseConfigured() {
  const { url, anonKey, serviceRoleKey } = getConfig();
  return /^https:\/\/[^/]+$/.test(url) && Boolean(anonKey && serviceRoleKey);
}

function getCredentials(role = 'service_role') {
  const { url, anonKey, serviceRoleKey } = getConfig();
  if (!isSupabaseConfigured()) {
    throw new AppError(503, 'قاعدة البيانات غير مُعدة؛ تحقق من متغيرات Supabase على الخادم');
  }
  const key = role === 'anon' ? anonKey : serviceRoleKey;
  return { url, key };
}

async function request(path, { method = 'GET', query = {}, body, role = 'service_role', headers = {} } = {}) {
  const { url, key } = getCredentials(role);
  const endpoint = new URL(`${url}${path}`);
  const rawBody = Buffer.isBuffer(body);
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) endpoint.searchParams.set(name, String(value));
  }

  let response;
  try {
    response = await fetch(endpoint, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        ...(body === undefined || rawBody ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: rawBody ? body : JSON.stringify(body) }),
    });
  } catch (error) {
    console.error('[Supabase request failed]', error);
    throw new AppError(502, 'تعذر الاتصال بخدمة قاعدة البيانات');
  }

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    const remoteCode = data && typeof data === 'object' ? data.code : '';
    const status = response.status === 409 ? 409 : response.status >= 400 && response.status < 500 ? 400 : 502;
    const message = remoteCode === '23505'
      ? 'السجل موجود مسبقاً'
      : 'تعذر إكمال العملية في قاعدة البيانات';
    throw Object.assign(new AppError(status, message), { code: remoteCode });
  }
  return { data, response };
}

async function selectRows(table, query = {}, { role = 'service_role' } = {}) {
  if (query.limit !== undefined) {
    const { data } = await request(`/rest/v1/${table}`, { query, role });
    if (!Array.isArray(data)) throw new AppError(502, 'استجابة غير صالحة من قاعدة البيانات');
    return data;
  }
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data } = await request(`/rest/v1/${table}`, {
      query: { select: '*', ...query, limit: PAGE_SIZE, offset },
      role,
    });
    if (!Array.isArray(data)) throw new AppError(502, 'استجابة غير صالحة من قاعدة البيانات');
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}

async function selectOne(table, query = {}, options) {
  const rows = await selectRows(table, { ...query, limit: 1 }, options);
  return rows[0] || null;
}

async function insertOne(table, row, { select = '*', role = 'service_role' } = {}) {
  const { data } = await request(`/rest/v1/${table}`, {
    method: 'POST',
    query: { select },
    body: row,
    role,
    headers: { Prefer: 'return=representation' },
  });
  return Array.isArray(data) ? data[0] || null : null;
}

async function upsertOne(table, row, conflictColumn, { select = '*', role = 'service_role' } = {}) {
  const { data } = await request(`/rest/v1/${table}`, {
    method: 'POST',
    query: { on_conflict: conflictColumn, select },
    body: row,
    role,
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
  });
  return Array.isArray(data) ? data[0] || null : null;
}

async function updateOne(table, query, patch, { select = '*', role = 'service_role' } = {}) {
  const { data } = await request(`/rest/v1/${table}`, {
    method: 'PATCH',
    query: { ...query, select },
    body: patch,
    role,
    headers: { Prefer: 'return=representation' },
  });
  return Array.isArray(data) ? data[0] || null : null;
}

async function deleteRows(table, query, { role = 'service_role' } = {}) {
  const { data } = await request(`/rest/v1/${table}`, {
    method: 'DELETE',
    query,
    role,
    headers: { Prefer: 'return=representation' },
  });
  return Array.isArray(data) ? data.length : 0;
}

async function rpc(name, args, { role = 'service_role' } = {}) {
  const { data } = await request(`/rest/v1/rpc/${name}`, {
    method: 'POST',
    body: args,
    role,
  });
  return data;
}

async function checkConnection() {
  await request('/rest/v1/products', {
    query: { select: 'id', limit: 1 },
    role: 'anon',
  });
}

module.exports = {
  request,
  selectRows,
  selectOne,
  insertOne,
  upsertOne,
  updateOne,
  deleteRows,
  rpc,
  checkConnection,
  isSupabaseConfigured,
};
