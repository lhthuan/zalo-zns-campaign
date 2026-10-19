import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login"];

export async function proxy(request: NextRequest) {
  // API routes authenticate themselves (requireUser / QStash signatures), so
  // resolving the session here too would just add an auth round-trip to every
  // data request the client makes.
  if (request.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  let userId: string | null = null;
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });

    // getClaims verifies the JWT locally when the project uses asymmetric
    // signing keys (falling back to the Auth server otherwise) and refreshes an
    // expired session, so it's both safe and usually network-free.
    const { data } = await supabase.auth.getClaims();
    userId = data?.claims?.sub ?? null;
  } catch (err) {
    // Never let an auth-check failure take down every page (login included) with a hard crash;
    // fall back to "not logged in" and surface the real cause in Vercel's function logs.
    console.error("proxy: failed to resolve Supabase session", err);
  }

  const isPublicPath = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

  if (!userId && !isPublicPath) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  if (userId && request.nextUrl.pathname === "/login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/campaigns";
    return NextResponse.redirect(homeUrl);
  }

  return response;
}

export const config = {
  // Exclude any path with a file extension (e.g. .html, .png, .txt) so files in
  // public/ — like Zalo's domain-verification HTML file — are served without
  // requiring a login session.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
