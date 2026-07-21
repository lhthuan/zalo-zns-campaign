import "server-only";

export interface QStashEvent {
  time: number;
  messageId: string;
  state: string;
  responseStatus: number | null;
  batchNumber: number | null;
}

interface RawQStashEvent {
  time: number;
  messageId: string;
  state: string;
  body: string;
  responseStatus?: number;
}

/**
 * Pages through QStash's /v2/events (most recent first), decoding each
 * event's body to match this campaign's enqueued batches by campaignId.
 * QStash doesn't support filtering events server-side by arbitrary payload
 * fields, so this fetches broadly and filters client-side — capped at
 * `maxPages` so a busy account's event history doesn't make this crawl
 * forever (events are typically only retained a few days anyway).
 *
 * This is what surfaced the "campaign stuck at exactly 1000 sent" bug: the
 * app's own DB showed 1993 recipients silently "pending" with zero error,
 * but QStash's events showed no CREATED event at all for those batches —
 * proof the enqueue call itself never ran for them (a pagination bug in the
 * batch list query, not a delivery failure), which the DB alone can't show.
 */
export async function fetchQStashEventsForCampaign(
  campaignId: string,
  maxPages = 20
): Promise<QStashEvent[]> {
  const token = process.env.QSTASH_TOKEN!;
  const base = (process.env.QSTASH_URL || "https://qstash.upstash.io").replace(/\/+$/, "");
  let cursor = "";
  const matched: QStashEvent[] = [];

  for (let page = 0; page < maxPages; page++) {
    const url = cursor ? `${base}/v2/events?cursor=${encodeURIComponent(cursor)}` : `${base}/v2/events`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`QStash events request failed (${res.status})`);
    const json = (await res.json()) as { events?: RawQStashEvent[]; cursor?: string };

    for (const e of json.events ?? []) {
      let decoded: { campaignId?: string; batchNumber?: number } = {};
      try {
        decoded = JSON.parse(Buffer.from(e.body, "base64").toString("utf8"));
      } catch {
        continue;
      }
      if (decoded.campaignId === campaignId) {
        matched.push({
          time: e.time,
          messageId: e.messageId,
          state: e.state,
          responseStatus: e.responseStatus ?? null,
          batchNumber: decoded.batchNumber ?? null,
        });
      }
    }

    if (!json.cursor) break;
    cursor = json.cursor;
  }

  return matched;
}
