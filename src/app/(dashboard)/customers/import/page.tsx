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
import { useTranslation } from "@/components/i18n-provider";

const NONE = "__none__";

interface ColumnSelectProps {
  field: string;
  label: string;
  value: string;
  headers: string[];
  noMappingLabel: string;
  onChange: (value: string) => void;
}

function ColumnSelect({ field, label, value, headers, noMappingLabel, onChange }: ColumnSelectProps) {
  const items = Object.fromEntries([[NONE, noMappingLabel], ...headers.map((h) => [h, h])]);
  return (
    <div className="space-y-1">
      <Label htmlFor={field}>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v ?? NONE)} items={items}>
        <SelectTrigger id={field} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{noMappingLabel}</SelectItem>
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
  const { t } = useTranslation("customersImport");
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
    if (json.duplicate > 0) {
      toast.warning(`Đã gộp ${json.duplicate} dòng trùng SĐT/Zalo UID (chỉ giữ dòng cuối cùng)`);
    }
    router.push("/customers");
  }

  const validCount = preview?.filter((r) => r.valid).length ?? 0;
  const invalidRows = preview?.filter((r) => !r.valid) ?? [];

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t("step0Title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={downloadSampleTemplate}>
            {t("downloadSample")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("step1Title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} />
        </CardContent>
      </Card>

      {headers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("step2Title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>{t("batchNameLabel")}</Label>
              <Input value={batchName} onChange={(e) => setBatchName(e.target.value)} />
            </div>
            <ColumnSelect
              field="phone"
              label={t("colPhone")}
              value={mapping.phone}
              headers={headers}
              noMappingLabel={t("noMapping")}
              onChange={(v) => setMappingField("phone", v)}
            />
            <ColumnSelect
              field="name"
              label={t("colName")}
              value={mapping.name}
              headers={headers}
              noMappingLabel={t("noMapping")}
              onChange={(v) => setMappingField("name", v)}
            />
            <ColumnSelect
              field="customer_code"
              label={t("colCode")}
              value={mapping.customer_code}
              headers={headers}
              noMappingLabel={t("noMapping")}
              onChange={(v) => setMappingField("customer_code", v)}
            />
            <ColumnSelect
              field="zalo_uid"
              label={t("colZaloUid")}
              value={mapping.zalo_uid}
              headers={headers}
              noMappingLabel={t("noMapping")}
              onChange={(v) => setMappingField("zalo_uid", v)}
            />
            <ColumnSelect
              field="group"
              label={t("colGroup")}
              value={mapping.group}
              headers={headers}
              noMappingLabel={t("noMapping")}
              onChange={(v) => setMappingField("group", v)}
            />
            <p className="text-sm text-muted-foreground">{t("mappingHint")}</p>
            <Button onClick={handlePreview}>{t("preview")}</Button>
          </CardContent>
        </Card>
      )}

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>
              {t("step3Title")} — {validCount} {t("validRows")}, {invalidRows.length} {t("invalidRows")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {invalidRows.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-destructive">{t("invalidRowsWarning")}</p>
                <div className="max-h-64 overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("colRow")}</TableHead>
                        <TableHead>{t("colName")}</TableHead>
                        <TableHead>{t("colPhone")}</TableHead>
                        <TableHead>{t("colZaloUid")}</TableHead>
                        <TableHead>{t("colError")}</TableHead>
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
                    <TableHead>{t("colName")}</TableHead>
                    <TableHead>{t("colPhone")}</TableHead>
                    <TableHead>{t("colZaloUid")}</TableHead>
                    <TableHead>{t("colGroup")}</TableHead>
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
              {submitting ? t("importing") : `${t("confirmImport")} ${validCount} ${t("validRows")}`}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
