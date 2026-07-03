"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

const STATUS_LABEL: Record<
  string,
  { label: string; variant: "success" | "warning" | "destructive" | "outline" }
> = {
  draft: { label: "Nháp", variant: "outline" },
  sending: { label: "Đang gửi", variant: "warning" },
  completed: { label: "Hoàn tất", variant: "success" },
  completed_with_errors: { label: "Hoàn tất (có lỗi)", variant: "warning" },
  failed: { label: "Thất bại", variant: "destructive" },
};
const ALL_STATUS = "__all__";
const statusItems = {
  [ALL_STATUS]: "— Tất cả trạng thái —",
  ...Object.fromEntries(Object.entries(STATUS_LABEL).map(([k, v]) => [k, v.label])),
};

export default function CampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHidden, setShowHidden] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [filterName, setFilterName] = useState("");
  const [filterTemplate, setFilterTemplate] = useState("");
  const [filterStatus, setFilterStatus] = useState(ALL_STATUS);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/campaigns${showHidden ? "?includeHidden=true" : ""}`);
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      toast.error(json.error ?? "Không tải được danh sách chiến dịch");
      return;
    }
    setCampaigns(json.data ?? []);
  }, [showHidden]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function toggleHidden(c: Campaign, e: React.MouseEvent) {
    e.stopPropagation();
    const res = await fetch(`/api/campaigns/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_hidden: !c.is_hidden }),
    });
    if (!res.ok) {
      toast.error("Không cập nhật được");
      return;
    }
    toast.success(c.is_hidden ? "Đã bỏ ẩn chiến dịch" : "Đã ẩn chiến dịch");
    load();
  }

  function copyCampaign(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    router.push(`/campaigns/new?copyFrom=${id}`);
  }

  async function deleteCampaign(c: Campaign, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Xoá chiến dịch nháp "${c.name}"? Không thể hoàn tác.`)) return;
    setDeletingId(c.id);
    const res = await fetch(`/api/campaigns/${c.id}`, { method: "DELETE" });
    const json = await res.json();
    setDeletingId(null);
    if (!res.ok) {
      toast.error(json.error ?? "Xoá thất bại");
      return;
    }
    toast.success("Đã xoá chiến dịch");
    load();
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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Chiến dịch</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(e) => setShowHidden(e.target.checked)}
            />
            Hiện cả chiến dịch đã ẩn
          </label>
          <Button render={<Link href="/campaigns/new" />}>Tạo chiến dịch</Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tên</TableHead>
            <TableHead>Template</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead>Đã gửi / Lỗi / Tổng</TableHead>
            <TableHead>Ngày tạo</TableHead>
            <TableHead className="text-right">Hành động</TableHead>
          </TableRow>
          <TableRow>
            <TableHead>
              <Input
                className="h-7 text-xs"
                placeholder="Lọc theo tên..."
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
              />
            </TableHead>
            <TableHead>
              <Input
                className="h-7 text-xs"
                placeholder="Lọc theo template..."
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
                  <SelectItem value={ALL_STATUS}>— Tất cả trạng thái —</SelectItem>
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
          {loading ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                Đang tải...
              </TableCell>
            </TableRow>
          ) : visibleCampaigns.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                Chưa có chiến dịch nào
              </TableCell>
            </TableRow>
          ) : (
            visibleCampaigns.map((c) => {
              const statusInfo = STATUS_LABEL[c.status] ?? { label: c.status, variant: "outline" as const };
              return (
                <TableRow
                  key={c.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/campaigns/${c.id}`)}
                >
                  <TableCell>
                    <span className="hover:underline">{c.name}</span>
                    {c.is_hidden && (
                      <Badge variant="outline" className="ml-2">
                        Đã ẩn
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{c.zalo_templates?.template_name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                  </TableCell>
                  <TableCell>
                    {c.sent_count} / {c.failed_count} / {c.total_recipients}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(c.created_at).toLocaleString("vi-VN")}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="sm" onClick={(e) => copyCampaign(c.id, e)}>
                      Sao chép
                    </Button>
                    <Button variant="ghost" size="sm" onClick={(e) => toggleHidden(c, e)}>
                      {c.is_hidden ? "Bỏ ẩn" : "Ẩn"}
                    </Button>
                    {c.status === "draft" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => deleteCampaign(c, e)}
                        disabled={deletingId === c.id}
                      >
                        {deletingId === c.id ? "Đang xoá..." : "Xoá"}
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
  );
}
