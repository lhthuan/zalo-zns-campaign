import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { sendPhoneTemplate, sendUidTemplate, tryExtractUid } from "@/lib/zalo/api";
import { describeZaloError } from "@/lib/zalo/errorCodes";
import { mapWithConcurrency } from "@/lib/concurrency";
import type { ZaloPhoneSendResult, ZaloUidSendResult } from "@/types/domain";

const requestSchema = z.object({
  template_id: z.string(),
  customer_ids: z.array(z.string()).min(1).max(20),
  template_data: z.record(z.string(), z.string()),
});

export async function POST(request: NextRequest) {
  try {
    await requireUser();
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

    const { data: customers, error: customersError } = await supabase
      .from("customers")
      .select("*")
      .in("id", body.customer_ids);
    if (customersError) throw customersError;
    if (!customers || customers.length === 0) {
      return NextResponse.json({ error: "No customers found" }, { status: 404 });
    }

    const results = await mapWithConcurrency(customers, 5, async (customer) => {
      const sendMode: "uid" | "phone" = customer.zalo_uid ? "uid" : "phone";
      if (sendMode === "phone" && !customer.phone) {
        return {
          customerId: customer.id,
          name: customer.name,
          phone: customer.phone,
          sendMode,
          success: false,
          zaloMsgId: null,
          errorCode: null,
          errorMessage: "Khách hàng không có SĐT lẫn Zalo UID — không gửi được.",
        };
      }
      try {
        let result: ZaloUidSendResult | ZaloPhoneSendResult;
        let msgId: string | undefined;

        if (sendMode === "uid") {
          result = await sendUidTemplate({
            userId: customer.zalo_uid!,
            templateId: template.template_id,
            templateData: body.template_data,
          });
          msgId = (result as ZaloUidSendResult).data?.message_id;
        } else {
          result = await sendPhoneTemplate({
            phone: customer.phone!,
            templateId: template.template_id,
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

        return {
          customerId: customer.id,
          name: customer.name,
          phone: customer.phone,
          sendMode,
          success,
          zaloMsgId: msgId ?? null,
          errorCode: success ? null : String(result.error),
          errorMessage: success ? null : describeZaloError(result.error, result.message),
        };
      } catch (err) {
        return {
          customerId: customer.id,
          name: customer.name,
          phone: customer.phone,
          sendMode,
          success: false,
          zaloMsgId: null,
          errorCode: null,
          errorMessage: (err as Error).message,
        };
      }
    });

    return NextResponse.json({ results });
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
