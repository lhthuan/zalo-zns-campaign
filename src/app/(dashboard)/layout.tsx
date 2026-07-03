import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/logout-button";
import { OaInfoBadge } from "@/components/oa-info-badge";
import { NavLinks } from "@/components/nav-links";
import { LanguageSwitcher } from "@/components/language-switcher";
import { CopyrightFooter } from "@/components/copyright-footer";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-4">
            <span className="font-heading font-semibold">Zalo ZNS Campaign</span>
            <NavLinks />
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <OaInfoBadge />
            <span className="text-sm text-muted-foreground">{user?.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t py-4">
        <CopyrightFooter />
      </footer>
    </div>
  );
}
