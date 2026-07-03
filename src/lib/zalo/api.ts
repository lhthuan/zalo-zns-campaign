import "server-only";
import { getValidAccessToken } from "@/lib/zalo/token";
import type { ZaloPhoneSendResult, ZaloTemplateParam, ZaloUidSendResult } from "@/types/domain";
import type { TemplateStatus } from "@/types/supabase";

const PHONE_SEND_URL = "https://business.openapi.zalo.me/message/template";
const UID_SEND_URL = "https://openapi.zalo.me/v3.0/oa/message/template";
const TEMPLATE_LIST_URL = "https://business.openapi.zalo.me/template/all";
const TEMPLATE_DETAIL_URL = "https://business.openapi.zalo.me/template/info/v2";
// Standard Official Account API (not part of the ZNS-specific docs verified
// earlier) — stable/long-established, but worth double-checking response
// shape once real credentials are live.
const OA_INFO_URL = "https://openapi.zalo.me/v2.0/oa/getoa";

async function zaloFetch<T>(url: string, init: RequestInit & { accessToken: string }): Promise<T> {
  const { accessToken, headers, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: {
      ...headers,
      access_token: accessToken,
    },
  });
  return (await res.json()) as T;
}

export interface SendPhoneParams {
  phone: string;
  templateId: string;
  templateData: Record<string, string>;
  trackingId: string;
}

export async function sendPhoneTemplate(params: SendPhoneParams): Promise<ZaloPhoneSendResult> {
  const accessToken = await getValidAccessToken();
  return zaloFetch<ZaloPhoneSendResult>(PHONE_SEND_URL, {
    accessToken,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone: params.phone,
      template_id: params.templateId,
      template_data: params.templateData,
      tracking_id: params.trackingId,
    }),
  });
}

export interface SendUidParams {
  userId: string;
  templateId: string;
  templateData: Record<string, string>;
}

export async function sendUidTemplate(params: SendUidParams): Promise<ZaloUidSendResult> {
  const accessToken = await getValidAccessToken();
  return zaloFetch<ZaloUidSendResult>(UID_SEND_URL, {
    accessToken,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: params.userId,
      template_id: params.templateId,
      template_data: params.templateData,
    }),
  });
}

interface ZaloTemplateListItem {
  templateId: string;
  templateName: string;
  status: TemplateStatus;
  createdTime?: string;
}

interface ZaloTemplateListResponse {
  error: number;
  message: string;
  data?: ZaloTemplateListItem[];
  metadata?: { total: number };
}

export async function listTemplates(offset = 0, limit = 50): Promise<ZaloTemplateListItem[]> {
  const accessToken = await getValidAccessToken();
  const url = new URL(TEMPLATE_LIST_URL);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("limit", String(limit));

  const json = await zaloFetch<ZaloTemplateListResponse>(url.toString(), {
    accessToken,
    method: "GET",
  });
  if (json.error !== 0 || !json.data) {
    throw new Error(`Zalo template/all failed: ${json.error} ${json.message}`);
  }

  const page = json.data;
  const total = json.metadata?.total ?? page.length;
  if (offset + page.length < total) {
    return [...page, ...(await listTemplates(offset + limit, limit))];
  }
  return page;
}

interface ZaloTemplateDetailResponse {
  error: number;
  message: string;
  data?: {
    templateId: string;
    templateName: string;
    status: TemplateStatus;
    templateTag?: string;
    listParams?: ZaloTemplateParam[];
    previewUrl?: string;
    price_sdt?: number | string;
    price_uid?: number | string;
  };
}

export interface ZaloTemplateDetail {
  templateId: string;
  templateName: string;
  status: TemplateStatus;
  tag: string | null;
  listParams: ZaloTemplateParam[];
  previewUrl: string | null;
  priceSdt: number | null;
  priceUid: number | null;
}

export async function getTemplateDetail(templateId: string): Promise<ZaloTemplateDetail> {
  const accessToken = await getValidAccessToken();
  const url = new URL(TEMPLATE_DETAIL_URL);
  url.searchParams.set("template_id", templateId);

  const json = await zaloFetch<ZaloTemplateDetailResponse>(url.toString(), {
    accessToken,
    method: "GET",
  });
  if (json.error !== 0 || !json.data) {
    throw new Error(`Zalo template/info/v2 failed for ${templateId}: ${json.error} ${json.message}`);
  }
  return {
    templateId: json.data.templateId,
    templateName: json.data.templateName,
    status: json.data.status,
    tag: json.data.templateTag ?? null,
    listParams: json.data.listParams ?? [],
    previewUrl: json.data.previewUrl ?? null,
    priceSdt: json.data.price_sdt != null ? Number(json.data.price_sdt) : null,
    priceUid: json.data.price_uid != null ? Number(json.data.price_uid) : null,
  };
}

interface ZaloOaInfoResponse {
  error: number;
  message: string;
  data?: {
    oa_id: string;
    name: string;
    avatar?: string;
    description?: string;
  };
}

export interface ZaloOaInfo {
  oaId: string;
  name: string;
  avatar: string | null;
}

export async function getOaInfo(): Promise<ZaloOaInfo> {
  const accessToken = await getValidAccessToken();
  const json = await zaloFetch<ZaloOaInfoResponse>(OA_INFO_URL, {
    accessToken,
    method: "GET",
  });
  if (json.error !== 0 || !json.data) {
    throw new Error(`Zalo oa/getoa failed: ${json.error} ${json.message}`);
  }
  return { oaId: json.data.oa_id, name: json.data.name, avatar: json.data.avatar ?? null };
}

/**
 * Best-effort extraction of a Zalo UID from a send response. Per official docs
 * neither send endpoint is documented to reveal a newly-discovered UID (the
 * UID-send response only echoes back the user_id you sent) — this exists so
 * we don't silently miss it if that ever changes, not because it's expected
 * to fire today. See plan section 0.
 */
export function tryExtractUid(
  response: ZaloPhoneSendResult | ZaloUidSendResult
): string | null {
  const data = response.data as Record<string, unknown> | undefined;
  if (!data) return null;
  const candidate = data.user_id ?? data.uid ?? data.zalo_uid;
  return typeof candidate === "string" ? candidate : null;
}
