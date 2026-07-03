"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SettingsData {
  zaloAppId: string | null;
  hasSecretKey: boolean;
  updatedAt: string | null;
}

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  max_total_sends: number | null;
  max_daily_sends: number | null;
  total_sends: number;
  created_at: string;
  last_used_at: string | null;
}

interface BackfillResult {
  updated: number;
  conflicts: { canonicalPhone: string; customerIds: string[] }[];
  unconvertible: { id: string; name: string | null; phone: string }[];
}

interface LogEntry {
  time: string;
  message: string;
  level: "info" | "error";
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [appId, setAppId] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyRow[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyMaxTotal, setNewKeyMaxTotal] = useState("");
  const [newKeyMaxDaily, setNewKeyMaxDaily] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const [newPlaintextKey, setNewPlaintextKey] = useState<string | null>(null);
  const [editingLimitsFor, setEditingLimitsFor] = useState<ApiKeyRow | null>(null);
  const [limitMaxTotal, setLimitMaxTotal] = useState("");
  const [limitMaxDaily, setLimitMaxDaily] = useState("");
  const [savingLimits, setSavingLimits] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);

  async function handleBackfillPhones() {
    if (
      !confirm(
        "Chuẩn hoá lại SĐT của toàn bộ khách hàng hiện có về định dạng 84xxxxxxxxx? Không thể hoàn tác."
      )
    )
      return;
    setBackfilling(true);
    const res = await fetch("/api/customers/backfill-phone", { method: "POST" });
    const json = await res.json();
    setBackfilling(false);
    if (!res.ok) {
      toast.error(json.error ?? "Chuẩn hoá thất bại");
      return;
    }
    setBackfillResult(json);
    toast.success(`Đã chuẩn hoá ${json.updated} SĐT`);
  }

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
    loadApiKeys();
  }, []);

  async function loadApiKeys() {
    const res = await fetch("/api/settings/api-keys");
    const json = await res.json();
    if (res.ok) setApiKeys(json.data ?? []);
  }

  async function handleCreateKey() {
    if (!newKeyName.trim()) return toast.error("Đặt tên cho hệ thống dùng key này");
    setCreatingKey(true);
    const res = await fetch("/api/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newKeyName.trim(),
        max_total_sends: newKeyMaxTotal.trim() ? Number(newKeyMaxTotal) : null,
        max_daily_sends: newKeyMaxDaily.trim() ? Number(newKeyMaxDaily) : null,
      }),
    });
    const json = await res.json();
    setCreatingKey(false);
    if (!res.ok) {
      toast.error(json.error ? JSON.stringify(json.error) : "Tạo key thất bại");
      return;
    }
    setNewPlaintextKey(json.data.plaintext);
    setNewKeyName("");
    setNewKeyMaxTotal("");
    setNewKeyMaxDaily("");
    loadApiKeys();
  }

  function openEditLimits(key: ApiKeyRow) {
    setEditingLimitsFor(key);
    setLimitMaxTotal(key.max_total_sends != null ? String(key.max_total_sends) : "");
    setLimitMaxDaily(key.max_daily_sends != null ? String(key.max_daily_sends) : "");
  }

  async function handleSaveLimits() {
    if (!editingLimitsFor) return;
    setSavingLimits(true);
    const res = await fetch(`/api/settings/api-keys/${editingLimitsFor.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        max_total_sends: limitMaxTotal.trim() ? Number(limitMaxTotal) : null,
        max_daily_sends: limitMaxDaily.trim() ? Number(limitMaxDaily) : null,
      }),
    });
    setSavingLimits(false);
    if (!res.ok) {
      toast.error("Cập nhật giới hạn thất bại");
      return;
    }
    toast.success("Đã cập nhật giới hạn");
    setEditingLimitsFor(null);
    loadApiKeys();
  }

  async function handleToggleKey(key: ApiKeyRow) {
    const res = await fetch(`/api/settings/api-keys/${key.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !key.is_active }),
    });
    if (!res.ok) return toast.error("Không cập nhật được");
    toast.success(key.is_active ? "Đã tắt key" : "Đã bật lại key");
    loadApiKeys();
  }

  async function handleDeleteKey(key: ApiKeyRow) {
    if (!confirm(`Xoá hẳn key "${key.name}"? Hệ thống dùng key này sẽ không gửi được nữa.`)) return;
    const res = await fetch(`/api/settings/api-keys/${key.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Không xoá được");
    toast.success("Đã xoá key");
    loadApiKeys();
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
          <CardTitle>4. API key cho hệ thống ngoài (POST /api/sendzns)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Cấp 1 key riêng cho từng hệ thống ngoài (website, POS, CRM...) muốn tự gọi gửi ZNS trực
            tiếp, không qua giao diện này. Mỗi key xoá/tắt riêng không ảnh hưởng hệ thống khác.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <Input
              placeholder="Tên hệ thống, vd: Website đặt hàng"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
            />
            <Input
              type="number"
              min={1}
              placeholder="Giới hạn tổng số tin (để trống = không giới hạn)"
              value={newKeyMaxTotal}
              onChange={(e) => setNewKeyMaxTotal(e.target.value)}
            />
            <Input
              type="number"
              min={1}
              placeholder="Giới hạn tin/ngày (để trống = không giới hạn)"
              value={newKeyMaxDaily}
              onChange={(e) => setNewKeyMaxDaily(e.target.value)}
            />
          </div>
          <Button onClick={handleCreateKey} disabled={creatingKey}>
            {creatingKey ? "Đang tạo..." : "Tạo key mới"}
          </Button>

          {apiKeys.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Đã gửi / Giới hạn</TableHead>
                  <TableHead>Dùng lần cuối</TableHead>
                  <TableHead className="text-right">Hành động</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell>{k.name}</TableCell>
                    <TableCell className="font-mono text-xs">{k.key_prefix}…</TableCell>
                    <TableCell>
                      <Badge variant={k.is_active ? "success" : "outline"}>
                        {k.is_active ? "Đang hoạt động" : "Đã tắt"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <p>
                        Tổng: {k.total_sends} / {k.max_total_sends ?? "∞"}
                      </p>
                      <p>Giới hạn/ngày: {k.max_daily_sends ?? "∞"}</p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {k.last_used_at ? new Date(k.last_used_at).toLocaleString("vi-VN") : "Chưa dùng"}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="ghost" size="sm" onClick={() => openEditLimits(k)}>
                        Sửa giới hạn
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleToggleKey(k)}>
                        {k.is_active ? "Tắt" : "Bật"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteKey(k)}>
                        Xoá
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>5. Chuẩn hoá SĐT khách hàng hiện có</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Chuyển SĐT của khách hàng đã có trong hệ thống (nhập trước khi chuẩn hoá được áp dụng) về
            đúng định dạng 84xxxxxxxxx mà Zalo yêu cầu. Không tự gộp khách hàng trùng — nếu 2 khách hàng
            khác nhau đang lưu cùng 1 số thật dưới 2 định dạng khác nhau, sẽ báo ra để bạn tự xử lý.
          </p>
          <Button variant="outline" onClick={handleBackfillPhones} disabled={backfilling}>
            {backfilling ? "Đang chuẩn hoá..." : "Chuẩn hoá SĐT"}
          </Button>

          {backfillResult && (
            <div className="space-y-2 text-sm">
              <p>
                Đã cập nhật <strong>{backfillResult.updated}</strong> SĐT.
              </p>
              {backfillResult.unconvertible.length > 0 && (
                <div>
                  <p className="font-medium text-destructive">
                    {backfillResult.unconvertible.length} SĐT không chuyển đổi được (cần sửa tay):
                  </p>
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {backfillResult.unconvertible.map((c) => (
                      <li key={c.id}>
                        {c.name ?? "(chưa có tên)"} — {c.phone}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {backfillResult.conflicts.length > 0 && (
                <div>
                  <p className="font-medium text-destructive">
                    {backfillResult.conflicts.length} số bị trùng giữa 2+ khách hàng (cần gộp/sửa tay):
                  </p>
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {backfillResult.conflicts.map((c) => (
                      <li key={c.canonicalPhone}>
                        {c.canonicalPhone} — các khách hàng ID: {c.customerIds.join(", ")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editingLimitsFor != null} onOpenChange={(open) => !open && setEditingLimitsFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sửa giới hạn — {editingLimitsFor?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Giới hạn tổng số tin (để trống = không giới hạn)</Label>
              <Input
                type="number"
                min={1}
                value={limitMaxTotal}
                onChange={(e) => setLimitMaxTotal(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Giới hạn số tin mỗi ngày (để trống = không giới hạn)</Label>
              <Input
                type="number"
                min={1}
                value={limitMaxDaily}
                onChange={(e) => setLimitMaxDaily(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingLimitsFor(null)}>
              Huỷ
            </Button>
            <Button onClick={handleSaveLimits} disabled={savingLimits}>
              {savingLimits ? "Đang lưu..." : "Lưu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newPlaintextKey != null} onOpenChange={(open) => !open && setNewPlaintextKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đã tạo key mới</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-destructive">
              Chỉ hiển thị đúng 1 lần — copy và lưu lại ngay, đóng cửa sổ này sẽ không xem lại được.
            </p>
            <p className="rounded-md border bg-muted/30 p-3 font-mono text-sm break-all">
              {newPlaintextKey}
            </p>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (newPlaintextKey) navigator.clipboard.writeText(newPlaintextKey);
                toast.success("Đã copy vào clipboard");
              }}
            >
              Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
