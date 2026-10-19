"use client";

import { useState, use } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, Eye, EyeOff, FileBarChart, Pencil, Play, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
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
import { apiFetch, apiSend } from "@/lib/api-client";
import { queryKeys } from "@/lib/queries";

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
  const queryClient = useQueryClient();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [qstashOpen, setQstashOpen] = useState(false);

  const campaignKey = queryKeys.campaign(id);

  const { data: campaign } = useQuery({
    queryKey: campaignKey,
    queryFn: () => apiFetch<{ data: Campaign }>(`/api/campaigns/${id}`).then((j) => j.data),
    // Poll while the campaign is actively sending so progress updates live.
    refetchInterval: (query) => (query.state.data && ACTIVE_STATUSES.has(query.state.data.status) ? 5000 : false),
    meta: { errorMessage: "Không tải được chiến dịch" },
  });

  const { data: preview } = useQuery({
    queryKey: [...campaignKey, "preview"],
    queryFn: () =>
      apiFetch<{ sample: PreviewRow[]; counts: { uid: number; phone: number } }>(`/api/campaigns/${id}/preview`),
  });

  const qstashQuery = useQuery({
    queryKey: [...campaignKey, "qstash-log"],
    queryFn: () => apiFetch<{ data: QStashEventRow[] }>(`/api/campaigns/${id}/qstash-log`).then((j) => j.data ?? []),
    enabled: qstashOpen,
    meta: { errorMessage: t("qstashLoadFailed") },
  });

  function invalidateCampaign() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: campaignKey }),
      queryClient.invalidateQueries({ queryKey: queryKeys.campaignList(false) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.campaignList(true) }),
    ]);
  }

  const hideMutation = useMutation({
    mutationFn: (isHidden: boolean) => apiSend(`/api/campaigns/${id}`, "PATCH", { is_hidden: !isHidden }),
    onSuccess: (_d, isHidden) => toast.success(isHidden ? t("hidSuccess") : t("hideSuccess")),
    onSettled: invalidateCampaign,
    meta: { errorMessage: t("updateFailed") },
  });

  const renameMutation = useMutation({
    mutationFn: (name: string) => apiSend(`/api/campaigns/${id}`, "PATCH", { name }),
    onSuccess: () => {
      toast.success(t("renameSuccess"));
      setEditingName(false);
    },
    onSettled: invalidateCampaign,
    meta: { errorMessage: t("renameFailed") },
  });

  const sendMutation = useMutation({
    mutationFn: () => apiSend<{ batches: number; failedBatches?: number[] }>(`/api/campaigns/${id}/send`, "POST"),
    onSuccess: (json) => {
      toast.success(`${t("sendStarted")} (${json.batches} ${t("batches")})`);
      if (json.failedBatches?.length) {
        toast.warning(`${t("enqueueFailedWarning")}: ${json.failedBatches.join(", ")}`);
      }
    },
    onSettled: invalidateCampaign,
    meta: { errorMessage: t("sendFailed") },
  });

  function handleSaveName() {
    if (!campaign || !nameDraft.trim() || nameDraft.trim() === campaign.name) {
      setEditingName(false);
      return;
    }
    renameMutation.mutate(nameDraft.trim());
  }

  if (!campaign) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const progress =
    campaign.total_recipients > 0
      ? ((campaign.sent_count + campaign.failed_count) / campaign.total_recipients) * 100
      : 0;

  const remaining = Math.max(0, campaign.total_recipients - campaign.sent_count - campaign.failed_count);
  const sending = sendMutation.isPending;

  const latestQstashByBatch = qstashQuery.data
    ? Object.values(
        qstashQuery.data.reduce<Record<number, QStashEventRow>>((acc, e) => {
          if (e.batchNumber == null) return acc;
          if (!acc[e.batchNumber] || acc[e.batchNumber].time < e.time) acc[e.batchNumber] = e;
          return acc;
        }, {})
      ).sort((a, b) => (a.batchNumber ?? 0) - (b.batchNumber ?? 0))
    : [];

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/campaigns" />}>
        <ArrowLeft className="size-4" />
        {t("backToList")}
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {editingName ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="w-80 max-w-full text-xl font-semibold"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName();
                  if (e.key === "Escape") setEditingName(false);
                }}
                autoFocus
              />
              <Button size="sm" onClick={handleSaveName} disabled={renameMutation.isPending}>
                {renameMutation.isPending ? t("saving") : t("save")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>
                {t("cancel")}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="font-heading text-2xl font-semibold tracking-tight">{campaign.name}</h1>
              <Button
                variant="ghost"
                size="sm"
                title={t("editName")}
                onClick={() => {
                  setNameDraft(campaign.name);
                  setEditingName(true);
                }}
              >
                <Pencil className="size-3.5" />
              </Button>
            </div>
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            {t("templateLabel")}: {campaign.zalo_templates?.template_name ?? "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge>
            {tStatus(campaign.status as "draft" | "sending" | "completed" | "completed_with_errors" | "failed")}
          </Badge>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/campaigns/new?copyFrom=${id}`} />}>
            <Copy className="size-3.5" />
            {t("copy")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => hideMutation.mutate(campaign.is_hidden)}>
            {campaign.is_hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
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
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{t("total")}</p>
              <p className="text-2xl font-semibold tabular-nums">{campaign.total_recipients}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{t("sent")}</p>
              <p className="text-2xl font-semibold tabular-nums">{campaign.sent_count + campaign.failed_count}</p>
              <p className="text-xs text-muted-foreground">
                <span className="text-emerald-600">
                  {campaign.sent_count} {t("success")}
                </span>{" "}
                · <span className="text-destructive">{campaign.failed_count} {t("failed")}</span>
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{t("remaining")}</p>
              <p className="text-2xl font-semibold tabular-nums">{remaining}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{t("channel")}</p>
              {preview ? (
                <p className="text-sm">
                  UID: <strong>{preview.counts.uid}</strong> · SĐT: <strong>{preview.counts.phone}</strong>
                </p>
              ) : (
                <Skeleton className="mt-1 h-5 w-32" />
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {campaign.status === "draft" && (
              <Button onClick={() => sendMutation.mutate()} disabled={sending}>
                <Play className="size-4" />
                {sending ? t("starting") : t("sendCampaign")}
              </Button>
            )}
            {campaign.status === "sending" && remaining > 0 && (
              <Button onClick={() => sendMutation.mutate()} disabled={sending} variant="outline">
                <RotateCw className="size-4" />
                {sending ? t("starting") : t("resumeSend")}
              </Button>
            )}
            {["completed", "completed_with_errors", "failed"].includes(campaign.status) && (
              <Button variant="outline" nativeButton={false} render={<Link href={`/campaigns/${id}/report`} />}>
                <FileBarChart className="size-4" />
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
            <Button variant="outline" size="sm" onClick={() => setQstashOpen((o) => !o)}>
              {qstashOpen ? t("hideContent") : t("viewContent")}
            </Button>
          </div>
        </CardHeader>
        {qstashOpen && (
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">{t("qstashLogHint")}</p>
            {qstashQuery.isPending ? (
              <Skeleton className="h-24" />
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
          <CampaignRecipientsGrid campaignId={id} live={ACTIVE_STATUSES.has(campaign.status)} />
        </CardContent>
      </Card>
    </div>
  );
}
