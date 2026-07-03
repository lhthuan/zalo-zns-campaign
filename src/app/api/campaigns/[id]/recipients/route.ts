import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import type { RecipientStatus, SendMode } from "@/types/supabase";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const SORTABLE_COLUMNS = new Set(["phone", "send_mode", "status", "sent_at", "created_at"]);
const STATUS_VALUES = new Set<RecipientStatus>(["pending", "sent", "failed"]);
const SEND_MODE_VALUES = new Set<SendMode>(["uid", "phone"]);

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireUser();
    const { id } = await params;
    const supabase = createAdminClient();

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const pageSize = Math.min(500, Math.max(1, Number(searchParams.get("pageSize") ?? "100")));
    const filterPhone = searchParams.get("filterPhone")?.trim();
    const filterName = searchParams.get("filterName")?.trim();
    const filterStatus = searchParams.get("filterStatus")?.trim();
    const filterSendMode = searchParams.get("filterSendMode")?.trim();
    const sortParam = searchParams.get("sort")?.trim();
    const sortColumn = sortParam && SORTABLE_COLUMNS.has(sortParam) ? sortParam : "created_at";
    const sortDir = searchParams.get("dir") === "desc" ? false : true;

    const selectClause = filterName
      ? "phone, zalo_uid, send_mode, status, zalo_msg_id, error_code, error_message, sent_at, created_at, customers!inner(name)"
      : "phone, zalo_uid, send_mode, status, zalo_msg_id, error_code, error_message, sent_at, created_at, customers(name)";

    let query = supabase
      .from("campaign_recipients")
      .select(selectClause, { count: "exact" })
      .eq("campaign_id", id)
      .order(sortColumn, { ascending: sortDir })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (filterPhone) query = query.ilike("phone", `%${filterPhone}%`);
    if (filterStatus && STATUS_VALUES.has(filterStatus as RecipientStatus)) {
      query = query.eq("status", filterStatus as RecipientStatus);
    }
    if (filterSendMode && SEND_MODE_VALUES.has(filterSendMode as SendMode)) {
      query = query.eq("send_mode", filterSendMode as SendMode);
    }
    if (filterName) query = query.ilike("customers.name", `%${filterName}%`);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data ?? [], total: count ?? 0, page, pageSize });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
