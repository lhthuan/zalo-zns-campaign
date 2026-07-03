import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import {
  validateMappedCustomer,
  presentCustomerFields,
  groupRowsBySignature,
  type MappedCustomerRow,
} from "@/lib/spreadsheet/import";

const rowSchema = z.object({
  customer_code: z.string().nullable(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  zalo_uid: z.string().nullable(),
  extra_fields: z.record(z.string(), z.string()),
  groups: z.array(z.string()),
});

const bodySchema = z.object({
  batch_name: z.string().trim().min(1),
  // Rows are validated client-side (preview step) before this call, but we
  // never trust the client alone — validateMappedCustomer() re-checks below.
  rows: z.array(rowSchema).min(1).max(20000),
});

type StampedRow = MappedCustomerRow & { import_batch: string };

/** Finds or creates each named group and returns name -> id. */
async function resolveGroupIds(
  supabase: ReturnType<typeof createAdminClient>,
  names: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(names)];
  if (unique.length === 0) return new Map();

  const { data: existing, error } = await supabase
    .from("customer_groups")
    .select("id, name")
    .in("name", unique);
  if (error) throw error;

  const idByName = new Map((existing ?? []).map((g) => [g.name, g.id]));
  const missing = unique.filter((n) => !idByName.has(n));
  if (missing.length > 0) {
    const { data: created, error: createError } = await supabase
      .from("customer_groups")
      .insert(missing.map((name) => ({ name })))
      .select("id, name");
    if (createError) throw createError;
    for (const g of created ?? []) idByName.set(g.name, g.id);
  }
  return idByName;
}

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
    // phone -> id and zalo_uid -> id, so group assignment (below) can find
    // each row's resulting customer without a second round-trip per row.
    const idByPhone = new Map<string, string>();
    const idByUid = new Map<string, string>();

    if (withPhone.length > 0) {
      const withImportBatch = withPhone.map((r) => ({
        ...presentCustomerFields(r),
        phone: r.phone as string,
        import_batch: r.import_batch,
      }));
      const groups = groupRowsBySignature(withImportBatch, [
        "customer_code",
        "name",
        "zalo_uid",
        "extra_fields",
      ] as const);
      for (const group of groups) {
        const { data, error } = await supabase
          .from("customers")
          .upsert(group, { onConflict: "phone", ignoreDuplicates: false })
          .select("id, phone, zalo_uid");
        if (error) throw error;
        for (const c of data ?? []) {
          if (c.phone) idByPhone.set(c.phone, c.id);
        }
        imported += data?.length ?? 0;
      }
    }

    // zalo_uid's unique index is partial (where zalo_uid is not null), which
    // Postgres can't use as a plain ON CONFLICT arbiter through PostgREST —
    // so phone-less rows are upserted by hand instead.
    for (const row of uidOnly) {
      const fields = presentCustomerFields(row);
      const { data: existing, error: findError } = await supabase
        .from("customers")
        .select("id")
        .eq("zalo_uid", row.zalo_uid as string)
        .maybeSingle();
      if (findError) throw findError;

      if (existing) {
        if (Object.keys(fields).length > 0 || row.import_batch) {
          const { error } = await supabase
            .from("customers")
            .update({ ...fields, import_batch: row.import_batch })
            .eq("id", existing.id);
          if (error) throw error;
        }
        idByUid.set(row.zalo_uid as string, existing.id);
      } else {
        const { data: inserted, error } = await supabase
          .from("customers")
          .insert({ ...fields, zalo_uid: row.zalo_uid, import_batch: row.import_batch })
          .select("id")
          .single();
        if (error) throw error;
        idByUid.set(row.zalo_uid as string, inserted.id);
      }
      imported++;
    }

    // Group assignment: find-or-create each named group, then add every row
    // that named it as a member (duplicates ignored).
    const allGroupNames = body.rows.flatMap((r) => r.groups);
    const groupIdByName = await resolveGroupIds(supabase, allGroupNames);
    const memberRows: { group_id: string; customer_id: string }[] = [];
    for (const row of body.rows) {
      if (row.groups.length === 0) continue;
      const customerId = row.phone ? idByPhone.get(row.phone) : row.zalo_uid ? idByUid.get(row.zalo_uid) : undefined;
      if (!customerId) continue;
      for (const groupName of row.groups) {
        const groupId = groupIdByName.get(groupName);
        if (groupId) memberRows.push({ group_id: groupId, customer_id: customerId });
      }
    }
    if (memberRows.length > 0) {
      const { error } = await supabase
        .from("customer_group_members")
        .upsert(memberRows, { onConflict: "group_id,customer_id", ignoreDuplicates: true });
      if (error) throw error;
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
