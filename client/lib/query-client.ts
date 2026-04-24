import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * Gets the base URL for the Express API server (e.g., "http://localhost:3000")
 * @returns {string} The API base URL
 */
export function getApiUrl(): string {
  let host = process.env.EXPO_PUBLIC_DOMAIN || process.env.EXPO_PUBLIC_API_URL;

  if (!host) {
    throw new Error("EXPO_PUBLIC_DOMAIN is not set. Set it to your server's domain:port (e.g., yourdomain.com or localhost:5000)");
  }

  if (host.startsWith("http://") || host.startsWith("https://")) {
    return host.endsWith("/") ? host.slice(0, -1) : host;
  }

  let url = new URL(`https://${host}`);

  return url.href;
}

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(message: string, status: number, body: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function defaultMessageForStatus(status: number): string {
  if (status === 400) return "Some of the details you entered are not valid. Please review and try again.";
  if (status === 401) return "Your session has expired or your credentials are incorrect. Please sign in again.";
  if (status === 403) return "You don't have permission to do this.";
  if (status === 404) return "We couldn't find what you were looking for.";
  if (status === 409) return "That action conflicts with the current state. Please refresh and try again.";
  if (status === 422) return "Some required information is missing or invalid.";
  if (status === 429) return "You're doing that a bit too often. Please wait a moment and try again.";
  if (status >= 500) return "Something went wrong on our end. Please try again in a moment.";
  return "Something didn't work as expected. Please try again.";
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const raw = await res.text();
    let body: any = raw;
    let message = "";
    if (raw) {
      try {
        body = JSON.parse(raw);
        if (body && typeof body === "object") {
          message = body.error || body.message || "";
        }
      } catch {
        message = raw;
      }
    }
    if (!message || /<!doctype html|<html/i.test(message)) {
      message = defaultMessageForStatus(res.status);
    }
    throw new ApiError(message, res.status, body);
  }
}

export function getErrorMessage(error: unknown, fallback = "Something didn't work as expected. Please try again."): string {
  if (!error) return fallback;
  if (error instanceof ApiError) return error.message || fallback;
  if (error instanceof Error) {
    const msg = error.message || "";
    const match = msg.match(/^\s*\d{3}\s*:\s*(.*)$/);
    if (match) {
      const rest = match[1];
      try {
        const parsed = JSON.parse(rest);
        if (parsed && typeof parsed === "object") {
          return parsed.error || parsed.message || fallback;
        }
      } catch {}
      return rest || fallback;
    }
    if (/network request failed|failed to fetch|networkerror/i.test(msg)) {
      return "We can't reach the server right now. Please check your internet connection and try again.";
    }
    return msg || fallback;
  }
  if (typeof error === "string") return error || fallback;
  return fallback;
}

// Identity is supplied via an HttpOnly signed session cookie set on
// /api/organizations/login and /api/organizations/staff-login. Clients no
// longer send a user id header — server-trusted cookies are the source of
// truth for permission checks.
export function setCurrentUserIdHeader(_id: string | null) {
  // no-op (kept for backwards compatibility with existing call sites)
}

function buildHeaders(hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  if (hasBody) headers["Content-Type"] = "application/json";
  return headers;
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  const res = await fetch(url, {
    method,
    headers: buildHeaders(data !== undefined),
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);

    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
