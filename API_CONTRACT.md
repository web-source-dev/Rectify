# API Contract — Family Chat & Backup

Shared contract between `backend/`, `web/`, and `mobile/`. All three must match this exactly.
Backend default port: `4000`. All REST routes are under `/api`. Socket.IO runs on the same
HTTP server/port (default namespace `/`).

## Auth model

- One shared **family PIN**, set server-side (bcrypt hash in `.env`).
- Any device that knows the PIN gets its own `User` row + a long-lived JWT (1 year).
- JWT payload: `{ userId, iat, exp }`. Send as `Authorization: Bearer <token>` on REST calls.
- Socket.IO: pass token via `io(url, { auth: { token } })`. Server rejects connection if invalid.
- The one exception: `GET /api/media/:id/file` also accepts `?token=<jwt>` as a query param,
  because `<img src>`/`<video src>` tags can't set headers. Prefer the header when possible.

## REST endpoints

### `POST /api/auth/pin`
Body: `{ "pin": "string", "deviceName"?: "string" }`
- Wrong PIN → `401 { "error": "invalid_pin" }`
- Correct PIN → creates a new `User` (name: null) if this is a brand-new device, else reuses
  nothing (every successful PIN entry with no prior token = new user; the app itself is
  responsible for persisting the token so it doesn't call this repeatedly).
- Response `200`: `{ "token": "string", "user": { "id": "string", "name": null } }`

### `GET /api/users/me`
Auth required. Response: `{ "id": "string", "name": "string|null" }`

### `PATCH /api/users/me`
Auth required. Body: `{ "name": "string" }` (1-40 chars, trimmed, required).
Response: `{ "id": "string", "name": "string" }`

### `GET /api/users`
Auth required. Response: `{ "users": [{ "id": "string", "name": "string|null" }] }`

### `GET /api/messages?before=<ISOdate|omit>&limit=50`
Auth required. Returns up to `limit` messages older than `before` (or newest if omitted),
sorted **ascending** by `createdAt` (ready to render top-to-bottom).
Response: `{ "messages": [{ "id", "userId", "name", "text", "createdAt" }], "hasMore": boolean }`

### `POST /api/messages`
Auth required. Body: `{ "text": "string" }` (1-2000 chars). Also persists + broadcasts via
socket — REST fallback for the web dashboard / if a socket isn't connected.
Response `201`: the created message object.

### `POST /api/media/check`
Auth required. Body: `{ "checksums": ["sha256hex", ...] }` (max 500 per call).
Response: `{ "existing": ["sha256hex", ...] }` — subset already stored, so the client can skip
re-uploading them (used by mobile to avoid re-syncing the whole library after reinstall).

### `POST /api/media/upload`
Auth required. `multipart/form-data`:
- `file`: the binary (image/video)
- `checksum`: sha256 hex the client computed (server re-verifies by hashing the bytes it
  received; the client value is only a hint used for the early `duplicate` short-circuit)
- `takenAt` (optional ISO date; falls back to upload time)
Response `200`: `{ "id", "url", "duplicate": boolean }` — `duplicate: true` means this checksum
already existed (server didn't store a second copy); client should still mark it synced locally.
Max file size: 300MB. Reject non-image/video mime types with `415`.

### `GET /api/media?cursor=<id|omit>&limit=30&type=all|image|video`
Auth required. Response:
`{ "items": [{ "id","userId","name","filename","mimeType","size","width","height","createdAt","url" }], "nextCursor": "string|null" }`
Newest first.

### `GET /api/media/:id/file`
Auth required (header or `?token=`). Streams the raw file with correct `Content-Type`.

### `DELETE /api/media/:id`
Auth required. Any family member may delete (shared family storage). `204` on success.

### `GET /api/media/stats`
Auth required. Response: `{ "totalCount": number, "totalSize": number, "images": number, "videos": number }`

### `GET /api/health`
No auth. `{ "status": "ok" }`

## Socket.IO events

Connect: `io(BASE_URL, { auth: { token } })`

- Client → Server `message:send` — payload `{ text: string }`
- Server → Server persists it, then Server → all clients `message:new` — payload
  `{ id, userId, name, text, createdAt }`
- Server → Server on connect may emit `presence:update` — payload `{ userId, name, online: boolean }`
  (optional nice-to-have, not required for v1 correctness)
- Auth failure on connect → server emits `connect_error` with message `unauthorized` and drops
  the socket.

## Env vars (backend/.env)

```
PORT=4000
JWT_SECRET=<random 32+ byte secret>
FAMILY_PIN=<the shared PIN, plaintext only in this env var; hashed at startup into memory>
DATABASE_URL="file:./data/family.db"
UPLOAD_DIR=./data/uploads
MAX_UPLOAD_MB=300
CORS_ORIGIN=*   # set to the real web dashboard origin in production
```

## Env vars (mobile & web)

Both just need `API_BASE_URL` (e.g. `https://family.example.com`), configured at build time.
