export const GOOGLE_HOME = "https://www.google.com/";

export const MAX_BROWSER_TABS = 8;

export function createBrowserTab(url, title) {
  const resolved = url || GOOGLE_HOME;
  return {
    id: `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    entryUrl: resolved,
    history: [resolved],
    index: 0,
    title: title || labelForUrl(resolved),
    loading: true,
  };
}

export function resolveBrowserInput(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) {
    return null;
  }
  if (/^(javascript|data|file|blob|intent):/i.test(trimmed)) {
    return null;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (looksLikeUrl(trimmed)) {
    return `https://${trimmed}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

// Google refuses to render inside a normal page unless this flag is set.
// Mobile uses a real browser view and does not need it.
export function embedUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "google.com" || host.endsWith(".google.com")) {
      if (!parsed.searchParams.has("igu")) {
        parsed.searchParams.set("igu", "1");
      }
      return parsed.toString();
    }
  } catch {
    return url;
  }
  return url;
}

export function omniboxText(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "google.com" && (parsed.pathname === "/" || parsed.pathname === "/webhp")) {
      return "";
    }
    if (host === "google.com" && parsed.pathname === "/search") {
      return parsed.searchParams.get("q") || url;
    }
  } catch {
    return url;
  }
  return url;
}

export function labelForUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "google.com" && parsed.pathname === "/search") {
      return parsed.searchParams.get("q") || "Google";
    }
    if (host === "google.com") {
      return "Google";
    }
    return host || "Tab";
  } catch {
    return "Tab";
  }
}

export function isGooglePage(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "") === "google.com";
  } catch {
    return false;
  }
}

export function pageKey(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`;
  } catch {
    return url;
  }
}

function looksLikeUrl(value) {
  if (/\s/.test(value)) {
    return false;
  }
  if (/^localhost(:\d+)?(\/.*)?$/i.test(value)) {
    return true;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(value)) {
    return true;
  }
  return /^[\w.-]+\.[a-z]{2,}(:\d+)?([/:?#].*)?$/i.test(value);
}
