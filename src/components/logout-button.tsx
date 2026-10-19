"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/components/i18n-provider";

export function LogoutButton() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation("nav");

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Don't leave the previous user's data in the cache for the next login.
    queryClient.clear();
    router.push("/login");
    router.refresh();
  }

  return (
    <Button variant="outline" size="sm" onClick={handleLogout}>
      <LogOut className="size-4" />
      <span className="hidden sm:inline">{t("logout")}</span>
    </Button>
  );
}
