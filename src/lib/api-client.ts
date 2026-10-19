export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

/**
 * fetch() wrapper for our own /api routes: parses JSON and throws an ApiError
 * carrying the route's `{ error }` message on non-2xx, so TanStack Query can
 * surface it.
 */
export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = (json as { error?: unknown }).error;
    // Some routes return structured (e.g. zod) errors rather than a string.
    const message = error == null ? `HTTP ${res.status}` : typeof error === "string" ? error : JSON.stringify(error);
    throw new ApiError(message, res.status);
  }
  return json as T;
}

/** apiFetch with a JSON body. */
export function apiSend<T>(url: string, method: "POST" | "PATCH" | "PUT" | "DELETE", body?: unknown) {
  return apiFetch<T>(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
