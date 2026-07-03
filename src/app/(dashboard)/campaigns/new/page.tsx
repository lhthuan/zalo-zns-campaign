"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { ALL_CUSTOMERS_BATCH } from "@/lib/customerBatch";
import { formatVnd } from "@/lib/format";

const NONE = "__none__";

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
  price_sdt: number | null;
  price_uid: number | null;
}

interface ImportBatch {
  import_batch: string;
  customer_count: number;
  last_imported_at: string;
}

interface CustomerGroup {
  group_id: string;
  name: string;
  customer_count: number;
}

interface ColumnSelectProps {
  label: string;
  value: string;
  headers: string[];
  onChange: (value: string) => void;
}

function ColumnSelect({ label, value, headers, onChange }: ColumnSelectProps) {
  const items = Object.fromEntries([[NONE, "— Chọn cột —"], ...headers.map((h) => [h, h])]);
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v ?? NONE)} items={items}>
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

function TemplatePreview({
  template,
  recipientCount,
}: {
  template: ZaloTemplate;
  recipientCount: number | null;
}) {
  const params = template.template_data_schema ?? [];
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Xem trước template: {template.template_name}</CardTitle>
          <Badge>{template.tag ?? "—"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
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
        {(template.price_sdt != null || template.price_uid != null) && (
          <div className="space-y-1 text-sm text-muted-foreground">
            {template.price_sdt != null && (
              <p>
                Đơn giá gửi qua SĐT: <strong className="text-foreground">{formatVnd(template.price_sdt)}</strong>{" "}
                / tin
                {recipientCount != null && recipientCount > 0 && (
                  <>
                    {" "}
                    × {recipientCount.toLocaleString("vi-VN")} người nhận ≈{" "}
                    <strong className="text-foreground">
                      {formatVnd(template.price_sdt * recipientCount)}
                    </strong>
                  </>
                )}
              </p>
            )}
            {template.price_uid != null && (
              <p>
                Đơn giá gửi qua UID: <strong className="text-foreground">{formatVnd(template.price_uid)}</strong>{" "}
                / tin
                {recipientCount != null && recipientCount > 0 && (
                  <>
                    {" "}
                    × {recipientCount.toLocaleString("vi-VN")} người nhận ≈{" "}
                    <strong className="text-foreground">
                      {formatVnd(template.price_uid * recipientCount)}
                    </strong>
                  </>
                )}
              </p>
            )}
            <p className="text-xs">
              Chi phí thực tế phụ thuộc mỗi người nhận gửi qua SĐT hay UID — số trên chỉ là ước tính nếu
              toàn bộ người nhận cùng 1 chế độ.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function NewCampaignPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Đang tải...</p>}>
      <NewCampaignForm />
    </Suspense>
  );
}

function NewCampaignForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const copyFromId = searchParams.get("copyFrom");

  const [templates, setTemplates] = useState<ZaloTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"broadcast" | "custom">("broadcast");
  const [submitting, setSubmitting] = useState(false);

  // Broadcast mode
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [allCustomerCount, setAllCustomerCount] = useState(0);
  const [broadcastSource, setBroadcastSource] = useState<"all" | "batch" | "group">("all");
  const [customerBatch, setCustomerBatch] = useState(ALL_CUSTOMERS_BATCH);
  const [customerGroupId, setCustomerGroupId] = useState("");
  const [fixedParams, setFixedParams] = useState<Record<string, string>>({});

  // Custom mode
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rowCount, setRowCount] = useState(0);
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
    fetch("/api/customer-groups")
      .then((res) => res.json())
      .then((json) => setGroups(json.data ?? []))
      .catch(() => toast.error("Không tải được danh sách nhóm khách hàng"));
    fetch("/api/customers?page=1&pageSize=1")
      .then((res) => res.json())
      .then((json) => setAllCustomerCount(json.total ?? 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!copyFromId) return;
    fetch(`/api/campaigns/${copyFromId}`)
      .then((res) => res.json())
      .then((json) => {
        const c = json.data;
        if (!c) return;
        setName(`${c.name} (bản sao)`);
        setTemplateId(c.template_id);
        if (c.creation_mode === "broadcast") {
          setMode("broadcast");
          if (c.customer_group_id) {
            setBroadcastSource("group");
            setCustomerGroupId(c.customer_group_id);
          } else if (c.customer_batch) {
            setBroadcastSource("batch");
            setCustomerBatch(c.customer_batch);
          } else {
            setBroadcastSource("all");
          }
          setFixedParams(c.fixed_template_data ?? {});
        } else {
          setMode("custom");
          toast.message("Chiến dịch gốc là dạng tuỳ biến — cần tải lại file danh sách người nhận.");
        }
      })
      .catch(() => toast.error("Không tải được chiến dịch để sao chép"));
  }, [copyFromId]);

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const params = selectedTemplate?.template_data_schema ?? [];
  const broadcastCount =
    broadcastSource === "all"
      ? allCustomerCount
      : broadcastSource === "batch"
        ? batches.find((b) => b.import_batch === customerBatch)?.customer_count ?? 0
        : groups.find((g) => g.group_id === customerGroupId)?.customer_count ?? 0;
  const recipientCount = mode === "broadcast" ? broadcastCount : rowCount;

  const templateItems = Object.fromEntries(templates.map((t) => [t.id, t.template_name]));
  const batchItems = Object.fromEntries(
    batches.map((b) => [b.import_batch, `${b.import_batch} (${b.customer_count})`])
  );
  const groupItems = Object.fromEntries(
    groups.map((g) => [g.group_id, `${g.name} (${g.customer_count})`])
  );

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
    setRowCount(rows.length);
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
      if (broadcastSource === "group") {
        if (!customerGroupId) {
          setSubmitting(false);
          return toast.error("Chọn nhóm khách hàng");
        }
        formData.append("customer_group_id", customerGroupId);
      } else if (broadcastSource === "batch") {
        formData.append("customer_batch", customerBatch);
      }
      formData.append("fixed_template_data", JSON.stringify(fixedParams));
    } else {
      if (!file) {
        setSubmitting(false);
        return toast.error("Chọn file danh sách người nhận");
      }
      if (phoneColumn === NONE && uidColumn === NONE) {
        setSubmitting(false);
        return toast.error("Phải chọn cột Số điện thoại hoặc Zalo UID");
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
          phone: phoneColumn === NONE ? undefined : phoneColumn,
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
    if (json.rejectedRows > 0) {
      toast.warning(`Đã loại ${json.rejectedRows} dòng lỗi (thiếu SĐT/UID hoặc SĐT không hợp lệ)`);
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
            <Select value={templateId} onValueChange={(v) => setTemplateId(v ?? "")} items={templateItems}>
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

      {selectedTemplate && (
        <TemplatePreview template={selectedTemplate} recipientCount={recipientCount} />
      )}

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
                  <Tabs
                    value={broadcastSource}
                    onValueChange={(v) =>
                      setBroadcastSource((v as "all" | "batch" | "group") ?? "all")
                    }
                  >
                    <TabsList>
                      <TabsTrigger value="all">Tất cả khách hàng</TabsTrigger>
                      <TabsTrigger value="batch">Theo lô upload</TabsTrigger>
                      <TabsTrigger value="group">Theo nhóm khách hàng</TabsTrigger>
                    </TabsList>

                    <TabsContent value="all" className="pt-3">
                      <p className="text-sm text-muted-foreground">
                        Gửi tới toàn bộ {allCustomerCount.toLocaleString("vi-VN")} khách hàng hiện có.
                      </p>
                    </TabsContent>

                    <TabsContent value="batch" className="space-y-1 pt-3">
                      <Select
                        value={customerBatch}
                        onValueChange={(v) => setCustomerBatch(v ?? "")}
                        items={batchItems}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Chọn lô đã upload" />
                        </SelectTrigger>
                        <SelectContent>
                          {batches.map((b) => (
                            <SelectItem key={b.import_batch} value={b.import_batch}>
                              {b.import_batch} ({b.customer_count})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Các lô này được tạo khi bạn import file ở trang Khách hàng, hoặc tự động đặt tên
                        theo chiến dịch &quot;Gửi tuỳ biến&quot; trước đó.
                      </p>
                    </TabsContent>

                    <TabsContent value="group" className="space-y-1 pt-3">
                      <Select
                        value={customerGroupId}
                        onValueChange={(v) => setCustomerGroupId(v ?? "")}
                        items={groupItems}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Chọn nhóm khách hàng" />
                        </SelectTrigger>
                        <SelectContent>
                          {groups.map((g) => (
                            <SelectItem key={g.group_id} value={g.group_id}>
                              {g.name} ({g.customer_count})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Nhóm khách hàng được quản lý ở trang Khách hàng.
                      </p>
                    </TabsContent>
                  </Tabs>
                </div>

                {params.length > 0 && (
                  <div className="space-y-3 border-t pt-3">
                    <p className="text-sm font-medium">Tham số template (áp dụng cho tất cả)</p>
                    {params.map((p) => (
                      <div key={p.name} className="space-y-1">
                        <Label>
                          {p.name} {p.require && <span className="text-destructive">*</span>}
                          <span className="ml-2 font-normal text-xs text-muted-foreground">
                            {p.type}
                            {(p.minLength || p.maxLength) &&
                              ` · ${p.minLength ?? 0}–${p.maxLength ?? "?"} ký tự`}
                          </span>
                        </Label>
                        <Input
                          value={fixedParams[p.name] ?? ""}
                          maxLength={p.maxLength}
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
                    <p className="text-sm font-medium">Map cột file ({rowCount} dòng)</p>
                    <ColumnSelect
                      label="Số điện thoại"
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
                      Cần map ít nhất SĐT hoặc Zalo UID. Người nhận sẽ dùng UID nếu có (từ file này hoặc
                      đã lưu trong hồ sơ khách hàng), ngược lại dùng số điện thoại. Sau khi gửi, những
                      khách hàng này sẽ được lưu/cập nhật vào danh sách Khách hàng, gắn theo tên chiến
                      dịch &quot;{name.trim() || "..."}&quot;.
                    </p>

                    {params.length > 0 && (
                      <div className="space-y-3 border-t pt-3">
                        <p className="text-sm font-medium">Tham số template (mỗi người 1 giá trị riêng)</p>
                        {params.map((p) => (
                          <ColumnSelect
                            key={p.name}
                            label={`${p.name}${p.require ? " *" : ""} — ${p.type}${
                              p.minLength || p.maxLength
                                ? ` (${p.minLength ?? 0}–${p.maxLength ?? "?"} ký tự)`
                                : ""
                            }`}
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
