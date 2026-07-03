"use client";

import { useEffect, useState } from "react";
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

export default function NewCampaignPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<ZaloTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [phoneColumn, setPhoneColumn] = useState(NONE);
  const [uidColumn, setUidColumn] = useState(NONE);
  const [paramMapping, setParamMapping] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/templates")
      .then((res) => res.json())
      .then((json) => setTemplates((json.data ?? []).filter((t: ZaloTemplate) => t.status === "ENABLE")))
      .catch(() => toast.error("Không tải được danh sách template"));
  }, []);

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const params = selectedTemplate?.template_data_schema ?? [];

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
    if (!file) return toast.error("Chọn file danh sách người nhận");
    if (phoneColumn === NONE) return toast.error("Phải chọn cột Số điện thoại");

    const missingRequired = params.filter((p) => p.require && !paramMapping[p.name]);
    if (missingRequired.length > 0) {
      return toast.error(`Chưa map tham số bắt buộc: ${missingRequired.map((p) => p.name).join(", ")}`);
    }

    setSubmitting(true);
    const formData = new FormData();
    formData.append("name", name.trim());
    formData.append("template_id", templateId);
    formData.append("file", file);
    formData.append(
      "mapping",
      JSON.stringify({
        phone: phoneColumn,
        zalo_uid: uidColumn === NONE ? undefined : uidColumn,
        templateParams: paramMapping,
      })
    );

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
    <div className="max-w-2xl space-y-4">
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
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Danh sách người nhận (.xlsx/.csv)</CardTitle>
        </CardHeader>
        <CardContent>
          <Input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} />
        </CardContent>
      </Card>

      {headers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>3. Map cột file</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Số điện thoại (bắt buộc)</Label>
              <Select value={phoneColumn} onValueChange={(v) => setPhoneColumn(v ?? NONE)}>
                <SelectTrigger>
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
            <div className="space-y-1">
              <Label>Zalo UID (nếu file có sẵn)</Label>
              <Select value={uidColumn} onValueChange={(v) => setUidColumn(v ?? NONE)}>
                <SelectTrigger>
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
              <p className="text-xs text-muted-foreground">
                Người nhận sẽ dùng UID nếu có (từ file này hoặc đã lưu trong hồ sơ khách hàng), ngược
                lại dùng số điện thoại.
              </p>
            </div>

            {params.length > 0 && (
              <div className="space-y-3 border-t pt-3">
                <p className="text-sm font-medium">Tham số template</p>
                {params.map((p) => (
                  <div key={p.name} className="space-y-1">
                    <Label>
                      {p.name} {p.require && <span className="text-destructive">*</span>}
                    </Label>
                    <Select
                      value={paramMapping[p.name] ?? NONE}
                      onValueChange={(v) =>
                        setParamMapping((m) => ({ ...m, [p.name]: v && v !== NONE ? v : "" }))
                      }
                    >
                      <SelectTrigger>
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
                ))}
              </div>
            )}

            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Đang tạo..." : "Tạo chiến dịch (nháp)"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
