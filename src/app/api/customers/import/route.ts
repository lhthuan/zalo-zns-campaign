import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { validateMappedCustomer, type MappedCustomerRow } from "@/lib/spreadsheet/import";

const rowSchema = z.object({
  customer_code: z.string().nullable(),
  name: z.string().trim().min(1),
  phone: z.string().nullable(),
  zalo_uid: z.string().nullable(),
  extra_fields: z.record(z.string(), z.string()),
});

const bodySchema = z.object({
  batch_name: z.string().trim().min(1),
  // Rows are validated client-side (preview step) before this call, but we
  // never trust the client alone — validateMappedCustomer() re-checks below.
  rows: z.array(rowSchema).min(1).max(20000),
});

type StampedRow = MappedCustomerRow & { import_batch: string };

export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const body = bodySchema.parse(await request.json());
    const supabase = createAdminClient();

    const withPhone: StampedRow[] = [];
    const uidOnly: StampedRow[] = [];
    let rejected = 0;

    for (const row of body.rows) {
      if (validateMappedCustomer(row)) {
        rejected++;
        continue;
      }
      const stamped: StampedRow = { ...row, import_batch: body.batch_name };
      if (stamped.phone) withPhone.push(stamped);
      else uidOnly.push(stamped);
    }

    let imported = 0;

    if (withPhone.length > 0) {
      // Same reasoning as elsewhere: PostgREST's upsert derives its ON CONFLICT
      // SET columns from the whole batch's key union, so rows without a UID
      // must never share a batch with rows that have one.
      const withUid = withPhone.filter((r) => r.zalo_uid);
      const withoutUid = withPhone.filter((r) => !r.zalo_uid);
      for (const group of [withUid, withoutUid]) {
        if (group.length === 0) continue;
        const { data, error } = await supabase
          .from("customers")
          .upsert(group, { onConflict: "phone", ignoreDuplicates: false })
          .select("id");
        if (error) throw error;
        imported += data?.length ?? 0;
      }
    }

    // zalo_uid's unique index is partial (where zalo_uid is not null), which
    // Postgres can't use as a plain ON CONFLICT arbiter through PostgREST —
    // so phone-less rows are upserted by hand instead.
    for (const row of uidOnly) {
      const { data: existing, error: findError } = await supabase
        .from("customers")
        .select("id")
        .eq("zalo_uid", row.zalo_uid as string)
        .maybeSingle();
      if (findError) throw findError;

      if (existing) {
        const { error } = await supabase
          .from("customers")
          .update({
            name: row.name,
            customer_code: row.customer_code,
            import_batch: row.import_batch,
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("customers").insert(row);
        if (error) throw error;
      }
      imported++;
    }

    return NextResponse.json({ imported, totalRows: body.rows.length, rejected });
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
