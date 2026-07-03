"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { DEFAULT_LOCALE, translations, type Locale, type Namespace } from "@/lib/i18n/translations";

const STORAGE_KEY = "zns-locale";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "vi" || stored === "ko") {
      // Reading a persisted preference on mount, not derived from props/state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocaleState(stored);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    setLocaleState(next);
  }, []);

  return <I18nContext.Provider value={{ locale, setLocale }}>{children}</I18nContext.Provider>;
}

export function useLocale() {
  return useContext(I18nContext);
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
