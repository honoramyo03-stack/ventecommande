const apiBase = (
  (import.meta.env.VITE_API_URL as string | undefined) ||
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  'http://localhost:4000'
).replace(/\/$/, '');

export const getApiBaseUrl = () => apiBase;

export const isApiConfigured = () => Boolean(apiBase);

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(payload?.error || `API_${response.status}`);
  }

  return payload as T;
}

export type StreamEvent = {
  type: string;
  table?: string;
  id?: string;
  at: string;
};

export function createRealtimeStream(onEvent: (evt: StreamEvent) => void): EventSource | null {
  try {
    const source = new EventSource(`${apiBase}/api/stream`);
    source.onmessage = (message) => {
      try {
        const data = JSON.parse(message.data) as StreamEvent;
        onEvent(data);
      } catch {
        // Ignore malformed stream payloads.
      }
    };
    return source;
  } catch {
    return null;
  }
}
