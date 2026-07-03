"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
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

const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  sending: "Đang gửi",
  completed: "Hoàn tất",
  completed_with_errors: "Hoàn tất (có lỗi)",
  failed: "Thất bại",
};

const RANGE_OPTIONS = { "7": "7 ngày qua", "30": "30 ngày qua", "90": "90 ngày qua", all: "Toàn bộ" };

function Donut({ success, failed, pending }: { success: number; failed: number; pending: number }) {
  const total = success + failed + pending;
  if (total === 0) {
    return (
      <div className="flex h-40 w-40 items-center justify-center rounded-full border-8 border-muted text-xs text-muted-foreground">
        Chưa có dữ liệu
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
          <span className="text-xs text-muted-foreground">thành công</span>
        </div>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-emerald-500" />
          Thành công: <strong>{success.toLocaleString("vi-VN")}</strong>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-red-500" />
          Thất bại: <strong>{failed.toLocaleString("vi-VN")}</strong>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-zinc-300" />
          Còn lại: <strong>{pending.toLocaleString("vi-VN")}</strong>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [range, setRange] = useState<keyof typeof RANGE_OPTIONS>("30");
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/dashboard/overview?days=${range}`);
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      toast.error(json.error ?? "Không tải được dashboard");
      return;
    }
    setData(json.data);
  }, [range]);

  useEffect(() => {
    // Standard fetch-on-mount/range-change: `load` awaits before calling setState.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (loading && !data) return <p className="text-muted-foreground">Đang tải...</p>;
  if (!data) return null;

  const { totals, byCampaign, byChannel, topCustomers } = data;
  const totalSent = totals.campaignSent + totals.apiSent + totals.testSent;
  const totalFailed = totals.campaignFailed + totals.apiFailed + totals.testFailed;
  const totalCost = totals.campaignCost + totals.apiCost + totals.testCost;
  const totalAttempted = totalSent + totalFailed;
  const successRate = totalAttempted > 0 ? ((totalSent / totalAttempted) * 100).toFixed(1) : "—";

  const maxCampaignVolume = Math.max(1, ...byCampaign.map((c) => c.sent + c.failed + c.pending));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Tổng quan</h1>
          <p className="text-sm text-muted-foreground">
            Tình hình gửi tin ZNS trên toàn hệ thống — chiến dịch, gửi thử, và API ngoài.
          </p>
        </div>
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
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Tổng số tin đã gửi</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{totalSent.toLocaleString("vi-VN")}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Tỷ lệ thành công</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-emerald-600">{successRate}%</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Tổng chi phí ước tính</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{formatVnd(totalCost)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Số chiến dịch</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{totals.campaignCount}</CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tỷ lệ thành công / thất bại</CardTitle>
          </CardHeader>
          <CardContent>
            <Donut success={totalSent} failed={totalFailed} pending={totals.campaignPending} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Theo nguồn gửi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between border-b pb-2">
              <span>Chiến dịch</span>
              <span>
                <strong className="text-emerald-600">{totals.campaignSent}</strong> thành công ·{" "}
                <strong className="text-destructive">{totals.campaignFailed}</strong> lỗi ·{" "}
                {formatVnd(totals.campaignCost)}
              </span>
            </div>
            <div className="flex items-center justify-between border-b pb-2">
              <span>Gửi thử</span>
              <span>
                <strong className="text-emerald-600">{totals.testSent}</strong> thành công ·{" "}
                <strong className="text-destructive">{totals.testFailed}</strong> lỗi ·{" "}
                {formatVnd(totals.testCost)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>API ngoài</span>
              <span>
                <strong className="text-emerald-600">{totals.apiSent}</strong> thành công ·{" "}
                <strong className="text-destructive">{totals.apiFailed}</strong> lỗi ·{" "}
                {formatVnd(totals.apiCost)}
              </span>
            </div>
            {byChannel.length > 0 && (
              <div className="border-t pt-3">
                <p className="mb-2 text-xs text-muted-foreground">Theo kênh (chiến dịch)</p>
                {byChannel.map((ch) => (
                  <div key={ch.send_mode} className="flex items-center justify-between">
                    <span>{ch.send_mode === "phone" ? "SĐT" : "UID"}</span>
                    <span>
                      <strong>{ch.sent}</strong> tin · {formatVnd(ch.cost)}
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
          <CardTitle>Theo chiến dịch</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {byCampaign.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có chiến dịch nào.</p>
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
                      <Badge variant="outline">{STATUS_LABEL[c.status] ?? c.status}</Badge>
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
                    {c.sent} thành công · {c.failed} lỗi · {c.pending} còn lại
                  </p>
                </Link>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Khách hàng nhận nhiều tin nhất</CardTitle>
        </CardHeader>
        <CardContent>
          {topCustomers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
          ) : (
            <div className="space-y-2">
              {topCustomers.map((c, i) => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <span>
                    <span className="mr-2 text-muted-foreground">#{i + 1}</span>
                    {c.name ?? c.phone ?? "—"}
                    {c.name && c.phone && <span className="text-muted-foreground"> · {c.phone}</span>}
                  </span>
                  <strong>{c.message_count} tin</strong>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
