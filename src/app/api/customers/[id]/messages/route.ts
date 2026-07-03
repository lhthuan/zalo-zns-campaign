import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export interface MessageLogEntry {
  id: string;
  source: "campaign" | "test_send" | "api";
  sourceLabel: string;
  templateLabel: string;
  templateData: Record<string, unknown>;
  sendMode: string;
  success: boolean;
  zaloMsgId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  at: string | null;
}

// Combines every source that can send a ZNS to this customer — campaigns,
// "Gửi thử", and the external /api/sendzns — into one timeline. Each source
// has a different schema, so this normalizes them rather than trying to
// union the tables in SQL.
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireUser();
    const { id } = await params;
    const supabase = createAdminClient();

    const [campaignRes, testSendRes, apiRes] = await Promise.all([
      supabase
        .from("campaign_recipients")
        .select("id, template_data, send_mode, status, zalo_msg_id, error_code, error_message, sent_at, created_at, campaigns(name, zalo_templates(template_name))")
        .eq("customer_id", id)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("test_send_log")
        .select("id, template_id, template_data, send_mode, success, zalo_msg_id, error_code, error_message, created_at")
        .eq("customer_id", id)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("api_send_log")
        .select("id, template_id, template_data, send_mode, success, zalo_msg_id, error_code, error_message, created_at, api_keys(name)")
        .eq("customer_id", id)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    if (campaignRes.error) throw campaignRes.error;
    if (testSendRes.error) throw testSendRes.error;
    if (apiRes.error) throw apiRes.error;

    const entries: MessageLogEntry[] = [];

    for (const r of campaignRes.data ?? []) {
      const campaign = r.campaigns as unknown as {
        name: string;
        zalo_templates: { template_name: string } | null;
      } | null;
      entries.push({
        id: r.id,
        source: "campaign",
        sourceLabel: campaign?.name ?? "Chiến dịch",
        templateLabel: campaign?.zalo_templates?.template_name ?? "—",
        templateData: r.template_data as Record<string, unknown>,
        sendMode: r.send_mode,
        success: r.status === "sent",
        zaloMsgId: r.zalo_msg_id,
        errorCode: r.error_code,
        errorMessage: r.error_message,
        at: r.sent_at ?? r.created_at,
      });
    }

    for (const r of testSendRes.data ?? []) {
      entries.push({
        id: r.id,
        source: "test_send",
        sourceLabel: "Gửi thử",
        templateLabel: r.template_id,
        templateData: r.template_data as Record<string, unknown>,
        sendMode: r.send_mode,
        success: r.success,
        zaloMsgId: r.zalo_msg_id,
        errorCode: r.error_code,
        errorMessage: r.error_message,
        at: r.created_at,
      });
    }

    for (const r of apiRes.data ?? []) {
      const apiKey = r.api_keys as unknown as { name: string } | null;
      entries.push({
        id: r.id,
        source: "api",
        sourceLabel: apiKey?.name ? `API: ${apiKey.name}` : "API ngoài",
        templateLabel: r.template_id,
        templateData: r.template_data as Record<string, unknown>,
        sendMode: r.send_mode,
        success: r.success,
        zaloMsgId: r.zalo_msg_id,
        errorCode: r.error_code,
        errorMessage: r.error_message,
        at: r.created_at,
      });
    }

    entries.sort((a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime());

    return NextResponse.json({ data: entries });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
