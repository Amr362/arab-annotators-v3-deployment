# Arab Annotators Platform 🏺

منصة احترافية لتصنيف وتعليق البيانات العربية باستخدام **Label Studio** مع لوحة تحكم متقدمة للمشرفين ونظام إدارة شامل للمستخدمين والمشاريع.

## المميزات الرئيسية ✨

### 🎯 التصنيف المزدوج (Dual Annotation)
- كل جملة يتم توسيمها من موسمين مستقلين
- نظام QA متقدم لمراجعة التوسيمات
- حساب معدل الاتفاق بين الموسمين (IAA)

### 👥 نظام الأدوار المتعدد
- **المشرف (Admin)**: إدارة المستخدمين والمشاريع والإحصائيات
- **الموسم (Tasker)**: توسيم البيانات عبر Label Studio
- **مراجع الجودة (QA)**: مراجعة التوسيمات وحل النزاعات
- **مدير المشروع (PM)**: التقارير والتواصل مع العميل

### 📊 الإحصائيات والتقارير
- لوحات إحصائيات فورية
- تتبع التقدم الكلي
- معدلات الدقة والاتفاق
- تقارير مفصلة قابلة للتصدير

### 🔔 الإشعارات الذكية
- إشعارات تلقائية عند إكمال نسب معينة (25%, 50%, 75%, 100%)
- تنبيهات جودة عند اكتشاف مشاكل
- تغذية راجعة للموسمين من فريق QA

### 🤖 تكامل LLM
- اقتراحات تصنيف ذكية بناءً على الأنماط السابقة
- تسريع عملية التصنيف
- تحسين الاتساق بين الموسمين

### 📤 التصدير المتقدم
- تصدير بصيغ متعددة (JSON, CSV, Excel)
- إحصائيات تفصيلية عن الجودة
- معدلات الاتفاق بين المصنفين

## البنية التقنية 🏗️

```
Frontend (React 19 + Tailwind 4)
    ↓
tRPC API (Type-safe RPC)
    ↓
Backend (Express 4)
    ↓
Database (PostgreSQL)
    ↓
Label Studio (Annotation UI)
```

### المكونات الرئيسية

| المكون | الوصف |
|-------|-------|
| **Label Studio** | واجهة التوسيم المتقدمة |
| **Admin Dashboard** | لوحة تحكم المشرف |
| **Tasker Dashboard** | لوحة الموسم |
| **QA Dashboard** | لوحة مراجع الجودة |
| **tRPC Procedures** | واجهات برمجية آمنة النوع |
| **Drizzle ORM** | إدارة قاعدة البيانات |

## المتطلبات 📋

- Node.js 18+
- Docker & Docker Compose
- PostgreSQL 12+
- Railway Account (للنشر)

## التثبيت المحلي 🚀

### 1. استنساخ المستودع
```bash
git clone https://github.com/your-username/arab-annotators-platform.git
cd arab-annotators-platform
```

### 2. تثبيت الاعتماديات
```bash
pnpm install
```

### 3. إعداد متغيرات البيئة
```bash
cp .env.example .env.local
# قم بتحرير .env.local وأضف بيانات قاعدة البيانات
```

### 4. تشغيل قاعدة البيانات
```bash
docker-compose up -d db
```

### 5. تطبيق الهجرات
```bash
pnpm db:push
```

### 6. تشغيل الخادم
```bash
pnpm dev
```

الموقع سيكون متاحاً على `http://localhost:3000`

## النشر على Railway 🚀

### الطريقة الأولى: عبر واجهة Railway

1. اذهب إلى [railway.app](https://railway.app)
2. انقر على "Create Project"
3. اختر "Deploy from GitHub"
4. اختر هذا المستودع
5. أضف متغيرات البيئة المطلوبة
6. انقر على "Deploy"

### الطريقة الثانية: عبر Railway CLI

```bash
# تثبيت Railway CLI
npm install -g @railway/cli

# تسجيل الدخول
railway login

# إنشاء مشروع جديد
railway init

# نشر المشروع
railway up
```

### متغيرات البيئة المطلوبة

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname
JWT_SECRET=your-secret-key-here
NODE_ENV=production
VITE_APP_TITLE=Arab Annotators
VITE_APP_LOGO=https://your-logo-url
```

## الحسابات الافتراضية 👤

عند التشغيل الأول، يتم إنشاء الحسابات التالية تلقائياً:

| الاسم | الدور | كلمة المرور |
|------|------|-----------|
| admin | Admin | admin123 |
| tasker1-20 | Tasker | unique-password-* |
| qa1-10 | QA | unique-password-* |

⚠️ **تغيير كلمات المرور فوراً في الإنتاج**

## سير العمل 📝

### 1. إنشاء مشروع جديد
- المشرف ينشئ مشروع جديد
- يحمل البيانات (40,000 جملة)
- يعين الموسمين والمراجعين

### 2. التوسيم
- الموسم يفتح المهمة في Label Studio
- يصنف الجملة حسب المعايير
- يرسل التصنيف

### 3. المراجعة
- موسم ثاني يصنف نفس الجملة بشكل مستقل
- QA يقارن التصنيفات
- عند الاختلاف، QA يحكم النزاع

### 4. التقارير
- المشرف يراقب التقدم
- يصدر تقارير أسبوعية
- يتابع معدلات الجودة

## الإحصائيات المدعومة 📊

### Inter-Annotator Agreement (IAA)
- **Cohen's Kappa**: لموسمين
- **Fleiss' Kappa**: لأكثر من موسمين
- **Krippendorff's Alpha**: للبيانات الفئوية

### مقاييس الجودة
- معدل الاتفاق الكلي
- معدل الخطأ
- توزيع الفئات
- معدل الاختلافات

## API Documentation 📚

### Tasker Endpoints
```typescript
// الحصول على المهام المعينة
GET /api/trpc/tasker.getTasks

// الحصول على الإحصائيات
GET /api/trpc/tasker.getStats
```

### QA Endpoints
```typescript
// الحصول على قائمة المراجعة
GET /api/trpc/qa.getQueue

// الحصول على إحصائيات QA
GET /api/trpc/qa.getStats
```

### Admin Endpoints
```typescript
// إدارة المستخدمين
GET /api/trpc/admin.getAllUsers
POST /api/trpc/admin.createUser
PUT /api/trpc/admin.updateUser

// إدارة المشاريع
GET /api/trpc/admin.getAllProjects
POST /api/trpc/admin.createProject
```

## الملفات المهمة 📁

```
.
├── client/                 # واجهة المستخدم (React)
│   ├── src/
│   │   ├── pages/         # صفحات التطبيق
│   │   ├── components/    # مكونات React
│   │   └── lib/           # مكتبات مساعدة
│   └── public/            # ملفات ثابتة
├── server/                 # الخادم (Express)
│   ├── routers.ts         # إجراءات tRPC
│   ├── db.ts              # دوال قاعدة البيانات
│   └── _core/             # الملفات الأساسية
├── drizzle/               # إدارة قاعدة البيانات
│   └── schema.ts          # تعريف الجداول
├── docker-compose.yml     # إعدادات Docker
├── railway.json           # إعدادات Railway
└── README.md              # هذا الملف
```

## استكشاف الأخطاء 🔧

### المشكلة: الخادم لا يبدأ
```bash
# تحقق من المنافذ
lsof -i :3000

# امسح node_modules وأعد التثبيت
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### المشكلة: خطأ في قاعدة البيانات
```bash
# تحقق من الاتصال
pnpm db:push

# أعد إنشاء الجداول
pnpm db:reset
```

### المشكلة: Label Studio لا يعمل
```bash
# تحقق من Docker
docker-compose ps

# أعد تشغيل الخدمات
docker-compose restart
```

## المساهمة 🤝

نرحب بالمساهمات! يرجى:

1. Fork المستودع
2. أنشئ فرع جديد (`git checkout -b feature/amazing-feature`)
3. Commit التغييرات (`git commit -m 'Add amazing feature'`)
4. Push إلى الفرع (`git push origin feature/amazing-feature`)
5. فتح Pull Request

## الترخيص 📄

هذا المشروع مرخص تحت MIT License - انظر ملف [LICENSE](LICENSE) للتفاصيل.

## الدعم 💬

للمساعدة والدعم:
- 📧 البريد الإلكتروني: support@arabannotators.store
- 💬 Discord: [انضم إلى سيرفرنا](https://discord.gg/arabannotators)
- 📱 WhatsApp: +966XXXXXXXXX

## الشكر والتقدير 🙏

شكر خاص لـ:
- فريق Label Studio على الأداة الرائعة
- مجتمع React والـ TypeScript
- جميع المساهمين والمختبرين

---

**صُنع بـ ❤️ من قبل فريق Arab Annotators**

آخر تحديث: مارس 2026
\n# Trigger Deploy: Tue Apr 21 09:40:00 EDT 2026
