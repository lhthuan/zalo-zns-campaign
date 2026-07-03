"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CampaignRecipientsGrid } from "@/components/campaign-recipients-grid";

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
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

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

  async function handleSaveName() {
    if (!campaign || !nameDraft.trim() || nameDraft.trim() === campaign.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    const res = await fetch(`/api/campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameDraft.trim() }),
    });
    setSavingName(false);
    if (!res.ok) {
      toast.error("Đổi tên thất bại");
      return;
    }
    toast.success("Đã đổi tên chiến dịch");
    setEditingName(false);
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

  const remaining = Math.max(0, campaign.total_recipients - campaign.sent_count - campaign.failed_count);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" render={<Link href="/campaigns" />}>
        ← Quay lại danh sách chiến dịch
      </Button>

      <div className="flex items-center justify-between">
        <div>
          {editingName ? (
            <div className="flex items-center gap-2">
              <Input
                className="w-80 text-xl font-semibold"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                autoFocus
              />
              <Button size="sm" onClick={handleSaveName} disabled={savingName}>
                {savingName ? "Đang lưu..." : "Lưu"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>
                Huỷ
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{campaign.name}</h1>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setNameDraft(campaign.name);
                  setEditingName(true);
                }}
              >
                Sửa tên
              </Button>
            </div>
          )}
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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Tổng số</p>
              <p className="text-2xl font-semibold">{campaign.total_recipients}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Đã gửi</p>
              <p className="text-2xl font-semibold">{campaign.sent_count + campaign.failed_count}</p>
              <p className="text-xs text-muted-foreground">
                <span className="text-emerald-600">{campaign.sent_count} thành công</span> ·{" "}
                <span className="text-destructive">{campaign.failed_count} lỗi</span>
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Còn lại</p>
              <p className="text-2xl font-semibold">{remaining}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Kênh gửi</p>
              {preview ? (
                <p className="text-sm">
                  UID: <strong>{preview.counts.uid}</strong> · SĐT: <strong>{preview.counts.phone}</strong>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </div>
          </div>
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

      <Card>
        <CardHeader>
          <CardTitle>Danh sách người nhận</CardTitle>
        </CardHeader>
        <CardContent>
          <CampaignRecipientsGrid campaignId={id} />
        </CardContent>
      </Card>
    </div>
  );
}
