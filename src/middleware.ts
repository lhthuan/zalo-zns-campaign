import { NextResponse, type NextRequest } from "next/server";

// TEMPORARY DIAGNOSTIC: stripped down to a no-op to isolate whether the
// Vercel 404 is caused by @supabase/ssr failing in the Edge Runtime, or is a
// platform issue unrelated to this file's contents. Restore the real
// Supabase-auth-checking version once this is resolved.
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
