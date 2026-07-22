import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { exportReportToXlsx, exportReportToCsv, type ReportRow } from "@/lib/spreadsheet/export";
import { fetchAllRows } from "@/lib/supabase/pagination";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface RecipientExportRow {
  phone: string | null;
  send_mode: string;
  status: string;
  zalo_msg_id: string | null;
  error_code: string | null;
  error_message: string | null;
  sent_at: string | null;
  customers: { name: string | null } | null;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireUser();
    const { id } = await params;
    const format = request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "xlsx";

    const supabase = createAdminClient();
    // A bare .select() is capped at 1000 rows by PostgREST — must page
    // through with .range() or any campaign over 1000 recipients silently
    // exports only its first 1000 (see docs/ARCHITECTURE.md §8).
    const data = await fetchAllRows<RecipientExportRow>((from, to) =>
      supabase
        .from("campaign_recipients")
        .select("phone, send_mode, status, zalo_msg_id, error_code, error_message, sent_at, customers(name)")
        .eq("campaign_id", id)
        .order("created_at", { ascending: true })
        .range(from, to)
    );

    const rows: ReportRow[] = (data ?? []).map((r) => ({
      phone: r.phone,
      customer_name: r.customers?.name ?? null,
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
