/**
 * SINGLE SOURCE OF TRUTH for per-module metadata.
 *
 * Rule 1 of the engineering spec: module display names, descriptions, accent
 * colors, icons, availability flags and suggested prompts are declared exactly
 * once, here, and imported by both the client and the server. A previous
 * iteration of this app duplicated this mapping across files and silently
 * dropped a module from one of them; deriving `MODULE_LIST` from `MODULE_IDS`
 * makes that class of bug structurally impossible - adding a member to the
 * union without adding its record entry is a compile error.
 */

export const MODULE_IDS = ['crypto', 'forex', 'ir-currency', 'gold', 'tse'] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

export interface ModuleMeta {
  readonly id: ModuleId;
  /** Farsi display name (all user-facing copy is Farsi / RTL). */
  readonly faName: string;
  /** Short Farsi description shown in the sidebar and module header. */
  readonly faDescription: string;
  /**
   * Accent color as a raw hex value rather than framework-specific class
   * names: the client injects it as a CSS custom property, so the palette has
   * one definition instead of one per styling mechanism.
   */
  readonly accent: string;
  /** Slightly translucent accent used for surfaces/badges. */
  readonly accentSoft: string;
  /** Inline SVG-free glyph, kept as text so no icon library is required. */
  readonly icon: string;
  /**
   * Availability flag. Every module ships enabled in this build; the flag is
   * retained because the UI must be able to represent a disabled module
   * without re-introducing a second, divergent copy of this metadata.
   */
  readonly comingSoon: boolean;
  /** Module-specific empty-state prompts (Farsi). Never generic/shared. */
  readonly suggestedPrompts: readonly string[];
}

export const MODULES: Record<ModuleId, ModuleMeta> = {
  crypto: {
    id: 'crypto',
    faName: 'ارز دیجیتال',
    faDescription: 'تحلیل چندلایه بیت‌کوین، اتریوم و آلت‌کوین‌ها بر پایه داده‌های زنده بایننس',
    accent: '#8b5cf6',
    accentSoft: 'rgba(139, 92, 246, 0.14)',
    icon: '₿',
    comingSoon: false,
    suggestedPrompts: [
      'ساختار روند بیت‌کوین در تایم‌فریم روزانه و هفتگی را با توجه به EMA50 و EMA200 تحلیل کن.',
      'شاخص ترس و طمع فعلی چه چیزی می‌گوید و چطور باید آن را با ساختار قیمت ترکیب کنم؟',
      'آیا در حال حاضر ست‌آپ کم‌ریسکی روی اتریوم دیده می‌شود؟ اگر نه، صریح بگو.',
    ],
  },
  forex: {
    id: 'forex',
    faName: 'فارکس جهانی',
    faDescription: 'جفت‌ارزهای اصلی، واگرایی سیاست پولی بانک‌های مرکزی و همبستگی با شاخص دلار',
    accent: '#22d3ee',
    accentSoft: 'rgba(34, 211, 238, 0.14)',
    icon: '⇄',
    comingSoon: false,
    suggestedPrompts: [
      'واگرایی سیاست پولی فدرال‌رزرو و بانک مرکزی اروپا الان به نفع کدام سمت یورو/دلار است؟',
      'ساختار روند EUR/USD را با تأیید حداقل سه سیگنال هم‌راستا بررسی کن.',
      'تا رسیدن داده‌های مهم اقتصادی این هفته، باز کردن پوزیشن جدید چه ریسکی دارد؟',
    ],
  },
  'ir-currency': {
    id: 'ir-currency',
    faName: 'ارز داخلی ایران',
    faDescription: 'دلار و یورو در بازار آزاد؛ تحلیل سیاستی، نقدینگی و اختلاف نرخ نیما با آزاد',
    accent: '#10b981',
    accentSoft: 'rgba(16, 185, 129, 0.14)',
    icon: '﷼',
    comingSoon: false,
    suggestedPrompts: [
      'اختلاف نرخ نیما/سانا با بازار آزاد چه سیگنالی درباره اعتماد بازار می‌دهد؟',
      'سه سناریوی صعودی، نزولی و خنثی برای دلار آزاد با محرک‌های هر کدام را توضیح بده.',
      'رشد نقدینگی چطور روی نرخ ارز اثر می‌گذارد؟ ساده و مرحله‌به‌مرحله توضیح بده.',
    ],
  },
  gold: {
    id: 'gold',
    faName: 'طلا و سکه',
    faDescription: 'انس جهانی، سکه و گرم ۱۸ عیار به همراه محاسبه شفاف حباب سکه',
    accent: '#f59e0b',
    accentSoft: 'rgba(245, 158, 11, 0.14)',
    icon: '◉',
    comingSoon: false,
    suggestedPrompts: [
      'حباب سکه امامی را با نرخ‌های فعلی محاسبه کن و مرحله‌به‌مرحله توضیح بده.',
      'روند انس جهانی طلا نسبت به نرخ بهره واقعی و شاخص دلار در چه وضعی است؟',
      'اگر انس ثابت بماند ولی دلار آزاد ۱۰٪ رشد کند، قیمت گرم ۱۸ عیار چه سناریویی دارد؟',
    ],
  },
  tse: {
    id: 'tse',
    faName: 'بورس تهران',
    faDescription: 'شاخص کل، نمادهای شاخص‌ساز، جریان پول حقیقی و اثر دامنه نوسان',
    accent: '#3b82f6',
    accentSoft: 'rgba(59, 130, 246, 0.14)',
    icon: '▤',
    comingSoon: false,
    suggestedPrompts: [
      'وضعیت شاخص کل را با توجه به محدودیت دامنه نوسان تحلیل کن.',
      'ورود و خروج پول حقیقی چیست و چرا در بورس ایران مهم شمرده می‌شود؟',
      'صنایع صادرات‌محور با تغییر نرخ دلار چطور اثر می‌گیرند؟',
    ],
  },
};

/** Derived from the union, so it can never omit a module. */
export const MODULE_LIST: readonly ModuleMeta[] = MODULE_IDS.map((id) => MODULES[id]);

export const DEFAULT_MODULE_ID: ModuleId = 'crypto';

export function isModuleId(value: unknown): value is ModuleId {
  return typeof value === 'string' && (MODULE_IDS as readonly string[]).includes(value);
}

/**
 * Safe lookup for possibly-missing keys (Rule 2). Returns `undefined` only for
 * genuinely unknown ids; callers that must render something use
 * `requireModuleMeta` instead of coercing `undefined` into the UI.
 */
export function getModuleMeta(id: string): ModuleMeta | undefined {
  return isModuleId(id) ? MODULES[id] : undefined;
}

/** Lookup with an explicit, documented fallback - never returns undefined. */
export function requireModuleMeta(id: string): ModuleMeta {
  return getModuleMeta(id) ?? MODULES[DEFAULT_MODULE_ID];
}

export const RESPONSE_LENGTHS = ['short', 'medium', 'comprehensive'] as const;
export type ResponseLength = (typeof RESPONSE_LENGTHS)[number];

export const RESPONSE_LENGTH_LABELS_FA: Record<ResponseLength, string> = {
  short: 'کوتاه',
  medium: 'متوسط',
  comprehensive: 'جامع',
};

export function isResponseLength(value: unknown): value is ResponseLength {
  return typeof value === 'string' && (RESPONSE_LENGTHS as readonly string[]).includes(value);
}
