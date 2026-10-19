"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Plus } from "lucide-react";
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
import { useTranslation } from "@/components/i18n-provider";
import { ZnsPreviewFrame } from "@/components/zns-preview-frame";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-client";
import {
  customerCountQuery,
  customerGroupsQuery,
  importBatchesQuery,
  queryKeys,
  useEnabledTemplates,
  type ZaloTemplate,
} from "@/lib/queries";
import { useTemplatePreview } from "@/hooks/use-template-preview";

const NONE = "__none__";

interface CopySourceCampaign {
  name: string;
  template_id: string;
  creation_mode: string;
  customer_group_id: string | null;
  customer_batch: string | null;
  fixed_template_data: Record<string, string> | null;
}

interface CreateCampaignResult {
  id: string;
  rejectedRows?: number;
  duplicateRows?: number;
}

interface ColumnSelectProps {
  label: string;
  value: string;
  headers: string[];
  chooseLabel: string;
  onChange: (value: string) => void;
}

function ColumnSelect({ label, value, headers, chooseLabel, onChange }: ColumnSelectProps) {
  const items = Object.fromEntries([[NONE, chooseLabel], ...headers.map((h) => [h, h])]);
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v ?? NONE)} items={items}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{chooseLabel}</SelectItem>
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
  t,
}: {
  template: ZaloTemplate;
  recipientCount: number | null;
  t: ReturnType<typeof useTranslation<"campaignNew">>["t"];
}) {
  const params = template.template_data_schema ?? [];
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>
            {t("previewTitle")} {template.template_name}
          </CardTitle>
          <Badge>{template.tag ?? "—"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {params.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noParams")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colParam")}</TableHead>
                <TableHead>{t("colType")}</TableHead>
                <TableHead>{t("colRequired")}</TableHead>
                <TableHead>{t("colLength")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {params.map((p) => (
                <TableRow key={p.name}>
                  <TableCell className="font-mono text-xs">{p.name}</TableCell>
                  <TableCell>{p.type}</TableCell>
                  <TableCell>{p.require ? t("yes") : t("no")}</TableCell>
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
                {t("priceSdt")}: <strong className="text-foreground">{formatVnd(template.price_sdt)}</strong>{" "}
                {t("perMessage")}
                {recipientCount != null && recipientCount > 0 && (
                  <>
                    {" "}
                    × {recipientCount.toLocaleString("vi-VN")} {t("recipientsUnit")} ≈{" "}
                    <strong className="text-foreground">
                      {formatVnd(template.price_sdt * recipientCount)}
                    </strong>
                  </>
                )}
              </p>
            )}
            {template.price_uid != null && (
              <p>
                {t("priceUid")}: <strong className="text-foreground">{formatVnd(template.price_uid)}</strong>{" "}
                {t("perMessage")}
                {recipientCount != null && recipientCount > 0 && (
                  <>
                    {" "}
                    × {recipientCount.toLocaleString("vi-VN")} {t("recipientsUnit")} ≈{" "}
                    <strong className="text-foreground">
                      {formatVnd(template.price_uid * recipientCount)}
                    </strong>
                  </>
                )}
              </p>
            )}
            <p className="text-xs">{t("approxCost")}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function NewCampaignPage() {
  const { t } = useTranslation("campaignNew");
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" aria-label={t("loading")} />}>
      <NewCampaignForm />
    </Suspense>
  );
}

function NewCampaignForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation("campaignNew");
  const searchParams = useSearchParams();
  const copyFromId = searchParams.get("copyFrom");

  const { data: templates = [] } = useEnabledTemplates();
  const { data: batches = [] } = useQuery(importBatchesQuery);
  const { data: groups = [] } = useQuery(customerGroupsQuery);
  const { data: allCustomerCount = 0 } = useQuery(customerCountQuery);

  const [templateId, setTemplateId] = useState<string>("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"broadcast" | "custom">("broadcast");

  // Broadcast mode
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

  // Prefill from ?copyFrom= once; the campaign detail is usually already
  // cached from the page the user came from.
  useEffect(() => {
    if (!copyFromId) return;
    queryClient
      .fetchQuery({
        queryKey: queryKeys.campaign(copyFromId),
        queryFn: () => apiFetch<{ data: CopySourceCampaign }>(`/api/campaigns/${copyFromId}`).then((j) => j.data),
      })
      .then((c) => {
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
  }, [copyFromId, queryClient]);

  const selectedTemplate = templates.find((tpl) => tpl.id === templateId);
  const params = selectedTemplate?.template_data_schema ?? [];
  const broadcastCount =
    broadcastSource === "all"
      ? allCustomerCount
      : broadcastSource === "batch"
        ? batches.find((b) => b.import_batch === customerBatch)?.customer_count ?? 0
        : groups.find((g) => g.group_id === customerGroupId)?.customer_count ?? 0;
  const recipientCount = mode === "broadcast" ? broadcastCount : rowCount;

  const templateItems = Object.fromEntries(templates.map((tpl) => [tpl.id, tpl.template_name]));
  const batchItems = Object.fromEntries(
    batches.map((b) => [b.import_batch, `${b.import_batch} (${b.customer_count})`])
  );
  const groupItems = Object.fromEntries(
    groups.map((g) => [g.group_id, `${g.name} (${g.customer_count})`])
  );

  const preview = useTemplatePreview(selectedTemplate?.template_id, !!selectedTemplate?.preview_url, fixedParams);

  const createMutation = useMutation({
    mutationFn: (formData: FormData) =>
      apiFetch<CreateCampaignResult>("/api/campaigns", { method: "POST", body: formData }),
    onSuccess: (json) => {
      if (json.rejectedRows && json.rejectedRows > 0) {
        toast.warning(`Đã loại ${json.rejectedRows} dòng lỗi (thiếu SĐT/UID hoặc SĐT không hợp lệ)`);
      }
      if (json.duplicateRows && json.duplicateRows > 0) {
        toast.warning(`Đã gộp ${json.duplicateRows} dòng trùng SĐT/Zalo UID (chỉ giữ dòng cuối cùng)`);
      }
      toast.success("Đã tạo chiến dịch nháp");
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns });
      // Custom-mode imports upsert customers into the directory too.
      queryClient.invalidateQueries({ queryKey: queryKeys.customers });
      router.push(`/campaigns/${json.id}`);
    },
    meta: { errorMessage: "Tạo chiến dịch thất bại" },
  });
  const submitting = createMutation.isPending;

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

  function handleSubmit() {
    if (!name.trim()) return toast.error("Nhập tên chiến dịch");
    if (!templateId) return toast.error("Chọn template");

    const formData = new FormData();
    formData.append("name", name.trim());
    formData.append("template_id", templateId);
    formData.append("mode", mode);

    if (mode === "broadcast") {
      const missingRequired = params.filter((p) => p.require && !fixedParams[p.name]?.trim());
      if (missingRequired.length > 0) {
        return toast.error(`Chưa điền tham số bắt buộc: ${missingRequired.map((p) => p.name).join(", ")}`);
      }
      if (broadcastSource === "group") {
        if (!customerGroupId) {
          return toast.error("Chọn nhóm khách hàng");
        }
        formData.append("customer_group_id", customerGroupId);
      } else if (broadcastSource === "batch") {
        formData.append("customer_batch", customerBatch);
      }
      formData.append("fixed_template_data", JSON.stringify(fixedParams));
    } else {
      if (!file) {
        return toast.error("Chọn file danh sách người nhận");
      }
      if (phoneColumn === NONE && uidColumn === NONE) {
        return toast.error("Phải chọn cột Số điện thoại hoặc Zalo UID");
      }
      const missingRequired = params.filter((p) => p.require && !paramMapping[p.name]);
      if (missingRequired.length > 0) {
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

    createMutation.mutate(formData);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="min-w-0 space-y-4">
      <PageHeader title={t("title")} />

      <Card>
        <CardHeader>
          <CardTitle>{t("step1Title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>{t("campaignName")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("template")}</Label>
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
          </div>
        </CardContent>
      </Card>

      {selectedTemplate && (
        <TemplatePreview template={selectedTemplate} recipientCount={recipientCount} t={t} />
      )}

      {selectedTemplate && (
        <Card>
          <CardHeader>
            <CardTitle>{t("step2Title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={mode} onValueChange={(v) => setMode((v as "broadcast" | "custom") ?? "broadcast")}>
              <TabsList>
                <TabsTrigger value="broadcast">{t("modeBroadcast")}</TabsTrigger>
                <TabsTrigger value="custom">{t("modeCustom")}</TabsTrigger>
              </TabsList>

              <TabsContent value="broadcast" className="space-y-4 pt-4">
                <p className="text-sm text-muted-foreground">{t("broadcastHint")}</p>
                <div className="space-y-1">
                  <Label>{t("customerListLabel")}</Label>
                  <Tabs
                    value={broadcastSource}
                    onValueChange={(v) =>
                      setBroadcastSource((v as "all" | "batch" | "group") ?? "all")
                    }
                  >
                    <TabsList>
                      <TabsTrigger value="all">{t("sourceAll")}</TabsTrigger>
                      <TabsTrigger value="batch">{t("sourceBatch")}</TabsTrigger>
                      <TabsTrigger value="group">{t("sourceGroup")}</TabsTrigger>
                    </TabsList>

                    <TabsContent value="all" className="pt-3">
                      <p className="text-sm text-muted-foreground">
                        {t("sendToAll")} {allCustomerCount.toLocaleString("vi-VN")} {t("customersExisting")}
                      </p>
                    </TabsContent>

                    <TabsContent value="batch" className="space-y-1 pt-3">
                      <Select
                        value={customerBatch}
                        onValueChange={(v) => setCustomerBatch(v ?? "")}
                        items={batchItems}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t("chooseBatch")} />
                        </SelectTrigger>
                        <SelectContent>
                          {batches.map((b) => (
                            <SelectItem key={b.import_batch} value={b.import_batch}>
                              {b.import_batch} ({b.customer_count})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">{t("batchHint")}</p>
                    </TabsContent>

                    <TabsContent value="group" className="space-y-1 pt-3">
                      <Select
                        value={customerGroupId}
                        onValueChange={(v) => setCustomerGroupId(v ?? "")}
                        items={groupItems}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t("chooseGroup")} />
                        </SelectTrigger>
                        <SelectContent>
                          {groups.map((g) => (
                            <SelectItem key={g.group_id} value={g.group_id}>
                              {g.name} ({g.customer_count})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">{t("groupHint")}</p>
                    </TabsContent>
                  </Tabs>
                </div>

                {params.length > 0 && (
                  <div className="space-y-3 border-t pt-3">
                    <p className="text-sm font-medium">{t("templateParamsAll")}</p>
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
                <p className="text-sm text-muted-foreground">{t("customHint")}</p>
                <Button variant="outline" onClick={downloadDataTemplate}>
                  <Download className="size-4" />
                  {t("downloadSample")}
                </Button>
                <div className="space-y-1">
                  <Label>{t("recipientFile")}</Label>
                  <Input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} />
                </div>

                {headers.length > 0 && (
                  <div className="space-y-3 border-t pt-3">
                    <p className="text-sm font-medium">
                      {t("mapColumns")} ({rowCount} {t("rows")})
                    </p>
                    <ColumnSelect
                      label={t("colPhone")}
                      value={phoneColumn}
                      headers={headers}
                      chooseLabel={t("chooseColumn")}
                      onChange={setPhoneColumn}
                    />
                    <ColumnSelect
                      label={t("colName")}
                      value={nameColumn}
                      headers={headers}
                      chooseLabel={t("chooseColumn")}
                      onChange={setNameColumn}
                    />
                    <ColumnSelect
                      label={t("colZaloUid")}
                      value={uidColumn}
                      headers={headers}
                      chooseLabel={t("chooseColumn")}
                      onChange={setUidColumn}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("mappingHint")} &quot;{name.trim() || "..."}&quot;.
                    </p>

                    {params.length > 0 && (
                      <div className="space-y-3 border-t pt-3">
                        <p className="text-sm font-medium">{t("templateParamsEach")}</p>
                        {params.map((p) => (
                          <ColumnSelect
                            key={p.name}
                            label={`${p.name}${p.require ? " *" : ""} — ${p.type}${
                              p.minLength || p.maxLength ? ` (${p.minLength ?? 0}–${p.maxLength ?? "?"})` : ""
                            }`}
                            value={paramMapping[p.name] ?? NONE}
                            headers={headers}
                            chooseLabel={t("chooseColumn")}
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

            <Button size="lg" className="mt-4" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {submitting ? t("creating") : t("createDraft")}
            </Button>
          </CardContent>
        </Card>
      )}
      </div>

      <div className="lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("livePreviewTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedTemplate ? (
              <p className="text-sm text-muted-foreground">{t("livePreviewNoTemplate")}</p>
            ) : !selectedTemplate.preview_url ? (
              <p className="text-sm text-muted-foreground">{t("livePreviewNoUrl")}</p>
            ) : (
              <div className="relative min-h-[200px] overflow-hidden rounded-lg border">
                {preview.isFetching && (
                  <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm">
                    <Loader2 className="size-3 animate-spin" />
                    {t("livePreviewLoading")}
                  </div>
                )}
                {preview.data ? (
                  <ZnsPreviewFrame html={preview.data} title={t("livePreviewTitle")} />
                ) : (
                  preview.isPending && <Skeleton className="h-[400px] w-full rounded-none" />
                )}
              </div>
            )}
            {mode === "custom" && selectedTemplate?.preview_url && (
              <p className="mt-2 text-xs text-muted-foreground">{t("livePreviewCustomModeHint")}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
