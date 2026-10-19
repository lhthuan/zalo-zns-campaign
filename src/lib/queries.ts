"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

/**
 * Query keys for every server resource the dashboard reads. Mutations
 * invalidate by prefix (e.g. ["campaigns"] refreshes every campaign list
 * variant), so keep related keys under a shared first element.
 */
export const queryKeys = {
  templates: ["templates"] as const,
  campaigns: ["campaigns"] as const,
  campaignList: (includeHidden: boolean) => ["campaigns", "list", { includeHidden }] as const,
  campaign: (id: string) => ["campaigns", "detail", id] as const,
  dashboard: (days: string) => ["dashboard", days] as const,
  apiLogs: (page: number, phone: string) => ["api-logs", { page, phone }] as const,
  oaInfo: ["oa-info"] as const,
  customers: ["customers"] as const,
  customerGroups: ["customer-groups"] as const,
  importBatches: ["import-batches"] as const,
  settings: ["settings"] as const,
};

export interface ZaloTemplateParam {
  name: string;
  require: boolean;
  type: string;
  maxLength?: number;
  minLength?: number;
}

export interface ZaloTemplate {
  id: string;
  template_id: string;
  template_name: string;
  status: string;
  tag: string | null;
  template_data_schema: ZaloTemplateParam[] | null;
  preview_url: string | null;
  price_sdt: number | null;
  price_uid: number | null;
  last_synced_at: string | null;
}

export const templatesQuery = queryOptions({
  queryKey: queryKeys.templates,
  queryFn: () => apiFetch<{ data: ZaloTemplate[] }>("/api/templates").then((j) => j.data ?? []),
  // Templates only change when someone presses "sync", which invalidates this.
  staleTime: 5 * 60_000,
  meta: { errorMessage: "Không tải được danh sách template" },
});

export function useTemplates() {
  return useQuery(templatesQuery);
}

/** Only approved templates — the ones a campaign or single send can use. */
export function useEnabledTemplates() {
  return useQuery({
    ...templatesQuery,
    select: (data) => data.filter((tpl) => tpl.status === "ENABLE"),
  });
}

export interface ImportBatch {
  import_batch: string;
  customer_count: number;
  last_imported_at: string;
}

export interface CustomerGroup {
  group_id: string;
  name: string;
  customer_count: number;
}

export const importBatchesQuery = queryOptions({
  queryKey: queryKeys.importBatches,
  queryFn: () => apiFetch<{ data: ImportBatch[] }>("/api/customers/import-batches").then((j) => j.data ?? []),
  meta: { errorMessage: "Không tải được danh sách lô khách hàng" },
});

export const customerGroupsQuery = queryOptions({
  queryKey: queryKeys.customerGroups,
  queryFn: () => apiFetch<{ data: CustomerGroup[] }>("/api/customer-groups").then((j) => j.data ?? []),
  meta: { errorMessage: "Không tải được danh sách nhóm khách hàng" },
});

/** Total number of customers in the directory. */
export const customerCountQuery = queryOptions({
  queryKey: [...queryKeys.customers, "count"],
  queryFn: () => apiFetch<{ total: number }>("/api/customers?page=1&pageSize=1").then((j) => j.total ?? 0),
});

export const oaInfoQuery = queryOptions({
  queryKey: queryKeys.oaInfo,
  queryFn: () => apiFetch<{ data: { name: string } }>("/api/zalo/oa-info").then((j) => j.data),
  staleTime: 10 * 60_000,
  retry: false,
});
