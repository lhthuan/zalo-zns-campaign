import { NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPhoneTemplate, sendUidTemplate, tryExtractUid } from "@/lib/zalo/api";
import { describeZaloError } from "@/lib/zalo/errorCodes";
import { mapWithConcurrency } from "@/lib/concurrency";

export const maxDuration = 60;

const SEND_CONCURRENCY = 8;

async function handler(request: Request): Promise<Response> {
  const { campaignId, batchNumber } = (await request.json()) as {
    campaignId: string;
    batchNumber: number;
  };

  const supabase = createAdminClient();

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("*, zalo_templates(template_id)")
    .eq("id", campaignId)
    .single();
  if (campaignError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  const zaloTemplateId = (campaign as unknown as { zalo_templates: { template_id: string } })
    .zalo_templates.template_id;

  const { data: recipients, error: recipientsError } = await supabase
    .from("campaign_recipients")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("batch_number", batchNumber)
    .eq("status", "pending")
    .limit(100);
  if (recipientsError) throw recipientsError;

  await mapWithConcurrency(recipients ?? [], SEND_CONCURRENCY, async (recipient) => {
    try {
      if (recipient.send_mode === "uid") {
        const result = await sendUidTemplate({
          userId: recipient.zalo_uid!,
          templateId: zaloTemplateId,
          templateData: recipient.template_data as Record<string, string>,
        });
        await recordResult(recipient, result.error, result.message, result.data?.message_id, result);
      } else if (recipient.phone) {
        const result = await sendPhoneTemplate({
          phone: recipient.phone,
          templateId: zaloTemplateId,
          templateData: recipient.template_data as Record<string, string>,
          trackingId: recipient.tracking_id,
        });
        await recordResult(recipient, result.error, result.message, result.data?.msg_id, result);
      } else {
        await supabase
          .from("campaign_recipients")
          .update({
            status: "failed",
            error_message: "Không có SĐT lẫn Zalo UID để gửi.",
            sent_at: new Date().toISOString(),
          })
          .eq("id", recipient.id);
      }
    } catch (err) {
      await supabase
        .from("campaign_recipients")
        .update({
          status: "failed",
          error_message: (err as Error).message,
          sent_at: new Date().toISOString(),
        })
        .eq("id", recipient.id);
    }
  });

  async function recordResult(
    recipient: { id: string; customer_id: string | null; zalo_uid: string | null },
    errorCode: number,
    message: string,
    msgId: string | undefined,
    fullResult: Parameters<typeof tryExtractUid>[0]
  ) {
    const success = errorCode === 0;
    await supabase
      .from("campaign_recipients")
      .update({
        status: success ? "sent" : "failed",
        zalo_msg_id: msgId ?? null,
        error_code: success ? null : String(errorCode),
        error_message: success ? null : describeZaloError(errorCode, message),
        sent_at: new Date().toISOString(),
      })
      .eq("id", recipient.id);

    // Only trust `data` (and thus any UID in it) on a confirmed-success response,
    // and skip the write entirely if it wouldn't change anything — matches the
    // same-shape check in the test-send route.
    if (success && recipient.customer_id) {
      const uid = tryExtractUid(fullResult);
      if (uid && uid !== recipient.zalo_uid) {
        await supabase.from("customers").update({ zalo_uid: uid }).eq("id", recipient.customer_id);
      }
    }
  }

  const [{ count: sentCount }, { count: failedCount }, { count: pendingCount }] = await Promise.all([
    supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "sent"),
    supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "failed"),
    supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "pending"),
  ]);

  const updates: {
    sent_count: number;
    failed_count: number;
    updated_at: string;
    status?: "failed" | "completed_with_errors" | "completed";
  } = {
    sent_count: sentCount ?? 0,
    failed_count: failedCount ?? 0,
    updated_at: new Date().toISOString(),
  };

  if ((pendingCount ?? 0) === 0) {
    if ((sentCount ?? 0) === 0) updates.status = "failed";
    else if ((failedCount ?? 0) > 0) updates.status = "completed_with_errors";
    else updates.status = "completed";
  }

  await supabase.from("campaigns").update(updates).eq("id", campaignId);

  return NextResponse.json({ processed: recipients?.length ?? 0 });
}

export const POST = verifySignatureAppRouter(handler);
