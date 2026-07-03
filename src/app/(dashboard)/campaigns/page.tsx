"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
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

interface Campaign {
  id: string;
  name: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  zalo_templates: { template_name: string } | null;
}

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Nháp", variant: "outline" },
  sending: { label: "Đang gửi", variant: "secondary" },
  completed: { label: "Hoàn tất", variant: "default" },
  completed_with_errors: { label: "Hoàn tất (có lỗi)", variant: "secondary" },
  failed: { label: "Thất bại", variant: "destructive" },
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/campaigns")
      .then((res) => res.json())
      .then((json) => setCampaigns(json.data ?? []))
      .catch(() => toast.error("Không tải được danh sách chiến dịch"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Chiến dịch</h1>
        <Button render={<Link href="/campaigns/new" />}>Tạo chiến dịch</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tên</TableHead>
            <TableHead>Template</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead>Đã gửi / Lỗi / Tổng</TableHead>
            <TableHead>Ngày tạo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                Đang tải...
              </TableCell>
            </TableRow>
          ) : campaigns.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                Chưa có chiến dịch nào
              </TableCell>
            </TableRow>
          ) : (
            campaigns.map((c) => {
              const statusInfo = STATUS_LABEL[c.status] ?? { label: c.status, variant: "outline" as const };
              return (
                <TableRow key={c.id} className="cursor-pointer">
                  <TableCell>
                    <Link href={`/campaigns/${c.id}`} className="hover:underline">
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell>{c.zalo_templates?.template_name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                  </TableCell>
                  <TableCell>
                    {c.sent_count} / {c.failed_count} / {c.total_recipients}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(c.created_at).toLocaleString("vi-VN")}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
