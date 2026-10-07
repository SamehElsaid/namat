/** Arabic-first bot copy and routing keys. English can be layered on later. */

export const TG_COMMANDS = {
  start: 'start',
  account: 'account',
  designs: 'designs',
  devices: 'devices',
  orders: 'orders',
  support: 'support',
  help: 'help',
} as const;

/** Inline-button callback_data values. Kept short (Telegram caps at 64 bytes). */
export const TG_CALLBACK = {
  account: 'account',
  designs: 'designs',
  devices: 'devices',
  orders: 'orders',
  support: 'support',
  supportApp: 'sup:app',
  supportPayment: 'sup:pay',
  supportDevice: 'sup:dev',
  supportDesign: 'sup:design',
  supportOther: 'sup:other',
  unlink: 'unlink',
} as const;

export const TG_TEXT = {
  welcome:
    'مرحبًا بك في نَمَط 👋\nمن هنا تقدر تتابع حسابك وأجهزتك وتصاميمك، أو تفتح نَمَط مباشرة.',
  needLink:
    'اربط حساب نَمَط أولًا للوصول إلى حسابك وأجهزتك وتصاميمك.\nافتح نَمَط من الزر بالأسفل ثم اختر «ربط تيليجرام».',
  linked: 'تم ربط حسابك بنجاح ✅\nتقدر الآن تتابع حسابك وأجهزتك وتصاميمك من هنا.',
  linkInvalid: 'رابط الربط غير صالح أو منتهي. أنشئ رابطًا جديدًا من حسابك في نَمَط.',
  linkTakenByOther: 'حساب تيليجرام هذا مرتبط بحساب نَمَط آخر. ألغِ الربط أولًا ثم أعد المحاولة.',
  alreadyLinked: 'حسابك مربوط بالفعل ✅',
  unlinked: 'تم إلغاء ربط تيليجرام عن حسابك.',
  notLinked: 'لا يوجد حساب نَمَط مربوط بهذه المحادثة.',
  help:
    'الأوامر المتاحة:\n/account حسابي\n/designs تصاميمي\n/devices أجهزتي\n/orders مشترياتي\n/support الدعم\n/help المساعدة',
  supportPrompt: 'اختر نوع المشكلة:',
  supportAsk: 'اكتب رسالتك الآن وسأرسلها لفريق الدعم. لا تكتب أي أرقام بطاقة أو رموز أمان.',
  supportSent: 'تم إرسال طلبك لفريق الدعم ✅ سيصلك الرد في حسابك.',
  supportEmpty: 'لم أستلم رسالة. ابدأ من /support مرة أخرى.',
  genericError: 'تعذّر تنفيذ الطلب الآن. حاول لاحقًا.',
  rateLimited: 'عدد كبير من الطلبات. انتظر لحظة ثم أعد المحاولة.',
} as const;

export const TG_BUTTONS = {
  openNamat: 'فتح نَمَط',
  account: 'حسابي',
  designs: 'تصاميمي',
  devices: 'أجهزتي',
  orders: 'مشترياتي',
  support: 'الدعم',
  link: 'ربط الحساب',
  unlink: 'إلغاء الربط',
} as const;
