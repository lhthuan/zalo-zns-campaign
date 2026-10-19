"use client";

import { translations, type Namespace } from "@/lib/i18n/translations";
import { useUiStore } from "@/stores/ui-store";

// The active locale lives in the persisted UI store (see stores/ui-store.ts);
// these hooks keep the original i18n API so call sites don't change.

export function useLocale() {
  const locale = useUiStore((s) => s.locale);
  const setLocale = useUiStore((s) => s.setLocale);
  return { locale, setLocale };
}

export function useTranslation<N extends Namespace>(namespace: N) {
  const { locale, setLocale } = useLocale();
  const dict = translations[locale][namespace] as Record<string, string>;

  function t(key: keyof (typeof translations)["vi"][N] & string, vars?: Record<string, string | number>) {
    let text = dict[key] ?? String(key);
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        text = text.replace(`{${k}}`, String(v));
      }
    }
    return text;
  }

  return { t, locale, setLocale };
}
