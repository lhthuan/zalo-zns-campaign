"use client";

import { useLocale } from "@/components/i18n-provider";
import { LOCALES } from "@/lib/i18n/translations";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const items = Object.fromEntries(LOCALES.map((l) => [l.value, l.label]));

  return (
    <Select value={locale} onValueChange={(v) => v && setLocale(v as "vi" | "ko")} items={items}>
      <SelectTrigger className="h-8 w-28 text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LOCALES.map((l) => (
          <SelectItem key={l.value} value={l.value}>
            {l.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
