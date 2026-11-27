const db = require('../db/database');
const productRepo = require('../db/repositories/productRepo');
const orderRepo = require('../db/repositories/orderRepo');
const customerRepo = require('../db/repositories/customerRepo');
const customerAccountRepo = require('../db/repositories/customerAccountRepo');
const reviewRepo = require('../db/repositories/reviewRepo');
const couponRepo = require('../db/repositories/couponRepo');
const settingsRepo = require('../db/repositories/settingsRepo');
const { createCustomerToken, getCustomerFromReq } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { AppError, json, readBody } = require('../utils/http');
const { normPhone } = require('../utils/validators');

async function handlePublicRoutes(req, res, method, pathname, url) {
  if (method === 'GET' && pathname === '/api/health') {
    return json(res, 200, { ok: true, db: db.isPg ? 'postgres' : 'sqlite', uptime: Math.round(process.uptime()) });
  }

  if (method === 'GET' && pathname === '/api/store') {
    const [settings, rawProducts, vipAccountNames, reviewStats] = await Promise.all([
      settingsRepo.get(),
      productRepo.findPublished(),
      customerAccountRepo.findVipNames(),
      reviewRepo.getStatsByProduct(),
    ]);
    const products = (settings.hide_sold_out
      ? rawProducts.filter(p => !p.sold_out)
      : rawProducts
    ).map(p => {
      const rs = reviewStats.get(p.id) || { count: 0, avg_rating: 0 };
      return { ...p, reviews_count: rs.count, avg_rating: rs.avg_rating };
    });
    const vip_names = [...new Set([...(settings.vip_customers || []), ...vipAccountNames])];
    return json(res, 200, { settings: { ...settings, vip_names }, products });
  }

  const revMatch = pathname.match(/^\/api\/products\/(\d+)\/reviews$/);
  if (revMatch) {
    const productId = Number(revMatch[1]);
    if (method === 'GET') {
      return json(res, 200, await reviewRepo.findByProductId(productId));
    }
    if (method === 'POST') {
      if (!rateLimit(req, 'review', 10, 600000)) {
        throw new AppError(429, 'محاولات كثيرة، حاول بعد قليل');
      }
      const product = await productRepo.findPublishedById(productId);
      if (!product) throw new AppError(404, 'المنتج غير موجود');
      const b = await readBody(req);
      const name = String(b.customer_name || '').trim();
      if (name.length < 2) throw new AppError(400, 'الرجاء كتابة اسمك');
      const review = await reviewRepo.create({
        product_id: productId,
        customer_name: name,
        rating: b.rating,
        comment: b.comment,
      });
      const stats = await reviewRepo.findByProductId(productId);
      return json(res, 201, { review, ...stats });
    }
  }

  if (method === 'POST' && pathname === '/api/auth/google') {
    if (!rateLimit(req, 'gauth', 20, 600000)) {
      throw new AppError(429, 'محاولات كثيرة، حاول بعد قليل');
    }
    const b = await readBody(req);
    const credential = String(b.credential || '').trim();
    if (!credential) throw new AppError(400, 'رمز التحقق من Google مفقود');

    const settings = await settingsRepo.get();
    const expectedAud = (settings.google_client_id || process.env.GOOGLE_CLIENT_ID || '').trim();
    if (!expectedAud) throw new AppError(400, 'تسجيل دخول Google غير مفعّل في إعدادات المتجر');

    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!verifyRes.ok) throw new AppError(401, 'فشل التحقق من حساب Google');
    const info = await verifyRes.json();
    if (info.aud !== expectedAud || (info.email_verified !== 'true' && info.email_verified !== true) || !info.email) {
      throw new AppError(401, 'بيانات حساب Google غير صالحة');
    }

    const user = await customerAccountRepo.upsertGoogle({
      email: info.email,
      sub: info.sub,
      name: info.name || info.email.split('@')[0],
      picture: info.picture || '',
    });
    const token = createCustomerToken(user.email);
    return json(res, 200, { token, user });
  }

  if (method === 'GET' && pathname === '/api/customer/me') {
    const email = getCustomerFromReq(req);
    if (!email) throw new AppError(401, 'يرجى تسجيل الدخول أولاً');
    const user = await customerAccountRepo.findByEmail(email);
    if (!user) throw new AppError(404, 'الحساب غير موجود');
    const orders = await orderRepo.findByCustomer(user.email, user.phone);
    return json(res, 200, { user, orders });
  }

  if (method === 'PUT' && pathname === '/api/customer/me') {
    const email = getCustomerFromReq(req);
    if (!email) throw new AppError(401, 'يرجى تسجيل الدخول أولاً');
    const b = await readBody(req);
    const phone = b.phone ? normPhone(b.phone) : '';
    if (b.phone && !phone) throw new AppError(400, 'رقم الهاتف غير صحيح (07xxxxxxxxx)');
    const user = await customerAccountRepo.updateProfile(email, {
      name: b.name,
      phone,
      governorate: b.governorate,
      address: b.address,
    });
    return json(res, 200, { user });
  }

  if (method === 'GET' && pathname === '/api/customer') {
    if (!rateLimit(req, 'customer', 60, 60000)) {
      throw new AppError(429, 'محاولات كثيرة، حاول بعد قليل');
    }
    const phone = normPhone(url.searchParams.get('phone'));
    if (!phone) return json(res, 200, { found: false });
    const customer = await customerRepo.findByPhone(phone);
    return json(res, 200, customer ? { found: true, ...customer } : { found: false });
  }

  if (method === 'GET' && pathname === '/api/orders/track') {
    if (!rateLimit(req, 'track', 30, 60000)) {
      throw new AppError(429, 'محاولات كثيرة، حاول بعد قليل');
    }
    const phone = normPhone(url.searchParams.get('phone'));
    if (!phone) throw new AppError(400, 'أدخل رقم هاتف صحيح (07xxxxxxxxx)');
    return json(res, 200, { orders: await orderRepo.findByPhone(phone) });
  }

  if (method === 'GET' && pathname === '/api/coupons/check') {
    const code = url.searchParams.get('code');
    const subtotal = Math.max(0, Number(url.searchParams.get('subtotal')) || 0);
    const coupon = await couponRepo.findByCode(code);
    if (!coupon || !coupon.active) {
      return json(res, 200, { valid: false, message: 'كود الخصم غير صالح أو متوقف' });
    }
    if (subtotal < Number(coupon.min_order || 0)) {
      return json(res, 200, { valid: false, message: `الحد الأدنى لاستخدام الكود هو ${coupon.min_order}` });
    }
    const discount = couponRepo.calculateDiscount(coupon, subtotal);
    return json(res, 200, {
      valid: true,
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      discount,
      message: `تم تطبيق كود ${coupon.code}`,
    });
  }

  if (method === 'POST' && pathname === '/api/orders') {
    if (!rateLimit(req, 'order', 10, 600000)) {
      throw new AppError(429, 'محاولات كثيرة، حاول بعد قليل');
    }

    const b = await readBody(req);
    const phone = normPhone(b.phone);
    if (!phone) throw new AppError(400, 'رقم الهاتف غير صحيح (مثال: 07xxxxxxxxx)');

    const name = String(b.name || '').trim();
    if (name.length < 2) throw new AppError(400, 'الرجاء كتابة الاسم');

    const settings = await settingsRepo.get();
    const gov = String(b.governorate || '');
    if (!(gov in settings.delivery)) throw new AppError(400, 'اختر المحافظة');

    const address = String(b.address || '').trim();
    if (!address) throw new AppError(400, 'الرجاء كتابة العنوان');

    const rawItems = Array.isArray(b.items) && b.items.length
      ? b.items.slice(0, 20)
      : [{ product_id: b.product_id, size: b.size, color: b.color, qty: b.qty || 1 }];

    const verifiedItems = [];
    const requestedTotalByProd = new Map();
    const requestedBySize = new Map();
    let subtotal = 0;
    let costTotal = 0;

    for (const item of rawItems) {
      const product = await productRepo.findPublishedById(Number(item.product_id));
      if (!product) throw new AppError(404, 'أحد المنتجات غير متوفر حالياً');
      if (product.sold_out || product.stock <= 0) {
        throw new AppError(400, `المنتج غير متوفر حالياً: ${product.name}`);
      }

      const qty = Math.min(20, Math.max(1, parseInt(item.qty, 10) || 1));
      const size = String(item.size || '');
      const prodTotal = (requestedTotalByProd.get(product.id) || 0) + qty;
      requestedTotalByProd.set(product.id, prodTotal);

      if (product.sizes.length) {
        const sizeObj = product.sizes.find(s => s.size === size);
        if (!sizeObj) throw new AppError(400, `اختر القياس للمنتج: ${product.name}`);
        if (sizeObj.stock <= 0) throw new AppError(400, `القياس (${size}) غير متوفر حالياً من: ${product.name}`);
        const szKey = `${product.id}:${size}`;
        const szTotal = (requestedBySize.get(szKey) || 0) + qty;
        requestedBySize.set(szKey, szTotal);
        if (szTotal > sizeObj.stock) {
          throw new AppError(400, `الكمية المتوفرة للقياس (${size}) من "${product.name}" هي ${sizeObj.stock} فقط`);
        }
      } else if (prodTotal > product.stock) {
        throw new AppError(400, `الكمية المتوفرة من "${product.name}" هي ${product.stock} فقط`);
      }

      const color = String(item.color || '');
      if (product.colors.length && !product.colors.includes(color)) {
        throw new AppError(400, `اختر اللون للمنتج: ${product.name}`);
      }

      subtotal += product.final_price * qty;
      costTotal += (Number(product.cost_price) || 0) * qty;
      verifiedItems.push({
        product_id: product.id,
        product_name: product.name,
        size,
        color,
        qty,
        price: product.final_price,
        cost_price: Number(product.cost_price) || 0,
      });
    }

    if (settings.min_order_amount > 0 && subtotal < settings.min_order_amount) {
      throw new AppError(400, `الحد الأدنى للطلب هو ${settings.min_order_amount} ${settings.currency}`);
    }

    let couponCode = '';
    let discountAmount = 0;
    let usedCouponId = null;
    const rawCoupon = String(b.coupon_code || '').trim();
    if (rawCoupon) {
      const coupon = await couponRepo.findByCode(rawCoupon);
      if (!coupon || !coupon.active) throw new AppError(400, 'كود الخصم غير صالح أو متوقف');
      if (subtotal < Number(coupon.min_order || 0)) {
        throw new AppError(400, `الحد الأدنى لاستخدام الكود هو ${coupon.min_order} ${settings.currency}`);
      }
      couponCode = coupon.code;
      discountAmount = couponRepo.calculateDiscount(coupon, subtotal);
      usedCouponId = coupon.id;
    }

    const afterDiscount = Math.max(0, subtotal - discountAmount);
    const orderProfit = afterDiscount - costTotal;
    let fee = Number(settings.delivery[gov]) || 0;
    if (settings.free_delivery_over > 0 && afterDiscount >= settings.free_delivery_over) {
      fee = 0;
    }
    const total = afterDiscount + fee;

    const first = verifiedItems[0];
    const summaryName = verifiedItems.length > 1
      ? `${first.product_name} (+${verifiedItems.length - 1} منتجات)`
      : first.product_name;

    const customerEmail = getCustomerFromReq(req) || '';

    const id = await db.withTransaction(async tx => {
      await customerRepo.upsert({ phone, name, governorate: gov, address }, tx);

      const newId = await orderRepo.create({
        product_id: first.product_id,
        product_name: summaryName,
        size: first.size,
        color: first.color,
        items: JSON.stringify(verifiedItems),
        customer_name: name,
        customer_email: customerEmail,
        phone,
        governorate: gov,
        address,
        measurements: '{}',
        sketch: '',
        note: String(b.note || '').trim().slice(0, 500),
        coupon_code: couponCode,
        discount_amount: discountAmount,
        price: subtotal,
        cost_total: costTotal,
        profit: orderProfit,
        delivery_fee: fee,
        total,
      }, tx);

      for (const item of verifiedItems) {
        await productRepo.decrementStock(item.product_id, item.qty, item.size, tx);
      }
      if (usedCouponId) await couponRepo.incrementUses(usedCouponId, tx);
      return newId;
    });

    return json(res, 201, {
      id,
      price: subtotal,
      discount_amount: discountAmount,
      delivery_fee: fee,
      total,
      items: verifiedItems,
    });
  }

  return false;
}

module.exports = { handlePublicRoutes };
