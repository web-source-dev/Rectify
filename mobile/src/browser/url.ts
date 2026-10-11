export const GOOGLE_HOME = 'https://www.google.com/';

export const MAX_BROWSER_TABS = 8;

const MOBILE_CHROME =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36';

export const BROWSER_USER_AGENT = MOBILE_CHROME;

export type BrowserTab = {
  id: string;
  entryUrl: string;
  currentUrl: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  progress: number;
  failed: boolean;
  loadId: number;
};

let tabSeq = 0;

export function createBrowserTab(url: string, title?: string): BrowserTab {
  tabSeq += 1;
  const resolved = (url || '').trim();
  return {
    id: `tab-${Date.now().toString(36)}-${tabSeq}`,
    entryUrl: resolved,
    currentUrl: resolved,
    title: title || (resolved ? labelForUrl(resolved) : 'Search'),
    canGoBack: false,
    canGoForward: false,
    loading: !!resolved,
    progress: resolved ? 0.08 : 0,
    failed: false,
    loadId: 0,
  };
}

export function resolveBrowserInput(input: string): string | null {
  const trimmed = input.trim();
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

export function allowInAppNavigation(url: string): boolean {
  return /^https?:\/\//i.test(url) || url === 'about:blank' || url.startsWith('about:blank');
}

// Hermes on the phone implements `new URL` but throws on `.hostname`.
// Split the address by hand instead.
type HttpUrl = {
  origin: string;
  host: string;
  path: string;
  query: string;
};

function parseHttpUrl(raw: string): HttpUrl | null {
  const match = /^(https?:)\/\/([^/?#]+)([^?#]*)(?:\?([^#]*))?/i.exec(String(raw || '').trim());
  if (!match) {
    return null;
  }
  const scheme = match[1].toLowerCase();
  const authority = match[2];
  const hostPort = authority.includes('@') ? authority.slice(authority.lastIndexOf('@') + 1) : authority;
  const host = hostPort.replace(/:\d+$/, '').toLowerCase();
  const path = match[3] && match[3].startsWith('/') ? match[3] : `/${match[3] || ''}`;
  return {
    origin: `${scheme}//${hostPort}`,
    host,
    path,
    query: match[4] || '',
  };
}

function queryParam(query: string, name: string): string {
  for (const part of query.split('&')) {
    if (!part) {
      continue;
    }
    const eq = part.indexOf('=');
    const key = decodePart(eq === -1 ? part : part.slice(0, eq));
    if (key === name) {
      return decodePart(eq === -1 ? '' : part.slice(eq + 1));
    }
  }
  return '';
}

function decodePart(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

function barePath(path: string): string {
  return path.replace(/\/+$/, '') || '/';
}

function googleHost(host: string): boolean {
  return /(^|\.)google\.[a-z.]+$/i.test(host);
}

export function isBareGoogle(url: string): boolean {
  const parsed = parseHttpUrl(url);
  if (!parsed || !googleHost(parsed.host)) {
    return false;
  }
  const path = barePath(parsed.path);
  return path === '/' || path === '/webhp';
}

// Resting address field: a search query, a site name, or nothing on the Google homepage.
export function friendlyOmnibox(url: string): string {
  const parsed = parseHttpUrl(url);
  if (!parsed || isBareGoogle(url)) {
    return '';
  }
  const path = barePath(parsed.path);
  if (googleHost(parsed.host) && path === '/search') {
    return queryParam(parsed.query, 'q');
  }
  return parsed.host.replace(/^www\./, '');
}

export function omniboxText(url: string): string {
  return friendlyOmnibox(url);
}

export function labelForUrl(url: string): string {
  const parsed = parseHttpUrl(url);
  if (!parsed) {
    return 'Tab';
  }
  const host = parsed.host.replace(/^www\./, '');
  if (host === 'google.com' && barePath(parsed.path) === '/search') {
    return queryParam(parsed.query, 'q') || 'Google';
  }
  if (googleHost(parsed.host) && (barePath(parsed.path) === '/' || barePath(parsed.path) === '/webhp')) {
    return 'Google';
  }
  return host || 'Tab';
}

export function niceTitle(title: string | undefined, url: string): string {
  const clean = (title || '').replace(/\s+/g, ' ').trim();
  if (!clean || clean === 'about:blank' || /^https?:\/\//i.test(clean)) {
    return labelForUrl(url);
  }
  return clean;
}

export function isGooglePage(url: string): boolean {
  const parsed = parseHttpUrl(url);
  return !!parsed && googleHost(parsed.host);
}

export function pageKey(url: string): string {
  const parsed = parseHttpUrl(url);
  if (!parsed) {
    return url;
  }
  return `${parsed.origin}${parsed.path.replace(/\/$/, '')}`;
}

function looksLikeUrl(value: string): boolean {
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
