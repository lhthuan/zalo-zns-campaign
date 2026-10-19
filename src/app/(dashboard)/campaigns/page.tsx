"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTranslation } from "@/components/i18n-provider";
import { PageHeader } from "@/components/page-header";
import { TableMessageRow, TableSkeletonRows } from "@/components/table-states";
import { apiFetch, apiSend } from "@/lib/api-client";
import { queryKeys } from "@/lib/queries";

interface Campaign {
  id: string;
  name: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  is_hidden: boolean;
  zalo_templates: { template_name: string } | null;
}

const ALL_STATUS = "__all__";

export default function CampaignsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation("campaigns");
  const { t: tStatus } = useTranslation("campaignStatus");

  const STATUS_LABEL: Record<
    string,
    { label: string; variant: "success" | "warning" | "destructive" | "outline" }
  > = {
    draft: { label: tStatus("draft"), variant: "outline" },
    sending: { label: tStatus("sending"), variant: "warning" },
    completed: { label: tStatus("completed"), variant: "success" },
    completed_with_errors: { label: tStatus("completed_with_errors"), variant: "warning" },
    failed: { label: tStatus("failed"), variant: "destructive" },
  };
  const statusItems = {
    [ALL_STATUS]: `— ${t("allStatus")} —`,
    ...Object.fromEntries(Object.entries(STATUS_LABEL).map(([k, v]) => [k, v.label])),
  };
  const [showHidden, setShowHidden] = useState(false);

  const [filterName, setFilterName] = useState("");
  const [filterTemplate, setFilterTemplate] = useState("");
  const [filterStatus, setFilterStatus] = useState(ALL_STATUS);

  const { data: campaigns = [], isPending } = useQuery({
    queryKey: queryKeys.campaignList(showHidden),
    queryFn: () =>
      apiFetch<{ data: Campaign[] }>(`/api/campaigns${showHidden ? "?includeHidden=true" : ""}`).then(
        (j) => j.data ?? []
      ),
    meta: { errorMessage: "Không tải được danh sách chiến dịch" },
  });

  const hideMutation = useMutation({
    mutationFn: (c: Campaign) => apiSend(`/api/campaigns/${c.id}`, "PATCH", { is_hidden: !c.is_hidden }),
    onSuccess: (_data, c) => toast.success(c.is_hidden ? "Đã bỏ ẩn chiến dịch" : "Đã ẩn chiến dịch"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.campaigns }),
    meta: { errorMessage: "Không cập nhật được" },
  });

  const deleteMutation = useMutation({
    mutationFn: (c: Campaign) => apiSend(`/api/campaigns/${c.id}`, "DELETE"),
    onSuccess: () => toast.success("Đã xoá chiến dịch"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.campaigns }),
    meta: { errorMessage: "Xoá thất bại" },
  });
  const deletingId = deleteMutation.isPending ? deleteMutation.variables?.id : null;

  function toggleHidden(c: Campaign, e: React.MouseEvent) {
    e.stopPropagation();
    hideMutation.mutate(c);
  }

  function copyCampaign(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    router.push(`/campaigns/new?copyFrom=${id}`);
  }

  function deleteCampaign(c: Campaign, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Xoá chiến dịch nháp "${c.name}"? Không thể hoàn tác.`)) return;
    deleteMutation.mutate(c);
  }

  const visibleCampaigns = useMemo(() => {
    const base = showHidden ? campaigns : campaigns.filter((c) => !c.is_hidden);
    return base.filter((c) => {
      if (filterName.trim() && !c.name.toLowerCase().includes(filterName.trim().toLowerCase())) return false;
      if (
        filterTemplate.trim() &&
        !(c.zalo_templates?.template_name ?? "").toLowerCase().includes(filterTemplate.trim().toLowerCase())
      )
        return false;
      if (filterStatus !== ALL_STATUS && c.status !== filterStatus) return false;
      return true;
    });
  }, [campaigns, showHidden, filterName, filterTemplate, filterStatus]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("title")}
        actions={
          <>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="accent-primary"
                checked={showHidden}
                onChange={(e) => setShowHidden(e.target.checked)}
              />
              {t("showHidden")}
            </label>
            <Button render={<Link href="/campaigns/new" />}>
              <Plus className="size-4" />
              {t("createCampaign")}
            </Button>
          </>
        }
      />

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("colName")}</TableHead>
              <TableHead>{t("colTemplate")}</TableHead>
              <TableHead>{t("colStatus")}</TableHead>
              <TableHead>{t("colCounts")}</TableHead>
              <TableHead>{t("colCreatedAt")}</TableHead>
              <TableHead className="text-right">{t("colActions")}</TableHead>
            </TableRow>
            <TableRow>
              <TableHead>
                <Input
                  className="h-7 text-xs"
                  placeholder={t("filterName")}
                  value={filterName}
                  onChange={(e) => setFilterName(e.target.value)}
                />
              </TableHead>
              <TableHead>
                <Input
                  className="h-7 text-xs"
                  placeholder={t("filterTemplate")}
                  value={filterTemplate}
                  onChange={(e) => setFilterTemplate(e.target.value)}
                />
              </TableHead>
              <TableHead>
                <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v ?? ALL_STATUS)} items={statusItems}>
                  <SelectTrigger className="h-7 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_STATUS}>— {t("allStatus")} —</SelectItem>
                    {Object.entries(STATUS_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead />
              <TableHead />
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              <TableSkeletonRows cols={6} />
            ) : visibleCampaigns.length === 0 ? (
              <TableMessageRow cols={6}>{t("noCampaigns")}</TableMessageRow>
            ) : (
              visibleCampaigns.map((c) => {
                const statusInfo = STATUS_LABEL[c.status] ?? { label: c.status, variant: "outline" as const };
                return (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/campaigns/${c.id}`)}
                  >
                    <TableCell className="font-medium">
                      <Link
                        href={`/campaigns/${c.id}`}
                        className="hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.name}
                      </Link>
                      {c.is_hidden && (
                        <Badge variant="outline" className="ml-2">
                          {t("hiddenBadge")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{c.zalo_templates?.template_name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      <span className="text-emerald-600">{c.sent_count}</span> /{" "}
                      <span className="text-destructive">{c.failed_count}</span> / {c.total_recipients}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(c.created_at).toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell className="space-x-1 text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={(e) => copyCampaign(c.id, e)} title={t("copy")}>
                        <Copy className="size-3.5" />
                        <span className="hidden xl:inline">{t("copy")}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => toggleHidden(c, e)}
                        title={c.is_hidden ? t("unhide") : t("hide")}
                      >
                        {c.is_hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                        <span className="hidden xl:inline">{c.is_hidden ? t("unhide") : t("hide")}</span>
                      </Button>
                      {c.status === "draft" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={(e) => deleteCampaign(c, e)}
                          disabled={deletingId === c.id}
                          title={t("delete")}
                        >
                          <Trash2 className="size-3.5" />
                          <span className="hidden xl:inline">
                            {deletingId === c.id ? t("deleting") : t("delete")}
                          </span>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
