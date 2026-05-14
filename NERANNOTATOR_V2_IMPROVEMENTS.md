# NERAnnotator v2 - تحسينات شاملة

## نظرة عامة

تم تطوير نسخة محسّنة من مكون `NERAnnotator` (مرمز الكيانات المسمى) مع إضافة ميزات متقدمة وتحسينات أداء وإمكانية وصول أفضل.

## الميزات الجديدة

### 1. **نظام التراجع والإعادة (Undo/Redo)**
- تتبع كامل لسجل التعديلات
- اختصارات لوحة المفاتيح: `Ctrl+Z` للتراجع، `Ctrl+Y` للإعادة
- حد أقصى قابل للتخصيص لحجم السجل

```tsx
<NERAnnotatorV2
  text={text}
  labels={labels}
  value={spans}
  onChange={handleChange}
  enableUndo={true}
  maxHistorySize={50}
/>
```

### 2. **البحث والتصفية المتقدمة**
- البحث الفوري عن الكيانات حسب النص أو التسمية
- تصفية حسب نوع الكيان
- عرض إحصائيات التصفية

```tsx
<NERAnnotatorV2
  text={text}
  labels={labels}
  value={spans}
  onChange={handleChange}
  enableSearch={true}
/>
```

### 3. **تصدير البيانات**
- تصدير التعليقات كملف JSON
- تنسيق منظم وسهل المعالجة

```tsx
<NERAnnotatorV2
  text={text}
  labels={labels}
  value={spans}
  onChange={handleChange}
  enableExport={true}
/>
```

### 4. **إخفاء/إظهار التسميات**
- خيار لإخفاء التسميات على الكيانات
- مفيد للعرض النظيف

### 5. **لوحة الإعدادات**
- عرض الاختصارات المتاحة
- تعليمات الاستخدام

### 6. **الإحصائيات المحسّنة**
- إجمالي عدد الكيانات
- عدد الأنواع الفريدة
- نسبة تغطية النص

## تحسينات الأداء

### 1. **Memoization محسّن**
- استخدام `useMemo` لتصفية الكيانات
- تقليل إعادة التصيير غير الضرورية

### 2. **معالجة الأخطاء المحسّنة**
- معالجة أفضل للحالات الحدية
- رسائل خطأ واضحة

### 3. **تحسينات الرسوم المتحركة**
- رسوم متحركة سلسة عند الإضافة والحذف
- تأثيرات بصرية محسّنة

## تحسينات الوصول (Accessibility)

### 1. **ARIA Labels محسّنة**
- تحديثات ARIA labels لجميع العناصر
- دعم أفضل لقارئات الشاشة

### 2. **لوحة المفاتيح**
- دعم كامل للتنقل بلوحة المفاتيح
- اختصارات محسّنة للتسميات

### 3. **التنبيهات الحية**
- تحديثات في الوقت الفعلي

## مثال الاستخدام الكامل

```tsx
import NERAnnotatorV2 from "@/components/annotation/NERAnnotatorV2";
import type { LabelOption, NERSpan, AnnotationResult } from "@/components/annotation/types";
import { useState } from "react";

export function NERPage() {
  const [spans, setSpans] = useState<NERSpan[]>([]);

  const labels: LabelOption[] = [
    { value: "Person", color: "#FF6B6B", shortcut: "p" },
    { value: "Location", color: "#4ECDC4", shortcut: "l" },
    { value: "Organization", color: "#45B7D1", shortcut: "o" },
    { value: "Date", color: "#F7B731", shortcut: "d" },
  ];

  const text = `محمد علي يعمل في شركة جوجل بمصر منذ عام 2020. 
  قابل رئيس الشركة في القاهرة في يناير 2023.`;

  const handleChange = (result: AnnotationResult) => {
    if (result.type === "ner") {
      setSpans(result.spans);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">مرمز الكيانات المسمى</h1>
      
      <NERAnnotatorV2
        text={text}
        labels={labels}
        value={spans}
        onChange={handleChange}
        enableUndo={true}
        enableSearch={true}
        enableExport={true}
        maxHistorySize={50}
      />

      {/* Display results */}
      <div className="mt-8 p-4 bg-gray-50 rounded-lg">
        <h2 className="text-lg font-semibold mb-4">النتائج</h2>
        <pre className="bg-white p-4 rounded border border-gray-200 overflow-auto">
          {JSON.stringify(spans, null, 2)}
        </pre>
      </div>
    </div>
  );
}
```

## الاختبارات

تم إضافة مجموعة شاملة من الاختبارات في `NERAnnotatorV2.test.tsx`:

- اختبار عرض الكيانات
- اختبار إضافة وحذف الكيانات
- اختبار البحث والتصفية
- اختبار النسخ
- اختبار التراجع والإعادة
- اختبار التصدير
- اختبار الاختصارات
- اختبار الإحصائيات

### تشغيل الاختبارات

```bash
pnpm test NERAnnotatorV2
```

## مقارنة مع النسخة الأولى

| الميزة | v1 | v2 |
|--------|----|----|
| إضافة/حذف الكيانات | ✅ | ✅ (أفضل) |
| البحث والتصفية | ❌ | ✅ |
| التراجع والإعادة | ❌ | ✅ |
| تصدير البيانات | ❌ | ✅ |
| إخفاء التسميات | ❌ | ✅ |
| الإحصائيات | ❌ | ✅ |
| لوحة الإعدادات | ❌ | ✅ |
| الاختصارات | ✅ | ✅ (أفضل) |
| إمكانية الوصول | ✅ | ✅ (أفضل) |
| الأداء | ✅ | ✅ (أفضل) |
| الاختبارات | ❌ | ✅ |

## الخصائص (Props)

```typescript
interface Props {
  // النص المراد تعليقه
  text: string;

  // قائمة التسميات المتاحة
  labels: LabelOption[];

  // الكيانات المحددة حالياً
  value: NERSpan[];

  // دالة التعديل
  onChange: (result: AnnotationResult) => void;

  // وضع القراءة فقط
  readOnly?: boolean;

  // تفعيل التراجع والإعادة
  enableUndo?: boolean;

  // تفعيل البحث والتصفية
  enableSearch?: boolean;

  // تفعيل التصدير
  enableExport?: boolean;

  // حد أقصى لحجم السجل
  maxHistorySize?: number;
}
```

## الأنواع (Types)

```typescript
type LabelOption = {
  value: string;
  color: string;
  shortcut?: string;
};

type NERSpan = {
  start: number;
  end: number;
  text: string;
  label: string;
  color: string;
};

type AnnotationResult = {
  type: "ner";
  spans: NERSpan[];
};
```

## الاختصارات المتاحة

- **اختصارات التسميات**: اضغط على الحرف المخصص لتحديد التسمية بسرعة
- **Ctrl+Z**: التراجع عن آخر تعديل
- **Ctrl+Y**: إعادة آخر تعديل تم التراجع عنه
- **Shift+Ctrl+Z**: إعادة (بديل)

## الخطوات التالية

1. **الاستخدام**: استبدل `NERAnnotator` بـ `NERAnnotatorV2` في المشروع
2. **الاختبار**: قم بتشغيل الاختبارات للتأكد من التوافقية
3. **التطوير**: يمكن إضافة ميزات إضافية مثل:
   - الاقتراحات الذكية للكيانات
   - الدعم متعدد اللغات
   - المشاركة والتعاون
   - التعليقات والملاحظات
   - الربط بين الكيانات

## الملاحظات المهمة

- المكون يحافظ على التوافقية العكسية مع النسخة الأولى
- جميع الميزات الجديدة اختيارية (اختيار)
- تم اختبار المكون بشكل شامل
- الكود موثق بالكامل مع JSDoc

## الأداء

- **الذاكرة**: استخدام محسّن للذاكرة مع Memoization
- **السرعة**: معالجة سريعة للنصوص الطويلة
- **التجاوب**: واجهة مستخدم سلسة وسريعة الاستجابة

## الدعم والمساهمة

للإبلاغ عن الأخطاء أو اقتراح ميزات جديدة، يرجى فتح issue في المستودع.

## الترخيص

MIT
