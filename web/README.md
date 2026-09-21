# Family Web Dashboard

React (Vite) dashboard for the Family Chat & Backup app: browse/play/delete synced photos
and videos, and chat with the family from a browser. Implements `../API_CONTRACT.md`.

## Develop

```
npm install
cp .env.example .env      # set VITE_API_BASE_URL if the backend isn't on localhost:4000
npm run dev
```

## Build & deploy

```
npm run build
```

Outputs static files to `dist/`. Two easy options:

1. **Same VPS as the backend**: point Nginx at `web/dist` as a static root (a separate
   `server {}` block or location, alongside the reverse-proxy config in `backend/DEPLOY.md`),
   and set `VITE_API_BASE_URL` to the backend's public URL before running `npm run build`.
2. **Any static host** (Netlify, Vercel, Cloudflare Pages, etc.) — just make sure
   `VITE_API_BASE_URL` points at the backend's public HTTPS URL at build time, and that the
   backend's `CORS_ORIGIN` allows this dashboard's origin.
