/** REST client. Default base '' → same-origin Next proxy (next.config rewrites). */
const BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: { accept: 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body?.message) message = body.message;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

export function adminMutation<T>(path: string, method: string, body?: unknown): Promise<T> {
  return api<T>(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-ils-admin': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function qs(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

/** WebSocket endpoint as seen from the browser. */
export function wsUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  if (typeof window === 'undefined') return 'ws://localhost:4000/ws';
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.hostname}:4000/ws`;
}
