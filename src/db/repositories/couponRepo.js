const db = require('../supabase');

function mapCoupon(row) {
  return row ? { ...row, active: Boolean(row.active) } : null;
}

async function findAll() {
  return (await db.selectRows('coupons', { order: 'id.desc' })).map(mapCoupon);
}

async function findByCode(code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return null;
  return mapCoupon(await db.selectOne('coupons', {
    select: 'id,code,type,value,min_order,active',
    code: `eq.${normalized}`,
  }, { role: 'anon' }));
}

function calculateDiscount(coupon, subtotal) {
  if (!coupon || !coupon.active) return 0;
  if (subtotal < Number(coupon.min_order || 0)) return 0;
  const value = Number(coupon.value || 0);
  if (coupon.type === 'percent') return Math.min(subtotal, Math.round(subtotal * (Math.min(value, 100) / 100)));
  if (coupon.type === 'fixed') return Math.min(subtotal, Math.max(0, value));
  return 0;
}

async function create({ code, type, value, min_order, active }) {
  const normalized = String(code || '').trim().toUpperCase().slice(0, 30);
  return mapCoupon(await db.insertOne('coupons', {
    code: normalized,
    type: ['percent', 'fixed'].includes(type) ? type : 'percent',
    value: Math.max(0, Number(value) || 0),
    min_order: Math.max(0, Number(min_order) || 0),
    active: Boolean(active),
  }));
}

async function toggle(id, active) {
  return mapCoupon(await db.updateOne('coupons', { id: `eq.${id}` }, { active: Boolean(active) }));
}

async function remove(id) {
  return (await db.deleteRows('coupons', { id: `eq.${id}` })) > 0;
}

module.exports = { findAll, findByCode, calculateDiscount, create, toggle, remove };
