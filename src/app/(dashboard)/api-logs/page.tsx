"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTranslation } from "@/components/i18n-provider";
import { PageHeader } from "@/components/page-header";
import { TableMessageRow, TableSkeletonRows } from "@/components/table-states";
import { apiFetch } from "@/lib/api-client";
import { queryKeys } from "@/lib/queries";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

interface ApiSendLogRow {
  id: string;
  phone: string;
  zalo_uid: string | null;
  template_id: string;
  send_mode: "uid" | "phone";
  success: boolean;
  zalo_msg_id: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  api_keys: { name: string } | null;
}

const PAGE_SIZE = 20;

export default function ApiLogsPage() {
  const { t } = useTranslation("apiLogs");
  const [page, setPage] = useState(1);
  const [phone, setPhone] = useState("");
  const debouncedPhone = useDebouncedValue(phone.trim());

  const { data, isPending, isFetching } = useQuery({
    queryKey: queryKeys.apiLogs(page, debouncedPhone),
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (debouncedPhone) params.set("phone", debouncedPhone);
      return apiFetch<{ data: ApiSendLogRow[]; total: number }>(`/api/sendzns/logs?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
    meta: { errorMessage: "Không tải được nhật ký" },
  });
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t("searchPlaceholder")}
          value={phone}
          onChange={(e) => {
            setPage(1);
            setPhone(e.target.value);
          }}
          className="pl-8"
        />
      </div>

      <div className={`rounded-xl border bg-card transition-opacity ${isFetching && !isPending ? "opacity-70" : ""}`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("colTime")}</TableHead>
              <TableHead>{t("colSource")}</TableHead>
              <TableHead>{t("colPhone")}</TableHead>
              <TableHead>{t("colTemplateId")}</TableHead>
              <TableHead>{t("colMode")}</TableHead>
              <TableHead>{t("colResult")}</TableHead>
              <TableHead>{t("colDetail")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              <TableSkeletonRows cols={7} />
            ) : rows.length === 0 ? (
              <TableMessageRow cols={7}>{t("noLogs")}</TableMessageRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("vi-VN")}
                  </TableCell>
                  <TableCell>{r.api_keys?.name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-sm">{r.phone}</TableCell>
                  <TableCell className="font-mono text-xs">{r.template_id}</TableCell>
                  <TableCell>{r.send_mode}</TableCell>
                  <TableCell>
                    <Badge variant={r.success ? "success" : "destructive"}>
                      {r.success ? t("success") : t("failed")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.success ? r.zalo_msg_id : r.error_message}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {t("totalPrefix")} {total} {t("totalSuffix")}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="size-4" />
            {t("previous")}
          </Button>
          <span className="tabular-nums">
            {page}/{totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t("next")}
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
