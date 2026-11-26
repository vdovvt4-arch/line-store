const db = require('../database');

function mapCoupon(r) {
  return r ? {
    ...r,
    id: Number(r.id),
    value: Number(r.value || 0),
    min_order: Number(r.min_order || 0),
    uses_count: Number(r.uses_count || 0),
    active: r.active === true || Number(r.active) === 1,
  } : null;
}

async function findAll() {
  const rows = await db.queryAll('SELECT * FROM coupons ORDER BY id DESC');
  return rows.map(mapCoupon);
}

async function findByCode(code) {
  const norm = String(code || '').trim().toUpperCase();
  if (!norm) return null;
  const row = await db.queryGet('SELECT * FROM coupons WHERE UPPER(code)=?', [norm]);
  return mapCoupon(row);
}

function calculateDiscount(coupon, subtotal) {
  if (!coupon || !coupon.active) return 0;
  if (subtotal < Number(coupon.min_order || 0)) return 0;
  const val = Number(coupon.value || 0);
  if (coupon.type === 'percent') return Math.min(subtotal, Math.round(subtotal * (Math.min(val, 100) / 100)));
  if (coupon.type === 'fixed') return Math.min(subtotal, Math.max(0, val));
  return 0;
}

async function create({ code, type, value, min_order, active }) {
  const norm = String(code || '').trim().toUpperCase().slice(0, 30);
  const t = ['percent', 'fixed'].includes(type) ? type : 'percent';
  const rawV = Math.max(0, Number(value) || 0);
  const v = t === 'percent' ? Math.min(100, rawV) : rawV;
  const min = Math.max(0, Number(min_order) || 0);
  const act = db.isPg ? !!active : (active ? 1 : 0);

  const id = await db.insertReturningId(
    'INSERT INTO coupons (code, type, value, min_order, active) VALUES (?, ?, ?, ?, ?)',
    [norm, t, v, min, act]
  );
  return mapCoupon(await db.queryGet('SELECT * FROM coupons WHERE id=?', [id]));
}

async function toggle(id, active) {
  await db.execute('UPDATE coupons SET active=? WHERE id=?', [db.isPg ? !!active : (active ? 1 : 0), id]);
  return mapCoupon(await db.queryGet('SELECT * FROM coupons WHERE id=?', [id]));
}

async function incrementUses(id, runner = db) {
  await runner.execute('UPDATE coupons SET uses_count = uses_count + 1 WHERE id=?', [id]);
}

async function remove(id) {
  const r = await db.execute('DELETE FROM coupons WHERE id=?', [id]);
  return r.changes > 0;
}

module.exports = { findAll, findByCode, calculateDiscount, create, toggle, incrementUses, remove };
