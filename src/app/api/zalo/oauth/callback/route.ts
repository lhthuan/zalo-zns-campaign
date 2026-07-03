import { NextRequest, NextResponse } from "next/server";
import { exchangeAuthorizationCode } from "@/lib/zalo/token";

const CODE_VERIFIER_COOKIE = "zalo_oauth_code_verifier";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const codeVerifier = request.cookies.get(CODE_VERIFIER_COOKIE)?.value;

  if (!code || !codeVerifier) {
    return NextResponse.json(
      { error: "Missing code or code_verifier — restart the flow at /api/zalo/oauth/start" },
      { status: 400 }
    );
  }

  try {
    await exchangeAuthorizationCode(code, codeVerifier);
    const response = NextResponse.redirect(new URL("/templates", process.env.NEXT_PUBLIC_APP_URL));
    response.cookies.delete(CODE_VERIFIER_COOKIE);
    return response;
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
