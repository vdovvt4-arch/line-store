# متجر أزياء لاين الرجالية (LINE Store)

متجر إلكتروني ولوحة إدارة يستخدمان Supabase Postgres لحفظ المنتجات والطلبات والعملاء والكوبونات والمصاريف والإعدادات، وSupabase Storage للصور. واجهات GitHub Pages تتصل بخادم API في Supabase Edge Functions؛ لا تحتاج الخدمة إلى Render أو بطاقة دفع.

## إعداد قاعدة البيانات

1. شغّل `supabase/migrations/20260101000000_initial_schema.sql` مرة واحدة إذا لم تكن قد طبقته.
2. شغّل `supabase/migrations/20261126000000_admin_sessions.sql` لإضافة تخزين جلسات الإدارة الآمن اللازم للـEdge Function.
3. يمكن تشغيل `supabase/seed.sql` اختيارياً لإضافة كوبون `LINE10`.

لا تنفّذ migrations تلقائياً من الخادم. لا تضع مفاتيح Supabase في Git أو أي ملف داخل `public/`.

## تشغيل Edge Function

- يتطلب المشروع Supabase CLI وDeno للاختبار والتشغيل المحلي. الإعداد في `supabase/config.toml` يعطّل فحص JWT على مستوى البوابة لهذه الدالة فقط؛ الدالة نفسها تتحقق من جلسة الإدارة وتفرض CORS على أصل GitHub Pages المحدد.
- ينشئ Supabase Edge Runtime متغير `SUPABASE_URL` ويمرر مفاتيح المشروع السرية عبر `SUPABASE_SECRET_KEYS`. تستخدم الدالة المفتاح الافتراضي على الخادم فقط، مع دعم الاسم القديم `SUPABASE_SERVICE_ROLE_KEY`. لا تنسخ `service_role` إلى الواجهة أو GitHub.
- اضبط `ADMIN_PASSWORD` كسرّ للدالة من إعدادات Supabase بعد مراجعة الكود. لا تحفظه في المستودع. جلسات الإدارة تحفظ بصمة الرمز في جدول `admin_sessions` وتنتهي بعد 12 ساعة.
- انشر الدالة بعد مراجعة التغييرات وتطبيق migration الجلسات:

  ```powershell
  supabase functions deploy store-api --project-ref diwdjdaikrlnsfrzthdx
  ```

- `public/config.js` يوجّه المتجر ولوحة الإدارة إلى `https://diwdjdaikrlnsfrzthdx.supabase.co/functions/v1/store-api`. انشر ملفات `public/` إلى GitHub Pages بعد مراجعتها.
- افحص جاهزية API من `https://diwdjdaikrlnsfrzthdx.supabase.co/functions/v1/store-api/api/health`.

للتشغيل المحلي، أنشئ `supabase/functions/.env` محلياً فقط وضع فيه `ADMIN_PASSWORD`، ثم استخدم `supabase functions serve store-api --env-file supabase/functions/.env`. اختبر بـ`deno test --allow-env supabase/functions/store-api/index_test.ts`. لا ترفع ملف `.env`.

## حدود الخطة المجانية

تنطبق حصص Supabase المجانية وحدود استخدام Edge Functions وStorage وقاعدة البيانات. قد تُوقَف المشاريع المجانية غير النشطة وفق سياسة Supabase الحالية؛ راقب الاستخدام وحالة المشروع من لوحة Supabase. لا توجد ضمانة تشغيل دائم على الخطة المجانية.

## خادم Node.js الاختياري

`server.js` و`render.yaml` ما زالا متاحين لمسار استضافة Node منفصل. هذا المسار ليس مطلوباً لتشغيل Edge Function، ويستخدم متغيرات `.env.example` عند تشغيله محلياً. لا تخلط أسرار خادم Node مع `public/config.js`.
