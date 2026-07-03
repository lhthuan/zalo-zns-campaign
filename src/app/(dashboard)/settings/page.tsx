"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface SettingsData {
  zaloAppId: string | null;
  hasSecretKey: boolean;
  updatedAt: string | null;
}

interface LogEntry {
  time: string;
  message: string;
  level: "info" | "error";
}

const PRICING_TAGS = ["TRANSACTION", "CUSTOMER_CARE", "PROMOTION", "OTHER"] as const;
const PRICING_LABEL: Record<(typeof PRICING_TAGS)[number], string> = {
  TRANSACTION: "Giao dịch (TRANSACTION)",
  CUSTOMER_CARE: "Chăm sóc KH (CUSTOMER_CARE)",
  PROMOTION: "Quảng cáo (PROMOTION)",
  OTHER: "Khác / chưa rõ loại",
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [appId, setAppId] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [pricing, setPricing] = useState<Record<string, number>>({});
  const [savingPricing, setSavingPricing] = useState(false);

  function addLog(message: string, level: LogEntry["level"] = "info") {
    setLog((prev) => [{ time: new Date().toLocaleTimeString("vi-VN"), message, level }, ...prev]);
  }

  useEffect(() => {
    fetch("/api/settings/zalo")
      .then((res) => res.json())
      .then((json) => {
        if (json.data) {
          setSettings(json.data);
          setAppId(json.data.zaloAppId ?? "");
        }
      })
      .catch(() => toast.error("Không tải được cấu hình"));
    fetch("/api/settings/zns-pricing")
      .then((res) => res.json())
      .then((json) => {
        const map: Record<string, number> = {};
        for (const row of json.data ?? []) map[row.tag] = row.price_vnd;
        setPricing(map);
      })
      .catch(() => toast.error("Không tải được cấu hình giá"));
  }, []);

  async function handleSavePricing() {
    setSavingPricing(true);
    const res = await fetch("/api/settings/zns-pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        PRICING_TAGS.map((tag) => ({ tag, price_vnd: Number(pricing[tag]) || 0 }))
      ),
    });
    const json = await res.json();
    setSavingPricing(false);
    if (!res.ok) {
      toast.error(json.error ? JSON.stringify(json.error) : "Lưu giá thất bại");
      return;
    }
    toast.success("Đã lưu giá ước tính");
  }

  async function handleSave() {
    if (!appId.trim() || !secretKey.trim()) {
      return toast.error("Nhập đủ App ID và App Secret Key");
    }
    setSaving(true);
    const res = await fetch("/api/settings/zalo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zalo_app_id: appId.trim(), zalo_app_secret_key: secretKey.trim() }),
    });
    const json = await res.json();
    setSaving(false);

    if (!res.ok) {
      addLog(`Lưu thất bại: ${json.error ? JSON.stringify(json.error) : "lỗi không xác định"}`, "error");
      toast.error("Lưu thất bại");
      return;
    }
    addLog("Đã lưu App ID / App Secret Key vào database.");
    toast.success("Đã lưu");
    setSecretKey("");
    setSettings((s) => (s ? { ...s, zaloAppId: appId.trim(), hasSecretKey: true } : s));
  }

  async function handleTest() {
    setTesting(true);
    addLog("Đang gọi Zalo API (oa/getoa) để kiểm tra kết nối...");
    const res = await fetch("/api/zalo/oa-info");
    const json = await res.json();
    setTesting(false);

    if (!res.ok || !json?.data?.name) {
      addLog(`Test kết nối thất bại: ${json.error ?? "lỗi không xác định"}`, "error");
      toast.error("Test kết nối thất bại — xem log bên dưới");
      return;
    }
    addLog(`Kết nối thành công — OA: ${json.data.name} (${json.data.oaId})`);
    toast.success(`Đã kết nối OA: ${json.data.name}`);
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Cài đặt kết nối Zalo</h1>

      <Card>
        <CardHeader>
          <CardTitle>1. App ID / App Secret Key</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {settings && (
            <p className="text-sm text-muted-foreground">
              Hiện tại: App ID{" "}
              <span className="font-mono">{settings.zaloAppId ?? "(chưa đặt)"}</span> — Secret Key:{" "}
              {settings.hasSecretKey ? (
                <Badge variant="default">đã đặt</Badge>
              ) : (
                <Badge variant="destructive">chưa đặt</Badge>
              )}
            </p>
          )}
          <div className="space-y-1">
            <Label>Zalo App ID</Label>
            <Input value={appId} onChange={(e) => setAppId(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Zalo App Secret Key</Label>
            <Input
              type="password"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder={settings?.hasSecretKey ? "•••••••• (đã đặt, nhập để đổi)" : ""}
            />
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Đang lưu..." : "Lưu"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Kết nối OAuth với Zalo OA</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Sau khi lưu App ID/Secret ở trên, bấm nút dưới để đăng nhập với tư cách admin OA và cấp
            quyền cho ứng dụng. Chỉ cần làm 1 lần (hoặc lại khi refresh token hết hạn sau 3 tháng).
          </p>
          <Button variant="outline" render={<a href="/api/zalo/oauth/start" />}>
            Kết nối với Zalo
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Test kết nối</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" onClick={handleTest} disabled={testing}>
            {testing ? "Đang kiểm tra..." : "Test kết nối"}
          </Button>

          <div className="space-y-1 rounded-md border bg-muted/30 p-3 font-mono text-xs">
            {log.length === 0 ? (
              <p className="text-muted-foreground">Chưa có log nào.</p>
            ) : (
              log.map((entry, i) => (
                <p key={i} className={entry.level === "error" ? "text-destructive" : ""}>
                  [{entry.time}] {entry.message}
                </p>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>4. Giá ước tính mỗi tin ZNS (theo loại template)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Zalo không trả về giá hợp đồng qua API — nhập đúng đơn giá/tin theo hợp đồng thật của bạn
            với Zalo/đối tác để app hiện chi phí ước tính khi tạo chiến dịch.
          </p>
          {PRICING_TAGS.map((tag) => (
            <div key={tag} className="flex items-center gap-3">
              <Label className="w-56 shrink-0">{PRICING_LABEL[tag]}</Label>
              <Input
                type="number"
                min={0}
                value={pricing[tag] ?? 0}
                onChange={(e) => setPricing((p) => ({ ...p, [tag]: Number(e.target.value) }))}
              />
              <span className="text-sm text-muted-foreground shrink-0">đ / tin</span>
            </div>
          ))}
          <Button onClick={handleSavePricing} disabled={savingPricing}>
            {savingPricing ? "Đang lưu..." : "Lưu giá"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
