# PostWast

PostWast مكتبة واجهة نشر عامة للمطورين. توفر واجهة React وWeb Component
لرفع الصور والفيديوهات، معاينتها، اختيار قناة النشر، وإظهار حالات الاتصال
والنجاح والأخطاء.

المكتبة لا تفرض خادمًا أو قاعدة بيانات أو منصة نشر. المشروع الذي يدمجها يملك
المصادقة والتخزين وربط Instagram أو Facebook أو TikTok وأي قواعد نشر خاصة به.

## الاستخدام من المستودع

```bash
# بعد استنساخ المستودع وفتح مجلده
pnpm install
pnpm --filter postwast run build
```

للتأكد من سلامة المستودع كاملًا:

```bash
pnpm run typecheck
```

## استخدام المكتبة

### React

```tsx
import { createPostWastHttpAdapter, PostWastPublishFlow } from "postwast";

const adapter = createPostWastHttpAdapter({
  channels: [
    {
      id: "main",
      name: "القناة الرئيسية",
      connected: true,
    },
  ],
  endpoint: "/api/posts",
});

export function PublishView() {
  return <PostWastPublishFlow adapter={adapter} locale="ar" />;
}
```

### HTML أو Python أو C++ أو أي خادم آخر

يمكن تشغيل Web Component داخل واجهة ويب:

```html
<script type="module">
  import "postwast/web-component";
</script>

<postwast-publisher
  endpoint="/api/posts"
  locale="ar"
  channels='[{"id":"main","name":"القناة الرئيسية","connected":true}]'
></postwast-publisher>
```

الخادم يستقبل طلب `POST multipart/form-data` يحتوي على:

- `file`
- `mediaType`
- `description`
- `channelId`

للتفاصيل الكاملة راجع [README الخاص بالمكتبة](lib/postwast/README.md).

## مسؤولية المشروع المضيف

المكتبة تقدم واجهة العميل فقط. يجب على المطور الذي يدمجها تجهيز:

- المصادقة والصلاحيات.
- التحقق النهائي من الملفات وحجمها ومحتواها.
- تخزين الملفات.
- ربط منصات النشر الخارجية.
- حماية مفاتيح API وبيانات المستخدمين.
- حماية endpoint من الطلبات غير المصرح بها ومعدلات الطلب المرتفعة.

فحص الملفات داخل المتصفح مساعد لتجربة المستخدم وليس حدًا أمنيًا.

## حالة المنتج

المكتبة متاحة للمطورين وفق tier الترخيص المناسب، وتدعم React 18+ وWeb Component.
الحزمة مبنية بصيغة ESM مع تعريفات TypeScript، ويمكن دمجها في مشروع مستقل
وفق شروط الترخيص.

## الترخيص

الاستخدام يخضع لشروط `LICENSE` المرفق مع المشروع والحزمة.
