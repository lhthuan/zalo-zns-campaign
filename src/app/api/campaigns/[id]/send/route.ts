import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { enqueueBatch } from "@/lib/qstash/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    await requireUser();
    const { id } = await params;
    const supabase = createAdminClient();

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", id)
      .single();
    if (campaignError || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (campaign.status !== "draft") {
      return NextResponse.json({ error: `Campaign is already ${campaign.status}` }, { status: 409 });
    }

    const { data: batchRows, error: batchError } = await supabase
      .from("campaign_recipients")
      .select("batch_number")
      .eq("campaign_id", id);
    if (batchError) throw batchError;

    const batchNumbers = [...new Set((batchRows ?? []).map((r) => r.batch_number))].sort((a, b) => a - b);
    if (batchNumbers.length === 0) {
      return NextResponse.json({ error: "Campaign has no recipients" }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from("campaigns")
      .update({ status: "sending", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (updateError) throw updateError;

    await Promise.all(batchNumbers.map((batchNumber) => enqueueBatch(id, batchNumber)));

    return NextResponse.json({ status: "sending", batches: batchNumbers.length });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
