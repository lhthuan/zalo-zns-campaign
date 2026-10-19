"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiSend } from "@/lib/api-client";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

/**
 * Zalo's preview page for a template with `params` substituted in, via our
 * preview-html proxy. Params are debounced so typing doesn't fire a request
 * per keystroke, and the previous render stays up while the next one loads.
 */
export function useTemplatePreview(templateId: string | undefined, hasPreviewUrl: boolean, params: Record<string, string>) {
  const debouncedParams = useDebouncedValue(params, 400);
  return useQuery({
    queryKey: ["template-preview", templateId, debouncedParams],
    queryFn: () =>
      apiSend<{ html: string }>("/api/templates/preview-html", "POST", {
        templateId,
        params: debouncedParams,
      }).then((j) => j.html),
    enabled: !!templateId && hasPreviewUrl,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
}
