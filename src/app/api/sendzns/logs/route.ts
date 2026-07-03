import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const supabase = createAdminClient();

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? "20")));
    const phone = searchParams.get("phone")?.trim();

    let query = supabase
      .from("api_send_log")
      .select("*, api_keys(name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (phone) query = query.ilike("phone", `%${phone}%`);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({ data, total: count ?? 0, page, pageSize });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
