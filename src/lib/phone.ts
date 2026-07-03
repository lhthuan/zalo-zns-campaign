// Zalo's ZNS send APIs require phone numbers in "84" + 9 digits format (no
// leading 0), e.g. 84901234567 — this is the canonical form we store.
// Common raw inputs we need to detect and convert:
//  - "0901234567" (10 digits, local leading-0 format)
//  - "901234567" (9 digits — Excel often coerces a leading-0 phone column to
//    a plain number, silently dropping the 0)
//  - "84901234567" (already canonical)
//  - any of the above with spaces/dashes/parens/+ formatting
const HEAD_DIGITS = "35789";

/**
 * Converts a raw phone input into Zalo's canonical 84xxxxxxxxx format.
 * Returns null if it can't be recognized as a valid VN mobile number.
 */
export function toCanonicalZnsPhone(raw: string): string | null {
  const digits = String(raw).replace(/\D/g, "");
  let candidate = digits;

  if (candidate.length === 10 && candidate.startsWith("0")) {
    candidate = `84${candidate.slice(1)}`;
  } else if (candidate.length === 9 && HEAD_DIGITS.includes(candidate[0])) {
    candidate = `84${candidate}`;
  }

  const re = new RegExp(`^84[${HEAD_DIGITS}]\\d{8}$`);
  return re.test(candidate) ? candidate : null;
}

export function isValidVietnamesePhone(raw: string): boolean {
  return toCanonicalZnsPhone(raw) !== null;
}
