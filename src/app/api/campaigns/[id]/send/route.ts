import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { enqueueBatch } from "@/lib/qstash/client";
import { mapWithConcurrency } from "@/lib/concurrency";
import { fetchAllRows } from "@/lib/supabase/pagination";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Upstash QStash's own docs cap free-tier parallelism at 10 concurrent publish
// calls — stay comfortably under that so a large campaign's batches never get
// rejected outright.
const ENQUEUE_CONCURRENCY = 5;
const ENQUEUE_MAX_ATTEMPTS = 3;

async function fetchAllPendingBatchNumbers(
  supabase: ReturnType<typeof createAdminClient>,
  campaignId: string
): Promise<number[]> {
  const rows = await fetchAllRows<{ batch_number: number }>((from, to) =>
    supabase
      .from("campaign_recipients")
      .select("batch_number")
      .eq("campaign_id", campaignId)
      .eq("status", "pending")
      .range(from, to)
  );
  return [...new Set(rows.map((r) => r.batch_number))].sort((a, b) => a - b);
}

async function enqueueWithRetry(campaignId: string, batchNumber: number): Promise<string | null> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= ENQUEUE_MAX_ATTEMPTS; attempt++) {
    try {
      await enqueueBatch(campaignId, batchNumber);
      return null;
    } catch (err) {
      lastError = err;
      if (attempt < ENQUEUE_MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      }
    }
  }
  return (lastError as Error)?.message ?? "Unknown enqueue error";
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
    // "sending" is allowed too — this doubles as the resume path for a
    // campaign whose earlier send left some batches never enqueued (e.g. an
    // enqueue call that failed/was rejected). Only batches with pending
    // recipients get re-enqueued below, so this is safe to call repeatedly.
    if (!["draft", "sending"].includes(campaign.status)) {
      return NextResponse.json({ error: `Campaign is already ${campaign.status}` }, { status: 409 });
    }

    const batchNumbers = await fetchAllPendingBatchNumbers(supabase, id);
    if (batchNumbers.length === 0) {
      return NextResponse.json({ error: "Không còn người nhận nào đang chờ gửi" }, { status: 400 });
    }

    if (campaign.status !== "sending") {
      const { error: updateError } = await supabase
        .from("campaigns")
        .update({ status: "sending", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (updateError) throw updateError;
    }

    const enqueueErrors = await mapWithConcurrency(batchNumbers, ENQUEUE_CONCURRENCY, (batchNumber) =>
      enqueueWithRetry(id, batchNumber)
    );
    const failedBatches = batchNumbers.filter((_, i) => enqueueErrors[i] !== null);

    return NextResponse.json({
      status: "sending",
      batches: batchNumbers.length,
      failedBatches: failedBatches.length > 0 ? failedBatches : undefined,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
