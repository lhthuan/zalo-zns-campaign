import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// customers.import_batch is a single column overwritten every time this
// customer is touched by a later import/campaign — see migration 013's
// comment. This reads the append-only log instead, so every batch that has
// ever touched this customer stays visible, not just the most recent one.
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireUser();
    const { id } = await params;
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("customer_import_history")
      .select("id, import_batch, imported_at")
      .eq("customer_id", id)
      .order("imported_at", { ascending: false });
    if (error) throw error;

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
