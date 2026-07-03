import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const PREVIEW_LIMIT = 50;

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireUser();
    const { id } = await params;
    const supabase = createAdminClient();

    const [{ data: rows, error: rowsError }, { count: uidCount }, { count: phoneCount }] = await Promise.all([
      supabase
        .from("campaign_recipients")
        .select("phone, zalo_uid, send_mode, template_data")
        .eq("campaign_id", id)
        .order("batch_number", { ascending: true })
        .limit(PREVIEW_LIMIT),
      supabase
        .from("campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id)
        .eq("send_mode", "uid"),
      supabase
        .from("campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id)
        .eq("send_mode", "phone"),
    ]);
    if (rowsError) throw rowsError;

    return NextResponse.json({
      sample: rows,
      counts: { uid: uidCount ?? 0, phone: phoneCount ?? 0 },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
