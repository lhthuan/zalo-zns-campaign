"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NavLinks } from "@/components/nav-links";
import { OaInfoBadge } from "@/components/oa-info-badge";
import { LanguageSwitcher } from "@/components/language-switcher";
import { LogoutButton } from "@/components/logout-button";
import { CopyrightFooter } from "@/components/copyright-footer";
import { useTranslation } from "@/components/i18n-provider";
import { useUiStore } from "@/stores/ui-store";

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 px-1 font-heading text-base font-semibold">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sm text-sidebar-primary-foreground">
        Z
      </span>
      {!collapsed && <span className="truncate">ZNS Campaign</span>}
    </Link>
  );
}

export function AppShell({ email, children }: { email: string | null; children: React.ReactNode }) {
  const { t } = useTranslation("nav");
  const pathname = usePathname();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const mobileNavOpen = useUiStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname, setMobileNavOpen]);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-3 text-sidebar-foreground transition-[width] duration-200 lg:flex",
          collapsed ? "w-16" : "w-60"
        )}
      >
        <div className="mb-6 pt-1">
          <Brand collapsed={collapsed} />
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavLinks collapsed={collapsed} />
        </div>
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={collapsed ? t("expandSidebar") : t("collapseSidebar")}
          title={collapsed ? t("expandSidebar") : t("collapseSidebar")}
          className="mt-2 flex items-center justify-center rounded-lg py-2 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </aside>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-sidebar p-3 text-sidebar-foreground shadow-xl">
            <div className="mb-6 flex items-center justify-between pt-1">
              <Brand collapsed={false} />
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-lg p-2 hover:bg-sidebar-accent"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
            <NavLinks onNavigate={() => setMobileNavOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="rounded-lg p-2 hover:bg-muted lg:hidden"
              aria-label={t("openMenu")}
            >
              <Menu className="size-5" />
            </button>
            <div className="ml-auto flex min-w-0 items-center gap-3">
              <OaInfoBadge />
              <LanguageSwitcher />
              {email && <span className="hidden truncate text-sm text-muted-foreground xl:inline">{email}</span>}
              <LogoutButton />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-6">{children}</main>
        <footer className="border-t py-4">
          <CopyrightFooter />
        </footer>
      </div>
    </div>
  );
}
