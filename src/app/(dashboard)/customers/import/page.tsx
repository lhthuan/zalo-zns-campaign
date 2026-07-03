"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NONE = "__none__";

interface ColumnSelectProps {
  field: string;
  label: string;
  value: string;
  headers: string[];
  onChange: (value: string) => void;
}

function ColumnSelect({ field, label, value, headers, onChange }: ColumnSelectProps) {
  return (
    <div className="space-y-1">
      <Label htmlFor={field}>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v ?? NONE)}>
        <SelectTrigger id={field}>
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

export default function CustomersImportPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({
    customer_code: NONE,
    name: NONE,
    phone: NONE,
    zalo_uid: NONE,
  });
  const [submitting, setSubmitting] = useState(false);

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
    if (!file) {
      toast.error("Chọn file trước đã");
      return;
    }
    if (mapping.phone === NONE) {
      toast.error("Phải chọn cột Số điện thoại");
      return;
    }

    setSubmitting(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append(
      "mapping",
      JSON.stringify({
        customer_code: mapping.customer_code === NONE ? undefined : mapping.customer_code,
        name: mapping.name === NONE ? undefined : mapping.name,
        phone: mapping.phone,
        zalo_uid: mapping.zalo_uid === NONE ? undefined : mapping.zalo_uid,
      })
    );

    const res = await fetch("/api/customers/import", { method: "POST", body: formData });
    const json = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      toast.error(json.error ? JSON.stringify(json.error) : "Import thất bại");
      return;
    }
    toast.success(`Đã import ${json.imported}/${json.totalRows} dòng`);
    router.push("/customers");
  }

  function setMappingField(field: string, value: string) {
    setMapping((m) => ({ ...m, [field]: value }));
  }

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">Import khách hàng từ file</h1>
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
            <CardTitle>2. Map cột file → dữ liệu khách hàng</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ColumnSelect
              field="phone"
              label="Số điện thoại (bắt buộc)"
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
            <p className="text-sm text-muted-foreground">
              Các cột còn lại chưa map sẽ được lưu vào trường phụ (extra_fields) của khách hàng.
            </p>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Đang import..." : "Import"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
