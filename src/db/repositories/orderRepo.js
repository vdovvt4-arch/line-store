const db = require('../supabase');

function mapOrder(row) {
  if (!row) return null;
  const items = Array.isArray(row.items) ? row.items : [];
  return {
    ...row,
    cost_total: Number(row.cost_total || 0),
    profit: Number(row.profit || 0),
    measurements: row.measurements && typeof row.measurements === 'object' ? row.measurements : {},
    items: items.length ? items : [{
      product_id: row.product_id,
      product_name: row.product_name,
      size: row.size,
      color: row.color,
      qty: 1,
      price: row.price,
      cost_price: 0,
    }],
  };
}

async function findAll() {
  return (await db.selectRows('orders', { order: 'id.desc' })).map(mapOrder);
}

async function findByPhone(phone) {
  const rows = await db.selectRows('orders', {
    select: 'id,product_id,product_name,size,color,items,governorate,coupon_code,discount_amount,price,delivery_fee,total,status,created_at',
    phone: `eq.${phone}`,
    order: 'id.desc',
    limit: 20,
  });
  return rows.map(mapOrder);
}

async function create(order) {
  const id = await db.rpc('place_order', {
    p_order: {
      product_id: order.product_id,
      product_name: order.product_name,
      size: order.size,
      color: order.color,
      items: order.items,
      customer_name: order.customer_name,
      phone: order.phone,
      governorate: order.governorate,
      address: order.address,
      measurements: order.measurements,
      sketch: order.sketch,
      note: order.note,
      coupon_code: order.coupon_code,
      discount_amount: order.discount_amount,
      price: order.price,
      cost_total: order.cost_total,
      profit: order.profit,
      delivery_fee: order.delivery_fee,
      total: order.total,
    },
    p_customer: order.customer,
    p_items: order.items_for_stock,
    p_coupon_id: order.coupon_id,
  });
  return Number(id);
}

async function updateStatus(id, status) {
  return Boolean(await db.updateOne('orders', { id: `eq.${id}` }, { status }));
}

async function remove(id) {
  return (await db.deleteRows('orders', { id: `eq.${id}` })) > 0;
}

module.exports = { findAll, findByPhone, create, updateStatus, remove };
