import { API_BASE_URL } from './config';
import { ChatMessage, User } from './types';

const REQUEST_TIMEOUT_MS = 15000;

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    throw new ApiError(0, e instanceof Error && e.name === 'AbortError' ? 'request_timeout' : 'network_error');
  } finally {
    clearTimeout(timeout);
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `request_failed_${res.status}`);
  }
  return data as T;
}

export function verifyPin(pin: string, existingToken?: string) {
  return request<{ token: string; user: User }>('/api/auth/pin', {
    method: 'POST',
    body: { pin, token: existingToken },
  });
}

export function setName(token: string, name: string) {
  return request<User>('/api/users/me', { method: 'PATCH', token, body: { name } });
}

export function fetchMessages(token: string, before?: string) {
  const qs = before ? `?before=${encodeURIComponent(before)}&limit=50` : '?limit=50';
  return request<{ messages: ChatMessage[]; hasMore: boolean }>(`/api/messages${qs}`, {
    token,
  });
}

export function sendMessage(token: string, body: { text?: string; mediaId?: string }) {
  return request<ChatMessage>('/api/messages', { method: 'POST', token, body });
}

// Multipart upload of a picked image; RN's fetch streams the content:// URI itself.
export async function uploadImage(
  token: string,
  file: { uri: string; mimeType: string; fileName: string },
): Promise<{ id: string; url: string; duplicate: boolean }> {
  const form = new FormData();
  form.append('file', { uri: file.uri, type: file.mimeType, name: file.fileName } as never);
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/media/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  } catch {
    throw new ApiError(0, 'network_error');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `request_failed_${res.status}`);
  }
  return data;
}

export function mediaFileUrl(url: string, token: string) {
  return `${API_BASE_URL}${url}?token=${encodeURIComponent(token)}`;
}

export { ApiError };
