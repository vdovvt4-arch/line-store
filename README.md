# متجر أزياء لاين الرجالية (LINE Store)

متجر إلكتروني ولوحة إدارة مبنيان على Node.js، مع Supabase Postgres لحفظ بيانات المنتجات والطلبات والعملاء والكوبونات والمصاريف والإعدادات، وSupabase Storage للصور.

## المتطلبات

- Node.js 22.13 أو أحدث.
- مشروع Supabase.

## إعداد Supabase

1. افتح SQL Editor في مشروع Supabase وشغّل `supabase/migrations/20260101000000_initial_schema.sql` مرة واحدة.
2. انسخ `.env.example` إلى `.env` وأضف قيم `SUPABASE_ANON_KEY` و`SUPABASE_SERVICE_ROLE_KEY` و`ADMIN_PASSWORD` من إعداداتك المحلية. لا تحفظ `.env` أو مفاتيح Supabase في Git.
3. يمكن تشغيل `supabase/seed.sql` اختيارياً لإضافة كوبون `LINE10`.

لا ينفّذ الخادم migrations تلقائياً، ولا يستورد ملف SQLite قديم. لا تضع مفتاح `service_role` في أي ملف داخل `public/`.

## التشغيل المحلي

```powershell
Copy-Item .env.example .env
node server.js
```

- المتجر: `http://localhost:3000/store`
- لوحة الإدارة: `http://localhost:3000/admin`
- فحص صحة الخادم وقاعدة البيانات: `http://localhost:3000/api/health`

يجب ضبط `ADMIN_PASSWORD` إلى كلمة مرور قوية قبل تسجيل الدخول. لا توجد كلمة مرور افتراضية.

## النشر على Render وGitHub Pages

1. انشر الخادم على Render باستخدام `render.yaml`. أضف `SUPABASE_ANON_KEY` و`SUPABASE_SERVICE_ROLE_KEY` كمتغيرات سرية في إعدادات الخدمة، واحتفظ بـ`ADMIN_PASSWORD` كسرّ. `SUPABASE_URL` و`CORS_ORIGINS` محددان في ملف Blueprint.
2. بعد نشر الخادم، افتح `public/config.js` وضع أصل الخادم في `API_ORIGIN`، مثال: `https://your-service.onrender.com` (دون `/api`). لا تضع مفاتيح Supabase في هذا الملف.
3. انشر ملفات `public/` إلى GitHub Pages. ملفات الواجهة لا تحتوي مفاتيح أو كلمات مرور.
4. يسمح الخادم افتراضياً بأصل `https://vdovvt4-arch.github.io`. أضف أي أصل آخر بدقة إلى `CORS_ORIGINS` في Render، مفصولاً بفواصل، ولا تستخدم `*`.

تظهر رسالة اتصال عربية في المتجر ولوحة الإدارة إذا لم يكن الخادم متاحاً أو لم يُضبط `API_ORIGIN`. يلزم تطبيق migration وإضافة مفاتيح الخادم قبل تشغيل الـAPI.
