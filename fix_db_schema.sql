-- 1. إزالة القيود الفريدة (Unique Constraints) التي قد تسبب مشاكل عند وجود قيم null متكررة
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_labelStudioProjectId_unique;

-- 2. جعل حقول Label Studio تقبل قيم فارغة (Nullable) في حال كانت NOT NULL
ALTER TABLE projects ALTER COLUMN "labelStudioProjectId" DROP NOT NULL;
ALTER TABLE tasks ALTER COLUMN "labelStudioTaskId" DROP NOT NULL;
ALTER TABLE annotations ALTER COLUMN "labelStudioAnnotationId" DROP NOT NULL;
ALTER TABLE users ALTER COLUMN "labelStudioUserId" DROP NOT NULL;

-- 3. التأكد من أن الأعمدة موجودة (في حال لم يتم إنشاؤها في الـ migrations السابقة)
-- ملاحظة: هذه الخطوة احترازية فقط
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='labelStudioProjectId') THEN
        ALTER TABLE projects ADD COLUMN "labelStudioProjectId" integer;
    END IF;
END $$;
