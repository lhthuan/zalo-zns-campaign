import "server-only";
import { Client } from "@upstash/qstash";
import { getAppUrl } from "@/lib/env";

let client: Client | null = null;

export function getQStashClient(): Client {
  if (!client) {
    client = new Client({ token: process.env.QSTASH_TOKEN! });
  }
  return client;
}

export function processBatchUrl(campaignId: string): string {
  return `${getAppUrl()}/api/campaigns/${campaignId}/process-batch`;
}

export function batchDeduplicationId(campaignId: string, batchNumber: number): string {
  return `${campaignId}-batch-${batchNumber}`;
}

export async function enqueueBatch(campaignId: string, batchNumber: number) {
  const qstash = getQStashClient();
  await qstash.publishJSON({
    url: processBatchUrl(campaignId),
    body: { campaignId, batchNumber },
    deduplicationId: batchDeduplicationId(campaignId, batchNumber),
  });
}
