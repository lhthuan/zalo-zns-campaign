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
import { useTranslation } from "@/components/i18n-provider";

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
  template_data_schema: ZaloTemplateParam[] | null;
}

interface Customer {
  id: string;
  name: string | null;
  phone: string | null;
  zalo_uid: string | null;
}

interface SendResult {
  customerId: string;
  name: string | null;
  phone: string | null;
  sendMode: "uid" | "phone";
  success: boolean;
  zaloMsgId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export default function SendTestPage() {
  const { t } = useTranslation("sendTest");
  const [templates, setTemplates] = useState<ZaloTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer[]>([]);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SendResult[]>([]);

  useEffect(() => {
    fetch("/api/templates")
      .then((res) => res.json())
      .then((json) => setTemplates((json.data ?? []).filter((tpl: ZaloTemplate) => tpl.status === "ENABLE")))
      .catch(() => toast.error("Không tải được danh sách template"));
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!search.trim()) {
        setSearchResults([]);
        return;
      }
      const params = new URLSearchParams({ pageSize: "20", search });
      fetch(`/api/customers?${params.toString()}`)
        .then((res) => res.json())
        .then((json) => setSearchResults(json.data ?? []))
        .catch(() => toast.error("Không tải được danh sách khách hàng"));
    }, 250);
    return () => clearTimeout(timeout);
  }, [search]);

  const selectedTemplate = templates.find((tpl) => tpl.id === templateId);
  const params = selectedTemplate?.template_data_schema ?? [];
  const templateItems = Object.fromEntries(templates.map((tpl) => [tpl.id, tpl.template_name]));
  const selectedIds = new Set(selected.map((c) => c.id));

  function addCustomer(c: Customer) {
    if (selectedIds.has(c.id)) return;
    setSelected((prev) => [...prev, c]);
  }

  function removeCustomer(id: string) {
    setSelected((prev) => prev.filter((c) => c.id !== id));
  }

  async function handleSend() {
    if (!templateId) return toast.error("Chọn template");
    if (selected.length === 0) return toast.error("Chọn ít nhất 1 khách hàng");

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
        customer_ids: selected.map((c) => c.id),
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="max-w-3xl space-y-4">
        <div>
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("step1")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={templateId} onValueChange={(v) => setTemplateId(v ?? "")} items={templateItems}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("chooseTemplate")} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((tpl) => (
                  <SelectItem key={tpl.id} value={tpl.id}>
                    {tpl.template_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {params.length > 0 && (
              <div className="mt-4 space-y-3 border-t pt-3">
                <p className="text-sm font-medium">{t("templateParams")}</p>
                {params.map((p) => (
                  <div key={p.name} className="space-y-1">
                    <Label>
                      {p.name} {p.require && <span className="text-destructive">*</span>}
                      <span className="ml-2 font-normal text-xs text-muted-foreground">
                        {p.type}
                        {(p.minLength || p.maxLength) && ` · ${p.minLength ?? 0}–${p.maxLength ?? "?"}`}
                      </span>
                    </Label>
                    <Input
                      value={paramValues[p.name] ?? ""}
                      maxLength={p.maxLength}
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
            <CardTitle>
              {t("step2")} ({selected.length} {t("selected")})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selected.map((c) => (
                  <Badge key={c.id} variant="secondary" className="gap-1 py-1 pr-1 pl-2 text-sm">
                    {c.name ?? c.phone ?? c.zalo_uid}
                    <button
                      type="button"
                      onClick={() => removeCustomer(c.id)}
                      className="ml-1 rounded-full px-1 hover:bg-black/10"
                      aria-label={`${t("deselect")} ${c.name ?? c.phone ?? ""}`}
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            <Input
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            {searchResults.length > 0 && (
              <div className="max-h-64 overflow-y-auto rounded-md border">
                <Table>
                  <TableBody>
                    {searchResults.map((c) => {
                      const already = selectedIds.has(c.id);
                      return (
                        <TableRow
                          key={c.id}
                          className={already ? "opacity-50" : "cursor-pointer"}
                          onClick={() => addCustomer(c)}
                        >
                          <TableCell>{c.name ?? "—"}</TableCell>
                          <TableCell>{c.phone ?? "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{c.zalo_uid ?? "—"}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {already ? t("already") : t("add")}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Button onClick={handleSend} disabled={sending}>
          {sending ? t("sending") : t("send")}
        </Button>

        {results.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t("resultTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("colName")}</TableHead>
                    <TableHead>{t("colPhone")}</TableHead>
                    <TableHead>{t("colMode")}</TableHead>
                    <TableHead>{t("colResult")}</TableHead>
                    <TableHead>{t("colDetail")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r) => (
                    <TableRow key={r.customerId}>
                      <TableCell>{r.name ?? "—"}</TableCell>
                      <TableCell>{r.phone ?? "—"}</TableCell>
                      <TableCell>{r.sendMode}</TableCell>
                      <TableCell>
                        <Badge variant={r.success ? "success" : "destructive"}>
                          {r.success ? t("success") : t("failed")}
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

      <div className="lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("previewTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!selectedTemplate ? (
              <p className="text-muted-foreground">{t("previewNoTemplate")}</p>
            ) : (
              <>
                <p className="font-medium">{selectedTemplate.template_name}</p>

                <div className="rounded-md border bg-muted/30 p-2 text-xs">
                  {selected.length === 0 ? (
                    <span className="text-muted-foreground">{t("previewNoCustomer")}</span>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-muted-foreground">
                        {t("previewSendTo")} {selected.length} {t("previewCustomersUnit")}
                      </p>
                      {selected.slice(0, 5).map((c) => (
                        <p key={c.id}>
                          {c.name ?? "—"}
                          {c.phone && <span className="text-muted-foreground"> · {c.phone}</span>}
                        </p>
                      ))}
                      {selected.length > 5 && (
                        <p className="text-muted-foreground">… +{selected.length - 5}</p>
                      )}
                    </div>
                  )}
                </div>

                {params.length === 0 ? (
                  <p className="text-muted-foreground">{t("previewNoParams")}</p>
                ) : (
                  <div className="space-y-1.5">
                    {params.map((p) => {
                      const value = paramValues[p.name];
                      return (
                        <div key={p.name} className="flex items-baseline justify-between gap-2 border-b pb-1">
                          <span className="shrink-0 font-mono text-xs text-muted-foreground">{p.name}</span>
                          <span
                            className={
                              value ? "text-right font-medium break-words" : "text-right text-muted-foreground italic"
                            }
                          >
                            {value || `<${p.name}>`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
