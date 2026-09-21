# backend

Node.js/Express + Socket.IO + Prisma (SQLite). Implements `../API_CONTRACT.md`.

## Local dev

```bash
npm install
cp .env.example .env
# edit .env: set JWT_SECRET (see comment in the file for how to generate one) and FAMILY_PIN
npx prisma migrate dev --name init
npm run dev
```

Server listens on `PORT` (default `4000`). Health check: `GET http://localhost:4000/api/health`.

## Data

SQLite file + uploaded media both live under `./data/` (gitignored). Back the whole app up by
copying that one folder.

## Production

See `DEPLOY.md` for a plain Ubuntu VPS deploy (no Docker).
