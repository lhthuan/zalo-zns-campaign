import "server-only";

const DEFAULT_PAGE_SIZE = 1000;

/**
 * PostgREST caps a single select's response at (by default) 1000 rows —
 * silently, with no error and no "truncated" flag. Any query that could
 * plausibly return more than that must page through with .range() instead of
 * trusting a bare .select() call to return everything.
 *
 * Found the hard way: a campaign's batch-enqueue step only ever fetched the
 * first 1000 campaign_recipients rows, so any campaign over ~1000 recipients
 * silently stopped sending at exactly batch 10 with no error anywhere. The
 * same bare-select shape existed on the customer-fetching side of broadcast
 * campaigns too (by group, and by "all"/lô) — those fail even more quietly,
 * since a truncated recipient list just looks like a smaller-than-expected
 * campaign instead of a stalled one.
 */
export async function fetchAllRows<T>(
  // Supabase query builders are thenable (PromiseLike), not actual Promise
  // instances — accepting PromiseLike lets callers pass the builder directly
  // instead of having to wrap every call site in an extra `async () => ...`.
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = DEFAULT_PAGE_SIZE
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}
