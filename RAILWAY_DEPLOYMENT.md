# نشر Arab Annotators على Railway 🚀

دليل شامل لنشر منصة Arab Annotators على Railway مع Auto-Deploy من GitHub.

## المتطلبات الأساسية

- ✅ حساب Railway (https://railway.app)
- ✅ حساب GitHub مع المستودع
- ✅ بيانات قاعدة البيانات

## خطوات النشر

### الخطوة 1: إنشاء مشروع جديد على Railway

1. اذهب إلى [railway.app](https://railway.app)
2. انقر على **"Create New Project"**
3. اختر **"Deploy from GitHub repo"**
4. ربط حسابك على GitHub (إذا لم تكن قد فعلت ذلك)
5. اختر المستودع: **`arab-annotators-platform`**
6. اختر الفرع: **`main`**

### الخطوة 2: إضافة قاعدة البيانات

#### استخدام قاعدة بيانات Supabase (موصى به)

1. اذهب إلى مشروعك في [Supabase](https://supabase.com)
2. اذهب إلى **Project Settings** → **Database**
3. ابحث عن **Connection string** واختر **URI**
4. انسخ الرابط (تأكد من استبدال `[YOUR-PASSWORD]` بكلمة مرور قاعدة البيانات)
5. في Railway، اذهب إلى **Variables** وأضف `DATABASE_URL` والصق الرابط هناك.

#### أو إضافة قاعدة بيانات PostgreSQL مباشرة في Railway

1. في لوحة التحكم، انقر على **"Add"**
2. اختر **"Database"** → **"PostgreSQL"**
3. انقر على **"Deploy"** (سيقوم Railway بربطها تلقائياً)

### الخطوة 3: إضافة متغيرات البيئة

في لوحة التحكم، اذهب إلى **"Variables"** وأضف:

```env
# قاعدة البيانات (سيتم ملؤها تلقائياً من Railway)
DATABASE_URL=postgresql://user:password@host:5432/dbname

# الأمان
JWT_SECRET=your-super-secret-key-change-this-in-production
NODE_ENV=production

# التطبيق
VITE_APP_TITLE=Arab Annotators
VITE_APP_LOGO=https://your-logo-url.png

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
VITE_GOOGLE_CLIENT_ID=your-google-client-id

### إعداد Google OAuth (هام جداً)
يجب إضافة رابط الـ Callback التالي في إعدادات Google Cloud Console تحت "Authorized redirect URIs":
`https://arab-annotators-production-011d.up.railway.app/api/oauth/callback`

# API Keys
BUILT_IN_FORGE_API_KEY=your-api-key
VITE_FRONTEND_FORGE_API_KEY=your-frontend-key
```

### الخطوة 4: تكوين الخادم

1. اذهب إلى **"Settings"** للخدمة الرئيسية
2. تأكد من:
   - **Start Command**: `pnpm start`
   - **Build Command**: `pnpm build`
   - **Port**: `3000`

### الخطوة 5: تفعيل Auto-Deploy

1. اذهب إلى **"Deployments"**
2. تأكد من تفعيل **"Auto Deploy"** عند كل push إلى `main`
3. اختياري: فعّل **"Automatic Deploys on Push"**

### الخطوة 6: النشر الأول

```bash
# من جهازك المحلي
git add .
git commit -m "Ready for Railway deployment"
git push origin main
```

Railway سيبدأ النشر تلقائياً!

## المراقبة والصيانة

### عرض السجلات

```bash
# في لوحة Railway
Deployments → Logs
```

### إعادة تشغيل الخادم

```bash
# في لوحة Railway
Deployments → Restart
```

### تحديث متغيرات البيئة

1. اذهب إلى **"Variables"**
2. عدّل القيمة
3. انقر **"Save"**
4. Railway سيعيد تشغيل الخادم تلقائياً

## استكشاف الأخطاء

### المشكلة: البناء يفشل

**السبب المحتمل**: مشاكل في الاعتماديات

**الحل**:
```bash
# تأكد من أن package.json صحيح
pnpm install --frozen-lockfile

# اختبر البناء محلياً
pnpm build
```

### المشكلة: قاعدة البيانات لا تتصل

**السبب المحتمل**: `DATABASE_URL` غير صحيح

**الحل**:
1. انسخ `DATABASE_URL` من متغيرات قاعدة البيانات في Railway
2. الصقه في متغيرات التطبيق
3. أعد تشغيل الخادم

### المشكلة: الخادم يتوقف بعد الانتشار

**السبب المحتمل**: خطأ في البدء

**الحل**:
1. افحص السجلات في **"Deployments → Logs"**
2. تأكد من أن جميع متغيرات البيئة موجودة
3. تأكد من أن قاعدة البيانات تعمل

### المشكلة: الموقع بطيء جداً

**السبب المحتمل**: موارد محدودة

**الحل**:
1. اذهب إلى **"Settings"**
2. زيادة **"Memory"** و **"CPU"**
3. أضف **"Replicas"** إضافية

## الأوامر المفيدة

### تشغيل الهجرات يدويًا

```bash
# عبر Railway CLI
railway run pnpm db:push
```

### إعادة تعيين قاعدة البيانات

```bash
# ⚠️ تحذير: هذا سيحذف جميع البيانات
railway run pnpm db:reset
```

### عرض السجلات الحية

```bash
railway logs --follow
```

## الأمان 🔒

### قبل النشر للإنتاج

- [ ] غيّر `JWT_SECRET` إلى قيمة قوية
- [ ] فعّل HTTPS (Railway يفعلها تلقائياً)
- [ ] استخدم كلمات مرور قوية لقاعدة البيانات
- [ ] فعّل SSL للاتصال بقاعدة البيانات
- [ ] قيّد الوصول إلى المتغيرات الحساسة
- [ ] استخدم متغيرات بيئة منفصلة للإنتاج

## النسخ الاحتياطية

### نسخ احتياطية من قاعدة البيانات

```bash
# في Railway
Database → Backups → Create Backup
```

### تصدير البيانات

```bash
# عبر Railway CLI
railway run pg_dump -U user dbname > backup.sql
```

## الأداء والتحسين

### تحسين الأداء

1. **تفعيل Caching**: أضف Redis من Railway
2. **تحسين الاستعلامات**: استخدم indexes في قاعدة البيانات
3. **CDN**: استخدم Cloudflare أو Railway CDN
4. **Compression**: فعّل gzip في Express

### مراقبة الأداء

```bash
# في لوحة Railway
Metrics → CPU, Memory, Network
```

## الدعم والمساعدة

- 📚 [توثيق Railway](https://docs.railway.app)
- 💬 [مجتمع Railway](https://discord.gg/railway)
- 🐛 [تقرير الأخطاء](https://github.com/Amr362/arab-annotators-platform/issues)

---

**ملاحظة**: Railway توفر 500 ساعة مجانية شهرياً. للمشاريع الإنتاجية، قد تحتاج إلى خطة مدفوعة.

آخر تحديث: مارس 2026
