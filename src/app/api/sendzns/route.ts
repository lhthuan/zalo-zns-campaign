import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashApiKey } from "@/lib/apiKey";
import { sendPhoneTemplate, sendUidTemplate, tryExtractUid } from "@/lib/zalo/api";
import { describeZaloError } from "@/lib/zalo/errorCodes";
import { isValidVietnamesePhone, normalizePhone } from "@/lib/phone";

// Public endpoint for external systems (POS, e-commerce backend, CRM...) to
// trigger a single transactional ZNS send directly, without going through
// the dashboard. Authenticated by a per-system API key (Bearer token) rather
// than the Supabase session cookie the rest of the app uses, since callers
// here have no browser session.

const bodySchema = z.object({
  phone: z.string().min(1),
  template_id: z.string().min(1),
  template_data: z.record(z.string(), z.string()).default({}),
});

export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Missing Authorization: Bearer <api_key> header" }, { status: 401 });
  }

  const { data: apiKey, error: keyError } = await supabase
    .from("api_keys")
    .select("*")
    .eq("key_hash", hashApiKey(token))
    .eq("is_active", true)
    .maybeSingle();
  if (keyError) {
    return NextResponse.json({ error: keyError.message }, { status: 500 });
  }
  if (!apiKey) {
    return NextResponse.json({ error: "Invalid or inactive API key" }, { status: 401 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidVietnamesePhone(body.phone)) {
    return NextResponse.json({ error: "Số điện thoại không hợp lệ" }, { status: 400 });
  }
  const phone = normalizePhone(body.phone);

  const { data: template, error: templateError } = await supabase
    .from("zalo_templates")
    .select("*")
    .eq("template_id", body.template_id)
    .maybeSingle();
  if (templateError) {
    return NextResponse.json({ error: templateError.message }, { status: 500 });
  }
  if (!template) {
    return NextResponse.json({ error: `Không tìm thấy template_id "${body.template_id}"` }, { status: 404 });
  }
  if (template.status !== "ENABLE") {
    return NextResponse.json(
      { error: `Template đang ở trạng thái ${template.status}, không gửi được` },
      { status: 400 }
    );
  }

  // Upsert-with-ignoreDuplicates so a repeat caller never clobbers a real
  // name/UID we already learned for this phone — it only fills in a
  // placeholder row the first time this phone is ever seen.
  const { error: upsertError } = await supabase
    .from("customers")
    .upsert({ name: phone, phone }, { onConflict: "phone", ignoreDuplicates: true });
  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, phone, zalo_uid")
    .eq("phone", phone)
    .single();
  if (customerError) {
    return NextResponse.json({ error: customerError.message }, { status: 500 });
  }

  const sendMode: "uid" | "phone" = customer.zalo_uid ? "uid" : "phone";
  let success = false;
  let zaloMsgId: string | null = null;
  let errorCode: string | null = null;
  let errorMessage: string | null = null;

  try {
    if (sendMode === "uid") {
      const result = await sendUidTemplate({
        userId: customer.zalo_uid!,
        templateId: template.template_id,
        templateData: body.template_data,
      });
      success = result.error === 0;
      zaloMsgId = result.data?.message_id ?? null;
      if (!success) {
        errorCode = String(result.error);
        errorMessage = describeZaloError(result.error, result.message);
      } else {
        const uid = tryExtractUid(result);
        if (uid && uid !== customer.zalo_uid) {
          await supabase.from("customers").update({ zalo_uid: uid }).eq("id", customer.id);
        }
      }
    } else {
      const result = await sendPhoneTemplate({
        phone,
        templateId: template.template_id,
        templateData: body.template_data,
        trackingId: crypto.randomBytes(16).toString("hex"),
      });
      success = result.error === 0;
      zaloMsgId = result.data?.msg_id ?? null;
      if (!success) {
        errorCode = String(result.error);
        errorMessage = describeZaloError(result.error, result.message);
      }
    }
  } catch (err) {
    errorMessage = (err as Error).message;
  }

  await supabase.from("api_send_log").insert({
    api_key_id: apiKey.id,
    customer_id: customer.id,
    phone,
    zalo_uid: customer.zalo_uid,
    template_id: body.template_id,
    template_data: body.template_data,
    send_mode: sendMode,
    success,
    zalo_msg_id: zaloMsgId,
    error_code: errorCode,
    error_message: errorMessage,
  });

  await supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", apiKey.id);

  return NextResponse.json(
    { success, sendMode, zaloMsgId, errorCode, errorMessage },
    { status: success ? 200 : 502 }
  );
}
