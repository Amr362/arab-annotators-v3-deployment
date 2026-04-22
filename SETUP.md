# دليل الإعداد السريع — Arab Annotators

## متغيرات البيئة المطلوبة على Railway

```
DATABASE_URL=postgresql://...        # قاعدة البيانات (Railway PostgreSQL)
JWT_SECRET=your-random-secret-key    # مفتاح التشفير (أي نص عشوائي طويل)
ADMIN_EMAIL=admin@yourdomain.com     # بريد حساب المدير الأول
ADMIN_PASSWORD=StrongPassword123     # كلمة مرور المدير (6 أحرف على الأقل)
ADMIN_NAME=مدير النظام               # اسم المدير (اختياري)
```

## خطوات النشر على Railway

1. **إنشاء قاعدة بيانات PostgreSQL** من Railway Dashboard
2. **ربط القاعدة بالتطبيق** — Railway يضيف DATABASE_URL تلقائياً
3. **إضافة المتغيرات** المذكورة أعلاه في Settings → Variables
4. **نشر التطبيق** — Railway يبني من الـ Dockerfile تلقائياً

## عند أول تشغيل

الخادم يقوم تلقائياً بـ:
- تشغيل الـ migrations (إضافة أعمدة جديدة)
- إنشاء حساب المدير من `ADMIN_EMAIL` + `ADMIN_PASSWORD`

## تسجيل الدخول

**لا يوجد Google OAuth** — كل تسجيل الدخول بالبريد + كلمة المرور:

- **المدير**: `ADMIN_EMAIL` / `ADMIN_PASSWORD`
- **المصنفون**: يُنشأون من لوحة Admin → إدارة المستخدمون
- **مراجعو الجودة**: يُنشأون من لوحة Admin → إنشاء جماعي

## إنشاء مستخدمين

من لوحة الـ Admin:
1. **مستخدم واحد**: Admin → "مستخدم جديد"
2. **دُفعة**: Admin → "إنشاء جماعي" → اختر الدور والعدد → حمّل CSV بكلمات المرور

## بدون Railway (local dev)

```bash
cp .env.example .env   # أو اكتب المتغيرات يدوياً
pnpm install
pnpm dev
```

ثم افتح `http://localhost:3000`
