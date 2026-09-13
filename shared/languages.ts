export type SupportedLanguage = {
  code: string;
  label: string;
  bcp47: string;
  rtl: boolean;
};

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: "en", label: "English",        bcp47: "en-US",  rtl: false },
  { code: "ar", label: "Arabic",         bcp47: "ar-SA",  rtl: true  },
  { code: "fr", label: "French",         bcp47: "fr-FR",  rtl: false },
  { code: "es", label: "Spanish",        bcp47: "es-ES",  rtl: false },
  { code: "de", label: "German",         bcp47: "de-DE",  rtl: false },
  { code: "it", label: "Italian",        bcp47: "it-IT",  rtl: false },
  { code: "pt", label: "Portuguese",     bcp47: "pt-PT",  rtl: false },
  { code: "nl", label: "Dutch",          bcp47: "nl-NL",  rtl: false },
  { code: "ru", label: "Russian",        bcp47: "ru-RU",  rtl: false },
  { code: "tr", label: "Turkish",        bcp47: "tr-TR",  rtl: false },
  { code: "hi", label: "Hindi",          bcp47: "hi-IN",  rtl: false },
  { code: "ur", label: "Urdu",           bcp47: "ur-PK",  rtl: true  },
  { code: "fa", label: "Persian",        bcp47: "fa-IR",  rtl: true  },
  { code: "bn", label: "Bengali",        bcp47: "bn-IN",  rtl: false },
  { code: "ta", label: "Tamil",          bcp47: "ta-IN",  rtl: false },
  { code: "te", label: "Telugu",         bcp47: "te-IN",  rtl: false },
  { code: "ml", label: "Malayalam",      bcp47: "ml-IN",  rtl: false },
  { code: "zh", label: "Chinese",        bcp47: "zh-CN",  rtl: false },
  { code: "ja", label: "Japanese",       bcp47: "ja-JP",  rtl: false },
  { code: "ko", label: "Korean",         bcp47: "ko-KR",  rtl: false },
  { code: "th", label: "Thai",           bcp47: "th-TH",  rtl: false },
  { code: "id", label: "Indonesian",     bcp47: "id-ID",  rtl: false },
  { code: "ms", label: "Malay",          bcp47: "ms-MY",  rtl: false },
  { code: "tl", label: "Filipino",       bcp47: "fil-PH", rtl: false },
  { code: "vi", label: "Vietnamese",     bcp47: "vi-VN",  rtl: false },
];

export const SUPPORTED_LANGUAGE_CODES: string[] = SUPPORTED_LANGUAGES.map((l) => l.code);

export function getLanguage(code: string | null | undefined): SupportedLanguage {
  const c = (code || "en").toLowerCase();
  return SUPPORTED_LANGUAGES.find((l) => l.code === c) || SUPPORTED_LANGUAGES[0];
}

export function isSupportedLanguage(code: string | null | undefined): boolean {
  if (!code) return false;
  return SUPPORTED_LANGUAGE_CODES.includes(code.toLowerCase());
}
