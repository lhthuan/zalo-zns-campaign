import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { sendPhoneTemplate, sendUidTemplate, tryExtractUid } from "@/lib/zalo/api";
import { describeZaloError } from "@/lib/zalo/errorCodes";
import { toCanonicalZnsPhone } from "@/lib/phone";
import type { ZaloPhoneSendResult, ZaloUidSendResult } from "@/types/domain";
import type { Database } from "@/types/supabase";

// Contacts created here (manual entry, not yet in the directory) are tagged
// with this label — same `customers.import_batch` field bulk imports use, so
// they show up consistently in "Lô" filters and customer_import_history.
const MANUAL_ENTRY_BATCH_LABEL = "Gửi lẻ ZNS";

const requestSchema = z
  .object({
    template_id: z.string(),
    template_data: z.record(z.string(), z.string()),
    customer_id: z.string().optional(),
    manual: z
      .object({
        name: z.string().trim().optional(),
        phone: z.string(),
      })
      .optional(),
  })
  .refine((v) => Boolean(v.customer_id) !== Boolean(v.manual), {
    message: "Cần chọn đúng 1 người nhận: từ danh bạ hoặc nhập thủ công",
  });

type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = requestSchema.parse(await request.json());
    const supabase = createAdminClient();

    const { data: template, error: templateError } = await supabase
      .from("zalo_templates")
      .select("*")
      .eq("id", body.template_id)
      .single();
    if (templateError || !template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    const tpl = template;

    let customer: CustomerRow;

    if (body.customer_id) {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", body.customer_id)
        .single();
      if (error || !data) {
        return NextResponse.json({ error: "Không tìm thấy khách hàng" }, { status: 404 });
      }
      customer = data;
    } else {
      const canonicalPhone = toCanonicalZnsPhone(body.manual!.phone);
      if (!canonicalPhone) {
        return NextResponse.json({ error: "Số điện thoại không hợp lệ" }, { status: 400 });
      }

      const { data: existing, error: findError } = await supabase
        .from("customers")
        .select("*")
        .eq("phone", canonicalPhone)
        .maybeSingle();
      if (findError) throw findError;

      if (existing) {
        // Don't clobber a name already on file with a blank/different manual
        // entry — only fill it in when the existing record has none yet.
        if (!existing.name && body.manual!.name) {
          const { data: updated, error: updateError } = await supabase
            .from("customers")
            .update({ name: body.manual!.name })
            .eq("id", existing.id)
            .select("*")
            .single();
          if (updateError) throw updateError;
          customer = updated;
        } else {
          customer = existing;
        }
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("customers")
          .insert({
            name: body.manual!.name || null,
            phone: canonicalPhone,
            import_batch: MANUAL_ENTRY_BATCH_LABEL,
          })
          .select("*")
          .single();
        if (insertError) throw insertError;
        customer = inserted;

        const { error: historyError } = await supabase
          .from("customer_import_history")
          .insert({ customer_id: inserted.id, import_batch: MANUAL_ENTRY_BATCH_LABEL });
        if (historyError) throw historyError;
      }
    }

    const sendMode: "uid" | "phone" = customer.zalo_uid ? "uid" : "phone";
    if (sendMode === "phone" && !customer.phone) {
      return NextResponse.json(
        { error: "Khách hàng không có SĐT lẫn Zalo UID — không gửi được." },
        { status: 400 }
      );
    }

    async function logAndReturn(
      success: boolean,
      zaloMsgId: string | null,
      errorCode: string | null,
      errorMessage: string | null
    ) {
      await supabase.from("test_send_log").insert({
        customer_id: customer.id,
        sent_by: user.id,
        phone: customer.phone,
        zalo_uid: customer.zalo_uid,
        template_id: tpl.template_id,
        template_data: body.template_data,
        send_mode: sendMode,
        success,
        zalo_msg_id: zaloMsgId,
        error_code: errorCode,
        error_message: errorMessage,
      });
      return {
        customerId: customer.id,
        name: customer.name,
        phone: customer.phone,
        sendMode,
        success,
        zaloMsgId,
        errorCode,
        errorMessage,
      };
    }

    try {
      let result: ZaloUidSendResult | ZaloPhoneSendResult;
      let msgId: string | undefined;

      if (sendMode === "uid") {
        result = await sendUidTemplate({
          userId: customer.zalo_uid!,
          templateId: tpl.template_id,
          templateData: body.template_data,
        });
        msgId = (result as ZaloUidSendResult).data?.message_id;
      } else {
        result = await sendPhoneTemplate({
          phone: customer.phone!,
          templateId: tpl.template_id,
          templateData: body.template_data,
          trackingId: crypto.randomBytes(16).toString("hex"),
        });
        msgId = (result as ZaloPhoneSendResult).data?.msg_id;
      }

      const success = result.error === 0;
      if (success) {
        const uid = tryExtractUid(result);
        if (uid && uid !== customer.zalo_uid) {
          await supabase.from("customers").update({ zalo_uid: uid }).eq("id", customer.id);
        }
      }

      const resultOut = await logAndReturn(
        success,
        msgId ?? null,
        success ? null : String(result.error),
        success ? null : describeZaloError(result.error, result.message)
      );
      return NextResponse.json({ result: resultOut });
    } catch (err) {
      const resultOut = await logAndReturn(false, null, null, (err as Error).message);
      return NextResponse.json({ result: resultOut });
    }
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
