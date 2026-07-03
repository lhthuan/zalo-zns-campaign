import "server-only";
import { createClient } from "@/lib/supabase/server";

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
  }
}

/** Throws UnauthorizedError if there is no logged-in staff/admin user. Use at the top of API route handlers (except QStash callbacks, which verify via signature instead). */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new UnauthorizedError();
  return user;
}
