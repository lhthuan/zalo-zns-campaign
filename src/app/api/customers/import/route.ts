import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { parseSpreadsheet } from "@/lib/spreadsheet/import";

const mappingSchema = z.object({
  customer_code: z.string().optional(),
  name: z.string().optional(),
  phone: z.string(),
  zalo_uid: z.string().optional(),
});

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function cell(row: Record<string, unknown>, column: string | undefined): string {
  if (!column || FORBIDDEN_KEYS.has(column)) return "";
  const value = Object.prototype.hasOwnProperty.call(row, column) ? row[column] : undefined;
  return value == null ? "" : String(value).trim();
}

export async function POST(request: NextRequest) {
  try {
    await requireUser();

    const formData = await request.formData();
    const file = formData.get("file");
    const mappingRaw = formData.get("mapping");
    if (!(file instanceof File) || typeof mappingRaw !== "string") {
      return NextResponse.json({ error: "Missing file or mapping" }, { status: 400 });
    }
    const mapping = mappingSchema.parse(JSON.parse(mappingRaw));

    const buffer = await file.arrayBuffer();
    const rows = parseSpreadsheet(buffer);

    const mappedColumns = new Set(
      [mapping.customer_code, mapping.name, mapping.phone, mapping.zalo_uid].filter(
        (v): v is string => Boolean(v)
      )
    );

    const customers = rows
      .map((row) => {
        const phone = cell(row, mapping.phone);
        if (!phone) return null;

        const extra_fields: Record<string, string> = {};
        for (const key of Object.keys(row)) {
          if (mappedColumns.has(key) || FORBIDDEN_KEYS.has(key)) continue;
          extra_fields[key] = cell(row, key);
        }

        return {
          customer_code: cell(row, mapping.customer_code) || null,
          name: cell(row, mapping.name) || phone,
          phone,
          zalo_uid: cell(row, mapping.zalo_uid) || null,
          extra_fields,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    if (customers.length === 0) {
      return NextResponse.json({ error: "No valid rows (missing phone) found in file" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("customers")
      .upsert(customers, { onConflict: "phone", ignoreDuplicates: false })
      .select("id");
    if (error) throw error;

    return NextResponse.json({ imported: data?.length ?? 0, totalRows: rows.length });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
