const db = require('../database');
const { parseJsonSafe } = require('../../utils/http');
const { finalPrice } = require('../../utils/validators');

function mapProduct(r) {
  if (!r) return null;
  const rawSizes = parseJsonSafe(r.sizes, []);
  const sizes = rawSizes.map(s => ({
    ...s,
    stock: s.stock !== undefined ? Math.max(0, Number(s.stock) || 0) : Math.max(0, Number(r.stock ?? 0)),
  }));
  const stock = sizes.length
    ? sizes.reduce((sum, s) => sum + s.stock, 0)
    : Math.max(0, Number(r.stock ?? 0));
  const low = Math.max(0, Number(r.low_stock_threshold ?? 3));
  const soldOut = r.sold_out === true || Number(r.sold_out) === 1 || stock <= 0;
  const fp = finalPrice(r);
  const cost = Math.max(0, Number(r.cost_price ?? 0));
  const unitProfit = fp - cost;
  return {
    ...r,
    id: Number(r.id),
    price: Number(r.price || 0),
    discount_value: Number(r.discount_value || 0),
    cost_price: cost,
    stock,
    low_stock_threshold: low,
    published: r.published === true || Number(r.published) === 1,
    sold_out: soldOut,
    available: !soldOut,
    low_stock: !soldOut && stock <= low,
    colors: parseJsonSafe(r.colors, []),
    sizes,
    images: parseJsonSafe(r.images, []),
    final_price: fp,
    unit_profit: unitProfit,
  };
}

async function findPublished() {
  const rows = await db.queryAll('SELECT * FROM products WHERE published=? ORDER BY id DESC', [db.isPg ? true : 1]);
  return rows.map(mapProduct);
}

async function findAll() {
  const rows = await db.queryAll('SELECT * FROM products ORDER BY id DESC');
  return rows.map(mapProduct);
}

async function findPublishedById(id) {
  return mapProduct(await db.queryGet('SELECT * FROM products WHERE id=? AND published=?', [id, db.isPg ? true : 1]));
}

async function findById(id) {
  return mapProduct(await db.queryGet('SELECT * FROM products WHERE id=?', [id]));
}

async function create(p) {
  const id = await db.insertReturningId(
    `INSERT INTO products (name, category, description, price, cost_price, discount_type, discount_value, stock, low_stock_threshold, colors, sizes, images, published, sold_out)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      p.name, p.category, p.description, p.price, p.cost_price, p.discount_type, p.discount_value,
      p.stock, p.low_stock_threshold, p.colors, p.sizes, p.images,
      db.isPg ? !!p.published : (p.published ? 1 : 0),
      db.isPg ? !!p.sold_out : (p.sold_out ? 1 : 0),
    ]
  );
  return await findById(id);
}

async function update(id, p) {
  const existing = await db.queryGet('SELECT id FROM products WHERE id=?', [id]);
  if (!existing) return null;

  await db.execute(
    `UPDATE products
     SET name=?, category=?, description=?, price=?, cost_price=?, discount_type=?, discount_value=?, stock=?, low_stock_threshold=?, colors=?, sizes=?, images=?, published=?, sold_out=?
     WHERE id=?`,
    [
      p.name, p.category, p.description, p.price, p.cost_price, p.discount_type, p.discount_value,
      p.stock, p.low_stock_threshold, p.colors, p.sizes, p.images,
      db.isPg ? !!p.published : (p.published ? 1 : 0),
      db.isPg ? !!p.sold_out : (p.sold_out ? 1 : 0),
      id,
    ]
  );
  return await findById(id);
}

async function updateInventory(id, patch) {
  const cur = await findById(id);
  if (!cur) return null;

  const sizes = cur.sizes.map(s => ({ ...s }));
  let sizesChanged = false;
  let stock = patch.stock !== undefined ? Math.max(0, parseInt(patch.stock, 10) || 0) : cur.stock;

  if (Array.isArray(patch.sizes) && sizes.length) {
    const byName = new Map(patch.sizes.map(s => [String(s.size || ''), Math.max(0, parseInt(s.stock, 10) || 0)]));
    for (const s of sizes) {
      if (byName.has(s.size)) {
        s.stock = byName.get(s.size);
        sizesChanged = true;
      }
    }
    if (sizesChanged) {
      stock = sizes.reduce((sum, s) => sum + s.stock, 0);
    }
  } else if (sizes.length && patch.stock !== undefined && stock !== cur.stock) {
    sizesChanged = true;
    if (stock === 0) {
      for (const s of sizes) s.stock = 0;
    } else if (cur.stock <= 0) {
      const base = Math.floor(stock / sizes.length);
      let rem = stock % sizes.length;
      for (const s of sizes) {
        s.stock = base + (rem > 0 ? 1 : 0);
        if (rem > 0) rem--;
      }
    } else {
      let remaining = stock;
      for (let i = 0; i < sizes.length; i++) {
        if (i === sizes.length - 1) {
          sizes[i].stock = Math.max(0, remaining);
        } else {
          const share = Math.round((sizes[i].stock / cur.stock) * stock);
          const clamped = Math.max(0, Math.min(remaining, share));
          sizes[i].stock = clamped;
          remaining -= clamped;
        }
      }
    }
  }

  const low = patch.low_stock_threshold !== undefined ? Math.max(0, parseInt(patch.low_stock_threshold, 10) || 0) : cur.low_stock_threshold;
  let soldOut = patch.sold_out !== undefined ? (patch.sold_out ? 1 : 0) : (cur.sold_out ? 1 : 0);
  if (stock <= 0) soldOut = 1;
  else if ((patch.stock !== undefined || sizesChanged) && patch.sold_out === undefined && cur.stock === 0 && stock > 0) soldOut = 0;

  const discountType = patch.discount_type !== undefined
    ? (['percent', 'fixed'].includes(patch.discount_type) ? patch.discount_type : 'none')
    : cur.discount_type;
  const discountValue = patch.discount_value !== undefined
    ? Math.max(0, Number(patch.discount_value) || 0)
    : cur.discount_value;

  await db.execute(
    `UPDATE products
     SET stock=?, low_stock_threshold=?, sold_out=?, discount_type=?, discount_value=?, sizes=?
     WHERE id=?`,
    [
      stock, low, db.isPg ? !!soldOut : soldOut, discountType, discountValue,
      sizesChanged ? JSON.stringify(sizes) : JSON.stringify(cur.sizes),
      id,
    ]
  );

  return await findById(id);
}

async function decrementStock(id, qty, size = '', runner = db) {
  const cur = await runner.queryGet('SELECT stock, sizes FROM products WHERE id=?', [id]);
  if (!cur) return;

  const sizes = parseJsonSafe(cur.sizes, []);
  if (sizes.length && size) {
    let changed = false;
    for (const s of sizes) {
      if (s.size === size) {
        const curSz = s.stock !== undefined ? Number(s.stock) : Number(cur.stock || 0);
        s.stock = Math.max(0, curSz - qty);
        changed = true;
      }
    }
    if (changed) {
      const nextTotal = sizes.reduce((sum, s) => sum + Math.max(0, Number(s.stock ?? 0)), 0);
      await runner.execute(
        'UPDATE products SET sizes=?, stock=?, sold_out=CASE WHEN ? <= 0 THEN ? ELSE sold_out END WHERE id=?',
        [JSON.stringify(sizes), nextTotal, nextTotal, db.isPg ? true : 1, id]
      );
      return;
    }
  }

  const next = Math.max(0, Number(cur.stock || 0) - qty);
  await runner.execute(
    'UPDATE products SET stock=?, sold_out=CASE WHEN ? <= 0 THEN ? ELSE sold_out END WHERE id=?',
    [next, next, db.isPg ? true : 1, id]
  );
}

async function incrementStock(id, qty, size = '', runner = db) {
  const cur = await runner.queryGet('SELECT stock, sizes FROM products WHERE id=?', [id]);
  if (!cur) return;

  const sizes = parseJsonSafe(cur.sizes, []);
  if (sizes.length && size) {
    let changed = false;
    for (const s of sizes) {
      if (s.size === size) {
        const curSz = s.stock !== undefined ? Number(s.stock) : Number(cur.stock || 0);
        s.stock = Math.max(0, curSz + qty);
        changed = true;
      }
    }
    if (changed) {
      const nextTotal = sizes.reduce((sum, s) => sum + Math.max(0, Number(s.stock ?? 0)), 0);
      await runner.execute(
        'UPDATE products SET sizes=?, stock=?, sold_out=CASE WHEN ? > 0 THEN ? ELSE sold_out END WHERE id=?',
        [JSON.stringify(sizes), nextTotal, nextTotal, db.isPg ? false : 0, id]
      );
      return;
    }
  }

  const next = Math.max(0, Number(cur.stock || 0) + qty);
  await runner.execute(
    'UPDATE products SET stock=?, sold_out=CASE WHEN ? > 0 THEN ? ELSE sold_out END WHERE id=?',
    [next, next, db.isPg ? false : 0, id]
  );
}

async function remove(id) {
  const r = await db.execute('DELETE FROM products WHERE id=?', [id]);
  return r.changes > 0;
}

module.exports = {
  findPublished, findAll, findPublishedById, findById,
  create, update, updateInventory, decrementStock, incrementStock, remove,
};
