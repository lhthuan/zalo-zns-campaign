"use client";

import { Fragment, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/components/i18n-provider";
import { TableMessageRow, TableSkeletonRows } from "@/components/table-states";
import { apiFetch } from "@/lib/api-client";
import { queryKeys } from "@/lib/queries";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

interface RecipientRow {
  id: string;
  phone: string | null;
  zalo_uid: string | null;
  import_batch: string | null;
  send_mode: string;
  status: string;
  zalo_msg_id: string | null;
  error_code: string | null;
  error_message: string | null;
  template_data: Record<string, string> | null;
  sent_at: string | null;
  created_at: string;
  customers: { name: string | null } | null;
}

const PAGE_SIZE_OPTIONS = [50, 100, 200, 500];
const ALL_STATUS = "__all__";
const ALL_MODE = "__all__";

export function CampaignRecipientsGrid({ campaignId, live = false }: { campaignId: string; live?: boolean }) {
  const { t } = useTranslation("recipientsGrid");
  const STATUS_LABEL: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "outline" }> = {
    pending: { label: t("statusPending"), variant: "outline" },
    sent: { label: t("statusSent"), variant: "success" },
    failed: { label: t("statusFailed"), variant: "destructive" },
  };
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  const [filterPhone, setFilterPhone] = useState("");
  const [filterName, setFilterName] = useState("");
  const [filterStatus, setFilterStatus] = useState(ALL_STATUS);
  const [filterSendMode, setFilterSendMode] = useState(ALL_MODE);
  const [sortColumn, setSortColumn] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const debouncedPhone = useDebouncedValue(filterPhone.trim());
  const debouncedName = useDebouncedValue(filterName.trim());

  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    sort: sortColumn,
    dir: sortDir,
  });
  if (debouncedPhone) params.set("filterPhone", debouncedPhone);
  if (debouncedName) params.set("filterName", debouncedName);
  if (filterStatus !== ALL_STATUS) params.set("filterStatus", filterStatus);
  if (filterSendMode !== ALL_MODE) params.set("filterSendMode", filterSendMode);
  const queryString = params.toString();

  const { data, isPending, isFetching } = useQuery({
    queryKey: [...queryKeys.campaign(campaignId), "recipients", queryString],
    queryFn: () =>
      apiFetch<{ data: RecipientRow[]; total: number }>(`/api/campaigns/${campaignId}/recipients?${queryString}`),
    placeholderData: keepPreviousData,
    refetchInterval: live ? 5000 : false,
    meta: { errorMessage: "Không tải được danh sách người nhận" },
  });
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;

  // Any filter/sort/page-size change goes back to page 1.
  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  function handleSort(column: string) {
    if (sortColumn === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDir("asc");
    }
    setPage(1);
  }

  function sortMark(column: string) {
    return sortColumn === column ? (sortDir === "asc" ? " ▲" : " ▼") : "";
  }

  function exportUrl(format: "xlsx" | "csv") {
    return `/api/campaigns/${campaignId}/report/export?format=${format}`;
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t("totalPrefix")} <strong className="text-foreground">{total}</strong> {t("totalMatching")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Select value={String(pageSize)} onValueChange={(v) => resetPage(setPageSize)(Number(v) || 100)}>
            <SelectTrigger className="h-8 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} {t("rowsPerPage")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" nativeButton={false} render={<a href={exportUrl("xlsx")} />}>
            <Download className="size-3.5" />
            {t("exportExcel")}
          </Button>
          <Button variant="outline" size="sm" nativeButton={false} render={<a href={exportUrl("csv")} />}>
            <Download className="size-3.5" />
            {t("exportCsv")}
          </Button>
        </div>
      </div>

      <div className={`overflow-x-auto rounded-md border transition-opacity ${isFetching && !isPending ? "opacity-80" : ""}`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("phone")}>
                {t("colPhone")}
                {sortMark("phone")}
              </TableHead>
              <TableHead>{t("colCustomer")}</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("send_mode")}>
                {t("colMode")}
                {sortMark("send_mode")}
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("status")}>
                {t("colStatus")}
                {sortMark("status")}
              </TableHead>
              <TableHead>{t("colError")}</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("sent_at")}>
                {t("colSentAt")}
                {sortMark("sent_at")}
              </TableHead>
              <TableHead>{t("colContent")}</TableHead>
            </TableRow>
            <TableRow>
              <TableHead>
                <Input
                  className="h-7 text-xs"
                  placeholder={t("filterPhone")}
                  value={filterPhone}
                  onChange={(e) => resetPage(setFilterPhone)(e.target.value)}
                />
              </TableHead>
              <TableHead>
                <Input
                  className="h-7 text-xs"
                  placeholder={t("filterCustomer")}
                  value={filterName}
                  onChange={(e) => resetPage(setFilterName)(e.target.value)}
                />
              </TableHead>
              <TableHead>
                <Select
                  value={filterSendMode}
                  onValueChange={(v) => resetPage(setFilterSendMode)(v ?? ALL_MODE)}
                  items={{ [ALL_MODE]: `— ${t("allModes")} —`, uid: "UID", phone: t("colPhone") }}
                >
                  <SelectTrigger className="h-7 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_MODE}>— {t("allModes")} —</SelectItem>
                    <SelectItem value="uid">UID</SelectItem>
                    <SelectItem value="phone">{t("colPhone")}</SelectItem>
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead>
                <Select
                  value={filterStatus}
                  onValueChange={(v) => resetPage(setFilterStatus)(v ?? ALL_STATUS)}
                  items={{
                    [ALL_STATUS]: `— ${t("allStatus")} —`,
                    ...Object.fromEntries(Object.entries(STATUS_LABEL).map(([k, v]) => [k, v.label])),
                  }}
                >
                  <SelectTrigger className="h-7 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_STATUS}>— {t("allStatus")} —</SelectItem>
                    {Object.entries(STATUS_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead />
              <TableHead />
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              <TableSkeletonRows cols={7} />
            ) : rows.length === 0 ? (
              <TableMessageRow cols={7}>{t("noRows")}</TableMessageRow>
            ) : (
              rows.map((row) => {
                const statusInfo = STATUS_LABEL[row.status] ?? { label: row.status, variant: "outline" as const };
                const isExpanded = expandedId === row.id;
                const dataEntries = Object.entries(row.template_data ?? {});
                return (
                  <Fragment key={row.id}>
                    <TableRow>
                      <TableCell>{row.phone ?? "—"}</TableCell>
                      <TableCell>{row.customers?.name ?? "—"}</TableCell>
                      <TableCell>{row.send_mode}</TableCell>
                      <TableCell>
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.error_message ? `${row.error_code ?? ""} ${row.error_message}` : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.sent_at ? new Date(row.sent_at).toLocaleString("vi-VN") : "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedId(isExpanded ? null : row.id)}
                        >
                          {isExpanded ? t("hideContent") : t("viewContent")}
                        </Button>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={7} className="bg-muted/30">
                          <div className="grid grid-cols-2 gap-x-6 gap-y-1 py-1 text-xs sm:grid-cols-3">
                            <div className="flex items-baseline gap-2">
                              <span className="shrink-0 font-mono text-muted-foreground">{t("colSourceBatch")}:</span>
                              <span className="font-medium break-words">{row.import_batch || "—"}</span>
                            </div>
                            {dataEntries.map(([key, value]) => (
                              <div key={key} className="flex items-baseline gap-2">
                                <span className="shrink-0 font-mono text-muted-foreground">{key}:</span>
                                <span className="font-medium break-words">{value || "—"}</span>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="size-4" />
            {t("previous")}
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums">
            {t("pagePrefix")} {page}/{totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            {t("next")}
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
