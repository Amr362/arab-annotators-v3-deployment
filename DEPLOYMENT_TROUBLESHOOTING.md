# Deployment Troubleshooting Guide — AnnotateOS v4

## تاريخ التحديث
**2026-05-15** — إصلاح شامل لمشاكل الاتصال والنشر على Railway

---

## المشاكل التي تم إصلاحها

### 1. تضارب في المنافذ (Port Mismatch) ✅

**المشكلة:**
- `railway.toml` كان يحدد `PORT = 5000`
- `Dockerfile` كان يحدد `ENV PORT=5000` و `EXPOSE 5000`
- لكن `.env.example` و `docker-compose.yml` و `nginx.conf` كانت تتوقع المنفذ `3000`
- هذا التضارب يسبب فشل الاتصال والتطبيق لا يستجيب

**الإصلاح:**
- تم توحيد جميع الملفات لاستخدام المنفذ **3000**
- تم تحديث:
  - `railway.toml`: `PORT = "3000"`
  - `Dockerfile`: `ENV PORT=3000` و `EXPOSE 3000`
  - `.env.example`: `PORT=3000` مع تعليقات توضيحية

### 2. مشكلة في أمر البدء (Start Command) ✅

**المشكلة:**
- `railway.toml` كان يحدد `startCommand = "node dist/index.js"`
- لم يكن يعيّن `NODE_ENV=production` بشكل صحيح
- هذا يسبب تشغيل الخادم في وضع التطوير بدلاً من الإنتاج

**الإصلاح:**
- تم تحديث `railway.toml` ليحدد: `startCommand = "NODE_ENV=production node dist/index.js"`
- تم تحديث `Dockerfile` ليحدد: `CMD ["sh", "-c", "NODE_ENV=production node dist/index.js"]`

### 3. مشكلة في مخرجات البناء (Build Output) ✅

**المشكلة:**
- الخادم في الإنتاج يتوقع الملفات الثابتة في `dist/public`
- إذا كانت هذه المجلدة فارغة أو مفقودة، سيحاول الخادم تقديم ملفات غير موجودة
- هذا يسبب أخطاء 404 أو 500

**الإصلاح:**
- تم تحسين `Dockerfile` لنسخ المزيد من الملفات الضرورية
- تم إضافة فحص للتأكد من وجود `dist/public` وإنشاء fallback إذا لم تكن موجودة
- تم تحسين `serveStatic()` في `server/_core/vite.ts` لمعالجة الأخطاء بشكل أفضل

### 4. معالجة الأخطاء غير كافية ✅

**المشكلة:**
- الخادم لم يكن يسجل أخطاء واضحة عند فشل البدء
- عند فشل الاتصال بقاعدة البيانات أو عدم توفر الملفات، كانت الرسائل غير واضحة

**الإصلاح:**
- تم إضافة معالجة أفضل للأخطاء في `server/_core/index.ts`
- تم إضافة معالج `server.on('error')` لتسجيل أخطاء المنفذ والخادم
- تم تحسين `serveStatic()` لتسجيل أخطاء واضحة عند فقدان الملفات
- تم إضافة تحذيرات في `server/_core/env.ts` عند فقدان متغيرات البيئة المهمة

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

### 3. تعيين متغيرات البيئة المطلوبة
```bash
railway variables set \
  NODE_ENV=production \
  PORT=3000 \
  ADMIN_EMAIL=admin@example.com \
  ADMIN_PASSWORD=your_secure_password \
  SESSION_SECRET=your_long_random_secret_min_32_chars
```

### 4. نشر المشروع
```bash
railway up
```

---

## التحقق من النشر

### 1. فحص صحة الخادم
```bash
curl https://your-railway-domain.up.railway.app/api/health
```

يجب أن تحصل على استجابة مثل:
```json
{
  "status": "ok",
  "timestamp": "2026-05-15T19:39:47.949Z"
}
```

### 2. فحص السجلات
```bash
railway logs
```

ابحث عن الرسائل التالية:
- `✅ Server running on port 3000` — الخادم يعمل بشكل صحيح
- `[Database] Connected successfully` — الاتصال بقاعدة البيانات نجح
- `[Bootstrap] Admin user ... ensured` — تم إنشاء حساب المسؤول

### 3. الوصول إلى التطبيق
افتح `https://your-railway-domain.up.railway.app` في المتصفح

---

## استكشاف الأخطاء الشائعة

### خطأ: "Connection refused" أو "Application not available"

**الأسباب المحتملة:**
1. المنفذ غير صحيح (تأكد من أن جميع الملفات تستخدم المنفذ 3000)
2. الخادم لم ينته من البدء بعد (انتظر 30-60 ثانية)
3. قاعدة البيانات لم تتصل بنجاح

**الحل:**
```bash
# فحص السجلات
railway logs

# ابحث عن أخطاء مثل:
# [Database] Connection Failed
# [Startup] Port 3000 is already in use
# Could not find the build directory
```

### خطأ: "Build output missing"

**الأسباب المحتملة:**
1. البناء لم ينته بنجاح
2. ملفات البناء لم تُنسخ بشكل صحيح في Docker

**الحل:**
```bash
# أعد بناء الصورة محليًا
docker build -t arab-annotators .

# تحقق من وجود dist/public
docker run -it arab-annotators ls -la dist/public
```

### خطأ: "Database connection failed"

**الأسباب المحتملة:**
1. `DATABASE_URL` أو `DATABASE_PRIVATE_URL` غير صحيحة
2. قاعدة البيانات لم تبدأ بعد

**الحل:**
```bash
# تحقق من متغيرات البيئة
railway variables

# تأكد من أن DATABASE_URL موجودة وصحيحة
# إذا كنت تستخدم Railway PostgreSQL، يجب أن تكون مثل:
# postgresql://user:password@host:5432/dbname
```

### خطأ: "Port 3000 is already in use"

**الحل:**
```bash
# قتل العملية التي تستخدم المنفذ
lsof -i :3000
kill -9 <PID>

# أو استخدم منفذ مختلف
PORT=3001 npm start
```

---

## ملفات تم تعديلها

| الملف | التغيير | الحالة |
|------|--------|--------|
| `railway.toml` | توحيد المنفذ على 3000 وتحسين أمر البدء | ✅ |
| `Dockerfile` | توحيد المنفذ على 3000 وتحسين نسخ الملفات | ✅ |
| `server/_core/index.ts` | إضافة معالجة أخطاء أفضل | ✅ |
| `server/_core/vite.ts` | تحسين معالجة الأخطاء في serveStatic | ✅ |
| `server/_core/env.ts` | إضافة تحذيرات عند فقدان متغيرات البيئة | ✅ |
| `.env.example` | تحسين التعليقات والتوثيق | ✅ |

---

## الملاحظات المهمة

1. **متغيرات البيئة المطلوبة:**
   - `DATABASE_URL` أو `DATABASE_PRIVATE_URL` — Railway توفرها تلقائيًا
   - `SESSION_SECRET` أو `JWT_SECRET` — يجب تعيينها يدويًا
   - `NODE_ENV=production` — يجب تعيينها على Railway

2. **المنفذ:**
   - جميع الملفات الآن تستخدم المنفذ **3000**
   - Railway قد توفر متغير `PORT` خاص بها، وسيتم استخدامه تلقائيًا

3. **الهجرات التلقائية:**
   - الخادم يشغل الهجرات تلقائيًا عند البدء
   - تأكد من أن `DATABASE_URL` صحيحة قبل النشر

4. **الملفات الثابتة:**
   - يتم بناء الواجهة الأمامية في `dist/public`
   - يتم نسخ جميع الملفات الضرورية في Dockerfile
   - إذا كانت `dist/public` فارغة، سيتم إنشاء fallback تلقائيًا

---

## الخطوات التالية

1. **اختبر محليًا:**
   ```bash
   docker build -t arab-annotators .
   docker run -e DATABASE_URL=postgresql://... -e SESSION_SECRET=your_secret -p 3000:3000 arab-annotators
   ```

2. **تأكد من جميع متغيرات البيئة على Railway**

3. **راقب السجلات بعد النشر:**
   ```bash
   railway logs -f
   ```

---

**آخر تحديث:** 2026-05-15
