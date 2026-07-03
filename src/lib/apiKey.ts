import "server-only";
import crypto from "node:crypto";

const PREFIX_LENGTH = 12;

export interface GeneratedApiKey {
  plaintext: string;
  prefix: string;
  hash: string;
}

/** Only the hash is ever stored — the plaintext is shown to the admin once, at creation time. */
export function generateApiKey(): GeneratedApiKey {
  const plaintext = `zns_${crypto.randomBytes(24).toString("base64url")}`;
  return { plaintext, prefix: plaintext.slice(0, PREFIX_LENGTH), hash: hashApiKey(plaintext) };
}

export function hashApiKey(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}
