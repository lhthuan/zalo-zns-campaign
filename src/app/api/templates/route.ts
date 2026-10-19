import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";

export async function GET() {
  try {
    await requireUser();
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("zalo_templates").select("*");
    if (error) throw error;
    // Newest first. template_id is a text column of numeric IDs, so compare
    // numerically — string order would put "99999" above "600501".
    data.sort((a, b) => Number(b.template_id) - Number(a.template_id));
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
