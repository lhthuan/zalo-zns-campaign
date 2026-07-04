"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CampaignRecipientsGrid } from "@/components/campaign-recipients-grid";
import { useTranslation } from "@/components/i18n-provider";

interface ReportSummary {
  sentUid: number;
  sentPhone: number;
  failed: number;
  pending: number;
}

export default function CampaignReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useTranslation("campaignReport");
  const [summary, setSummary] = useState<ReportSummary | null>(null);

  useEffect(() => {
    // Only the summary counts are fetched here now — the detail table below
    // is a self-contained, paginated grid component.
    fetch(`/api/campaigns/${id}/report?page=1`)
      .then((res) => res.json())
      .then((json) => setSummary(json.summary))
      .catch(() => toast.error(t("loadFailed")));
  }, [id, t]);

  const total = summary ? summary.sentUid + summary.sentPhone + summary.failed + summary.pending : 0;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" render={<Link href={`/campaigns/${id}`} />}>
        ← {t("backToCampaign")}
      </Button>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">{t("total")}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{total}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">{t("successUidPhone")}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold text-emerald-600">
              {summary.sentUid + summary.sentPhone}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({summary.sentUid} UID · {summary.sentPhone} SĐT)
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">{t("failed")}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold text-destructive">{summary.failed}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">{t("remaining")}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{summary.pending}</CardContent>
          </Card>
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
