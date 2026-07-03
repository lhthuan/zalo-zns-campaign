import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { exportRowsToXlsx, exportRowsToCsv, type ExportColumn } from "@/lib/spreadsheet/export";

// Exports every row matching the current filter (never just the on-screen
// page) — add a field to CustomerExportRow + COLUMNS below to expose a new
// customer column in the export without touching the fetch/write logic.
interface CustomerExportRow {
  customer_code: string | null;
  name: string | null;
  phone: string | null;
  zalo_uid: string | null;
  import_batch: string | null;
  groups: string;
  created_at: string;
}

const COLUMNS: ExportColumn<CustomerExportRow>[] = [
  { label: "Mã KH", value: (r) => r.customer_code },
  { label: "Tên", value: (r) => r.name },
  { label: "SĐT", value: (r) => r.phone },
  { label: "Zalo UID", value: (r) => r.zalo_uid },
  { label: "Lô nhập", value: (r) => r.import_batch },
  { label: "Nhóm", value: (r) => r.groups },
  { label: "Ngày tạo", value: (r) => r.created_at },
];

const FETCH_CHUNK = 1000;

interface CustomerRow {
  id: string;
  customer_code: string | null;
  name: string | null;
  phone: string | null;
  zalo_uid: string | null;
  import_batch: string | null;
  created_at: string;
}

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const supabase = createAdminClient();

    const { searchParams } = request.nextUrl;
    const format = searchParams.get("format") === "csv" ? "csv" : "xlsx";
    const search = searchParams.get("search")?.trim();
    const batch = searchParams.get("batch")?.trim();
    const groupId = searchParams.get("groupId")?.trim();

    const rows: CustomerRow[] = [];
    for (let from = 0; ; from += FETCH_CHUNK) {
      let query = groupId
        ? supabase
            .from("customers")
            .select(
              "id, customer_code, name, phone, zalo_uid, import_batch, created_at, customer_group_members!inner(group_id)"
            )
            .eq("customer_group_members.group_id", groupId)
        : supabase
            .from("customers")
            .select("id, customer_code, name, phone, zalo_uid, import_batch, created_at");

      query = query.order("created_at", { ascending: false }).range(from, from + FETCH_CHUNK - 1);
      if (search) query = query.or(`phone.ilike.%${search}%,customer_code.ilike.%${search}%,name.ilike.%${search}%`);
      if (batch) query = query.eq("import_batch", batch);

      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) break;
      rows.push(...(data as unknown as CustomerRow[]));
      if (data.length < FETCH_CHUNK) break;
    }

    const groupsByCustomer = new Map<string, string[]>();
    const ids = rows.map((r) => r.id);
    for (let i = 0; i < ids.length; i += FETCH_CHUNK) {
      const chunkIds = ids.slice(i, i + FETCH_CHUNK);
      const { data, error } = await supabase
        .from("customer_group_members")
        .select("customer_id, customer_groups(name)")
        .in("customer_id", chunkIds);
      if (error) throw error;
      for (const m of data ?? []) {
        const groupName = (m.customer_groups as unknown as { name: string } | null)?.name;
        if (!groupName) continue;
        const list = groupsByCustomer.get(m.customer_id) ?? [];
        list.push(groupName);
        groupsByCustomer.set(m.customer_id, list);
      }
    }

    const exportRows: CustomerExportRow[] = rows.map((r) => ({
      customer_code: r.customer_code,
      name: r.name,
      phone: r.phone,
      zalo_uid: r.zalo_uid,
      import_batch: r.import_batch,
      groups: (groupsByCustomer.get(r.id) ?? []).join(", "),
      created_at: r.created_at,
    }));

    if (format === "csv") {
      const csv = exportRowsToCsv(exportRows, COLUMNS);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="khach-hang.csv"',
        },
      });
    }

    const buffer = exportRowsToXlsx(exportRows, COLUMNS, "Khách hàng");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="khach-hang.xlsx"',
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
