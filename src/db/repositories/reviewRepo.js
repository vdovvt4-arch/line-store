const db = require('../database');

function mapReview(r) {
  if (!r) return null;
  return {
    ...r,
    id: Number(r.id),
    product_id: Number(r.product_id),
    rating: Math.min(5, Math.max(1, Number(r.rating) || 5)),
  };
}

async function findByProductId(productId) {
  const rows = await db.queryAll(
    'SELECT * FROM reviews WHERE product_id=? ORDER BY id DESC LIMIT 50',
    [productId]
  );
  const reviews = rows.map(mapReview);
  const stat = await db.queryGet(
    'SELECT COUNT(*) AS cnt, COALESCE(AVG(rating), 0) AS avg_rating FROM reviews WHERE product_id=?',
    [productId]
  );
  return {
    reviews,
    count: Number(stat?.cnt || 0),
    avg_rating: Number(Number(stat?.avg_rating || 0).toFixed(1)),
  };
}

async function getStatsByProduct() {
  const rows = await db.queryAll(
    'SELECT product_id, COUNT(*) AS cnt, COALESCE(AVG(rating), 0) AS avg_rating FROM reviews GROUP BY product_id'
  );
  const map = new Map();
  for (const r of rows) {
    map.set(Number(r.product_id), {
      count: Number(r.cnt || 0),
      avg_rating: Number(Number(r.avg_rating || 0).toFixed(1)),
    });
  }
  return map;
}

async function findAll() {
  const rows = await db.queryAll(`
    SELECT r.*, p.name AS product_name
    FROM reviews r
    LEFT JOIN products p ON p.id = r.product_id
    ORDER BY r.id DESC
    LIMIT 100
  `);
  return rows.map(mapReview);
}

async function create({ product_id, customer_name, rating, comment }) {
  const cleanName = String(customer_name || '').trim().slice(0, 80);
  const cleanRating = Math.min(5, Math.max(1, parseInt(rating, 10) || 5));
  const cleanComment = String(comment || '').trim().slice(0, 500);
  const id = await db.insertReturningId(
    'INSERT INTO reviews (product_id, customer_name, rating, comment) VALUES (?, ?, ?, ?)',
    [product_id, cleanName, cleanRating, cleanComment]
  );
  return mapReview(await db.queryGet('SELECT * FROM reviews WHERE id=?', [id]));
}

async function remove(id) {
  const r = await db.execute('DELETE FROM reviews WHERE id=?', [id]);
  return r.changes > 0;
}

module.exports = { findByProductId, getStatsByProduct, findAll, create, remove };
