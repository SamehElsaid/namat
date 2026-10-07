# NAMAT customer installation

PHYSICAL IPHONE VERIFICATION REQUIRED for Safari profile installation, a real Apple-signed device callback, UDID recovery, Apple device registration from that UDID, a signed IPA install, Developer Mode, and Wallet Apply/Restore. Automated tests cover a CMS fixture, a stored IPA, and mocked Apple responses. They have not been executed on a physical iPhone.

## English

Purchase NAMAT.
The lifetime entitlement becomes active.
Open **Set up this iPhone** at `/account/install` in Safari.
Tap **Register this iPhone**.
Safari downloads a NAMAT registration profile.
Install that profile in Settings.
The iPhone sends only the device identifier, model, and iOS version back to NAMAT.
NAMAT links that iPhone to the signed-in purchase.
NAMAT prepares the app.
When it is ready, tap **Install NAMAT**.
Open NAMAT.
Finish pairing and Wallet setup inside the app.

The owner does not collect a device code by WhatsApp or email.
The owner does not type a device identifier.
The owner does not rebuild or sign NAMAT once per customer.

A purchase activates one iPhone at a time. Transfer activation in the account before using another iPhone. That limit is separate from Apple's Ad Hoc device pool, which is finite. When that pool is full, the account says installation is currently unavailable and the purchase stays active.

Developer Mode is shown only after the app is ready, and only for Ad Hoc or user-side signing. It is not the first step.

The app activates with a NAMAT installation token created on the iPhone. The Apple device identifier is used to prepare installation. It is not the login secret.

## العربية

اشترِ NAMAT.
يصبح استحقاق الشراء مدى الحياة فعالاً.
افتح **إعداد جهازك** من `/account/install` في Safari.
اضغط **تسجيل هذا iPhone**.
ينزّل Safari ملف تسجيل NAMAT.
ثبّت الملف من الإعدادات.
يرسل iPhone إلى NAMAT معرّف الجهاز والطراز وإصدار iOS فقط.
يربط NAMAT هذا iPhone بعملية الشراء التي سجّلت الدخول بها.
يجهّز NAMAT التطبيق.
عند الجاهزية اضغط **تثبيت NAMAT**.
افتح NAMAT.
أكمل الاقتران وإعداد المحفظة داخل التطبيق.

لا يستلم المالك رمز الجهاز عبر واتساب أو البريد.
لا يكتب المالك معرّف الجهاز.
لا يعيد المالك بناء NAMAT أو توقيعه لكل عميل.

الشراء يفعّل آيفونًا واحدًا في كل مرة. انقل التفعيل من الحساب قبل استخدام آيفون آخر. هذا الحد مستقل عن سعة أجهزة Apple في توزيع Ad Hoc، وهي سعة محدودة. إذا امتلأت السعة تظهر رسالة أن التثبيت غير متاح حالياً ويبقى الشراء فعالاً.

يظهر نمط المطور فقط بعد جاهزية التطبيق، ولطرق Ad Hoc أو التوقيع من جهة المستخدم. ليس الخطوة الأولى.

يفعّل التطبيق برمز تثبيت ينشئه NAMAT على iPhone. معرّف جهاز Apple لتجهيز التثبيت، وليس سر تسجيل الدخول.

## What is automated

1. `POST /api/v1/device-enrollment/start` creates a short-lived session bound to the user and the lifetime entitlement.
2. `GET /api/v1/device-enrollment/profile/:token` returns a Profile Service `.mobileconfig` requesting `UDID`, `PRODUCT`, and `VERSION`, plus a one-time `Challenge`.
3. `POST /api/v1/device-enrollment/callback/:token` accepts only a CMS-signed device response. The signer must chain to `ENROLLMENT_CMS_TRUST_BUNDLE_PEM`. Production fails closed when that bundle is missing. The expired 2014 Apple iPhone Device CA is not used unless `ENROLLMENT_ALLOW_LEGACY_IPHONE_DEVICE_CA=true`. The callback must include the session challenge. Raw XML, a bad signature, a wrong challenge, expiry, replay, and another customer's device are rejected. The challenge and the raw device identifier are not logged. Diagnostic mode records signer certificate metadata for the account owner and does not enroll the device.
4. `AppleProvisioningProvider` registers the device and regenerates an Ad Hoc profile when App Store Connect credentials exist.
5. A signing lock queues customers so profile regeneration does not overlap.
6. `RESIGN` reuses the unsigned Release payload stored by the API. `FULL_REBUILD` rebuilds AirliftFFI and the Release app when the configured source commit, AirliftFFI SHA, or version is missing. A 14-day Actions artifact is not the durable source.
7. GitHub Actions workflow `ios-customer-sign.yml` signs an IPA, uploads the bytes, and only then reports completion. The API stores the IPA, checks SHA-256, and only then marks the enrollment ready. The workflow does not receive the device identifier.
8. The account page polls `QUEUED`, `REGISTERING_DEVICE`, `GENERATING_PROFILE`, `SIGNING`, `READY`, and `FAILED`.
9. Production does not issue an enrollment profile when the encryption key, profile signing certificate, Apple credentials, signing callback, dispatcher, or stable payload is missing.

`INSTALL_STRATEGY` may be `AD_HOC_SELF_SERVICE`, `TESTFLIGHT`, `USER_SIDE_SIGNING`, or `UNAVAILABLE`. Enterprise distribution is not used. Ad Hoc is not treated as unlimited.

Sensitive identifiers are encrypted with `ENROLLMENT_DATA_KEY`. Logs and audit records store an internal id and an 8-character fingerprint prefix. They do not store the raw device identifier, Wallet identifiers, or card data.

## Owner actions that remain

Configure the server and GitHub secrets once. Retry a failed provisioning or signing job from Admin → Installations. Deactivate a NAMAT installation. Watch Apple capacity. Do not handle each customer by hand.
