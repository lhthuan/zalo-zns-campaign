import "server-only";
import { createClient } from "@/lib/supabase/server";

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
  }
}

/** Throws UnauthorizedError if there is no logged-in staff/admin user. Use at the top of API route handlers (except QStash callbacks, which verify via signature instead). */
export async function requireUser(): Promise<{ id: string; email: string | null }> {
  const supabase = await createClient();
  // getClaims verifies the session JWT (locally with asymmetric signing keys,
  // via the Auth server otherwise) — cheaper than getUser on every request.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) throw new UnauthorizedError();
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
}
