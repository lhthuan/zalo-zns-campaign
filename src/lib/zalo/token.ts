import "server-only";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const TOKEN_URL = "https://oauth.zaloapp.com/v4/oa/access_token";
const REFRESH_SAFETY_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before real expiry
const LOCK_DURATION_MS = 30 * 1000;
const LOCK_POLL_INTERVAL_MS = 500;
const LOCK_POLL_MAX_ATTEMPTS = 10;

export interface ZaloCredentials {
  appId: string;
  secretKey: string;
}

/** Zalo App ID/Secret are stored in the DB (app_settings), editable from /settings without a redeploy. */
export async function getZaloCredentials(): Promise<ZaloCredentials> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  if (!data?.zalo_app_id || !data?.zalo_app_secret_key) {
    throw new Error("Chưa cấu hình Zalo App ID/Secret — vào trang Cài đặt để nhập.");
  }
  return { appId: data.zalo_app_id, secretKey: data.zalo_app_secret_key };
}

export function generatePkcePair() {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

interface ZaloTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: string;
  error?: number;
  error_name?: string;
  error_reason?: string;
}

async function requestToken(
  credentials: ZaloCredentials,
  body: Record<string, string>
): Promise<ZaloTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      secret_key: credentials.secretKey,
    },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json()) as ZaloTokenResponse;
  if (!json.access_token || !json.refresh_token) {
    throw new Error(
      `Zalo OAuth token request failed: ${json.error_name ?? json.error} ${json.error_reason ?? ""}`
    );
  }
  return json;
}

/** One-time bootstrap: exchange the OAuth authorization code for the first token pair. */
export async function exchangeAuthorizationCode(code: string, codeVerifier: string) {
  const credentials = await getZaloCredentials();
  const token = await requestToken(credentials, {
    code,
    app_id: credentials.appId,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });
  await persistToken(token);
  return token;
}

async function persistToken(token: ZaloTokenResponse) {
  const supabase = createAdminClient();
  const expiresAt = new Date(Date.now() + Number(token.expires_in) * 1000).toISOString();
  const { error } = await supabase.from("zalo_oauth_tokens").upsert({
    id: 1,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: expiresAt,
    locked_until: null,
  });
  if (error) throw error;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns a valid access token, refreshing it first if needed.
 *
 * Zalo's refresh_token is single-use and rotates on every refresh, so two
 * concurrent callers refreshing at once would invalidate each other. Since the
 * refresh call is an HTTP round-trip to Zalo (can't be wrapped in one SQL
 * transaction via PostgREST), we use `locked_until` as a claim column: the
 * caller that successfully flips it from NULL/expired to "now + 30s" via a
 * conditional UPDATE is the sole refresher; Postgres re-checks the WHERE
 * clause after acquiring the row lock, so only one concurrent UPDATE can ever
 * match. Losers poll briefly and read back the token the winner wrote.
 */
export async function getValidAccessToken(): Promise<string> {
  const supabase = createAdminClient();

  const { data: row, error } = await supabase
    .from("zalo_oauth_tokens")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error("zalo_oauth_tokens is empty — run the OAuth bootstrap flow first.");

  if (new Date(row.expires_at).getTime() - REFRESH_SAFETY_BUFFER_MS > Date.now()) {
    return row.access_token;
  }

  const claimUntil = new Date(Date.now() + LOCK_DURATION_MS).toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("zalo_oauth_tokens")
    .update({ locked_until: claimUntil })
    .eq("id", 1)
    .or(`locked_until.is.null,locked_until.lt.${new Date().toISOString()}`)
    .select("*")
    .single();

  if (claimError || !claimed) {
    // someone else is refreshing — poll for their result
    for (let attempt = 0; attempt < LOCK_POLL_MAX_ATTEMPTS; attempt++) {
      await sleep(LOCK_POLL_INTERVAL_MS);
      const { data: latest } = await supabase
        .from("zalo_oauth_tokens")
        .select("*")
        .eq("id", 1)
        .single();
      if (latest && new Date(latest.expires_at).getTime() - REFRESH_SAFETY_BUFFER_MS > Date.now()) {
        return latest.access_token;
      }
    }
    throw new Error("Timed out waiting for concurrent Zalo token refresh to finish.");
  }

  try {
    const credentials = await getZaloCredentials();
    const token = await requestToken(credentials, {
      refresh_token: claimed.refresh_token,
      app_id: credentials.appId,
      grant_type: "refresh_token",
    });
    await persistToken(token);
    return token.access_token;
  } catch (err) {
    // release the lock so a later call can retry instead of waiting out the full TTL
    await supabase.from("zalo_oauth_tokens").update({ locked_until: null }).eq("id", 1);
    throw err;
  }
}
