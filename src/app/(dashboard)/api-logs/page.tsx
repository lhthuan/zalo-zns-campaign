"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
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
  const [rows, setRows] = useState<ApiSendLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (phone) params.set("phone", phone);
    const res = await fetch(`/api/sendzns/logs?${params.toString()}`);
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      toast.error(json.error ?? "Không tải được nhật ký");
      return;
    }
    setRows(json.data ?? []);
    setTotal(json.total ?? 0);
  }, [page, phone]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Nhật ký API</h1>
        <p className="text-sm text-muted-foreground">
          Lịch sử gửi ZNS qua API <code className="font-mono">POST /api/sendzns</code> từ các hệ thống
          ngoài (không phải chiến dịch trong app này).
        </p>
      </div>

      <Input
        placeholder="Tìm theo số điện thoại..."
        value={phone}
        onChange={(e) => {
          setPage(1);
          setPhone(e.target.value);
        }}
        className="max-w-sm"
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Thời gian</TableHead>
            <TableHead>Nguồn (key)</TableHead>
            <TableHead>SĐT</TableHead>
            <TableHead>Template ID</TableHead>
            <TableHead>Chế độ</TableHead>
            <TableHead>Kết quả</TableHead>
            <TableHead>Chi tiết</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                Đang tải...
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                Chưa có lượt gửi nào qua API
              </TableCell>
            </TableRow>
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
                    {r.success ? "Thành công" : "Thất bại"}
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

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Tổng {total} lượt gửi</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Trước
          </Button>
          <span>
            {page}/{totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Sau
          </Button>
        </div>
      </div>
    </div>
  );
}
