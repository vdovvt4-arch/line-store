# متجر أزياء لاين الرجالية (LINE Store)

متجر إلكتروني متكامل لمحل ملابس رجالية مع لوحة إدارة، مبني بـ Node.js ويدعم **Supabase (PostgreSQL)** للنشر السحابي الدائم، مع دعم **SQLite** تلقائياً للتشغيل المحلي.

## المتطلبات
- **Node.js 22.13+**
- حساب مجاني في **Supabase** (للنشر الدائم على السحابة).

## التشغيل المحلي
1. ثبّت الحزم:
   ```powershell
   npm install
   ```
2. (اختياري) انسخ `.env.example` إلى `.env` وأضف رابط `DATABASE_URL` الخاص بـ Supabase (أو اتركه فارغاً لاستخدام SQLite محلياً):
   ```powershell
   Copy-Item .env.example .env
   ```
3. شغّل الخادم:
   ```powershell
   node server.js
   ```
4. افتح المتصفح:
   - **لوحة الإدارة:** `http://localhost:3000/` (كلمة المرور الافتراضية: `line2026`)
   - **متجر الزبائن:** `http://localhost:3000/store/line` (قابل للتخصيص من الإعدادات)
   - **فحص صحة الخادم:** `http://localhost:3000/api/health`

## الربط بقاعدة بيانات Supabase والنشر على GitHub + Render
1. **إنشاء قاعدة البيانات في Supabase:**
   - أنشئ مشروعاً جديداً في [Supabase](https://supabase.com/dashboard).
   - من **Project Settings** ← **Database** ← **Connection string (URI)** انسخ رابط `DATABASE_URL` (واستبدل `[YOUR-PASSWORD]` بكلمة مرور قاعدة البيانات).
   - *(اختياري)* يمكنك تشغيل ملف [`supabase_schema.sql`](supabase_schema.sql) في SQL Editor، أو تركه للخادم الذي سينشئ الجداول والبيانات الأولية تلقائياً عند التشغيل الأول.

2. **رفع المشروع على GitHub:**
   - أنشئ مستودعاً جديداً على [GitHub](https://github.com/new) وارفع الملفات (بدون `node_modules/` و`.env` و`*.db`).

3. **النشر على Render:**
   - اربط المستودع في [Render](https://render.com) عبر `render.yaml` (`npm install --omit=dev` ثم `node server.js`).
   - أضف متغيري البيئة:
     - `DATABASE_URL`: رابط Supabase URI.
     - `ADMIN_PASSWORD`: كلمة مرور لوحة الإدارة.
