const db = require('../supabase');
const { finalPrice } = require('../../utils/validators');

function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapProduct(row) {
  if (!row) return null;
  const sizes = parseArray(row.sizes).map(size => ({
    ...size,
    stock: size.stock !== undefined ? Math.max(0, Number(size.stock) || 0) : Math.max(0, Number(row.stock ?? 0)),
  }));
  const stock = sizes.length
    ? sizes.reduce((sum, size) => sum + size.stock, 0)
    : Math.max(0, Number(row.stock ?? 0));
  const low = Math.max(0, Number(row.low_stock_threshold ?? 3));
  const soldOut = Boolean(row.sold_out) || stock <= 0;
  const price = finalPrice(row);

  return {
    ...row,
    cost_price: Math.max(0, Number(row.cost_price ?? 0)),
    stock,
    low_stock_threshold: low,
    published: Boolean(row.published),
    sold_out: soldOut,
    available: !soldOut,
    low_stock: !soldOut && stock <= low,
    colors: parseArray(row.colors),
    sizes,
    images: parseArray(row.images),
    final_price: price,
    unit_profit: price - Math.max(0, Number(row.cost_price ?? 0)),
  };
}

async function findPublished() {
  const columns = 'id,name,category,description,price,discount_type,discount_value,stock,low_stock_threshold,colors,sizes,images,published,sold_out,created_at';
  const rows = await db.selectRows('products', {
    select: columns,
    published: 'eq.true',
    order: 'id.desc',
  }, { role: 'anon' });
  return rows.map(mapProduct);
}

async function findAll() {
  return (await db.selectRows('products', { order: 'id.desc' })).map(mapProduct);
}

async function findPublishedById(id) {
  return mapProduct(await db.selectOne('products', {
    id: `eq.${id}`,
    published: 'eq.true',
  }));
}

async function findById(id) {
  return mapProduct(await db.selectOne('products', { id: `eq.${id}` }));
}

async function create(product) {
  return mapProduct(await db.insertOne('products', product));
}

async function update(id, product) {
  return mapProduct(await db.updateOne('products', { id: `eq.${id}` }, product));
}

async function updateInventory(id, patch) {
  const current = await findById(id);
  if (!current) return null;

  const stock = patch.stock !== undefined ? Math.max(0, parseInt(patch.stock, 10) || 0) : current.stock;
  const low = patch.low_stock_threshold !== undefined
    ? Math.max(0, parseInt(patch.low_stock_threshold, 10) || 0)
    : current.low_stock_threshold;
  let soldOut = patch.sold_out !== undefined ? Boolean(patch.sold_out) : current.sold_out;
  if (stock <= 0) soldOut = true;
  else if (patch.stock !== undefined && patch.sold_out === undefined && current.stock === 0) soldOut = false;

  const discountType = patch.discount_type !== undefined
    ? (['percent', 'fixed'].includes(patch.discount_type) ? patch.discount_type : 'none')
    : current.discount_type;
  const discountValue = patch.discount_value !== undefined
    ? Math.max(0, Number(patch.discount_value) || 0)
    : current.discount_value;

  return mapProduct(await db.updateOne('products', { id: `eq.${id}` }, {
    stock,
    low_stock_threshold: low,
    sold_out: soldOut,
    discount_type: discountType,
    discount_value: discountValue,
  }));
}

async function remove(id) {
  return (await db.deleteRows('products', { id: `eq.${id}` })) > 0;
}

module.exports = {
  findPublished,
  findAll,
  findPublishedById,
  findById,
  create,
  update,
  updateInventory,
  remove,
};
