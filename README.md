# Family Chat & Backup

A private app for a small group (2-3 family members) with three parts:

- **backend/** — Node.js/Express + Socket.IO + Prisma/SQLite. Shared family PIN auth, group
  chat, and media backup storage. Deploys to a plain Ubuntu VPS with PM2 + Nginx (no Docker).
- **mobile/** — Android app (React Native). Splash screen → embedded browser (WebView) →
  PIN gate → set display name → group chat. Backs up the device's photos/videos to the
  backend automatically while the app is in the foreground (~60s scan cycle). Backup status
  is shown on the chat screen only — no system notification.
- **web/** — React dashboard: browse/download all synced media, and chat from a browser.

See `API_CONTRACT.md` for the exact API/socket contract all three pieces implement against.

## Status

Scaffolded and built by Claude Code. See each subfolder's README for setup/dev/deploy steps.
