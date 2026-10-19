"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Search, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { isValidVietnamesePhone } from "@/lib/phone";
import { useTranslation } from "@/components/i18n-provider";
import { PageHeader } from "@/components/page-header";
import { ZnsPreviewFrame } from "@/components/zns-preview-frame";
import { apiFetch, apiSend } from "@/lib/api-client";
import { useEnabledTemplates } from "@/lib/queries";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useTemplatePreview } from "@/hooks/use-template-preview";
import { useSendTestStore, type DirectoryCustomer, type RecipientMode } from "@/stores/send-test-store";

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
  const { data: templates = [], isPending: templatesPending } = useEnabledTemplates();
  const {
    templateId,
    paramValues,
    recipientMode,
    selectedCustomer,
    manualName,
    manualPhone,
    set,
    setParam,
  } = useSendTestStore();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SendResult[]>([]);
  const debouncedSearch = useDebouncedValue(search.trim(), 250);

  const { data: searchResults = [], isFetching: searching } = useQuery({
    queryKey: ["customer-search", debouncedSearch],
    queryFn: () => {
      const params = new URLSearchParams({ pageSize: "20", search: debouncedSearch });
      return apiFetch<{ data: DirectoryCustomer[] }>(`/api/customers?${params.toString()}`).then((j) => j.data ?? []);
    },
    enabled: debouncedSearch.length > 0,
    meta: { errorMessage: "Không tải được danh sách khách hàng" },
  });

  const selectedTemplate = templates.find((tpl) => tpl.id === templateId);
  const params = selectedTemplate?.template_data_schema ?? [];
  const templateItems = Object.fromEntries(templates.map((tpl) => [tpl.id, tpl.template_name]));

  const recipientName = recipientMode === "directory" ? selectedCustomer?.name ?? null : manualName.trim() || null;
  const recipientPhone =
    recipientMode === "directory" ? selectedCustomer?.phone ?? null : manualPhone.trim() || null;

  const preview = useTemplatePreview(selectedTemplate?.template_id, !!selectedTemplate?.preview_url, paramValues);

  const sendMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiSend<{ result: SendResult }>("/api/zns/test-send", "POST", body),
    onMutate: () => setResults([]),
    onSuccess: ({ result }) => {
      setResults([result]);
      if (result.success) toast.success(t("success"));
      else toast.error(`${t("failed")}: ${result.errorMessage ?? ""}`);
    },
    meta: { errorMessage: "Gửi thất bại" },
  });

  function handleSend() {
    if (!templateId) return toast.error("Chọn template");

    const missingRequired = params.filter((p) => p.require && !paramValues[p.name]);
    if (missingRequired.length > 0) {
      return toast.error(`Chưa điền tham số bắt buộc: ${missingRequired.map((p) => p.name).join(", ")}`);
    }

    let recipientPayload: Record<string, unknown>;
    if (recipientMode === "directory") {
      if (!selectedCustomer) return toast.error("Chọn 1 khách hàng từ danh bạ");
      recipientPayload = { customer_id: selectedCustomer.id };
    } else {
      const phone = manualPhone.trim();
      if (!phone) return toast.error("Nhập số điện thoại");
      if (!isValidVietnamesePhone(phone)) return toast.error(t("manualPhoneInvalid"));
      recipientPayload = { manual: { name: manualName.trim() || undefined, phone } };
    }

    sendMutation.mutate({ template_id: templateId, template_data: paramValues, ...recipientPayload });
  }

  const sending = sendMutation.isPending;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="space-y-4">
        <PageHeader title={t("title")} description={t("subtitle")} />

        <Card>
          <CardHeader>
            <CardTitle>{t("step1")}</CardTitle>
          </CardHeader>
          <CardContent>
            {templatesPending ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Select
                value={templateId}
                onValueChange={(v) => set({ templateId: v ?? "", paramValues: {} })}
                items={templateItems}
              >
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
            )}

            {params.length > 0 && (
              <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">
                <p className="text-sm font-medium sm:col-span-2">{t("templateParams")}</p>
                {params.map((p) => (
                  <div key={p.name} className="space-y-1">
                    <Label>
                      {p.name} {p.require && <span className="text-destructive">*</span>}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {p.type}
                        {(p.minLength || p.maxLength) && ` · ${p.minLength ?? 0}–${p.maxLength ?? "?"}`}
                      </span>
                    </Label>
                    <Input
                      value={paramValues[p.name] ?? ""}
                      maxLength={p.maxLength}
                      onChange={(e) => setParam(p.name, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("step2")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs
              value={recipientMode}
              onValueChange={(v) => set({ recipientMode: (v as RecipientMode) ?? "directory" })}
            >
              <TabsList>
                <TabsTrigger value="directory">{t("modeDirectory")}</TabsTrigger>
                <TabsTrigger value="manual">{t("modeManual")}</TabsTrigger>
              </TabsList>

              <TabsContent value="directory" className="space-y-3 pt-3">
                {selectedCustomer && (
                  <Badge variant="secondary" className="gap-1 py-1 pr-1 pl-2 text-sm">
                    {selectedCustomer.name ?? selectedCustomer.phone ?? selectedCustomer.zalo_uid}
                    <button
                      type="button"
                      onClick={() => set({ selectedCustomer: null })}
                      className="ml-1 rounded-full p-0.5 hover:bg-black/10"
                      aria-label={`${t("clear")} ${selectedCustomer.name ?? ""}`}
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                )}

                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder={t("searchPlaceholder")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8"
                  />
                  {searching && (
                    <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>

                {debouncedSearch && searchResults.length > 0 && (
                  <div className="max-h-64 overflow-y-auto rounded-md border">
                    <Table>
                      <TableBody>
                        {searchResults.map((c) => {
                          const already = selectedCustomer?.id === c.id;
                          return (
                            <TableRow
                              key={c.id}
                              className={already ? "opacity-50" : "cursor-pointer"}
                              onClick={() => set({ selectedCustomer: c })}
                            >
                              <TableCell>{c.name ?? "—"}</TableCell>
                              <TableCell>{c.phone ?? "—"}</TableCell>
                              <TableCell className="text-muted-foreground">{c.zalo_uid ?? "—"}</TableCell>
                              <TableCell className="text-right text-xs text-muted-foreground">
                                {already ? t("already") : t("choose")}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="manual" className="grid gap-3 pt-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>{t("manualNameLabel")}</Label>
                  <Input value={manualName} onChange={(e) => set({ manualName: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>{t("manualPhoneLabel")}</Label>
                  <Input value={manualPhone} onChange={(e) => set({ manualPhone: e.target.value })} />
                  <p className="text-xs text-muted-foreground">{t("manualPhoneHint")}</p>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Button size="lg" onClick={handleSend} disabled={sending}>
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
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
                  {!recipientName && !recipientPhone ? (
                    <span className="text-muted-foreground">{t("previewNoRecipient")}</span>
                  ) : (
                    <p>
                      {t("previewSendTo")}: {recipientName ?? "—"}
                      {recipientPhone && <span className="text-muted-foreground"> · {recipientPhone}</span>}
                    </p>
                  )}
                </div>

                {selectedTemplate.preview_url ? (
                  <div className="relative min-h-[200px] overflow-hidden rounded-lg border">
                    {preview.isFetching && (
                      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm">
                        <Loader2 className="size-3 animate-spin" />
                        {t("previewLoading")}
                      </div>
                    )}
                    {preview.data ? (
                      <ZnsPreviewFrame html={preview.data} title={t("previewTitle")} />
                    ) : (
                      preview.isPending && <Skeleton className="h-[400px] w-full rounded-none" />
                    )}
                  </div>
                ) : params.length === 0 ? (
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
