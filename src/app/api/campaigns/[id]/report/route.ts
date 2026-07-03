import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const PAGE_SIZE = 50;

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireUser();
    const { id } = await params;
    const supabase = createAdminClient();

    const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? "1"));

    const [sentUid, sentPhone, failed, pending, rows] = await Promise.all([
      supabase
        .from("campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id)
        .eq("status", "sent")
        .eq("send_mode", "uid"),
      supabase
        .from("campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id)
        .eq("status", "sent")
        .eq("send_mode", "phone"),
      supabase
        .from("campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id)
        .eq("status", "failed"),
      supabase
        .from("campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id)
        .eq("status", "pending"),
      supabase
        .from("campaign_recipients")
        .select("phone, send_mode, status, zalo_msg_id, error_code, error_message, sent_at, customers(name)")
        .eq("campaign_id", id)
        .order("created_at", { ascending: true })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    ]);

    if (rows.error) throw rows.error;

    return NextResponse.json({
      summary: {
        sentUid: sentUid.count ?? 0,
        sentPhone: sentPhone.count ?? 0,
        failed: failed.count ?? 0,
        pending: pending.count ?? 0,
      },
      rows: rows.data,
      page,
      pageSize: PAGE_SIZE,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
