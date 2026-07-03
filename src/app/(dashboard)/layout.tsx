import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/logout-button";
import { OaInfoBadge } from "@/components/oa-info-badge";
import { NavLinks } from "@/components/nav-links";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-4">
            <span className="font-heading font-semibold">Zalo ZNS Campaign</span>
            <NavLinks />
          </div>
          <div className="flex items-center gap-3">
            <OaInfoBadge />
            <span className="text-sm text-muted-foreground">{user?.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
