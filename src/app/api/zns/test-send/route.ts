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

    const { data: customers, error: customersError } = await supabase
      .from("customers")
      .select("*")
      .in("id", body.customer_ids);
    if (customersError) throw customersError;
    if (!customers || customers.length === 0) {
      return NextResponse.json({ error: "No customers found" }, { status: 404 });
    }
    const customerList = customers;

    async function logAndReturn(
      customer: (typeof customerList)[number],
      sendMode: "uid" | "phone",
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

    const results = await mapWithConcurrency(customerList, 5, async (customer) => {
      const sendMode: "uid" | "phone" = customer.zalo_uid ? "uid" : "phone";
      if (sendMode === "phone" && !customer.phone) {
        return logAndReturn(
          customer,
          sendMode,
          false,
          null,
          null,
          "Khách hàng không có SĐT lẫn Zalo UID — không gửi được."
        );
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

        return logAndReturn(
          customer,
          sendMode,
          success,
          msgId ?? null,
          success ? null : String(result.error),
          success ? null : describeZaloError(result.error, result.message)
        );
      } catch (err) {
        return logAndReturn(customer, sendMode, false, null, null, (err as Error).message);
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
