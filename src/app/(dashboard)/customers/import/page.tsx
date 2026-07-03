"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { mapAndValidateCustomerRows, type ValidatedCustomerRow } from "@/lib/spreadsheet/import";

const NONE = "__none__";

interface ColumnSelectProps {
  field: string;
  label: string;
  value: string;
  headers: string[];
  onChange: (value: string) => void;
}

function ColumnSelect({ field, label, value, headers, onChange }: ColumnSelectProps) {
  const items = Object.fromEntries([[NONE, "— Không map —"], ...headers.map((h) => [h, h])]);
  return (
    <div className="space-y-1">
      <Label htmlFor={field}>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v ?? NONE)} items={items}>
        <SelectTrigger id={field} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>— Không map —</SelectItem>
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

// Add a header + matching example cell here whenever a new customer field
// needs its own import column — the mapping UI below already lets any
// column be assigned to any field, so this only needs to stay a template.
function downloadSampleTemplate() {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["Mã khách hàng", "Tên", "Số điện thoại", "Zalo UID", "Nhóm"],
    ["KH0001", "Nguyễn Văn A", "0901234567", "", "Khách VIP, Hà Nội"],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Khách hàng");
  XLSX.writeFile(workbook, "mau_import_khach_hang.xlsx");
}

export default function CustomersImportPage() {
  const router = useRouter();
  const [batchName, setBatchName] = useState("");
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({
    customer_code: NONE,
    name: NONE,
    phone: NONE,
    zalo_uid: NONE,
    group: NONE,
  });
  const [preview, setPreview] = useState<ValidatedCustomerRow[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPreview(null);
    if (!batchName) setBatchName(f.name.replace(/\.[^./\\]+$/, ""));

    const buffer = await f.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    setRawRows(rows);
    setHeaders(rows.length > 0 ? Object.keys(rows[0]) : []);
  }

  function setMappingField(field: string, value: string) {
    setMapping((m) => ({ ...m, [field]: value }));
    setPreview(null);
  }

  function handlePreview() {
    if (mapping.phone === NONE && mapping.zalo_uid === NONE) {
      return toast.error("Phải map ít nhất cột Số điện thoại hoặc Zalo UID");
    }
    const validated = mapAndValidateCustomerRows(rawRows, {
      customer_code: mapping.customer_code === NONE ? undefined : mapping.customer_code,
      name: mapping.name === NONE ? undefined : mapping.name,
      phone: mapping.phone === NONE ? undefined : mapping.phone,
      zalo_uid: mapping.zalo_uid === NONE ? undefined : mapping.zalo_uid,
      group: mapping.group === NONE ? undefined : mapping.group,
    });
    setPreview(validated);
  }

  async function handleConfirmImport() {
    if (!preview) return;
    const validRows = preview.filter((r) => r.valid).map((r) => r.data);
    if (validRows.length === 0) return toast.error("Không có dòng hợp lệ nào để import");
    if (!batchName.trim()) return toast.error("Đặt tên cho lô import này");

    setSubmitting(true);
    const res = await fetch("/api/customers/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch_name: batchName.trim(), rows: validRows }),
    });
    const json = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      toast.error(json.error ? JSON.stringify(json.error) : "Import thất bại");
      return;
    }
    toast.success(`Đã import ${json.imported}/${json.totalRows} dòng vào lô "${batchName.trim()}"`);
    router.push("/customers");
  }

  const validCount = preview?.filter((r) => r.valid).length ?? 0;
  const invalidRows = preview?.filter((r) => !r.valid) ?? [];

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Import khách hàng từ file</h1>

      <Card>
        <CardHeader>
          <CardTitle>0. Tải file mẫu (không bắt buộc)</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={downloadSampleTemplate}>
            Tải file mẫu Excel
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>1. Chọn file (.xlsx/.csv)</CardTitle>
        </CardHeader>
        <CardContent>
          <Input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} />
        </CardContent>
      </Card>

      {headers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>2. Đặt tên lô nhập & map cột</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Tên lô nhập (dùng để lọc/xoá lại sau này, và chọn khi tạo chiến dịch)</Label>
              <Input value={batchName} onChange={(e) => setBatchName(e.target.value)} />
            </div>
            <ColumnSelect
              field="phone"
              label="Số điện thoại"
              value={mapping.phone}
              headers={headers}
              onChange={(v) => setMappingField("phone", v)}
            />
            <ColumnSelect
              field="name"
              label="Tên"
              value={mapping.name}
              headers={headers}
              onChange={(v) => setMappingField("name", v)}
            />
            <ColumnSelect
              field="customer_code"
              label="Mã khách hàng"
              value={mapping.customer_code}
              headers={headers}
              onChange={(v) => setMappingField("customer_code", v)}
            />
            <ColumnSelect
              field="zalo_uid"
              label="Zalo UID (nếu có)"
              value={mapping.zalo_uid}
              headers={headers}
              onChange={(v) => setMappingField("zalo_uid", v)}
            />
            <ColumnSelect
              field="group"
              label="Nhóm (nếu có — nhiều nhóm cách nhau bằng dấu phẩy)"
              value={mapping.group}
              headers={headers}
              onChange={(v) => setMappingField("group", v)}
            />
            <p className="text-sm text-muted-foreground">
              Khách hàng cần có ít nhất SĐT hoặc Zalo UID. Nhóm chưa tồn tại sẽ tự được tạo. Các cột còn
              lại chưa map sẽ được lưu vào trường phụ (extra_fields).
            </p>
            <Button onClick={handlePreview}>Xem trước</Button>
          </CardContent>
        </Card>
      )}

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>
              3. Xác nhận import — {validCount} dòng hợp lệ, {invalidRows.length} dòng lỗi
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {invalidRows.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-destructive">
                  Các dòng lỗi sau sẽ bị loại khi import:
                </p>
                <div className="max-h-64 overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Dòng</TableHead>
                        <TableHead>Tên</TableHead>
                        <TableHead>SĐT</TableHead>
                        <TableHead>Zalo UID</TableHead>
                        <TableHead>Lỗi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invalidRows.map((r) => (
                        <TableRow key={r.rowIndex}>
                          <TableCell>{r.rowIndex + 2}</TableCell>
                          <TableCell>{r.data.name ?? "—"}</TableCell>
                          <TableCell>{r.data.phone ?? "—"}</TableCell>
                          <TableCell>{r.data.zalo_uid ?? "—"}</TableCell>
                          <TableCell>
                            <Badge variant="destructive">{r.reason}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <div className="max-h-64 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tên</TableHead>
                    <TableHead>SĐT</TableHead>
                    <TableHead>Zalo UID</TableHead>
                    <TableHead>Nhóm</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview
                    .filter((r) => r.valid)
                    .map((r) => (
                      <TableRow key={r.rowIndex}>
                        <TableCell>{r.data.name ?? "—"}</TableCell>
                        <TableCell>{r.data.phone ?? "—"}</TableCell>
                        <TableCell>{r.data.zalo_uid ?? "—"}</TableCell>
                        <TableCell>{r.data.groups.join(", ") || "—"}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>

            <Button onClick={handleConfirmImport} disabled={submitting || validCount === 0}>
              {submitting ? "Đang import..." : `Xác nhận import ${validCount} dòng hợp lệ`}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
