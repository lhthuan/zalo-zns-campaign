import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { toCanonicalZnsPhone } from "@/lib/phone";

// One-time maintenance action: older rows may still have phone numbers in
// whatever format they were originally entered (leading 0, etc.) from before
// canonicalization was enforced on every write path. This re-derives the
// canonical form for every existing customer and updates in place — except
// when two different customers would collapse onto the same canonical
// number (the same real phone stored twice under different formats), which
// is a genuine duplicate-data situation that needs a human decision, not a
// silent merge.
export async function POST() {
  try {
    await requireUser();
    const supabase = createAdminClient();

    const { data: customers, error } = await supabase
      .from("customers")
      .select("id, name, phone")
      .not("phone", "is", null);
    if (error) throw error;

    const canonicalToIds = new Map<string, string[]>();
    for (const c of customers ?? []) {
      const canonical = toCanonicalZnsPhone(c.phone as string);
      if (!canonical) continue;
      const ids = canonicalToIds.get(canonical) ?? [];
      ids.push(c.id);
      canonicalToIds.set(canonical, ids);
    }

    let updated = 0;
    const conflicts: { canonicalPhone: string; customerIds: string[] }[] = [];
    const unconvertible: { id: string; name: string | null; phone: string }[] = [];

    for (const c of customers ?? []) {
      const canonical = toCanonicalZnsPhone(c.phone as string);
      if (!canonical) {
        unconvertible.push({ id: c.id, name: c.name, phone: c.phone as string });
        continue;
      }
      if (canonical === c.phone) continue; // already canonical

      const owners = canonicalToIds.get(canonical) ?? [];
      if (owners.length > 1) {
        if (!conflicts.some((x) => x.canonicalPhone === canonical)) {
          conflicts.push({ canonicalPhone: canonical, customerIds: owners });
        }
        continue; // don't touch either row — needs manual review
      }

      const { error: updateError } = await supabase
        .from("customers")
        .update({ phone: canonical })
        .eq("id", c.id);
      if (updateError) throw updateError;
      updated++;
    }

    return NextResponse.json({ updated, conflicts, unconvertible });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
