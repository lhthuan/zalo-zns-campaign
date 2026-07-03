"use client";

import { useTranslation } from "@/components/i18n-provider";

export function CopyrightFooter() {
  const { t } = useTranslation("footer");
  return (
    <p className="text-center text-xs text-muted-foreground">
      {t("copyright", { year: new Date().getFullYear() })}
    </p>
  );
}
