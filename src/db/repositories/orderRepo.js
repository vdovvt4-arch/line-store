const db = require('../database');
const { parseJsonSafe } = require('../../utils/http');

function mapOrder(r) {
  if (!r) return null;
  const items = parseJsonSafe(r.items, []);
  return {
    ...r,
    id: Number(r.id),
    product_id: r.product_id ? Number(r.product_id) : null,
    price: Number(r.price || 0),
    discount_amount: Number(r.discount_amount || 0),
    delivery_fee: Number(r.delivery_fee || 0),
    total: Number(r.total || 0),
    cost_total: Number(r.cost_total || 0),
    profit: Number(r.profit || 0),
    measurements: parseJsonSafe(r.measurements, {}),
    items: items.length ? items : [{
      product_id: r.product_id,
      product_name: r.product_name,
      size: r.size,
      color: r.color,
      qty: 1,
      price: r.price,
      cost_price: 0,
    }],
  };
}

async function findAll() {
  const rows = await db.queryAll('SELECT * FROM orders ORDER BY id DESC');
  return rows.map(mapOrder);
}

async function findById(id, runner = db) {
  return mapOrder(await runner.queryGet('SELECT * FROM orders WHERE id=?', [id]));
}

async function findByPhone(phone) {
  const rows = await db.queryAll(
    `SELECT id, product_name, size, color, items, governorate, coupon_code, discount_amount, price, delivery_fee, total, status, created_at
     FROM orders
     WHERE phone=?
     ORDER BY id DESC
     LIMIT 20`,
    [phone]
  );
  return rows.map(mapOrder);
}

async function findByCustomer(email, phone = '') {
  if (email && phone) {
    const rows = await db.queryAll(
      `SELECT id, product_name, size, color, items, governorate, coupon_code, discount_amount, price, delivery_fee, total, status, created_at
       FROM orders
       WHERE customer_email=? OR phone=?
       ORDER BY id DESC
       LIMIT 30`,
      [email, phone]
    );
    return rows.map(mapOrder);
  }
  if (email) {
    const rows = await db.queryAll(
      `SELECT id, product_name, size, color, items, governorate, coupon_code, discount_amount, price, delivery_fee, total, status, created_at
       FROM orders
       WHERE customer_email=?
       ORDER BY id DESC
       LIMIT 30`,
      [email]
    );
    return rows.map(mapOrder);
  }
  return phone ? await findByPhone(phone) : [];
}

async function create(order, runner = db) {
  return await runner.insertReturningId(
    `INSERT INTO orders(product_id, product_name, size, color, items, customer_name, customer_email, phone, governorate, address, measurements, sketch, note, coupon_code, discount_amount, price, cost_total, profit, delivery_fee, total)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      order.product_id,
      order.product_name,
      order.size,
      order.color,
      order.items,
      order.customer_name,
      order.customer_email || '',
      order.phone,
      order.governorate,
      order.address,
      order.measurements,
      order.sketch,
      order.note,
      order.coupon_code || '',
      Number(order.discount_amount || 0),
      order.price,
      Number(order.cost_total || 0),
      Number(order.profit || 0),
      order.delivery_fee,
      order.total,
    ]
  );
}

async function updateStatus(id, status, runner = db) {
  const r = await runner.execute('UPDATE orders SET status=? WHERE id=?', [status, id]);
  return r.changes > 0;
}

async function remove(id, runner = db) {
  const r = await runner.execute('DELETE FROM orders WHERE id=?', [id]);
  return r.changes > 0;
}

module.exports = { findAll, findById, findByPhone, findByCustomer, create, updateStatus, remove };
