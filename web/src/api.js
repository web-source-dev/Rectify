const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4003";

export function getToken() {
  return localStorage.getItem("token");
}

export function getStoredUser() {
  const raw = localStorage.getItem("user");
  return raw ? JSON.parse(raw) : null;
}

export function storeSession(token, user) {
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

async function request(path, { method = "GET", body, isForm = false, auth = true } = {}) {
  const headers = {};
  if (!isForm && body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const message = (data && data.error) || res.statusText || "request_failed";
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const api = {
  baseUrl: BASE_URL,

  health: () => request("/api/health", { auth: false }),

  loginWithPin: (pin, deviceName) =>
    request("/api/auth/pin", {
      method: "POST",
      auth: false,
      body: { pin, deviceName },
    }),

  getMe: () => request("/api/users/me"),

  setName: (name) => request("/api/users/me", { method: "PATCH", body: { name } }),

  listUsers: () => request("/api/users"),

  listMessages: (before) =>
    request(`/api/messages${before ? `?before=${encodeURIComponent(before)}` : ""}`),

  sendMessage: (text) => request("/api/messages", { method: "POST", body: { text } }),

  checkMedia: (checksums) =>
    request("/api/media/check", { method: "POST", body: { checksums } }),

  uploadMedia: (formData) =>
    request("/api/media/upload", { method: "POST", isForm: true, body: formData }),

  listMedia: ({ cursor, limit = 30, type = "all" } = {}) => {
    const params = new URLSearchParams({ limit: String(limit), type });
    if (cursor) params.set("cursor", cursor);
    return request(`/api/media?${params.toString()}`);
  },

  deleteMedia: (id) => request(`/api/media/${id}`, { method: "DELETE" }),

  mediaStats: () => request("/api/media/stats"),

  wipeAll: () => request("/api/admin/wipe", { method: "POST", body: { confirm: "DELETE" } }),

  mediaFileUrl: (id) => {
    const token = getToken();
    return `${BASE_URL}/api/media/${id}/file?token=${encodeURIComponent(token || "")}`;
  },
};
