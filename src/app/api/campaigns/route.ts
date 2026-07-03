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

const INSERT_CHUNK_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
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
    const file = formData.get("file");
    const mappingRaw = formData.get("mapping");

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof templateId !== "string" ||
      !(file instanceof File) ||
      typeof mappingRaw !== "string"
    ) {
      return NextResponse.json({ error: "Missing name, template_id, file or mapping" }, { status: 400 });
    }
    const mapping: ColumnMapping = mappingSchema.parse(JSON.parse(mappingRaw));

    const supabase = createAdminClient();

    const { data: template, error: templateError } = await supabase
      .from("zalo_templates")
      .select("*")
      .eq("id", templateId)
      .single();
    if (templateError || !template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const buffer = await file.arrayBuffer();
    const rows = parseSpreadsheet(buffer);
    const imported = mapRowsToRecipients(rows, mapping).filter((r) => r.phone);

    if (imported.length === 0) {
      return NextResponse.json({ error: "No valid rows (missing phone) found in file" }, { status: 400 });
    }

    const phones = [...new Set(imported.map((r) => r.phone))];
    const customerByPhone = new Map<string, { id: string; zalo_uid: string | null }>();
    for (const phoneChunk of chunk(phones, 500)) {
      const { data: existing, error } = await supabase
        .from("customers")
        .select("id, phone, zalo_uid")
        .in("phone", phoneChunk);
      if (error) throw error;
      for (const c of existing ?? []) customerByPhone.set(c.phone, { id: c.id, zalo_uid: c.zalo_uid });
    }

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .insert({
        name: name.trim(),
        template_id: templateId,
        total_recipients: imported.length,
        source_file_name: file.name,
        created_by: user.id,
      })
      .select()
      .single();
    if (campaignError) throw campaignError;

    const recipientRows = imported.map((r, index) => {
      const customer = customerByPhone.get(r.phone);
      const zaloUid = r.zalo_uid || customer?.zalo_uid || null;
      return {
        campaign_id: campaign.id,
        customer_id: customer?.id ?? null,
        phone: r.phone,
        zalo_uid: zaloUid,
        template_data: r.template_data,
        send_mode: (zaloUid ? "uid" : "phone") as "uid" | "phone",
        tracking_id: crypto.randomBytes(16).toString("hex"),
        batch_number: Math.floor(index / 100) + 1,
      };
    });

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

    return NextResponse.json({ id: campaign.id, totalRecipients: imported.length, byMode }, { status: 201 });
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
