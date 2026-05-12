# Deployment Fixes — AnnotateOS v4

## تاريخ التحديث
**2026-05-12** — إصلاح مشاكل النشر على Railway

---

## المشاكل المكتشفة والإصلاحات

### 1. ملف `railway.toml` مفقود ❌ → ✅

**المشكلة:**
- المشروع لم يكن يحتوي على ملف `railway.toml` الذي يحدد إعدادات النشر على Railway
- هذا يؤدي إلى عدم معرفة Railway بكيفية بناء وتشغيل المشروع

**الإصلاح:**
- تم إنشاء ملف `railway.toml` جديد يحتوي على:
  - `builder = "dockerfile"` — استخدام Dockerfile للبناء
  - `startCommand = "pnpm start"` — أمر التشغيل الصحيح
  - `healthcheckPath = "/api/health"` — مسار فحص صحة الخادم
  - متغيرات البيئة الافتراضية

### 2. ملف `.env.example` غير محدث ❌ → ✅

**المشكلة:**
- ملف `.env.example` كان ينقصه عدة متغيرات بيئة مهمة
- لم تكن هناك توثيق واضحة لمتغيرات مثل `ADMIN_EMAIL`، `ADMIN_PASSWORD`، `SETUP_TOKEN`
- هذا يسبب التباسًا عند النشر

**الإصلاح:**
- تم تحديث `.env.example` ليشمل:
  - `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` — لإنشاء حساب المسؤول تلقائيًا
  - `SETUP_TOKEN` — لحماية نقطة نهاية الإعداد الأولية
  - `JWT_SECRET` — بديل لـ `SESSION_SECRET`
  - `DATABASE_PRIVATE_URL` — بديل لـ `DATABASE_URL` (مفيد على Railway)
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — لتسجيل الدخول عبر Google
  - `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY` — لواجهات برمجية متقدمة
  - `OWNER_OPEN_ID` — لترقية تلقائية للمسؤول
  - تعليقات توضيحية شاملة لكل متغير

### 3. مشاكل محتملة في الهجرات (Migrations)

**الملاحظة:**
- ملف `drizzle/meta/_journal.json` يحتوي على إدخال واحد فقط
- الملفات الأخرى مثل `0001_modern_wolf_cub.sql` إلى `0006_v4_state_machine.sql` موجودة لكن قد لا تكون مسجلة في السجل
- هذا قد يسبب مشاكل عند تشغيل الهجرات

**التوصية:**
- تشغيل `pnpm db:migrate` لتطبيق جميع الهجرات المفقودة
- أو استخدام `pnpm db:push` لمزامنة الحالة الحالية مع قاعدة البيانات

### 4. Dockerfile صحيح بالفعل ✅

**الملاحظة:**
- ملف `Dockerfile` يبدو صحيحًا:
  - يستخدم بناء متعدد المراحل (multi-stage)
  - ينسخ الملفات الثابتة من `builder` إلى `production`
  - يشغل الهجرات قبل بدء الخادم
  - يحتوي على healthcheck صحيح

---

## خطوات النشر على Railway

### 1. إنشاء مشروع Railway
```bash
railway init
```

### 2. إضافة خدمة PostgreSQL
```bash
railway add
# اختر PostgreSQL
```

### 3. تعيين متغيرات البيئة
```bash
railway variables set \
  ADMIN_EMAIL=admin@example.com \
  ADMIN_PASSWORD=your_secure_password \
  JWT_SECRET=your_long_random_secret_min_32_chars \
  NODE_ENV=production
```

### 4. نشر المشروع
```bash
railway up
```

---

## التحقق من النشر

### فحص صحة الخادم
```bash
curl https://your-railway-domain.up.railway.app/api/health
```

يجب أن تحصل على استجابة مثل:
```json
{
  "status": "ok",
  "version": "4.0.0",
  "timestamp": "2026-05-12T22:14:36.064Z",
  "uptime": 123
}
```

### فحص السجلات
```bash
railway logs
```

---

## ملاحظات مهمة

1. **متغيرات البيئة المطلوبة:**
   - `DATABASE_URL` أو `DATABASE_PRIVATE_URL` — Railway توفرها تلقائيًا
   - `SESSION_SECRET` أو `JWT_SECRET` — يجب تعيينها يدويًا

2. **الهجرات التلقائية:**
   - الخادم يشغل `pnpm db:migrate` تلقائيًا عند البدء
   - تأكد من أن `DATABASE_URL` صحيحة قبل النشر

3. **إنشاء حساب المسؤول:**
   - إذا لم يكن هناك مسؤول، يمكنك استخدام `/api/auth/setup` لإنشاء واحد
   - أو تعيين `ADMIN_EMAIL` و `ADMIN_PASSWORD` لإنشاء واحد تلقائيًا

4. **الملفات الثابتة:**
   - يتم بناء الواجهة الأمامية في `dist/public`
   - يتم نسخ جميع الملفات الضرورية في Dockerfile

---

## الملفات المعدلة

- ✅ `railway.toml` — **جديد**
- ✅ `.env.example` — **محدث**
- ✅ `DEPLOYMENT_FIXES.md` — **جديد** (هذا الملف)

---

## الخطوات التالية

1. اختبر النشر محليًا باستخدام Docker:
   ```bash
   docker build -t arab-annotators .
   docker run -e DATABASE_URL=postgresql://... -p 3000:3000 arab-annotators
   ```

2. تأكد من أن جميع متغيرات البيئة مضبوطة بشكل صحيح على Railway

3. راقب السجلات بعد النشر للتأكد من عدم وجود أخطاء

---

**آخر تحديث:** 2026-05-12
