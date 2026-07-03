import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { parseSpreadsheet, mapRowsToRecipients, type ColumnMapping } from "@/lib/spreadsheet/import";

const mappingSchema = z.object({
  customer_code: z.string().optional(),
  name: z.string().optional(),
  phone: z.string(),
  zalo_uid: z.string().optional(),
  templateParams: z.record(z.string(), z.string()),
});

const fixedTemplateDataSchema = z.record(z.string(), z.string());

const ALL_CUSTOMERS = "__all__";
const INSERT_CHUNK_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

interface RecipientBase {
  phone: string;
  zalo_uid: string | null;
  customer_id: string | null;
  template_data: Record<string, string>;
}

export async function GET() {
  try {
    await requireUser();
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("campaigns")
      .select("*, zalo_templates(template_name)")
      .order("created_at", { ascending: false });
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

    if (mode === "broadcast") {
      const customerBatchRaw = formData.get("customer_batch");
      const fixedRaw = formData.get("fixed_template_data");
      if (typeof fixedRaw !== "string") {
        return NextResponse.json({ error: "Missing fixed_template_data" }, { status: 400 });
      }
      const fixedTemplateData = fixedTemplateDataSchema.parse(JSON.parse(fixedRaw));
      const batchLabel =
        typeof customerBatchRaw === "string" && customerBatchRaw !== ALL_CUSTOMERS
          ? customerBatchRaw
          : null;

      let query = supabase.from("customers").select("id, phone, zalo_uid");
      if (batchLabel) query = query.eq("import_batch", batchLabel);
      const { data: customers, error } = await query;
      if (error) throw error;
      if (!customers || customers.length === 0) {
        return NextResponse.json({ error: "Danh sách khách hàng trống" }, { status: 400 });
      }

      recipientsBase = customers.map((c) => ({
        phone: c.phone,
        zalo_uid: c.zalo_uid,
        customer_id: c.id,
        template_data: fixedTemplateData,
      }));
      sourceFileName = batchLabel ? `Lô: ${batchLabel}` : "Tất cả khách hàng";
    } else {
      const file = formData.get("file");
      const mappingRaw = formData.get("mapping");
      if (!(file instanceof File) || typeof mappingRaw !== "string") {
        return NextResponse.json({ error: "Missing file or mapping" }, { status: 400 });
      }
      const mapping: ColumnMapping = mappingSchema.parse(JSON.parse(mappingRaw));

      const buffer = await file.arrayBuffer();
      const rows = parseSpreadsheet(buffer);
      const imported = mapRowsToRecipients(rows, mapping).filter((r) => r.phone);

      if (imported.length === 0) {
        return NextResponse.json(
          { error: "No valid rows (missing phone) found in file" },
          { status: 400 }
        );
      }

      // Upsert every uploaded recipient into the customers table, tagged with this
      // campaign's name so it becomes a reusable list later (per requirement: after
      // sending a custom campaign, keep the customer data referenced by campaign name).
      // Split into two upsert groups for the same reason as customers/import/route.ts:
      // PostgREST's ON CONFLICT SET columns come from the whole batch's key union, so
      // rows without a UID must never share a batch with rows that do have one.
      interface CustomerUpsertRow {
        name: string;
        phone: string;
        import_batch: string;
        customer_code?: string;
        zalo_uid?: string;
      }

      const withUid: CustomerUpsertRow[] = [];
      const withoutUid: CustomerUpsertRow[] = [];
      for (const r of imported) {
        const row: CustomerUpsertRow = {
          name: r.name || r.phone,
          phone: r.phone,
          import_batch: name.trim(),
        };
        if (r.customer_code) row.customer_code = r.customer_code;
        if (r.zalo_uid) {
          row.zalo_uid = r.zalo_uid;
          withUid.push(row);
        } else {
          withoutUid.push(row);
        }
      }

      const customerByPhone = new Map<string, { id: string; zalo_uid: string | null }>();
      for (const group of [withUid, withoutUid]) {
        if (group.length === 0) continue;
        const { data, error } = await supabase
          .from("customers")
          .upsert(group, { onConflict: "phone", ignoreDuplicates: false })
          .select("id, phone, zalo_uid");
        if (error) throw error;
        for (const c of data ?? []) customerByPhone.set(c.phone, { id: c.id, zalo_uid: c.zalo_uid });
      }

      recipientsBase = imported.map((r) => {
        const customer = customerByPhone.get(r.phone);
        const zaloUid = r.zalo_uid || customer?.zalo_uid || null;
        return {
          phone: r.phone,
          zalo_uid: zaloUid,
          customer_id: customer?.id ?? null,
          template_data: r.template_data,
        };
      });
      sourceFileName = file.name;
    }

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .insert({
        name: name.trim(),
        template_id: templateId,
        total_recipients: recipientsBase.length,
        source_file_name: sourceFileName,
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
      { id: campaign.id, totalRecipients: recipientsBase.length, byMode },
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
