import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import {
  parseSpreadsheet,
  mapRowsToRecipients,
  groupRowsBySignature,
  dedupeByContactKey,
  isImportableRecipient,
  type ColumnMapping,
} from "@/lib/spreadsheet/import";
import { ALL_CUSTOMERS_BATCH } from "@/lib/customerBatch";
import { fetchAllRows } from "@/lib/supabase/pagination";

const mappingSchema = z.object({
  customer_code: z.string().optional(),
  name: z.string().optional(),
  phone: z.string().optional(),
  zalo_uid: z.string().optional(),
  templateParams: z.record(z.string(), z.string()),
});

const fixedTemplateDataSchema = z.record(z.string(), z.string());

const INSERT_CHUNK_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

interface RecipientBase {
  phone: string | null;
  zalo_uid: string | null;
  customer_id: string | null;
  template_data: Record<string, string>;
  // Snapshot of customers.import_batch (or the campaign name, in custom mode)
  // at creation time — see migration 012's comment for why this can't just be
  // read back off `customers` later.
  import_batch: string | null;
}

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const includeHidden = request.nextUrl.searchParams.get("includeHidden") === "true";
    const supabase = createAdminClient();
    let query = supabase
      .from("campaigns")
      .select("*, zalo_templates(template_name)")
      .order("created_at", { ascending: false });
    if (!includeHidden) query = query.eq("is_hidden", false);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();

    const formData = await request.formData();
    const name = formData.get("name");
    const templateId = formData.get("template_id");
    const mode = formData.get("mode") === "broadcast" ? "broadcast" : "custom";

    if (typeof name !== "string" || !name.trim() || typeof templateId !== "string") {
      return NextResponse.json({ error: "Missing name or template_id" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: template, error: templateError } = await supabase
      .from("zalo_templates")
      .select("*")
      .eq("id", templateId)
      .single();
    if (templateError || !template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    let recipientsBase: RecipientBase[];
    let sourceFileName: string;
    let customerBatchForRow: string | null = null;
    let customerGroupIdForRow: string | null = null;
    let fixedTemplateDataForRow: Record<string, string> | null = null;
    let rejectedRows = 0;
    let duplicateRows = 0;

    if (mode === "broadcast") {
      const customerBatchRaw = formData.get("customer_batch");
      const customerGroupIdRaw = formData.get("customer_group_id");
      const fixedRaw = formData.get("fixed_template_data");
      if (typeof fixedRaw !== "string") {
        return NextResponse.json({ error: "Missing fixed_template_data" }, { status: 400 });
      }
      const fixedTemplateData = fixedTemplateDataSchema.parse(JSON.parse(fixedRaw));
      const groupId = typeof customerGroupIdRaw === "string" && customerGroupIdRaw ? customerGroupIdRaw : null;
      const batchLabel =
        !groupId && typeof customerBatchRaw === "string" && customerBatchRaw !== ALL_CUSTOMERS_BATCH
          ? customerBatchRaw
          : null;

      type BroadcastCustomer = { id: string; phone: string | null; zalo_uid: string | null; import_batch: string | null };
      let customers: BroadcastCustomer[] | null;
      let sourceLabel: string;
      if (groupId) {
        const { data: group, error: groupError } = await supabase
          .from("customer_groups")
          .select("name")
          .eq("id", groupId)
          .single();
        if (groupError || !group) {
          return NextResponse.json({ error: "Nhóm khách hàng không tồn tại" }, { status: 404 });
        }
        const members = await fetchAllRows<{ customers: BroadcastCustomer | null }>((from, to) =>
          supabase
            .from("customer_group_members")
            .select("customers(id, phone, zalo_uid, import_batch)")
            .eq("group_id", groupId)
            .range(from, to)
        );
        customers = members.map((m) => m.customers).filter((c): c is BroadcastCustomer => c != null);
        sourceLabel = `Nhóm: ${group.name}`;
      } else {
        customers = await fetchAllRows<BroadcastCustomer>((from, to) => {
          let query = supabase.from("customers").select("id, phone, zalo_uid, import_batch").range(from, to);
          if (batchLabel) query = query.eq("import_batch", batchLabel);
          return query;
        });
        sourceLabel = batchLabel ? `Lô: ${batchLabel}` : "Tất cả khách hàng";
      }
      if (!customers || customers.length === 0) {
        return NextResponse.json({ error: "Danh sách khách hàng trống" }, { status: 400 });
      }

      recipientsBase = customers.map((c) => ({
        phone: c.phone,
        zalo_uid: c.zalo_uid,
        customer_id: c.id,
        template_data: fixedTemplateData,
        import_batch: c.import_batch,
      }));
      sourceFileName = sourceLabel;
      customerBatchForRow = batchLabel;
      customerGroupIdForRow = groupId;
      fixedTemplateDataForRow = fixedTemplateData;
    } else {
      const file = formData.get("file");
      const mappingRaw = formData.get("mapping");
      if (!(file instanceof File) || typeof mappingRaw !== "string") {
        return NextResponse.json({ error: "Missing file or mapping" }, { status: 400 });
      }
      const mapping: ColumnMapping = mappingSchema.parse(JSON.parse(mappingRaw));

      const buffer = await file.arrayBuffer();
      const rows = parseSpreadsheet(buffer);
      const allRows = mapRowsToRecipients(rows, mapping);
      const validRows = allRows.filter(isImportableRecipient);
      const { rows: imported, duplicateCount } = dedupeByContactKey(validRows);
      rejectedRows = allRows.length - validRows.length;
      duplicateRows = duplicateCount;

      if (imported.length === 0) {
        return NextResponse.json(
          { error: "Không có dòng hợp lệ nào (cần SĐT đúng định dạng hoặc Zalo UID)" },
          { status: 400 }
        );
      }

      // Upsert every uploaded recipient into the customers table, tagged with this
      // campaign's name so it becomes a reusable list later (per requirement: after
      // sending a custom campaign, keep the customer data referenced by campaign name).
      // Only include a field when this row actually has a value for it — an
      // absent field means "don't touch this column" on conflict, so re-uploading
      // a list without e.g. a name column never clobbers a name already on file.
      interface CustomerUpsertRow {
        name?: string;
        phone?: string;
        zalo_uid?: string;
        import_batch: string;
        customer_code?: string;
      }

      const withPhone: CustomerUpsertRow[] = [];
      const uidOnly: CustomerUpsertRow[] = [];
      for (const r of imported) {
        const row: CustomerUpsertRow = { import_batch: name.trim() };
        if (r.name) row.name = r.name;
        if (r.customer_code) row.customer_code = r.customer_code;
        if (r.phone) {
          row.phone = r.phone;
          if (r.zalo_uid) row.zalo_uid = r.zalo_uid;
          withPhone.push(row);
        } else if (r.zalo_uid) {
          row.zalo_uid = r.zalo_uid;
          uidOnly.push(row);
        }
      }

      const customerByPhone = new Map<string, { id: string; zalo_uid: string | null }>();
      const customerByUid = new Map<string, { id: string }>();

      // PostgREST's upsert derives its ON CONFLICT SET columns from the whole
      // batch's key union, so rows with a different set of present optional
      // fields must never share one upsert call.
      const phoneGroups = groupRowsBySignature(withPhone, [
        "name",
        "customer_code",
        "zalo_uid",
      ] as const);
      for (const group of phoneGroups) {
        const { data, error } = await supabase
          .from("customers")
          .upsert(group, { onConflict: "phone", ignoreDuplicates: false })
          .select("id, phone, zalo_uid");
        if (error) throw error;
        for (const c of data ?? []) {
          if (c.phone) customerByPhone.set(c.phone, { id: c.id, zalo_uid: c.zalo_uid });
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
              import_batch: row.import_batch,
              ...(row.name ? { name: row.name } : {}),
              ...(row.customer_code ? { customer_code: row.customer_code } : {}),
            })
            .eq("id", existing.id);
          if (error) throw error;
          customerByUid.set(row.zalo_uid as string, { id: existing.id });
        } else {
          const { data: inserted, error } = await supabase
            .from("customers")
            .insert(row)
            .select("id")
            .single();
          if (error) throw error;
          customerByUid.set(row.zalo_uid as string, { id: inserted.id });
        }
      }

      recipientsBase = imported.map((r) => {
        const byPhone = r.phone ? customerByPhone.get(r.phone) : undefined;
        const byUid = !r.phone && r.zalo_uid ? customerByUid.get(r.zalo_uid) : undefined;
        const zaloUid = r.zalo_uid || byPhone?.zalo_uid || null;
        return {
          phone: r.phone ?? null,
          zalo_uid: zaloUid,
          customer_id: byPhone?.id ?? byUid?.id ?? null,
          template_data: r.template_data,
          import_batch: name.trim(),
        };
      });
      sourceFileName = file.name;

      // Append-only trail of every batch that has ever touched each customer —
      // see migration 013's comment for why customers.import_batch alone (a
      // single column, overwritten on every re-import) can't answer that.
      const historyRows = [...new Set(recipientsBase.map((r) => r.customer_id).filter((id): id is string => id != null))].map(
        (customer_id) => ({ customer_id, import_batch: name.trim() })
      );
      if (historyRows.length > 0) {
        const { error } = await supabase.from("customer_import_history").insert(historyRows);
        if (error) throw error;
      }
    }

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .insert({
        name: name.trim(),
        template_id: templateId,
        total_recipients: recipientsBase.length,
        source_file_name: sourceFileName,
        creation_mode: mode,
        customer_batch: customerBatchForRow,
        customer_group_id: customerGroupIdForRow,
        fixed_template_data: fixedTemplateDataForRow,
        created_by: user.id,
      })
      .select()
      .single();
    if (campaignError) throw campaignError;

    const recipientRows = recipientsBase.map((r, index) => ({
      campaign_id: campaign.id,
      customer_id: r.customer_id,
      phone: r.phone,
      zalo_uid: r.zalo_uid,
      template_data: r.template_data,
      import_batch: r.import_batch,
      send_mode: (r.zalo_uid ? "uid" : "phone") as "uid" | "phone",
      tracking_id: crypto.randomBytes(16).toString("hex"),
      batch_number: Math.floor(index / 100) + 1,
    }));

    for (const rowChunk of chunk(recipientRows, INSERT_CHUNK_SIZE)) {
      const { error } = await supabase.from("campaign_recipients").insert(rowChunk);
      if (error) throw error;
    }

    const byMode = recipientRows.reduce(
      (acc, r) => {
        acc[r.send_mode]++;
        return acc;
      },
      { uid: 0, phone: 0 }
    );

    return NextResponse.json(
      { id: campaign.id, totalRecipients: recipientsBase.length, byMode, rejectedRows, duplicateRows },
      { status: 201 }
    );
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
