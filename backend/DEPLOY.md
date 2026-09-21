# Deploying to an Ubuntu VPS (no Docker)

Assumes a fresh-ish Ubuntu 22.04/24.04 VPS you can SSH into, and a domain (or subdomain)
pointed at its IP — you need that for real HTTPS, which matters here because the mobile app
sends the family PIN and every photo/video over this connection.

## 1. Install Node.js LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # confirm it installed
```

## 2. Create a deploy user + directory (skip if you already have one)

```bash
sudo adduser --disabled-password --gecos "" family
sudo su - family
mkdir -p ~/app
```

## 3. Get the code onto the server

From your machine, copy the `backend/` folder to the server (e.g. `scp -r backend family@YOUR_VPS_IP:~/app/`),
or `git clone` your repo there. End state: the contents of this `backend/` folder live at
`~/app/backend` on the VPS.

## 4. Install dependencies + configure

```bash
cd ~/app/backend
npm ci --omit=dev
cp .env.example .env
```

Edit `.env`:
- `JWT_SECRET`: generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `FAMILY_PIN`: pick the shared PIN the family will type into the app
- `CORS_ORIGIN`: set to the real web dashboard origin once you know it (e.g. `https://family.example.com`)
- Leave `DATABASE_URL` / `UPLOAD_DIR` as-is unless you want data stored elsewhere

## 5. Set up the database

```bash
npx prisma migrate deploy
```

This creates `data/family.db` (SQLite — no separate database server to install or manage).

## 6. Run it with PM2

```bash
sudo npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup    # run the command it prints (as a sudo-capable user) so it survives reboots
```

Check it's alive: `curl http://localhost:9015/api/health` should return `{"status":"ok"}`.

## 7. Put Nginx in front (TLS + WebSocket upgrade for Socket.IO)

```bash
sudo apt-get install -y nginx
```

`/etc/nginx/sites-available/family`:

```nginx
server {
    listen 80;
    server_name family.example.com;

    client_max_body_size 320M;   # a little headroom over MAX_UPLOAD_MB

    location / {
        proxy_pass http://127.0.0.1:9015;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;   # generous timeout for large video uploads
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/family /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 8. HTTPS via certbot

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d family.example.com
```

Certbot rewrites the Nginx config to serve HTTPS and sets up auto-renewal. After this,
`API_BASE_URL` for the mobile app and web dashboard is `https://family.example.com`.

## Updating after a code change

```bash
cd ~/app/backend
git pull   # or re-copy the files
npm ci --omit=dev
npx prisma migrate deploy
pm2 restart family-backend
```

## Backups

Everything that matters is under `backend/data/` (the SQLite file + `uploads/`). Periodically
copy that folder somewhere else, e.g.:

```bash
tar -czf family-backup-$(date +%F).tar.gz -C ~/app/backend data
```
