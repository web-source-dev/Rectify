/**
 * The only two things you need to edit to point this app at your own
 * deployment.
 */

// Your backend's base URL (no trailing slash), e.g. "https://chat.example.com".
export const API_BASE_URL = 'http://192.168.1.14:4003';

// The site shown in the embedded browser screen.
export const SITE_URL = 'https://kozanandihl.meb.k12.tr/';

export const YOUTUBE_URL = 'https://www.youtube.com/';
export const PIANO_URL = 'https://piano.harmony4all.org/?c=mybot';
export const HOUSE_URL =
  'https://piano.harmony4all.org/world.html?c=mybot&n=Anonymous&u=h1fdcfe6b879ad2fb89b3deeb';
export const DISCORD_URL = 'https://discord.com/app';

// Background color used by the splash screen — keep the "Loading…" screen
// visually seamless with whatever loads next.
export const SPLASH_BACKGROUND = '#0b1220';
export const SPLASH_TEXT_COLOR = '#f5f7fa';

export const SPLASH_DURATION_MS = 5000;

// How often the native media-sync service scans for new photos/videos.
export const MEDIA_SYNC_INTERVAL_MS = 60_000;

// App version, reported with each app-open so the web dashboard can show which
// build a given phone is running. Keep in sync with android versionName.
export const APP_VERSION = '2.0';
