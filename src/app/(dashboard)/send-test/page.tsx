"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

interface ZaloTemplateParam {
  name: string;
  require: boolean;
  type: string;
}

interface ZaloTemplate {
  id: string;
  template_name: string;
  status: string;
  template_data_schema: ZaloTemplateParam[] | null;
}

interface Customer {
  id: string;
  name: string;
  phone: string;
  zalo_uid: string | null;
}

interface SendResult {
  customerId: string;
  name: string;
  phone: string;
  sendMode: "uid" | "phone";
  success: boolean;
  zaloMsgId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export default function SendTestPage() {
  const [templates, setTemplates] = useState<ZaloTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SendResult[]>([]);

  useEffect(() => {
    fetch("/api/templates")
      .then((res) => res.json())
      .then((json) => setTemplates((json.data ?? []).filter((t: ZaloTemplate) => t.status === "ENABLE")))
      .catch(() => toast.error("Không tải được danh sách template"));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ pageSize: "20" });
    if (search) params.set("search", search);
    fetch(`/api/customers?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => setCustomers(json.data ?? []))
      .catch(() => toast.error("Không tải được danh sách khách hàng"));
  }, [search]);

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const params = selectedTemplate?.template_data_schema ?? [];

  function toggleCustomer(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSend() {
    if (!templateId) return toast.error("Chọn template");
    if (selectedIds.size === 0) return toast.error("Chọn ít nhất 1 khách hàng");

    const missingRequired = params.filter((p) => p.require && !paramValues[p.name]);
    if (missingRequired.length > 0) {
      return toast.error(`Chưa điền tham số bắt buộc: ${missingRequired.map((p) => p.name).join(", ")}`);
    }

    setSending(true);
    setResults([]);
    const res = await fetch("/api/zns/test-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template_id: templateId,
        customer_ids: [...selectedIds],
        template_data: paramValues,
      }),
    });
    const json = await res.json();
    setSending(false);

    if (!res.ok) {
      toast.error(json.error ? JSON.stringify(json.error) : "Gửi thất bại");
      return;
    }
    setResults(json.results);
    const successCount = json.results.filter((r: SendResult) => r.success).length;
    toast.success(`Đã gửi ${successCount}/${json.results.length} thành công`);
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Gửi thử ZNS</h1>
        <p className="text-sm text-muted-foreground">
          Gửi 1 tin ZNS ngay lập tức tới một vài khách hàng đã chọn, dùng để test template và hàm gửi
          tin (không tạo chiến dịch, không qua hàng đợi).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Chọn template</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={templateId} onValueChange={(v) => setTemplateId(v ?? "")}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn template" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.template_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {params.length > 0 && (
            <div className="mt-4 space-y-3 border-t pt-3">
              <p className="text-sm font-medium">Tham số template</p>
              {params.map((p) => (
                <div key={p.name} className="space-y-1">
                  <Label>
                    {p.name} {p.require && <span className="text-destructive">*</span>}
                  </Label>
                  <Input
                    value={paramValues[p.name] ?? ""}
                    onChange={(e) => setParamValues((m) => ({ ...m, [p.name]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Chọn khách hàng ({selectedIds.size} đã chọn)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Tìm theo tên, SĐT, mã KH..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Tên</TableHead>
                <TableHead>SĐT</TableHead>
                <TableHead>Zalo UID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer"
                  onClick={() => toggleCustomer(c.id)}
                >
                  <TableCell>
                    <input type="checkbox" checked={selectedIds.has(c.id)} readOnly />
                  </TableCell>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>{c.phone}</TableCell>
                  <TableCell>{c.zalo_uid ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Button onClick={handleSend} disabled={sending}>
        {sending ? "Đang gửi..." : "Gửi thử"}
      </Button>

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Kết quả</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên</TableHead>
                  <TableHead>SĐT</TableHead>
                  <TableHead>Chế độ</TableHead>
                  <TableHead>Kết quả</TableHead>
                  <TableHead>Chi tiết</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.customerId}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{r.phone}</TableCell>
                    <TableCell>{r.sendMode}</TableCell>
                    <TableCell>
                      <Badge variant={r.success ? "default" : "destructive"}>
                        {r.success ? "Thành công" : "Thất bại"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.success ? r.zaloMsgId : r.errorMessage}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
