"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { ArrowDown, ArrowUp, ArrowUpDown, RefreshCw, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { TableMessageRow, TableSkeletonRows } from "@/components/table-states";
import { ZnsPreviewFrame } from "@/components/zns-preview-frame";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, apiSend } from "@/lib/api-client";
import { queryKeys, useTemplates, type ZaloTemplate } from "@/lib/queries";

type SortKey = "id" | "name";

/** The template's preview with its placeholders left as-is, rendered through our preview-html proxy. */
function TemplatePreview({ template, title }: { template: ZaloTemplate; title: string }) {
  const { data: html, isPending, error } = useQuery({
    queryKey: ["template-preview", template.template_id],
    queryFn: () =>
      apiSend<{ html: string }>("/api/templates/preview-html", "POST", {
        templateId: template.template_id,
        params: {},
      }).then((j) => j.html),
    staleTime: 5 * 60_000,
  });
  if (isPending) return <Skeleton className="h-96 w-full" />;
  if (error || !html) return <p className="p-4 text-sm text-muted-foreground">{error?.message ?? "—"}</p>;
  return <ZnsPreviewFrame html={html} title={title} />;
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
  const queryClient = useQueryClient();
  const { data: templates = [], isPending } = useTemplates();
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<ZaloTemplate | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "id", dir: "desc" });

  const syncMutation = useMutation({
    mutationFn: () => apiFetch<{ synced: number; total: number }>("/api/templates/sync", { method: "POST" }),
    onSuccess: (json) => toast.success(`Đã đồng bộ ${json.synced}/${json.total} template`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.templates }),
    meta: { errorMessage: "Sync thất bại" },
  });
  const syncing = syncMutation.isPending;

  const filtered = [...templates]
    .filter((tpl) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        tpl.template_name.toLowerCase().includes(q) || tpl.template_id.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const cmp =
        sort.key === "name"
          ? a.template_name.localeCompare(b.template_name, "vi", { numeric: true })
          : Number(a.template_id) - Number(b.template_id);
      return sort.dir === "asc" ? cmp : -cmp;
    });

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : // Names read naturally A→Z; IDs default to newest first.
          { key, dir: key === "name" ? "asc" : "desc" }
    );
  }

  function sortIcon(key: SortKey) {
    if (sort.key !== key) return <ArrowUpDown className="size-3.5 opacity-50" />;
    return sort.dir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("title")}
        description={
          <>
            {templates.length} {t("syncedCount")}
            {search.trim() && ` — ${filtered.length} ${t("searchMatches")}`}
          </>
        }
        actions={
          <Button onClick={() => syncMutation.mutate()} disabled={syncing}>
            <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? t("syncing") : t("sync")}
          </Button>
        }
      />

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <button type="button" onClick={() => toggleSort("name")} className="inline-flex items-center gap-1 hover:text-foreground">
                {t("colName")}
                {sortIcon("name")}
              </button>
            </TableHead>
            <TableHead>
              <button type="button" onClick={() => toggleSort("id")} className="inline-flex items-center gap-1 hover:text-foreground">
                {t("colId")}
                {sortIcon("id")}
              </button>
            </TableHead>
            <TableHead>{t("colTag")}</TableHead>
            <TableHead>{t("colStatus")}</TableHead>
            <TableHead>{t("colLastSynced")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending ? (
            <TableSkeletonRows cols={5} />
          ) : templates.length === 0 ? (
            <TableMessageRow cols={5}>{t("noTemplates")}</TableMessageRow>
          ) : filtered.length === 0 ? (
            <TableMessageRow cols={5}>
              {t("noMatch")} &quot;{search}&quot;
            </TableMessageRow>
          ) : (
            filtered.map((tpl) => {
              const statusInfo = STATUS_LABEL[tpl.status] ?? { label: tpl.status, variant: "outline" as const };
              return (
                <TableRow key={tpl.id} className="cursor-pointer" onClick={() => setDetail(tpl)}>
                  <TableCell className="font-medium hover:underline">{tpl.template_name}</TableCell>
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
      </div>

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
                    <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
                      <TemplatePreview
                        template={detail}
                        title={`${t("previewTitle")} ${detail.template_name}`}
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
