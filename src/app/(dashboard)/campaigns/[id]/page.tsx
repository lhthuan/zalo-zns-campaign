"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  is_hidden: boolean;
  zalo_templates: { template_name: string; tag: string | null } | null;
}

interface PreviewRow {
  phone: string;
  zalo_uid: string | null;
  send_mode: string;
  template_data: Record<string, string>;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  sending: "Đang gửi",
  completed: "Hoàn tất",
  completed_with_errors: "Hoàn tất (có lỗi)",
  failed: "Thất bại",
};

const ACTIVE_STATUSES = new Set(["sending"]);

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [preview, setPreview] = useState<{ sample: PreviewRow[]; counts: { uid: number; phone: number } } | null>(
    null
  );
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const [campaignRes, previewRes] = await Promise.all([
      fetch(`/api/campaigns/${id}`),
      fetch(`/api/campaigns/${id}/preview`),
    ]);
    const campaignJson = await campaignRes.json();
    const previewJson = await previewRes.json();
    if (campaignRes.ok) setCampaign(campaignJson.data);
    if (previewRes.ok) setPreview(previewJson);
  }, [id]);

  useEffect(() => {
    // Standard fetch-on-mount: `load` awaits before calling setState, it isn't synchronous.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    if (!campaign || !ACTIVE_STATUSES.has(campaign.status)) return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [campaign, load]);

  async function handleToggleHidden() {
    if (!campaign) return;
    const res = await fetch(`/api/campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_hidden: !campaign.is_hidden }),
    });
    if (!res.ok) {
      toast.error("Không cập nhật được");
      return;
    }
    toast.success(campaign.is_hidden ? "Đã bỏ ẩn" : "Đã ẩn chiến dịch");
    load();
  }

  async function handleSend() {
    setSending(true);
    const res = await fetch(`/api/campaigns/${id}/send`, { method: "POST" });
    const json = await res.json();
    setSending(false);
    if (!res.ok) {
      toast.error(json.error ?? "Gửi thất bại");
      return;
    }
    toast.success(`Đã bắt đầu gửi (${json.batches} batch)`);
    load();
  }

  if (!campaign) return <p className="text-muted-foreground">Đang tải...</p>;

  const progress =
    campaign.total_recipients > 0
      ? ((campaign.sent_count + campaign.failed_count) / campaign.total_recipients) * 100
      : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{campaign.name}</h1>
          <p className="text-sm text-muted-foreground">
            Template: {campaign.zalo_templates?.template_name ?? "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{STATUS_LABEL[campaign.status] ?? campaign.status}</Badge>
          <Button variant="outline" size="sm" render={<Link href={`/campaigns/new?copyFrom=${id}`} />}>
            Sao chép
          </Button>
          <Button variant="outline" size="sm" onClick={handleToggleHidden}>
            {campaign.is_hidden ? "Bỏ ẩn" : "Ẩn"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tiến độ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={progress} />
          <div className="flex gap-6 text-sm text-muted-foreground">
            <span>Tổng: {campaign.total_recipients}</span>
            <span>Đã gửi: {campaign.sent_count}</span>
            <span>Lỗi: {campaign.failed_count}</span>
          </div>
          {preview && (
            <div className="flex gap-6 text-sm text-muted-foreground">
              <span>Gửi qua UID: {preview.counts.uid}</span>
              <span>Gửi qua SĐT: {preview.counts.phone}</span>
            </div>
          )}
          <div className="flex gap-2">
            {campaign.status === "draft" && (
              <Button onClick={handleSend} disabled={sending}>
                {sending ? "Đang bắt đầu..." : "Gửi chiến dịch"}
              </Button>
            )}
            {["completed", "completed_with_errors", "failed"].includes(campaign.status) && (
              <Button variant="outline" render={<Link href={`/campaigns/${id}/report`} />}>
                Xem báo cáo
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {preview && preview.sample.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Xem trước ({preview.sample.length} dòng đầu)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SĐT</TableHead>
                  <TableHead>Zalo UID</TableHead>
                  <TableHead>Chế độ gửi</TableHead>
                  <TableHead>Dữ liệu template</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.sample.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell>{row.phone}</TableCell>
                    <TableCell>{row.zalo_uid ?? "—"}</TableCell>
                    <TableCell>{row.send_mode}</TableCell>
                    <TableCell className="max-w-md truncate text-xs text-muted-foreground">
                      {JSON.stringify(row.template_data)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
