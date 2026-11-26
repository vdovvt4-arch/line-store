const db = require('../database');

async function findByPhone(phone) {
  return await db.queryGet('SELECT phone, name, governorate, address FROM customers WHERE phone=?', [phone]);
}

async function upsert({ phone, name, governorate, address }, runner = db) {
  await runner.execute(
    `INSERT INTO customers(phone, name, governorate, address) VALUES(?, ?, ?, ?)
     ON CONFLICT(phone) DO UPDATE SET
       name=excluded.name,
       governorate=excluded.governorate,
       address=excluded.address`,
    [phone, name, governorate, address]
  );
}

async function findAllWithStats() {
  const rows = await db.queryAll(`
    SELECT c.*, COUNT(o.id) AS orders_count,
           COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN o.total ELSE 0 END), 0) AS total_spent
    FROM customers c
    LEFT JOIN orders o ON o.phone = c.phone
    GROUP BY c.phone, c.name, c.governorate, c.address, c.created_at
    ORDER BY c.created_at DESC
  `);
  return rows.map(r => ({
    ...r,
    orders_count: Number(r.orders_count || 0),
    total_spent: Number(r.total_spent || 0),
  }));
}

module.exports = { findByPhone, upsert, findAllWithStats };
