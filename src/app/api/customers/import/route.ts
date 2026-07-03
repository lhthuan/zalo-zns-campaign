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

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, "");
}

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
    const batchNameRaw = formData.get("batch_name");
    if (!(file instanceof File) || typeof mappingRaw !== "string") {
      return NextResponse.json({ error: "Missing file or mapping" }, { status: 400 });
    }
    const mapping = mappingSchema.parse(JSON.parse(mappingRaw));
    const batchName =
      (typeof batchNameRaw === "string" ? batchNameRaw.trim() : "") || stripExtension(file.name);

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

        // zalo_uid is intentionally omitted (not set to null) when the file has no
        // value for it, so re-importing a phone list without a UID column doesn't
        // wipe out a UID already known for that customer from a prior import/send.
        const zaloUid = cell(row, mapping.zalo_uid);
        return {
          customer_code: cell(row, mapping.customer_code) || null,
          name: cell(row, mapping.name) || phone,
          phone,
          import_batch: batchName,
          ...(zaloUid ? { zalo_uid: zaloUid } : {}),
          extra_fields,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    if (customers.length === 0) {
      return NextResponse.json({ error: "No valid rows (missing phone) found in file" }, { status: 400 });
    }

    // PostgREST upsert derives its ON CONFLICT DO UPDATE SET columns from the
    // union of keys across the whole batch — if even one row includes
    // zalo_uid, every other row in the same batch gets zalo_uid overwritten
    // with NULL. Split into two upserts so rows without a UID value never
    // touch that column at all.
    const withUid = customers.filter((c) => "zalo_uid" in c);
    const withoutUid = customers.filter((c) => !("zalo_uid" in c));

    const supabase = createAdminClient();
    let imported = 0;
    for (const group of [withUid, withoutUid]) {
      if (group.length === 0) continue;
      const { data, error } = await supabase
        .from("customers")
        .upsert(group, { onConflict: "phone", ignoreDuplicates: false })
        .select("id");
      if (error) throw error;
      imported += data?.length ?? 0;
    }

    return NextResponse.json({ imported, totalRows: rows.length });
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
