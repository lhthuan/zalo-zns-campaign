"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { CampaignRecipientsGrid } from "@/components/campaign-recipients-grid";
import { useTranslation } from "@/components/i18n-provider";

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

interface QStashEventRow {
  time: number;
  messageId: string;
  state: string;
  responseStatus: number | null;
  batchNumber: number | null;
}

const QSTASH_STATE_VARIANT: Record<string, "success" | "warning" | "destructive" | "outline"> = {
  DELIVERED: "success",
  CREATED: "outline",
  ACTIVE: "outline",
  RETRY: "warning",
  ERROR: "destructive",
  FAILED: "destructive",
};

const ACTIVE_STATUSES = new Set(["sending"]);

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useTranslation("campaignDetail");
  const { t: tStatus } = useTranslation("campaignStatus");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [preview, setPreview] = useState<{ sample: PreviewRow[]; counts: { uid: number; phone: number } } | null>(
    null
  );
  const [sending, setSending] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [qstashOpen, setQstashOpen] = useState(false);
  const [qstashLoading, setQstashLoading] = useState(false);
  const [qstashLog, setQstashLog] = useState<QStashEventRow[] | null>(null);

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

  async function loadQstashLog() {
    setQstashLoading(true);
    const res = await fetch(`/api/campaigns/${id}/qstash-log`);
    const json = await res.json();
    setQstashLoading(false);
    if (!res.ok) {
      toast.error(json.error ?? t("qstashLoadFailed"));
      return;
    }
    setQstashLog(json.data ?? []);
  }

  function toggleQstashLog() {
    const next = !qstashOpen;
    setQstashOpen(next);
    if (next && qstashLog == null) loadQstashLog();
  }

  async function handleToggleHidden() {
    if (!campaign) return;
    const res = await fetch(`/api/campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_hidden: !campaign.is_hidden }),
    });
    if (!res.ok) {
      toast.error(t("updateFailed"));
      return;
    }
    toast.success(campaign.is_hidden ? t("hidSuccess") : t("hideSuccess"));
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
      toast.error(t("renameFailed"));
      return;
    }
    toast.success(t("renameSuccess"));
    setEditingName(false);
    load();
  }

  async function handleSend() {
    setSending(true);
    const res = await fetch(`/api/campaigns/${id}/send`, { method: "POST" });
    const json = await res.json();
    setSending(false);
    if (!res.ok) {
      toast.error(json.error ?? t("sendFailed"));
      return;
    }
    toast.success(`${t("sendStarted")} (${json.batches} ${t("batches")})`);
    if (json.failedBatches?.length > 0) {
      toast.warning(`${t("enqueueFailedWarning")}: ${json.failedBatches.join(", ")}`);
    }
    load();
  }

  if (!campaign) return <p className="text-muted-foreground">{t("loading")}</p>;

  const progress =
    campaign.total_recipients > 0
      ? ((campaign.sent_count + campaign.failed_count) / campaign.total_recipients) * 100
      : 0;

  const remaining = Math.max(0, campaign.total_recipients - campaign.sent_count - campaign.failed_count);

  const latestQstashByBatch = qstashLog
    ? Object.values(
        qstashLog.reduce<Record<number, QStashEventRow>>((acc, e) => {
          if (e.batchNumber == null) return acc;
          if (!acc[e.batchNumber] || acc[e.batchNumber].time < e.time) acc[e.batchNumber] = e;
          return acc;
        }, {})
      ).sort((a, b) => (a.batchNumber ?? 0) - (b.batchNumber ?? 0))
    : [];

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" render={<Link href="/campaigns" />}>
        ← {t("backToList")}
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
                {savingName ? t("saving") : t("save")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>
                {t("cancel")}
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
                {t("editName")}
              </Button>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            {t("templateLabel")}: {campaign.zalo_templates?.template_name ?? "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge>
            {tStatus(campaign.status as "draft" | "sending" | "completed" | "completed_with_errors" | "failed")}
          </Badge>
          <Button variant="outline" size="sm" render={<Link href={`/campaigns/new?copyFrom=${id}`} />}>
            {t("copy")}
          </Button>
          <Button variant="outline" size="sm" onClick={handleToggleHidden}>
            {campaign.is_hidden ? t("unhide") : t("hide")}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("progressTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={progress} />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">{t("total")}</p>
              <p className="text-2xl font-semibold">{campaign.total_recipients}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">{t("sent")}</p>
              <p className="text-2xl font-semibold">{campaign.sent_count + campaign.failed_count}</p>
              <p className="text-xs text-muted-foreground">
                <span className="text-emerald-600">
                  {campaign.sent_count} {t("success")}
                </span>{" "}
                · <span className="text-destructive">{campaign.failed_count} {t("failed")}</span>
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">{t("remaining")}</p>
              <p className="text-2xl font-semibold">{remaining}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">{t("channel")}</p>
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
                {sending ? t("starting") : t("sendCampaign")}
              </Button>
            )}
            {campaign.status === "sending" && remaining > 0 && (
              <Button onClick={handleSend} disabled={sending} variant="outline">
                {sending ? t("starting") : t("resumeSend")}
              </Button>
            )}
            {["completed", "completed_with_errors", "failed"].includes(campaign.status) && (
              <Button variant="outline" render={<Link href={`/campaigns/${id}/report`} />}>
                {t("viewReport")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("qstashLogTitle")}</CardTitle>
            <Button variant="outline" size="sm" onClick={toggleQstashLog}>
              {qstashOpen ? t("hideContent") : t("viewContent")}
            </Button>
          </div>
        </CardHeader>
        {qstashOpen && (
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">{t("qstashLogHint")}</p>
            {qstashLoading ? (
              <p className="text-sm text-muted-foreground">{t("loading")}</p>
            ) : !latestQstashByBatch.length ? (
              <p className="text-sm text-muted-foreground">{t("qstashLogEmpty")}</p>
            ) : (
              <div className="max-h-80 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("qstashColBatch")}</TableHead>
                      <TableHead>{t("qstashColState")}</TableHead>
                      <TableHead>{t("qstashColHttp")}</TableHead>
                      <TableHead>{t("qstashColTime")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {latestQstashByBatch.map((e) => (
                      <TableRow key={e.batchNumber}>
                        <TableCell>{e.batchNumber}</TableCell>
                        <TableCell>
                          <Badge variant={QSTASH_STATE_VARIANT[e.state] ?? "outline"}>{e.state}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{e.responseStatus ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(e.time).toLocaleString("vi-VN")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("recipientsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <CampaignRecipientsGrid campaignId={id} />
        </CardContent>
      </Card>
    </div>
  );
}
