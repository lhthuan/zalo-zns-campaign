"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
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

interface ZaloTemplateParam {
  name: string;
  require: boolean;
  type: string;
  maxLength?: number;
  minLength?: number;
}

interface ZaloTemplate {
  id: string;
  template_id: string;
  template_name: string;
  status: string;
  tag: string | null;
  template_data_schema: ZaloTemplateParam[] | null;
  last_synced_at: string | null;
}

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  ENABLE: { label: "Đang hoạt động", variant: "default" },
  PENDING_REVIEW: { label: "Chờ duyệt", variant: "secondary" },
  REJECT: { label: "Bị từ chối", variant: "destructive" },
  DISABLE: { label: "Đã tắt", variant: "outline" },
};

export default function TemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [template, setTemplate] = useState<ZaloTemplate | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/templates/${id}`);
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      toast.error(json.error ?? "Không tải được template");
      return;
    }
    setTemplate(json.data);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (loading) return <p className="text-muted-foreground">Đang tải...</p>;
  if (!template) return <p className="text-muted-foreground">Không tìm thấy template.</p>;

  const statusInfo = STATUS_LABEL[template.status] ?? { label: template.status, variant: "outline" as const };
  const params_ = template.template_data_schema ?? [];

  return (
    <div className="max-w-3xl space-y-4">
      <Button variant="ghost" size="sm" render={<Link href="/templates" />}>
        ← Quay lại danh sách
      </Button>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{template.template_name}</h1>
        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Thông tin chung</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">Template ID</p>
            <p className="font-mono">{template.template_id}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Loại (tag)</p>
            <p>{template.tag ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Đồng bộ lần cuối</p>
            <p>{template.last_synced_at ? new Date(template.last_synced_at).toLocaleString("vi-VN") : "—"}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tham số truyền vào ({params_.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {params_.length === 0 ? (
            <p className="text-sm text-muted-foreground">Template này không có tham số nào.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên tham số</TableHead>
                  <TableHead>Kiểu dữ liệu</TableHead>
                  <TableHead>Bắt buộc</TableHead>
                  <TableHead>Độ dài</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {params_.map((p) => (
                  <TableRow key={p.name}>
                    <TableCell className="font-mono text-xs">{p.name}</TableCell>
                    <TableCell>{p.type}</TableCell>
                    <TableCell>{p.require ? "Có" : "Không"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.minLength || p.maxLength
                        ? `${p.minLength ?? 0}–${p.maxLength ?? "?"} ký tự`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Zalo không cung cấp API trả về nội dung/giao diện thật của template (chỉ trả danh sách tham
            số ở trên) — để xem đúng nội dung/giao diện tin nhắn sẽ gửi, vào Zalo Business Manager (ZBS)
            → Quản lý mẫu ZNS → tìm template có ID này.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
