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
import { useTranslation } from "@/components/i18n-provider";

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

export default function TemplatesPage() {
  const { t } = useTranslation("templates");
  const STATUS_LABEL: Record<
    string,
    { label: string; variant: "success" | "warning" | "destructive" | "outline" }
  > = {
    ENABLE: { label: t("statusEnable"), variant: "success" },
    PENDING_REVIEW: { label: t("statusPendingReview"), variant: "warning" },
    REJECT: { label: t("statusReject"), variant: "destructive" },
    DISABLE: { label: t("statusDisable"), variant: "outline" },
  };
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

  const filtered = templates.filter((tpl) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      tpl.template_name.toLowerCase().includes(q) || tpl.template_id.toLowerCase().includes(q)
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
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {templates.length} {t("syncedCount")}
            {search.trim() && ` — ${filtered.length} ${t("searchMatches")}`}
          </p>
        </div>
        <Button onClick={handleSync} disabled={syncing}>
          {syncing ? t("syncing") : t("sync")}
        </Button>
      </div>

      <Input
        placeholder={t("searchPlaceholder")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("colName")}</TableHead>
            <TableHead>{t("colId")}</TableHead>
            <TableHead>{t("colTag")}</TableHead>
            <TableHead>{t("colStatus")}</TableHead>
            <TableHead>{t("colLastSynced")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                {t("loading")}
              </TableCell>
            </TableRow>
          ) : templates.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                {t("noTemplates")}
              </TableCell>
            </TableRow>
          ) : filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                {t("noMatch")} &quot;{search}&quot;
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((tpl) => {
              const statusInfo = STATUS_LABEL[tpl.status] ?? { label: tpl.status, variant: "outline" as const };
              return (
                <TableRow key={tpl.id} className="cursor-pointer" onClick={() => setDetail(tpl)}>
                  <TableCell className="hover:underline">{tpl.template_name}</TableCell>
                  <TableCell className="font-mono text-xs">{tpl.template_id}</TableCell>
                  <TableCell>{tpl.tag ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {tpl.last_synced_at ? new Date(tpl.last_synced_at).toLocaleString("vi-VN") : "—"}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <Dialog open={detail != null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="flex max-h-[85vh] max-w-5xl flex-col overflow-hidden p-0">
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
                      <p className="text-muted-foreground">{t("priceSdt")}</p>
                      <p>{detail.price_sdt != null ? `${formatVnd(detail.price_sdt)} ${t("perMessage")}` : "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t("priceUid")}</p>
                      <p>{detail.price_uid != null ? `${formatVnd(detail.price_uid)} ${t("perMessage")}` : "—"}</p>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 font-medium">
                      {t("paramsTitle")} ({(detail.template_data_schema ?? []).length})
                    </p>
                    {(detail.template_data_schema ?? []).length === 0 ? (
                      <p className="text-muted-foreground">{t("noParams")}</p>
                    ) : (
                      <div className="overflow-x-auto rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t("colParamName")}</TableHead>
                              <TableHead>{t("colParamType")}</TableHead>
                              <TableHead>{t("colParamRequired")}</TableHead>
                              <TableHead>{t("colParamLength")}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(detail.template_data_schema ?? []).map((p) => (
                              <TableRow key={p.name}>
                                <TableCell className="font-mono text-xs">{p.name}</TableCell>
                                <TableCell>{p.type}</TableCell>
                                <TableCell>{p.require ? t("yes") : t("no")}</TableCell>
                                <TableCell className="text-muted-foreground">
                                  {p.minLength || p.maxLength
                                    ? `${p.minLength ?? 0}–${p.maxLength ?? "?"}`
                                    : "—"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                    {!detail.preview_url && <p className="mt-3 text-xs text-muted-foreground">{t("noPreviewHint")}</p>}
                  </div>
                </div>

                {detail.preview_url && (
                  <div className="flex w-full shrink-0 flex-col border-t p-4 lg:w-[440px] lg:border-t-0 lg:border-l">
                    <p className="mb-2 shrink-0 text-sm font-medium">{t("previewTitle")}</p>
                    <div className="min-h-[600px] flex-1 overflow-hidden rounded-lg border lg:min-h-0">
                      <iframe
                        src={detail.preview_url}
                        title={`${t("previewTitle")} ${detail.template_name}`}
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
