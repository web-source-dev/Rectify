# Family Web Dashboard

React (Vite) dashboard for the Family Chat & Backup app: browse/play/delete synced photos
and videos, and chat with the family from a browser. Implements `../API_CONTRACT.md`.

## Develop

```
npm install
cp .env.example .env      # set VITE_API_BASE_URL if the backend isn't on localhost:9015
npm run dev
```

## Build & deploy

```
npm run build
```

Outputs static files to `dist/`. A few options:

1. **PM2 on the same VPS as the backend** (matches `backend/ecosystem.config.js`): after
   `npm run build`, run `pm2 start ecosystem.config.js` from `web/`. This serves `dist/` via
   the `serve` package on port `9016` (`npm run start`). Make sure `VITE_API_BASE_URL` pointed
   at the backend's public URL *before* `npm run build` — it's baked into the build, not read
   at runtime.
2. **Nginx as a static root** instead of PM2: point Nginx at `web/dist` (a separate `server {}`
   block or location, alongside the reverse-proxy config in `backend/DEPLOY.md`).
3. **Any static host** (Netlify, Vercel, Cloudflare Pages, etc.) — just make sure
   `VITE_API_BASE_URL` points at the backend's public HTTPS URL at build time, and that the
   backend's `CORS_ORIGIN` allows this dashboard's origin.
