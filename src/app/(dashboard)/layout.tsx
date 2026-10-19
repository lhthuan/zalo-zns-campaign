import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  // The proxy already verified the session; getClaims reads the email from
  // the (locally verified) JWT instead of another Auth server round-trip.
  const { data } = await supabase.auth.getClaims();
  const email = typeof data?.claims?.email === "string" ? data.claims.email : null;

  return <AppShell email={email}>{children}</AppShell>;
}
