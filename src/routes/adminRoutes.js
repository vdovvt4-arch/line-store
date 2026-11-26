const db = require('../db/database');
const { GOVERNORATES, ORDER_STATUSES } = require('../config');
const productRepo = require('../db/repositories/productRepo');
const orderRepo = require('../db/repositories/orderRepo');
const customerRepo = require('../db/repositories/customerRepo');
const customerAccountRepo = require('../db/repositories/customerAccountRepo');
const couponRepo = require('../db/repositories/couponRepo');
const expenseRepo = require('../db/repositories/expenseRepo');
const settingsRepo = require('../db/repositories/settingsRepo');
const { createSession, requireAdmin, revokeSession, setAdminPassword } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { AppError, json, readBody } = require('../utils/http');
const { cleanProduct } = require('../utils/validators');

async function handleAdminRoutes(req, res, method, pathname) {
  if (method === 'POST' && pathname === '/api/admin/login') {
    if (!rateLimit(req, 'login', 10, 600000)) {
      throw new AppError(429, 'محاولات دخول كثيرة، انتظر قليلاً');
    }
    const b = await readBody(req);
    const token = await createSession(b.password);
    return json(res, 200, { token });
  }

  if (!pathname.startsWith('/api/admin/')) return false;

  requireAdmin(req);

  if (method === 'POST' && pathname === '/api/admin/logout') {
    revokeSession(req);
    return json(res, 200, { ok: true });
  }

  if (method === 'GET' && pathname === '/api/admin/bootstrap') {
    const [products, orders, customers, customerAccounts, coupons, expenses, settings] = await Promise.all([
      productRepo.findAll(),
      orderRepo.findAll(),
      customerRepo.findAllWithStats(),
      customerAccountRepo.findAll(),
      couponRepo.findAll(),
      expenseRepo.findAll(),
      settingsRepo.get(),
    ]);
    return json(res, 200, {
      products,
      orders,
      customers,
      customerAccounts,
      coupons,
      expenses,
      settings,
      governorates: GOVERNORATES,
    });
  }

  if (method === 'PATCH' && pathname === '/api/admin/customer-accounts/vip') {
    const b = await readBody(req);
    if (!b.email) throw new AppError(400, 'البريد الإلكتروني مطلوب');
    const updated = await customerAccountRepo.setVip(b.email, !!b.is_vip);
    if (!updated) throw new AppError(404, 'الحساب غير موجود');
    return json(res, 200, updated);
  }

  if (method === 'POST' && pathname === '/api/admin/products') {
    const b = await readBody(req);
    const p = cleanProduct(b);
    if (!p.name) throw new AppError(400, 'اسم المنتج مطلوب');
    return json(res, 201, await productRepo.create(p));
  }

  const invMatch = pathname.match(/^\/api\/admin\/products\/(\d+)\/inventory$/);
  if (invMatch && method === 'PATCH') {
    const id = Number(invMatch[1]);
    const b = await readBody(req);
    const updated = await productRepo.updateInventory(id, b);
    if (!updated) throw new AppError(404, 'المنتج غير موجود');
    return json(res, 200, updated);
  }

  const prodMatch = pathname.match(/^\/api\/admin\/products\/(\d+)$/);
  if (prodMatch) {
    const id = Number(prodMatch[1]);
    if (method === 'PUT') {
      const b = await readBody(req);
      const p = cleanProduct(b);
      if (!p.name) throw new AppError(400, 'اسم المنتج مطلوب');
      const updated = await productRepo.update(id, p);
      if (!updated) throw new AppError(404, 'المنتج غير موجود');
      return json(res, 200, updated);
    }
    if (method === 'DELETE') {
      await productRepo.remove(id);
      return json(res, 200, { ok: true });
    }
  }

  const orderMatch = pathname.match(/^\/api\/admin\/orders\/(\d+)$/);
  if (orderMatch) {
    const id = Number(orderMatch[1]);
    if (method === 'PATCH') {
      const b = await readBody(req);
      const status = String(b.status || '');
      if (!ORDER_STATUSES.includes(status)) throw new AppError(400, 'حالة غير صالحة');
      const curOrder = await orderRepo.findById(id);
      if (!curOrder) throw new AppError(404, 'الطلب غير موجود');

      await db.withTransaction(async tx => {
        await orderRepo.updateStatus(id, status, tx);
        if (curOrder.status !== 'cancelled' && status === 'cancelled') {
          for (const item of curOrder.items) {
            if (item.product_id) await productRepo.incrementStock(item.product_id, Number(item.qty || 1), item.size || '', tx);
          }
        } else if (curOrder.status === 'cancelled' && status !== 'cancelled') {
          for (const item of curOrder.items) {
            if (item.product_id) await productRepo.decrementStock(item.product_id, Number(item.qty || 1), item.size || '', tx);
          }
        }
      });
      return json(res, 200, { ok: true, status });
    }
    if (method === 'DELETE') {
      const curOrder = await orderRepo.findById(id);
      if (!curOrder) throw new AppError(404, 'الطلب غير موجود');
      await db.withTransaction(async tx => {
        if (curOrder.status !== 'cancelled') {
          for (const item of curOrder.items) {
            if (item.product_id) await productRepo.incrementStock(item.product_id, Number(item.qty || 1), item.size || '', tx);
          }
        }
        await orderRepo.remove(id, tx);
      });
      return json(res, 200, { ok: true });
    }
  }

  if (method === 'POST' && pathname === '/api/admin/coupons') {
    const b = await readBody(req);
    if (!String(b.code || '').trim()) throw new AppError(400, 'كود الخصم مطلوب');
    try {
      return json(res, 201, await couponRepo.create(b));
    } catch {
      throw new AppError(400, 'كود الخصم مستخدم مسبقاً');
    }
  }

  const couponMatch = pathname.match(/^\/api\/admin\/coupons\/(\d+)$/);
  if (couponMatch) {
    const id = Number(couponMatch[1]);
    if (method === 'PATCH') {
      const b = await readBody(req);
      const updated = await couponRepo.toggle(id, !!b.active);
      if (!updated) throw new AppError(404, 'كود الخصم غير موجود');
      return json(res, 200, updated);
    }
    if (method === 'DELETE') {
      await couponRepo.remove(id);
      return json(res, 200, { ok: true });
    }
  }

  if (method === 'POST' && pathname === '/api/admin/expenses') {
    const b = await readBody(req);
    if (!String(b.title || '').trim()) throw new AppError(400, 'وصف المصروف مطلوب');
    return json(res, 201, await expenseRepo.create(b));
  }

  const expMatch = pathname.match(/^\/api\/admin\/expenses\/(\d+)$/);
  if (expMatch && method === 'DELETE') {
    await expenseRepo.remove(Number(expMatch[1]));
    return json(res, 200, { ok: true });
  }

  if (method === 'PUT' && pathname === '/api/admin/settings') {
    const b = await readBody(req);
    return json(res, 200, await settingsRepo.update(b));
  }

  if (method === 'POST' && pathname === '/api/admin/password') {
    const b = await readBody(req);
    await setAdminPassword(b.password);
    return json(res, 200, { ok: true });
  }

  throw new AppError(404, 'مسار غير موجود');
}

module.exports = { handleAdminRoutes };
