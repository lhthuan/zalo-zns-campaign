"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
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

interface RecipientRow {
  phone: string | null;
  zalo_uid: string | null;
  send_mode: string;
  status: string;
  zalo_msg_id: string | null;
  error_code: string | null;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
  customers: { name: string | null } | null;
}

const PAGE_SIZE_OPTIONS = [50, 100, 200, 500];
const ALL_STATUS = "__all__";
const ALL_MODE = "__all__";

const STATUS_LABEL: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "outline" }> = {
  pending: { label: "Chờ gửi", variant: "outline" },
  sent: { label: "Thành công", variant: "success" },
  failed: { label: "Thất bại", variant: "destructive" },
};

export function CampaignRecipientsGrid({ campaignId }: { campaignId: string }) {
  const [rows, setRows] = useState<RecipientRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [loading, setLoading] = useState(false);

  const [filterPhone, setFilterPhone] = useState("");
  const [filterName, setFilterName] = useState("");
  const [filterStatus, setFilterStatus] = useState(ALL_STATUS);
  const [filterSendMode, setFilterSendMode] = useState(ALL_MODE);
  const [sortColumn, setSortColumn] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const buildParams = useCallback(
    (targetPage: number) => {
      const params = new URLSearchParams({
        page: String(targetPage),
        pageSize: String(pageSize),
        sort: sortColumn,
        dir: sortDir,
      });
      if (filterPhone.trim()) params.set("filterPhone", filterPhone.trim());
      if (filterName.trim()) params.set("filterName", filterName.trim());
      if (filterStatus !== ALL_STATUS) params.set("filterStatus", filterStatus);
      if (filterSendMode !== ALL_MODE) params.set("filterSendMode", filterSendMode);
      return params;
    },
    [pageSize, sortColumn, sortDir, filterPhone, filterName, filterStatus, filterSendMode]
  );

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/campaigns/${campaignId}/recipients?${buildParams(page).toString()}`);
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      toast.error(json.error ?? "Không tải được danh sách người nhận");
      return;
    }
    setRows(json.data ?? []);
    setTotal(json.total ?? 0);
  }, [campaignId, buildParams, page]);

  useEffect(() => {
    // Standard fetch-on-mount/filter-change: `load` awaits before calling setState.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Reset to page 1 whenever a filter or sort changes (not on page itself).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [filterPhone, filterName, filterStatus, filterSendMode, sortColumn, sortDir, pageSize]);

  function handleSort(column: string) {
    if (sortColumn === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDir("asc");
    }
  }

  function exportUrl(format: "xlsx" | "csv") {
    return `/api/campaigns/${campaignId}/report/export?format=${format}`;
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Tổng <strong className="text-foreground">{total}</strong> người nhận thoả điều kiện
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" render={<a href={exportUrl("xlsx")} />}>
            Xuất Excel
          </Button>
          <Button variant="outline" size="sm" render={<a href={exportUrl("csv")} />}>
            Xuất CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v) || 100)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} dòng / trang
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("phone")}>
                SĐT{sortColumn === "phone" && (sortDir === "asc" ? " ▲" : " ▼")}
              </TableHead>
              <TableHead>Khách hàng</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("send_mode")}>
                Chế độ{sortColumn === "send_mode" && (sortDir === "asc" ? " ▲" : " ▼")}
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("status")}>
                Trạng thái{sortColumn === "status" && (sortDir === "asc" ? " ▲" : " ▼")}
              </TableHead>
              <TableHead>Lỗi</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("sent_at")}>
                Thời gian gửi{sortColumn === "sent_at" && (sortDir === "asc" ? " ▲" : " ▼")}
              </TableHead>
            </TableRow>
            <TableRow>
              <TableHead>
                <Input
                  className="h-7 text-xs"
                  placeholder="Lọc SĐT..."
                  value={filterPhone}
                  onChange={(e) => setFilterPhone(e.target.value)}
                />
              </TableHead>
              <TableHead>
                <Input
                  className="h-7 text-xs"
                  placeholder="Lọc tên KH..."
                  value={filterName}
                  onChange={(e) => setFilterName(e.target.value)}
                />
              </TableHead>
              <TableHead>
                <Select
                  value={filterSendMode}
                  onValueChange={(v) => setFilterSendMode(v ?? ALL_MODE)}
                  items={{ [ALL_MODE]: "— Tất cả —", uid: "UID", phone: "SĐT" }}
                >
                  <SelectTrigger className="h-7 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_MODE}>— Tất cả —</SelectItem>
                    <SelectItem value="uid">UID</SelectItem>
                    <SelectItem value="phone">SĐT</SelectItem>
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead>
                <Select
                  value={filterStatus}
                  onValueChange={(v) => setFilterStatus(v ?? ALL_STATUS)}
                  items={{
                    [ALL_STATUS]: "— Tất cả —",
                    ...Object.fromEntries(Object.entries(STATUS_LABEL).map(([k, v]) => [k, v.label])),
                  }}
                >
                  <SelectTrigger className="h-7 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_STATUS}>— Tất cả —</SelectItem>
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Đang tải...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Không có người nhận nào khớp điều kiện
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, i) => {
                const statusInfo = STATUS_LABEL[row.status] ?? { label: row.status, variant: "outline" as const };
                return (
                  <TableRow key={i}>
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
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Trước
          </Button>
          <span className="text-sm text-muted-foreground">
            Trang {page}/{totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Sau
          </Button>
        </div>
      )}
    </div>
  );
}
