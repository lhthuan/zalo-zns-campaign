import { NextResponse } from "next/server";
import { generatePkcePair, getZaloCredentials } from "@/lib/zalo/token";
import { getAppUrl } from "@/lib/env";

const CODE_VERIFIER_COOKIE = "zalo_oauth_code_verifier";

export async function GET() {
  try {
    const credentials = await getZaloCredentials();
    const { codeVerifier, codeChallenge } = generatePkcePair();

    const url = new URL("https://oauth.zaloapp.com/v4/oa/permission");
    url.searchParams.set("app_id", credentials.appId);
    url.searchParams.set("redirect_uri", `${getAppUrl()}/api/zalo/oauth/callback`);
    url.searchParams.set("code_challenge", codeChallenge);

    const response = NextResponse.redirect(url.toString());
    response.cookies.set(CODE_VERIFIER_COOKIE, codeVerifier, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 600, // authorization code is valid 10 minutes; verifier doesn't need to outlive it
      path: "/api/zalo/oauth",
    });
    return response;
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
