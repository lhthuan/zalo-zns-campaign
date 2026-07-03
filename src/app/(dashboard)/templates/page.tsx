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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatVnd } from "@/lib/format";

interface ZaloTemplateParam {
  name: string;
  require: boolean;
  type: string;
  maxLength?: number;
  minLength?: number;
}

interface ZaloTemplate {
  id: string;
  template_id: string;
  template_name: string;
  status: string;
  tag: string | null;
  template_data_schema: ZaloTemplateParam[] | null;
  preview_url: string | null;
  price_sdt: number | null;
  price_uid: number | null;
  last_synced_at: string | null;
}

const STATUS_LABEL: Record<
  string,
  { label: string; variant: "success" | "warning" | "destructive" | "outline" }
> = {
  ENABLE: { label: "Đang hoạt động", variant: "success" },
  PENDING_REVIEW: { label: "Chờ duyệt", variant: "warning" },
  REJECT: { label: "Bị từ chối", variant: "destructive" },
  DISABLE: { label: "Đã tắt", variant: "outline" },
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<ZaloTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<ZaloTemplate | null>(null);

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

  const filtered = templates.filter((t) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      t.template_name.toLowerCase().includes(q) || t.template_id.toLowerCase().includes(q)
    );
  });

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
        <div>
          <h1 className="text-xl font-semibold">Template ZNS</h1>
          <p className="text-sm text-muted-foreground">
            {templates.length} template đã đồng bộ
            {search.trim() && ` — ${filtered.length} khớp tìm kiếm`}
          </p>
        </div>
        <Button onClick={handleSync} disabled={syncing}>
          {syncing ? "Đang đồng bộ..." : "Sync from Zalo"}
        </Button>
      </div>

      <Input
        placeholder="Tìm theo tên template hoặc Template ID..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

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
          ) : filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                Không tìm thấy template khớp &quot;{search}&quot;
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((t) => {
              const statusInfo = STATUS_LABEL[t.status] ?? { label: t.status, variant: "outline" as const };
              return (
                <TableRow key={t.id} className="cursor-pointer" onClick={() => setDetail(t)}>
                  <TableCell className="hover:underline">{t.template_name}</TableCell>
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

      <Dialog open={detail != null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col overflow-hidden p-0">
          {detail && (
            <>
              <DialogHeader className="shrink-0 border-b p-4 pr-12">
                <div className="flex items-center gap-2">
                  <DialogTitle>{detail.template_name}</DialogTitle>
                  <Badge>{detail.tag ?? "—"}</Badge>
                </div>
              </DialogHeader>

              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-y-hidden">
                <div className="min-w-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-muted-foreground">Template ID</p>
                      <p className="font-mono">{detail.template_id}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Đơn giá gửi qua SĐT</p>
                      <p>{detail.price_sdt != null ? `${formatVnd(detail.price_sdt)} / tin` : "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Đơn giá gửi qua UID</p>
                      <p>{detail.price_uid != null ? `${formatVnd(detail.price_uid)} / tin` : "—"}</p>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 font-medium">
                      Tham số truyền vào ({(detail.template_data_schema ?? []).length})
                    </p>
                    {(detail.template_data_schema ?? []).length === 0 ? (
                      <p className="text-muted-foreground">Template này không có tham số nào.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Tên tham số</TableHead>
                              <TableHead>Kiểu dữ liệu</TableHead>
                              <TableHead>Bắt buộc</TableHead>
                              <TableHead>Độ dài</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(detail.template_data_schema ?? []).map((p) => (
                              <TableRow key={p.name}>
                                <TableCell className="font-mono text-xs">{p.name}</TableCell>
                                <TableCell>{p.type}</TableCell>
                                <TableCell>{p.require ? "Có" : "Không"}</TableCell>
                                <TableCell className="text-muted-foreground">
                                  {p.minLength || p.maxLength
                                    ? `${p.minLength ?? 0}–${p.maxLength ?? "?"} ký tự`
                                    : "—"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                    {!detail.preview_url && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Template này chưa có link xem trước — vào Zalo Business Manager (ZBS) → Quản lý
                        mẫu ZNS → tìm template có ID này để xem đúng nội dung/giao diện.
                      </p>
                    )}
                  </div>
                </div>

                {detail.preview_url && (
                  <div className="flex w-full shrink-0 flex-col border-t p-4 lg:w-[340px] lg:border-t-0 lg:border-l">
                    <p className="mb-2 shrink-0 text-sm font-medium">Xem trước template</p>
                    <div className="min-h-[600px] flex-1 overflow-hidden rounded-lg border lg:min-h-0">
                      <iframe
                        src={detail.preview_url}
                        title={`Xem trước ${detail.template_name}`}
                        className="h-full w-full"
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
