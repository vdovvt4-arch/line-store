-- LINE Menswear Store - Supabase (PostgreSQL) Schema
-- ملاحظة: الخادم ينشئ هذه الجداول تلقائياً عند التشغيل الأول، ويمكنك أيضاً تشغيل هذا الملف يدوياً في Supabase SQL Editor.

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
