"use client";

import { useEffect, useState, useCallback } from "react";
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

interface ZaloTemplate {
  id: string;
  template_id: string;
  template_name: string;
  status: string;
  tag: string | null;
  last_synced_at: string | null;
}

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  ENABLE: { label: "Đang hoạt động", variant: "default" },
  PENDING_REVIEW: { label: "Chờ duyệt", variant: "secondary" },
  REJECT: { label: "Bị từ chối", variant: "destructive" },
  DISABLE: { label: "Đã tắt", variant: "outline" },
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<ZaloTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/templates");
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      toast.error(json.error ?? "Không tải được danh sách template");
      return;
    }
    setTemplates(json.data);
  }, []);

  useEffect(() => {
    // Standard fetch-on-mount: `load` awaits before calling setState, it isn't synchronous.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleSync() {
    setSyncing(true);
    const res = await fetch("/api/templates/sync", { method: "POST" });
    const json = await res.json();
    setSyncing(false);
    if (!res.ok) {
      toast.error(json.error ?? "Sync thất bại");
      return;
    }
    toast.success(`Đã đồng bộ ${json.synced}/${json.total} template`);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Template ZNS</h1>
        <Button onClick={handleSync} disabled={syncing}>
          {syncing ? "Đang đồng bộ..." : "Sync from Zalo"}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tên template</TableHead>
            <TableHead>Template ID</TableHead>
            <TableHead>Tag</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead>Đồng bộ lần cuối</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                Đang tải...
              </TableCell>
            </TableRow>
          ) : templates.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                Chưa có template nào — bấm &quot;Sync from Zalo&quot;
              </TableCell>
            </TableRow>
          ) : (
            templates.map((t) => {
              const statusInfo = STATUS_LABEL[t.status] ?? { label: t.status, variant: "outline" as const };
              return (
                <TableRow key={t.id}>
                  <TableCell>{t.template_name}</TableCell>
                  <TableCell className="font-mono text-xs">{t.template_id}</TableCell>
                  <TableCell>{t.tag ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {t.last_synced_at ? new Date(t.last_synced_at).toLocaleString("vi-VN") : "—"}
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
