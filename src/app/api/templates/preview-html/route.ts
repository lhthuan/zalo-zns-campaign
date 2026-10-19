import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getTemplateDetail } from "@/lib/zalo/api";

// Zalo's preview page is cross-origin, so we can't script real values into it
// via an iframe (no DOM access, no postMessage support on their end). Instead
// we fetch the raw HTML server-side, substitute each known placeholder with
// the value the user actually entered (HTML-escaped), and hand the resulting
// markup back for the client to render via <iframe srcDoc>.

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fetchPreviewPage(url: string): Promise<string | null> {
  const res = await fetch(url, { cache: "no-store" });
  return res.ok ? res.text() : null;
}

function isEmptyPreviewShell(html: string): boolean {
  return /<textarea[^>]*id="preview-content-source"[^>]*>\s*<\/textarea>/i.test(html);
}

export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const body = await request.json();
    const templateId = typeof body.templateId === "string" ? body.templateId : "";
    const params = (body.params ?? {}) as Record<string, string>;
    if (!templateId) {
      return NextResponse.json({ error: "Thiếu templateId" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: template, error } = await supabase
      .from("zalo_templates")
      .select("preview_url")
      .eq("template_id", templateId)
      .maybeSingle();
    if (error) throw error;
    if (!template?.preview_url) {
      return NextResponse.json({ error: "Template chưa có link xem trước" }, { status: 404 });
    }

    let previewUrl = template.preview_url;
    let html = await fetchPreviewPage(previewUrl);

    // Since Zalo's 2026-10-15 preview rewrite, the page is a shell whose
    // content lives in a server-filled <textarea>, and Zalo intermittently
    // serves it empty (Zalo's own script then shows "Không có nội dung xem
    // trước. URL "srcdoc"..."). Nudge it via template/info (which also tells
    // us if the preview link changed) and retry a few times.
    for (let attempt = 0; attempt < 3 && html !== null && isEmptyPreviewShell(html); attempt++) {
      if (attempt === 0) {
        try {
          const detail = await getTemplateDetail(templateId);
          if (detail.previewUrl && detail.previewUrl !== previewUrl) {
            previewUrl = detail.previewUrl;
            await supabase
              .from("zalo_templates")
              .update({ preview_url: previewUrl })
              .eq("template_id", templateId);
          }
        } catch {
          // Best effort — still retry the fetch below.
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 800));
      html = await fetchPreviewPage(previewUrl);
    }
    if (html === null) {
      return NextResponse.json({ error: "Không tải được nội dung xem trước từ Zalo" }, { status: 502 });
    }

    for (const [key, rawValue] of Object.entries(params)) {
      const safeValue = escapeHtml(rawValue?.trim() ? rawValue : `<${key}>`);
      const escapedKey = escapeRegExp(key);
      // Placeholders show up HTML-escaped in the fetched source (&lt;key&gt;)
      // but fall back to a literal <key> match in case a template renders it
      // unescaped somewhere (e.g. inside an attribute).
      html = html.replace(new RegExp(`&lt;${escapedKey}&gt;`, "g"), safeValue);
      html = html.replace(new RegExp(`<${escapedKey}>`, "g"), safeValue);
    }

    // Relative asset URLs (css/js/images) in the fetched page must resolve
    // against Zalo's origin, not ours, once rendered via srcDoc.
    const baseTag = `<base href="${previewUrl}">`;
    html = /<head[^>]*>/i.test(html)
      ? html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`)
      : `<head>${baseTag}</head>${html}`;

    return NextResponse.json({ html });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
