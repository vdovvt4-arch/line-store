const db = require('../supabase');

async function findByPhone(phone) {
  return db.selectOne('customers', {
    select: 'phone,name,governorate,address',
    phone: `eq.${phone}`,
  });
}

async function upsert(customer) {
  return db.upsertOne('customers', customer, 'phone');
}

async function findAllWithStats() {
  const [customers, orders] = await Promise.all([
    db.selectRows('customers', { order: 'created_at.desc' }),
    db.selectRows('orders', { select: 'phone,status,total' }),
  ]);
  const stats = new Map();
  for (const order of orders) {
    const current = stats.get(order.phone) || { orders_count: 0, total_spent: 0 };
    current.orders_count += 1;
    if (order.status !== 'cancelled') current.total_spent += Number(order.total) || 0;
    stats.set(order.phone, current);
  }
  return customers.map(customer => ({
    ...customer,
    ...(stats.get(customer.phone) || { orders_count: 0, total_spent: 0 }),
  }));
}

module.exports = { findByPhone, upsert, findAllWithStats };
