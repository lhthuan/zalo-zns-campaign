"use client";

import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CircleCheck, Megaphone, Send, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatVnd } from "@/lib/format";
import { useTranslation } from "@/components/i18n-provider";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-client";
import { queryKeys } from "@/lib/queries";

interface CampaignRow {
  id: string;
  name: string;
  status: string;
  sent: number;
  failed: number;
  pending: number;
  cost: number;
}

interface ChannelRow {
  send_mode: string;
  sent: number;
  cost: number;
}

interface CustomerRow {
  id: string;
  name: string | null;
  phone: string | null;
  message_count: number;
}

interface Totals {
  campaignCount: number;
  campaignSent: number;
  campaignFailed: number;
  campaignPending: number;
  campaignCost: number;
  apiSent: number;
  apiFailed: number;
  apiCost: number;
  testSent: number;
  testFailed: number;
  testCost: number;
}

interface Overview {
  byCampaign: CampaignRow[];
  byChannel: ChannelRow[];
  topCustomers: CustomerRow[];
  totals: Totals;
}

function Donut({
  success,
  failed,
  pending,
  labels,
}: {
  success: number;
  failed: number;
  pending: number;
  labels: { success: string; failed: string; pending: string; noData: string };
}) {
  const total = success + failed + pending;
  if (total === 0) {
    return (
      <div className="flex h-40 w-40 items-center justify-center rounded-full border-8 border-muted text-xs text-muted-foreground">
        {labels.noData}
      </div>
    );
  }
  const successDeg = (success / total) * 360;
  const failedDeg = (failed / total) * 360;
  const gradient = `conic-gradient(#10b981 0deg ${successDeg}deg, #ef4444 ${successDeg}deg ${
    successDeg + failedDeg
  }deg, #d4d4d8 ${successDeg + failedDeg}deg 360deg)`;
  const successRate = ((success / total) * 100).toFixed(1);
  return (
    <div className="flex items-center gap-6">
      <div
        className="relative flex h-40 w-40 shrink-0 items-center justify-center rounded-full"
        style={{ background: gradient }}
      >
        <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-background">
          <span className="text-2xl font-semibold">{successRate}%</span>
          <span className="text-xs text-muted-foreground">{labels.success}</span>
        </div>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-emerald-500" />
          {labels.success}: <strong>{success.toLocaleString("vi-VN")}</strong>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-red-500" />
          {labels.failed}: <strong>{failed.toLocaleString("vi-VN")}</strong>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-zinc-300" />
          {labels.pending}: <strong>{pending.toLocaleString("vi-VN")}</strong>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  valueClassName,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className={`mt-1 truncate text-2xl font-semibold ${valueClassName ?? ""}`}>{value}</p>
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <Icon className="size-4" />
        </span>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation("dashboard");
  const { t: tStatus } = useTranslation("campaignStatus");
  const RANGE_OPTIONS = {
    "7": t("range7"),
    "30": t("range30"),
    "90": t("range90"),
    all: t("rangeAll"),
  };
  const [range, setRange] = useState<keyof typeof RANGE_OPTIONS>("30");
  const { data, isFetching } = useQuery({
    queryKey: queryKeys.dashboard(range),
    queryFn: () => apiFetch<{ data: Overview }>(`/api/dashboard/overview?days=${range}`).then((j) => j.data),
    // Keep showing the previous range's numbers while the new range loads.
    placeholderData: keepPreviousData,
    meta: { errorMessage: "Không tải được dashboard" },
  });

  const header = (
    <PageHeader
      title={t("title")}
      description={t("subtitle")}
      actions={
        <Select value={range} onValueChange={(v) => setRange((v as keyof typeof RANGE_OPTIONS) ?? "30")} items={RANGE_OPTIONS}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(RANGE_OPTIONS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
  );

  if (!data) {
    return (
      <div className="space-y-4">
        {header}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  const { totals, byCampaign, byChannel, topCustomers } = data;
  const totalSent = totals.campaignSent + totals.apiSent + totals.testSent;
  const totalFailed = totals.campaignFailed + totals.apiFailed + totals.testFailed;
  const totalCost = totals.campaignCost + totals.apiCost + totals.testCost;
  const totalAttempted = totalSent + totalFailed;
  const successRate = totalAttempted > 0 ? ((totalSent / totalAttempted) * 100).toFixed(1) : "—";

  const maxCampaignVolume = Math.max(1, ...byCampaign.map((c) => c.sent + c.failed + c.pending));

  return (
    <div className={`space-y-4 transition-opacity ${isFetching ? "opacity-70" : ""}`}>
      {header}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Send} label={t("totalSent")} value={totalSent.toLocaleString("vi-VN")} />
        <StatCard
          icon={CircleCheck}
          label={t("successRate")}
          value={`${successRate}%`}
          valueClassName="text-emerald-600"
        />
        <StatCard icon={Wallet} label={t("totalCost")} value={formatVnd(totalCost)} />
        <StatCard icon={Megaphone} label={t("campaignCount")} value={String(totals.campaignCount)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("successFailRatio")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Donut
              success={totalSent}
              failed={totalFailed}
              pending={totals.campaignPending}
              labels={{
                success: t("success"),
                failed: t("failed"),
                pending: t("pending"),
                noData: t("noData"),
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("bySource")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between border-b pb-2">
              <span>{t("sourceCampaign")}</span>
              <span>
                <strong className="text-emerald-600">{totals.campaignSent}</strong> {t("success")} ·{" "}
                <strong className="text-destructive">{totals.campaignFailed}</strong> {t("failed")} ·{" "}
                {formatVnd(totals.campaignCost)}
              </span>
            </div>
            <div className="flex items-center justify-between border-b pb-2">
              <span>{t("sourceTest")}</span>
              <span>
                <strong className="text-emerald-600">{totals.testSent}</strong> {t("success")} ·{" "}
                <strong className="text-destructive">{totals.testFailed}</strong> {t("failed")} ·{" "}
                {formatVnd(totals.testCost)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>{t("sourceApi")}</span>
              <span>
                <strong className="text-emerald-600">{totals.apiSent}</strong> {t("success")} ·{" "}
                <strong className="text-destructive">{totals.apiFailed}</strong> {t("failed")} ·{" "}
                {formatVnd(totals.apiCost)}
              </span>
            </div>
            {byChannel.length > 0 && (
              <div className="border-t pt-3">
                <p className="mb-2 text-xs text-muted-foreground">{t("byChannel")}</p>
                {byChannel.map((ch) => (
                  <div key={ch.send_mode} className="flex items-center justify-between">
                    <span>{ch.send_mode === "phone" ? "SĐT" : "UID"}</span>
                    <span>
                      <strong>{ch.sent}</strong> {t("messagesUnit")} · {formatVnd(ch.cost)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("byCampaign")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {byCampaign.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noCampaigns")}</p>
          ) : (
            byCampaign.map((c) => {
              const volume = c.sent + c.failed + c.pending;
              const pct = Math.max(2, (volume / maxCampaignVolume) * 100);
              return (
                <Link
                  key={c.id}
                  href={`/campaigns/${c.id}`}
                  className="block space-y-1 rounded-md p-2 hover:bg-muted/50"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium hover:underline">{c.name}</span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">
                        {tStatus(c.status as "draft" | "sending" | "completed" | "completed_with_errors" | "failed") ??
                          c.status}
                      </Badge>
                      <span>{formatVnd(c.cost)}</span>
                    </div>
                  </div>
                  <div className="flex h-2 overflow-hidden rounded-full bg-muted" style={{ width: `${pct}%` }}>
                    <div
                      className="bg-emerald-500"
                      style={{ width: volume > 0 ? `${(c.sent / volume) * 100}%` : "0%" }}
                    />
                    <div
                      className="bg-red-500"
                      style={{ width: volume > 0 ? `${(c.failed / volume) * 100}%` : "0%" }}
                    />
                    <div
                      className="bg-zinc-300"
                      style={{ width: volume > 0 ? `${(c.pending / volume) * 100}%` : "0%" }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {c.sent} {t("success")} · {c.failed} {t("failed")} · {c.pending} {t("pending")}
                  </p>
                </Link>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("topCustomers")}</CardTitle>
        </CardHeader>
        <CardContent>
          {topCustomers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noData")}</p>
          ) : (
            <div className="space-y-2">
              {topCustomers.map((c, i) => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <span>
                    <span className="mr-2 text-muted-foreground">#{i + 1}</span>
                    {c.name ?? c.phone ?? "—"}
                    {c.name && c.phone && <span className="text-muted-foreground"> · {c.phone}</span>}
                  </span>
                  <strong>
                    {c.message_count} {t("messagesUnit")}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
