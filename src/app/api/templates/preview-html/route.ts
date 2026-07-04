import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/lib/auth";

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

    const previewRes = await fetch(template.preview_url);
    if (!previewRes.ok) {
      return NextResponse.json({ error: "Không tải được nội dung xem trước từ Zalo" }, { status: 502 });
    }
    let html = await previewRes.text();

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
    const baseTag = `<base href="${template.preview_url}">`;
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
