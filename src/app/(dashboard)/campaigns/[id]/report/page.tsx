"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CampaignRecipientsGrid } from "@/components/campaign-recipients-grid";
import { useTranslation } from "@/components/i18n-provider";
import { PageHeader } from "@/components/page-header";
import { apiFetch } from "@/lib/api-client";
import { queryKeys } from "@/lib/queries";

interface ReportSummary {
  sentUid: number;
  sentPhone: number;
  failed: number;
  pending: number;
}

function SummaryCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent>
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{children}</div>
      </CardContent>
    </Card>
  );
}

export default function CampaignReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useTranslation("campaignReport");

  // Only the summary counts are fetched here — the detail table below is a
  // self-contained, paginated grid component.
  const { data: summary } = useQuery({
    queryKey: [...queryKeys.campaign(id), "report-summary"],
    queryFn: () => apiFetch<{ summary: ReportSummary }>(`/api/campaigns/${id}/report?page=1`).then((j) => j.summary),
    meta: { errorMessage: t("loadFailed") },
  });

  const total = summary ? summary.sentUid + summary.sentPhone + summary.failed + summary.pending : 0;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/campaigns/${id}`} />}>
        <ArrowLeft className="size-4" />
        {t("backToCampaign")}
      </Button>

      <PageHeader title={t("title")} />

      {summary ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <SummaryCard label={t("total")}>{total}</SummaryCard>
          <SummaryCard label={t("successUidPhone")}>
            <span className="text-emerald-600">{summary.sentUid + summary.sentPhone}</span>
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({summary.sentUid} UID · {summary.sentPhone} SĐT)
            </span>
          </SummaryCard>
          <SummaryCard label={t("failed")}>
            <span className="text-destructive">{summary.failed}</span>
          </SummaryCard>
          <SummaryCard label={t("remaining")}>{summary.pending}</SummaryCard>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("detailTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <CampaignRecipientsGrid campaignId={id} />
        </CardContent>
      </Card>
    </div>
  );
}
