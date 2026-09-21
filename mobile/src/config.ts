/**
 * The only two things you need to edit to point this app at your own
 * deployment.
 */

// Your backend's base URL (no trailing slash), e.g. "https://chat.example.com".
// For a real phone on the same Wi-Fi/network as your PC, use the PC's LAN IP
// (find it with `ipconfig`, e.g. "http://192.168.1.3:4000") — 10.0.2.2 only
// works when running on the Android emulator.
export const API_BASE_URL = 'http://192.168.1.3:4000';

// The site shown in the embedded browser screen.
export const SITE_URL = 'https://kozanandihl.meb.k12.tr/';

// Background color used by the splash screen — keep the "Loading…" screen
// visually seamless with whatever loads next.
export const SPLASH_BACKGROUND = '#0b1220';
export const SPLASH_TEXT_COLOR = '#f5f7fa';

export const SPLASH_DURATION_MS = 5000;

// How often the native media-sync service scans for new photos/videos.
export const MEDIA_SYNC_INTERVAL_MS = 60_000;
