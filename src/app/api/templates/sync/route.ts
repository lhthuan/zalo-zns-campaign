import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { listTemplates, getTemplateDetail } from "@/lib/zalo/api";

export async function POST() {
  try {
    await requireUser();

    const list = await listTemplates();
    const enabled = list.filter((t) => t.status === "ENABLE");

    const supabase = createAdminClient();
    const now = new Date().toISOString();

    const results = await Promise.allSettled(
      enabled.map(async (item) => {
        const detail = await getTemplateDetail(item.templateId);
        const { error } = await supabase.from("zalo_templates").upsert(
          {
            template_id: detail.templateId,
            template_name: detail.templateName,
            status: detail.status,
            tag: detail.tag,
            template_data_schema: detail.listParams,
            last_synced_at: now,
          },
          { onConflict: "template_id" }
        );
        if (error) throw error;
      })
    );

    // Non-enabled templates: keep status in sync for anything we already cached
    const nonEnabled = list.filter((t) => t.status !== "ENABLE");
    for (const item of nonEnabled) {
      await supabase
        .from("zalo_templates")
        .update({ status: item.status, last_synced_at: now })
        .eq("template_id", item.templateId);
    }

    const failed = results.filter((r) => r.status === "rejected");
    return NextResponse.json({
      synced: enabled.length - failed.length,
      failed: failed.length,
      total: list.length,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
