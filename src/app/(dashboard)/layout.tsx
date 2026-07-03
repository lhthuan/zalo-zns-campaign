import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/logout-button";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <nav className="flex items-center gap-6">
            <span className="font-semibold">Zalo ZNS Campaign</span>
            <Link href="/customers" className="text-sm text-muted-foreground hover:text-foreground">
              Khách hàng
            </Link>
            <Link href="/templates" className="text-sm text-muted-foreground hover:text-foreground">
              Template
            </Link>
            <Link href="/campaigns" className="text-sm text-muted-foreground hover:text-foreground">
              Chiến dịch
            </Link>
            <Link href="/send-test" className="text-sm text-muted-foreground hover:text-foreground">
              Gửi thử
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{user?.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
