"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NONE = "__none__";
const ALL_CUSTOMERS = "__all__";

interface ZaloTemplateParam {
  name: string;
  require: boolean;
  type: string;
  maxLength?: number;
  minLength?: number;
}

interface ZaloTemplate {
  id: string;
  template_name: string;
  status: string;
  tag: string | null;
  template_data_schema: ZaloTemplateParam[] | null;
}

interface ImportBatch {
  import_batch: string;
  customer_count: number;
  last_imported_at: string;
}

interface ColumnSelectProps {
  label: string;
  value: string;
  headers: string[];
  onChange: (value: string) => void;
}

function ColumnSelect({ label, value, headers, onChange }: ColumnSelectProps) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v ?? NONE)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>— Chọn cột —</SelectItem>
          {headers.map((h) => (
            <SelectItem key={h} value={h}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function TemplatePreview({ template }: { template: ZaloTemplate }) {
  const params = template.template_data_schema ?? [];
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Xem trước template: {template.template_name}</CardTitle>
          <Badge>{template.tag ?? "—"}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {params.length === 0 ? (
          <p className="text-sm text-muted-foreground">Template này không có tham số nào.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tham số</TableHead>
                <TableHead>Kiểu</TableHead>
                <TableHead>Bắt buộc</TableHead>
                <TableHead>Độ dài</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {params.map((p) => (
                <TableRow key={p.name}>
                  <TableCell className="font-mono text-xs">{p.name}</TableCell>
                  <TableCell>{p.type}</TableCell>
                  <TableCell>{p.require ? "Có" : "Không"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.minLength || p.maxLength ? `${p.minLength ?? 0}–${p.maxLength ?? "?"}` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default function NewCampaignPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<ZaloTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"broadcast" | "custom">("broadcast");
  const [submitting, setSubmitting] = useState(false);

  // Broadcast mode
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [allCustomerCount, setAllCustomerCount] = useState(0);
  const [customerBatch, setCustomerBatch] = useState(ALL_CUSTOMERS);
  const [fixedParams, setFixedParams] = useState<Record<string, string>>({});

  // Custom mode
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [phoneColumn, setPhoneColumn] = useState(NONE);
  const [nameColumn, setNameColumn] = useState(NONE);
  const [uidColumn, setUidColumn] = useState(NONE);
  const [paramMapping, setParamMapping] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/templates")
      .then((res) => res.json())
      .then((json) => setTemplates((json.data ?? []).filter((t: ZaloTemplate) => t.status === "ENABLE")))
      .catch(() => toast.error("Không tải được danh sách template"));
    fetch("/api/customers/import-batches")
      .then((res) => res.json())
      .then((json) => setBatches(json.data ?? []))
      .catch(() => toast.error("Không tải được danh sách lô khách hàng"));
    fetch("/api/customers?page=1&pageSize=1")
      .then((res) => res.json())
      .then((json) => setAllCustomerCount(json.total ?? 0))
      .catch(() => {});
  }, []);

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const params = selectedTemplate?.template_data_schema ?? [];

  function downloadDataTemplate() {
    if (!selectedTemplate) return;
    const headerRow = ["Số điện thoại", "Tên", "Zalo UID (nếu có)", ...params.map((p) => p.name)];
    const exampleRow = ["0901234567", "Nguyễn Văn A", "", ...params.map(() => "")];
    const worksheet = XLSX.utils.aoa_to_sheet([headerRow, exampleRow]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Danh sách gửi");
    XLSX.writeFile(workbook, `mau_du_lieu_${selectedTemplate.template_name}.xlsx`);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const buffer = await f.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    setHeaders(rows.length > 0 ? Object.keys(rows[0]) : []);
  }

  async function handleSubmit() {
    if (!name.trim()) return toast.error("Nhập tên chiến dịch");
    if (!templateId) return toast.error("Chọn template");

    setSubmitting(true);
    const formData = new FormData();
    formData.append("name", name.trim());
    formData.append("template_id", templateId);
    formData.append("mode", mode);

    if (mode === "broadcast") {
      const missingRequired = params.filter((p) => p.require && !fixedParams[p.name]?.trim());
      if (missingRequired.length > 0) {
        setSubmitting(false);
        return toast.error(`Chưa điền tham số bắt buộc: ${missingRequired.map((p) => p.name).join(", ")}`);
      }
      formData.append("customer_batch", customerBatch);
      formData.append("fixed_template_data", JSON.stringify(fixedParams));
    } else {
      if (!file) {
        setSubmitting(false);
        return toast.error("Chọn file danh sách người nhận");
      }
      if (phoneColumn === NONE) {
        setSubmitting(false);
        return toast.error("Phải chọn cột Số điện thoại");
      }
      const missingRequired = params.filter((p) => p.require && !paramMapping[p.name]);
      if (missingRequired.length > 0) {
        setSubmitting(false);
        return toast.error(`Chưa map tham số bắt buộc: ${missingRequired.map((p) => p.name).join(", ")}`);
      }
      formData.append("file", file);
      formData.append(
        "mapping",
        JSON.stringify({
          phone: phoneColumn,
          name: nameColumn === NONE ? undefined : nameColumn,
          zalo_uid: uidColumn === NONE ? undefined : uidColumn,
          templateParams: paramMapping,
        })
      );
    }

    const res = await fetch("/api/campaigns", { method: "POST", body: formData });
    const json = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      toast.error(json.error ? JSON.stringify(json.error) : "Tạo chiến dịch thất bại");
      return;
    }
    toast.success("Đã tạo chiến dịch nháp");
    router.push(`/campaigns/${json.id}`);
  }

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-xl font-semibold">Tạo chiến dịch mới</h1>

      <Card>
        <CardHeader>
          <CardTitle>1. Thông tin chung</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Tên chiến dịch</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Template</Label>
            <Select value={templateId} onValueChange={(v) => setTemplateId(v ?? "")}>
              <SelectTrigger className="w-full">
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
          </div>
        </CardContent>
      </Card>

      {selectedTemplate && <TemplatePreview template={selectedTemplate} />}

      {selectedTemplate && (
        <Card>
          <CardHeader>
            <CardTitle>2. Chế độ gửi</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={mode} onValueChange={(v) => setMode((v as "broadcast" | "custom") ?? "broadcast")}>
              <TabsList>
                <TabsTrigger value="broadcast">Gửi hàng loạt (1 nội dung)</TabsTrigger>
                <TabsTrigger value="custom">Gửi tuỳ biến (tải file)</TabsTrigger>
              </TabsList>

              <TabsContent value="broadcast" className="space-y-4 pt-4">
                <p className="text-sm text-muted-foreground">
                  Điền cố định tham số bên dưới — nội dung giống nhau sẽ được gửi cho tất cả khách hàng
                  trong danh sách bạn chọn.
                </p>
                <div className="space-y-1">
                  <Label>Danh sách khách hàng</Label>
                  <Select value={customerBatch} onValueChange={(v) => setCustomerBatch(v ?? ALL_CUSTOMERS)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_CUSTOMERS}>
                        — Tất cả khách hàng — ({allCustomerCount})
                      </SelectItem>
                      {batches.map((b) => (
                        <SelectItem key={b.import_batch} value={b.import_batch}>
                          {b.import_batch} ({b.customer_count})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Các lô này được tạo khi bạn import file ở trang Khách hàng, hoặc tự động đặt tên theo
                    chiến dịch &quot;Gửi tuỳ biến&quot; trước đó.
                  </p>
                </div>

                {params.length > 0 && (
                  <div className="space-y-3 border-t pt-3">
                    <p className="text-sm font-medium">Tham số template (áp dụng cho tất cả)</p>
                    {params.map((p) => (
                      <div key={p.name} className="space-y-1">
                        <Label>
                          {p.name} {p.require && <span className="text-destructive">*</span>}
                        </Label>
                        <Input
                          value={fixedParams[p.name] ?? ""}
                          onChange={(e) =>
                            setFixedParams((m) => ({ ...m, [p.name]: e.target.value }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="custom" className="space-y-4 pt-4">
                <p className="text-sm text-muted-foreground">
                  Mỗi khách hàng có thể nhận nội dung khác nhau — tải file mẫu, điền số điện thoại + tên +
                  tham số riêng cho từng người, rồi tải lên lại.
                </p>
                <Button variant="outline" onClick={downloadDataTemplate}>
                  Tải file mẫu Excel cho template này
                </Button>
                <div className="space-y-1">
                  <Label>File danh sách người nhận (.xlsx/.csv)</Label>
                  <Input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} />
                </div>

                {headers.length > 0 && (
                  <div className="space-y-3 border-t pt-3">
                    <p className="text-sm font-medium">Map cột file</p>
                    <ColumnSelect
                      label="Số điện thoại (bắt buộc)"
                      value={phoneColumn}
                      headers={headers}
                      onChange={setPhoneColumn}
                    />
                    <ColumnSelect label="Tên khách hàng" value={nameColumn} headers={headers} onChange={setNameColumn} />
                    <ColumnSelect
                      label="Zalo UID (nếu file có sẵn)"
                      value={uidColumn}
                      headers={headers}
                      onChange={setUidColumn}
                    />
                    <p className="text-xs text-muted-foreground">
                      Người nhận sẽ dùng UID nếu có (từ file này hoặc đã lưu trong hồ sơ khách hàng), ngược
                      lại dùng số điện thoại. Sau khi gửi, những khách hàng này sẽ được lưu/cập nhật vào
                      danh sách Khách hàng, gắn theo tên chiến dịch &quot;{name.trim() || "..."}&quot;.
                    </p>

                    {params.length > 0 && (
                      <div className="space-y-3 border-t pt-3">
                        <p className="text-sm font-medium">Tham số template (mỗi người 1 giá trị riêng)</p>
                        {params.map((p) => (
                          <ColumnSelect
                            key={p.name}
                            label={`${p.name}${p.require ? " *" : ""}`}
                            value={paramMapping[p.name] ?? NONE}
                            headers={headers}
                            onChange={(v) =>
                              setParamMapping((m) => ({ ...m, [p.name]: v && v !== NONE ? v : "" }))
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <Button className="mt-4" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Đang tạo..." : "Tạo chiến dịch (nháp)"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
