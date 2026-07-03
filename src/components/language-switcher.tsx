"use client";

import { useLocale } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

const FLAGS: { value: "vi" | "ko"; flag: string; label: string }[] = [
  { value: "vi", flag: "🇻🇳", label: "Tiếng Việt" },
  { value: "ko", flag: "🇰🇷", label: "한국어" },
];

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();

  return (
    <div className="flex items-center gap-1">
      {FLAGS.map((f) => (
        <button
          key={f.value}
          type="button"
          title={f.label}
          aria-label={f.label}
          aria-pressed={locale === f.value}
          onClick={() => setLocale(f.value)}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full text-lg transition-colors",
            locale === f.value ? "bg-secondary ring-1 ring-primary/40" : "opacity-50 hover:opacity-100"
          )}
        >
          <span aria-hidden>{f.flag}</span>
        </button>
      ))}
    </div>
  );
}
