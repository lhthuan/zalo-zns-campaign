// Vietnamese mobile numbers: 10 digits starting with 0, or 11 digits starting
// with 84 (no leading 0) — head digit after the prefix is one of 3/5/7/8/9,
// which covers all current mobile carrier prefixes.
const VN_MOBILE_RE = /^(?:0|84)[35789]\d{8}$/;

export function normalizePhone(raw: string): string {
  return raw.replace(/[\s.\-()]/g, "").replace(/^\+/, "");
}

export function isValidVietnamesePhone(raw: string): boolean {
  return VN_MOBILE_RE.test(normalizePhone(raw));
}
