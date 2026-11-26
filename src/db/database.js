const { DB_PATH } = require('../config');

const DATABASE_URL = (process.env.DATABASE_URL || '').trim();
const isPg = Boolean(DATABASE_URL);

let pool = null;
let sqliteDb = null;

function toPgSql(sql) {
  let idx = 0;
  return sql.replace(/\?/g, () => `$${++idx}`);
}

function getRunner(client) {
  if (isPg) {
    const target = client || pool;
    return {
      async queryAll(sql, params = []) {
        const res = await target.query(toPgSql(sql), params);
        return res.rows;
      },
      async queryGet(sql, params = []) {
        const res = await target.query(toPgSql(sql), params);
        return res.rows[0] || null;
      },
      async execute(sql, params = []) {
        const res = await target.query(toPgSql(sql), params);
        return { changes: res.rowCount || 0 };
      },
      async insertReturningId(sql, params = []) {
        const pgSql = /\bRETURNING\b/i.test(sql) ? sql : `${sql.trim().replace(/;$/, '')} RETURNING id`;
        const res = await target.query(toPgSql(pgSql), params);
        return Number(res.rows[0]?.id || 0);
      },
    };
  }

  return {
    async queryAll(sql, params = []) {
      return sqliteDb.prepare(sql).all(...params);
    },
    async queryGet(sql, params = []) {
      return sqliteDb.prepare(sql).get(...params) || null;
    },
    async execute(sql, params = []) {
      const r = sqliteDb.prepare(sql).run(...params);
      return { changes: Number(r.changes || 0), lastInsertRowid: Number(r.lastInsertRowid || 0) };
    },
    async insertReturningId(sql, params = []) {
      const r = sqliteDb.prepare(sql).run(...params);
      return Number(r.lastInsertRowid || 0);
    },
  };
}

function queryAll(sql, params = []) {
  return getRunner().queryAll(sql, params);
}

function queryGet(sql, params = []) {
  return getRunner().queryGet(sql, params);
}

function execute(sql, params = []) {
  return getRunner().execute(sql, params);
}

function insertReturningId(sql, params = []) {
  return getRunner().insertReturningId(sql, params);
}

async function withTransaction(fn) {
  if (isPg) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(getRunner(client));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch {}
      throw err;
    } finally {
      client.release();
    }
  }

  sqliteDb.exec('BEGIN IMMEDIATE');
  try {
    const result = await fn(getRunner());
    sqliteDb.exec('COMMIT');
    return result;
  } catch (err) {
    try { sqliteDb.exec('ROLLBACK'); } catch {}
    throw err;
  }
}

const PG_SCHEMA = `
  CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT DEFAULT '',
    description TEXT DEFAULT '',
    price DOUBLE PRECISION DEFAULT 0,
    cost_price DOUBLE PRECISION DEFAULT 0,
    discount_type TEXT DEFAULT 'none',
    discount_value DOUBLE PRECISION DEFAULT 0,
    stock INTEGER DEFAULT 10,
    low_stock_threshold INTEGER DEFAULT 3,
    colors TEXT DEFAULT '[]',
    sizes TEXT DEFAULT '[]',
    images TEXT DEFAULT '[]',
    published INTEGER DEFAULT 0,
    sold_out INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS customers (
    phone TEXT PRIMARY KEY,
    name TEXT,
    governorate TEXT,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    product_id INTEGER,
    product_name TEXT,
    size TEXT,
    color TEXT DEFAULT '',
    items TEXT DEFAULT '[]',
    customer_name TEXT,
    phone TEXT,
    governorate TEXT,
    address TEXT,
    measurements TEXT DEFAULT '{}',
    sketch TEXT DEFAULT '',
    note TEXT DEFAULT '',
    coupon_code TEXT DEFAULT '',
    discount_amount DOUBLE PRECISION DEFAULT 0,
    price DOUBLE PRECISION DEFAULT 0,
    cost_total DOUBLE PRECISION DEFAULT 0,
    profit DOUBLE PRECISION DEFAULT 0,
    delivery_fee DOUBLE PRECISION DEFAULT 0,
    total DOUBLE PRECISION DEFAULT 0,
    status TEXT DEFAULT 'new',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS coupons (
    id SERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    type TEXT DEFAULT 'percent',
    value DOUBLE PRECISION DEFAULT 0,
    min_order DOUBLE PRECISION DEFAULT 0,
    active INTEGER DEFAULT 1,
    uses_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT DEFAULT 'other',
    amount DOUBLE PRECISION DEFAULT 0,
    note TEXT DEFAULT '',
    expense_date TEXT DEFAULT (CURRENT_DATE::text),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS customer_accounts (
    email TEXT PRIMARY KEY,
    google_sub TEXT DEFAULT '',
    name TEXT DEFAULT '',
    picture TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    governorate TEXT DEFAULT '',
    address TEXT DEFAULT '',
    is_vip BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email TEXT DEFAULT '';
`;

const SQLITE_SCHEMA = `
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT DEFAULT '',
    description TEXT DEFAULT '',
    price REAL DEFAULT 0,
    cost_price REAL DEFAULT 0,
    discount_type TEXT DEFAULT 'none',
    discount_value REAL DEFAULT 0,
    stock INTEGER DEFAULT 10,
    low_stock_threshold INTEGER DEFAULT 3,
    colors TEXT DEFAULT '[]',
    sizes TEXT DEFAULT '[]',
    images TEXT DEFAULT '[]',
    published INTEGER DEFAULT 0,
    sold_out INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS customers (
    phone TEXT PRIMARY KEY,
    name TEXT,
    governorate TEXT,
    address TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    product_name TEXT,
    size TEXT,
    color TEXT DEFAULT '',
    items TEXT DEFAULT '[]',
    customer_name TEXT,
    phone TEXT,
    governorate TEXT,
    address TEXT,
    measurements TEXT DEFAULT '{}',
    sketch TEXT DEFAULT '',
    note TEXT DEFAULT '',
    coupon_code TEXT DEFAULT '',
    discount_amount REAL DEFAULT 0,
    price REAL DEFAULT 0,
    cost_total REAL DEFAULT 0,
    profit REAL DEFAULT 0,
    delivery_fee REAL DEFAULT 0,
    total REAL DEFAULT 0,
    status TEXT DEFAULT 'new',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    type TEXT DEFAULT 'percent',
    value REAL DEFAULT 0,
    min_order REAL DEFAULT 0,
    active INTEGER DEFAULT 1,
    uses_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT DEFAULT 'other',
    amount REAL DEFAULT 0,
    note TEXT DEFAULT '',
    expense_date TEXT DEFAULT (date('now')),
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS customer_accounts (
    email TEXT PRIMARY KEY,
    google_sub TEXT DEFAULT '',
    name TEXT DEFAULT '',
    picture TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    governorate TEXT DEFAULT '',
    address TEXT DEFAULT '',
    is_vip BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email TEXT DEFAULT '';
`;

async function initDatabase() {
  if (isPg) {
    const { Pool } = require('pg');
    const isLocal = DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1');
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: isLocal ? false : { rejectUnauthorized: false },
    });
    await pool.query(PG_SCHEMA);
    console.log('[DB] Connected to Supabase / PostgreSQL');
  } else {
    const { DatabaseSync } = require('node:sqlite');
    sqliteDb = new DatabaseSync(DB_PATH);
    sqliteDb.exec(SQLITE_SCHEMA);
    for (const sql of [
      "ALTER TABLE orders ADD COLUMN color TEXT DEFAULT ''",
      "ALTER TABLE orders ADD COLUMN items TEXT DEFAULT '[]'",
      "ALTER TABLE orders ADD COLUMN coupon_code TEXT DEFAULT ''",
      "ALTER TABLE orders ADD COLUMN discount_amount REAL DEFAULT 0",
      "ALTER TABLE orders ADD COLUMN cost_total REAL DEFAULT 0",
      "ALTER TABLE orders ADD COLUMN profit REAL DEFAULT 0",
      "ALTER TABLE orders ADD COLUMN customer_email TEXT DEFAULT ''",
      "ALTER TABLE products ADD COLUMN sold_out INTEGER DEFAULT 0",
      "ALTER TABLE products ADD COLUMN stock INTEGER DEFAULT 10",
      "ALTER TABLE products ADD COLUMN low_stock_threshold INTEGER DEFAULT 3",
      "ALTER TABLE products ADD COLUMN cost_price REAL DEFAULT 0",
    ]) {
      try { sqliteDb.exec(sql); } catch {}
    }
    console.log('[DB] Using local SQLite database:', DB_PATH);
  }

  await seedIfEmpty();
}

async function seedIfEmpty() {
  const prodRow = await queryGet('SELECT COUNT(*) AS count FROM products');
  if (Number(prodRow?.count || 0) === 0) {
    const sampleProducts = [
      {
        name: 'بدلة رسمية رجالية سليم فت',
        category: 'بدلات رسمية',
        description: 'بدلة رجالية أنيقة بقصة سليم فت وخامة تركية فاخرة، مناسبة للعمل والمناسبات الرسمية.',
        price: 120000,
        cost_price: 68000,
        discount_type: 'percent',
        discount_value: 15,
        stock: 12,
        low_stock_threshold: 3,
        colors: ['كحلي', 'أسود', 'رمادي غامق'],
        sizes: [
          { size: '48 (M)', stock: 4, chest: '98', waist: '84', length: '73', shoulder: '44', sleeve: '62' },
          { size: '50 (L)', stock: 5, chest: '104', waist: '90', length: '75', shoulder: '46', sleeve: '63' },
          { size: '52 (XL)', stock: 3, chest: '110', waist: '96', length: '77', shoulder: '48', sleeve: '64' },
        ],
        images: [],
        published: 1,
        sold_out: 0,
      },
      {
        name: 'قميص كتان رجالي صيفي',
        category: 'قمصان',
        description: 'قميص كتان طبيعي بارد ومريح بقصة عصرية، مثالي للإطلالات اليومية والكاجوال الأنيق.',
        price: 35000,
        cost_price: 18000,
        discount_type: 'none',
        discount_value: 0,
        stock: 20,
        low_stock_threshold: 4,
        colors: ['أبيض', 'بيج', 'سماوي', 'زيتوني'],
        sizes: [
          { size: 'M', stock: 7, chest: '102', waist: '96', length: '72', shoulder: '44', sleeve: '61' },
          { size: 'L', stock: 8, chest: '108', waist: '102', length: '74', shoulder: '46', sleeve: '63' },
          { size: 'XL', stock: 5, chest: '114', waist: '108', length: '76', shoulder: '48', sleeve: '65' },
        ],
        images: [],
        published: 1,
        sold_out: 0,
      },
      {
        name: 'بنطلون قماش كلاسيك',
        category: 'بنطلونات',
        description: 'بنطلون قماش بقصة مستقيمة ومريحة مع خامة عملية لا تتجعد بسهولة.',
        price: 42000,
        cost_price: 20000,
        discount_type: 'fixed',
        discount_value: 7000,
        stock: 3,
        low_stock_threshold: 3,
        colors: ['أسود', 'رمادي', 'كحلي', 'بيج'],
        sizes: [
          { size: '30', stock: 1, chest: '-', waist: '78', length: '102', shoulder: '-', sleeve: '-' },
          { size: '32', stock: 2, chest: '-', waist: '83', length: '104', shoulder: '-', sleeve: '-' },
          { size: '34', stock: 0, chest: '-', waist: '88', length: '105', shoulder: '-', sleeve: '-' },
          { size: '36', stock: 0, chest: '-', waist: '93', length: '106', shoulder: '-', sleeve: '-' },
        ],
        images: [],
        published: 1,
        sold_out: 0,
      },
      {
        name: 'تيشيرت بولو قطن فاخر',
        category: 'تيشيرتات',
        description: 'تيشيرت بولو قطن 100% بياقة ثابتة وخامة ناعمة مناسبة للبس اليومي.',
        price: 25000,
        cost_price: 12000,
        discount_type: 'none',
        discount_value: 0,
        stock: 18,
        low_stock_threshold: 5,
        colors: ['أسود', 'أبيض', 'كحلي', 'عنابي'],
        sizes: [
          { size: 'M', stock: 6, chest: '100', waist: '96', length: '70', shoulder: '43', sleeve: '22' },
          { size: 'L', stock: 7, chest: '106', waist: '102', length: '72', shoulder: '45', sleeve: '23' },
          { size: 'XL', stock: 5, chest: '112', waist: '108', length: '74', shoulder: '47', sleeve: '24' },
        ],
        images: [],
        published: 1,
        sold_out: 0,
      },
    ];

    for (const p of sampleProducts) {
      await execute(
        `INSERT INTO products (name, category, description, price, cost_price, discount_type, discount_value, stock, low_stock_threshold, colors, sizes, images, published, sold_out)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.name, p.category, p.description, p.price, p.cost_price, p.discount_type, p.discount_value,
          p.stock, p.low_stock_threshold,
          JSON.stringify(p.colors), JSON.stringify(p.sizes), JSON.stringify(p.images),
          p.published, p.sold_out,
        ]
      );
    }
  }

  const coupRow = await queryGet('SELECT COUNT(*) AS count FROM coupons');
  if (Number(coupRow?.count || 0) === 0) {
    await execute(
      'INSERT INTO coupons (code, type, value, min_order, active) VALUES (?, ?, ?, ?, ?)',
      ['LINE10', 'percent', 10, 0, 1]
    );
  }

  const expRow = await queryGet('SELECT COUNT(*) AS count FROM expenses');
  if (Number(expRow?.count || 0) === 0) {
    await execute(
      'INSERT INTO expenses (title, category, amount, note) VALUES (?, ?, ?, ?)',
      ['إيجار المحل الشهري', 'rent', 500000, 'إيجار المعرض']
    );
    await execute(
      'INSERT INTO expenses (title, category, amount, note) VALUES (?, ?, ?, ?)',
      ['فاتورة الكهرباء والمولدة', 'electricity', 150000, 'كهرباء شهرية']
    );
  }
}

async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
  }
  if (sqliteDb) {
    sqliteDb.close();
    sqliteDb = null;
  }
}

module.exports = {
  isPg,
  queryAll,
  queryGet,
  execute,
  insertReturningId,
  withTransaction,
  initDatabase,
  closeDatabase,
};
