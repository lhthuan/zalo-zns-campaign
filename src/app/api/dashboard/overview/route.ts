import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const supabase = createAdminClient();

    const daysParam = request.nextUrl.searchParams.get("days");
    const daysBack = daysParam && daysParam !== "all" ? Number(daysParam) : null;

    const { data, error } = await supabase.rpc("dashboard_overview", { days_back: daysBack });
    if (error) throw error;

    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
