"use client";

import { useEffect, useState, use } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ReportRow {
  phone: string;
  send_mode: string;
  status: string;
  zalo_msg_id: string | null;
  error_code: string | null;
  error_message: string | null;
  sent_at: string | null;
  customers: { name: string } | null;
}

interface ReportSummary {
  sentUid: number;
  sentPhone: number;
  failed: number;
  pending: number;
}

export default function CampaignReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Intentional: mark loading as soon as the fetch-on-mount effect starts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/campaigns/${id}/report?page=${page}`)
      .then((res) => res.json())
      .then((json) => {
        setSummary(json.summary);
        setRows(json.rows ?? []);
      })
      .catch(() => toast.error("Không tải được báo cáo"))
      .finally(() => setLoading(false));
  }, [id, page]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Báo cáo chiến dịch</h1>
        <div className="flex gap-2">
          <Button variant="outline" render={<a href={`/api/campaigns/${id}/report/export?format=xlsx`} />}>
            Xuất Excel
          </Button>
          <Button variant="outline" render={<a href={`/api/campaigns/${id}/report/export?format=csv`} />}>
            Xuất CSV
          </Button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Thành công qua UID</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{summary.sentUid}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Thành công qua SĐT</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{summary.sentPhone}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Thất bại</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold text-destructive">{summary.failed}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Đang chờ</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{summary.pending}</CardContent>
          </Card>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SĐT</TableHead>
            <TableHead>Khách hàng</TableHead>
            <TableHead>Chế độ</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead>Lỗi</TableHead>
            <TableHead>Thời gian gửi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                Đang tải...
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, i) => (
              <TableRow key={i}>
                <TableCell>{row.phone}</TableCell>
                <TableCell>{row.customers?.name ?? "—"}</TableCell>
                <TableCell>{row.send_mode}</TableCell>
                <TableCell>
                  <Badge variant={row.status === "sent" ? "default" : row.status === "failed" ? "destructive" : "secondary"}>
                    {row.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{row.error_message ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.sent_at ? new Date(row.sent_at).toLocaleString("vi-VN") : "—"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Trước
        </Button>
        <Button variant="outline" size="sm" disabled={rows.length < 50} onClick={() => setPage((p) => p + 1)}>
          Sau
        </Button>
      </div>
    </div>
  );
}
