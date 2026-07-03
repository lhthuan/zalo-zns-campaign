import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { exportReportToXlsx, exportReportToCsv, type ReportRow } from "@/lib/spreadsheet/export";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireUser();
    const { id } = await params;
    const format = request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "xlsx";

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("campaign_recipients")
      .select("phone, send_mode, status, zalo_msg_id, error_code, error_message, sent_at, customers(name)")
      .eq("campaign_id", id)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const rows: ReportRow[] = (data ?? []).map((r) => ({
      phone: r.phone,
      customer_name: (r.customers as unknown as { name: string | null } | null)?.name ?? null,
      send_mode: r.send_mode,
      status: r.status,
      zalo_msg_id: r.zalo_msg_id,
      error_code: r.error_code,
      error_message: r.error_message,
      sent_at: r.sent_at,
    }));

    if (format === "csv") {
      const csv = exportReportToCsv(rows);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="campaign-${id}-report.csv"`,
        },
      });
    }

    const buffer = exportReportToXlsx(rows);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="campaign-${id}-report.xlsx"`,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
