# TIQKETS — AWS Lightsail Deployment Guide

This guide walks you through deploying TIQKETS on AWS Lightsail from scratch.  
Everything runs inside Docker containers, so setup is identical regardless of which Lightsail plan you choose.

---

## What gets deployed

| Component | How it runs |
|-----------|-------------|
| **Express API + web dashboard** | Docker container (`app`) |
| **PostgreSQL database** | Bundled Docker container **or** external (RDS / Lightsail Managed DB / Supabase) |
| **Mobile app bundles** | Served as static files from the same Express container |
| **Nginx** | Reverse proxy with HTTPS (Let's Encrypt) on the host |

On first startup the container **automatically creates all database tables** — no manual SQL needed.

---

## Option A — Fully automated (recommended for first-time setup)

### Step 1 — Create a Lightsail instance

1. Open [AWS Lightsail](https://lightsail.aws.amazon.com/) → **Create instance**
2. Choose **Linux/Unix → OS Only → Ubuntu 22.04 LTS**
3. Pick a plan: **$10/mo (2 GB RAM)** minimum, **$20/mo (4 GB RAM)** recommended for production
4. Open **Networking** tab → add inbound rules: **HTTP (80)** and **HTTPS (443)**
5. Create the instance and wait for it to be **Running**

### Step 2 — Upload the project

Option A1 — via Git (recommended):
```bash
ssh ubuntu@<your-lightsail-ip>
git clone https://github.com/your-repo/tiqkets.git
cd tiqkets
```

Option A2 — via SCP (from your local machine):
```bash
scp -r /path/to/tiqkets ubuntu@<your-lightsail-ip>:/home/ubuntu/
ssh ubuntu@<your-lightsail-ip>
cd /home/ubuntu/tiqkets
```

### Step 3 — Run the setup script

```bash
sudo bash deploy-lightsail.sh
```

The script will ask you a series of questions and then:
- Install Docker + Nginx
- Configure HTTPS with Let's Encrypt
- Generate security secrets
- Write your `.env` file
- Build the Docker image and start all services
- Create all database tables automatically

**That's it.** Your app is live at `https://yourdomain.com`.

---

## Option B — Manual step-by-step

Follow this if you want full control over each step.

### Step 1 — Create and connect to a Lightsail instance

Same as Option A Step 1.

```bash
ssh ubuntu@<your-lightsail-ip>
```

### Step 2 — Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
```

### Step 3 — Install Nginx

```bash
sudo apt-get update && sudo apt-get install -y nginx certbot python3-certbot-nginx
```

### Step 4 — Upload project files

```bash
# From your local machine
scp -r /path/to/tiqkets ubuntu@<your-ip>:/opt/tiqkets
```

### Step 5 — Configure environment variables

```bash
cd /opt/tiqkets
cp .env.production.example .env
nano .env   # fill in your values (see variable reference below)
chmod 600 .env
```

#### Required variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `APP_DOMAIN` | Your domain without protocol, e.g. `tiqkets.example.com` |
| `EXPO_PUBLIC_DOMAIN` | Same as APP_DOMAIN |
| `ORG_SESSION_SECRET` | 64-char random hex — signs org session cookies |
| `SUPER_ADMIN_PORTAL_TOKEN` | Password-like token for the `/superadmin` portal |
| `SUPER_ADMIN_EMAIL` | Login email for the super admin dashboard |
| `SUPER_ADMIN_PASSWORD` | Login password for the super admin dashboard |

Generate secrets:
```bash
# ORG_SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# SUPER_ADMIN_PORTAL_TOKEN
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

#### Database options

**Option B1 — Bundled PostgreSQL** (simplest, runs in a container alongside the app):

```env
DATABASE_URL=postgresql://tiqkets:YOUR_DB_PASSWORD@db:5432/tiqkets
DB_PASSWORD=YOUR_DB_PASSWORD
```

**Option B2 — Lightsail Managed Database**:
1. Create a **PostgreSQL 16** database in Lightsail
2. Note the endpoint, port, username, and password
3. Set `DATABASE_URL=postgresql://USERNAME:PASSWORD@ENDPOINT:5432/tiqkets`
4. Use `docker-compose.external-db.yml` (no bundled postgres)

**Option B3 — Amazon RDS**:
1. Create an RDS PostgreSQL instance, ensure it's accessible from your Lightsail instance
2. Set `DATABASE_URL=postgresql://USERNAME:PASSWORD@RDS_ENDPOINT:5432/tiqkets`
3. Use `docker-compose.external-db.yml`

**Option B4 — Supabase / Neon / any hosted Postgres**:
1. Create a project, copy the connection string
2. Set `DATABASE_URL=<connection string>`
3. Use `docker-compose.external-db.yml`

### Step 6 — Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/tiqkets
```

Paste:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    client_max_body_size 20M;

    location / {
        proxy_pass         http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   X-Forwarded-Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/tiqkets /etc/nginx/sites-enabled/tiqkets
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### Step 7 — Set up HTTPS

```bash
sudo certbot --nginx -d yourdomain.com --email you@example.com --agree-tos --redirect
```

### Step 8 — Build and start

**With bundled PostgreSQL:**
```bash
docker compose -f docker-compose.yml up -d --build
```

**With external PostgreSQL:**
```bash
docker compose -f docker-compose.external-db.yml up -d --build
```

The container will:
1. Wait for the database to be reachable
2. Run all SQL migrations automatically
3. Start the Express server on port 5000

### Step 9 — Mobile app static bundles (optional but recommended)

For Expo Go users to scan a QR code and use the app, you need to build the static bundles **before** deploying, and run this step from your **development machine** (not the server):

```bash
APP_DOMAIN=yourdomain.com npm run expo:static:build
```

Then upload the generated `static-build/` folder to the server:
```bash
scp -r static-build ubuntu@<your-ip>:/opt/tiqkets/
```

Or include it in your git repository before deploying.

---

## Updating the application

```bash
cd /opt/tiqkets

# Pull latest code
git pull

# Rebuild and restart (migrations run automatically on next startup)
docker compose -f docker-compose.yml up -d --build
```

Or with external DB:
```bash
docker compose -f docker-compose.external-db.yml up -d --build
```

---

## Useful commands

```bash
# View live logs
docker compose -f docker-compose.yml logs -f

# Restart just the app (not the database)
docker compose -f docker-compose.yml restart app

# Open a shell inside the container
docker compose -f docker-compose.yml exec app sh

# Connect to the bundled postgres
docker compose -f docker-compose.yml exec db psql -U tiqkets

# Stop everything
docker compose -f docker-compose.yml down

# Stop and wipe database (DESTRUCTIVE)
docker compose -f docker-compose.yml down -v
```

---

## Database migrations

Migrations run **automatically every time the container starts**.  
The migration runner (`server/migrate.ts`) uses Drizzle ORM's migration system with the SQL files in the `migrations/` folder.

- First deploy: all tables are created from scratch
- Subsequent deploys: only new migrations are applied (already-applied ones are skipped)
- No manual SQL or `drizzle-kit` commands needed on the server

If you add new columns or tables to `shared/schema.ts` during development, regenerate the migration:
```bash
# On your development machine
DATABASE_URL=postgresql://... npx drizzle-kit generate
```
Then commit the new file in `migrations/` and redeploy.

---

## Lightsail Managed Database setup

If you prefer to keep the database separate from the application:

1. In Lightsail, go to **Databases → Create database**
2. Choose **PostgreSQL 16**, any plan
3. Note the **Endpoint**, **Port** (5432), **Username**, and **Password**
4. In Lightsail, **attach the database to your instance** (or set a VPC firewall rule allowing port 5432 from your instance IP)
5. Create the database:
   ```bash
   psql postgresql://USERNAME:PASSWORD@ENDPOINT:5432/postgres -c "CREATE DATABASE tiqkets;"
   ```
6. Set `DATABASE_URL=postgresql://USERNAME:PASSWORD@ENDPOINT:5432/tiqkets` in `.env`
7. Use `docker-compose.external-db.yml`

---

## Environment variable reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | `postgresql://user:pass@host:5432/dbname` |
| `APP_DOMAIN` | Yes | Domain without protocol (`tiqkets.example.com`) |
| `EXPO_PUBLIC_DOMAIN` | Yes | Same as APP_DOMAIN |
| `ALLOWED_ORIGINS` | Recommended | `https://yourdomain.com` |
| `ORG_SESSION_SECRET` | Yes | 64-char hex, signs session cookies |
| `SUPER_ADMIN_PORTAL_TOKEN` | Yes | Long random string — super admin access token |
| `SUPER_ADMIN_EMAIL` | Yes | Super admin login email |
| `SUPER_ADMIN_PASSWORD` | Yes | Super admin login password |
| `PORT` | No | Default: `5000` |
| `ZEPTOMAIL_SMTP_PASSWORD` | No | Enables email (OTP, billing reminders) |
| `ZEPTOMAIL_FROM_EMAIL` | No | From address for emails |
| `SUPPORT_EMAIL` | No | Support email shown in emails |
| `WHATSAPP_PHONE_NUMBER_ID` | No | Meta WhatsApp Business API |
| `WHATSAPP_ACCESS_TOKEN` | No | Meta WhatsApp Business API |
| `WHATSAPP_VERIFY_TOKEN` | No | Meta WhatsApp webhook token |
| `RAZORPAY_KEY_ID` | No | Razorpay payment gateway |
| `RAZORPAY_KEY_SECRET` | No | Razorpay payment gateway |

---

## Troubleshooting

**Container exits immediately:**
```bash
docker compose -f docker-compose.yml logs app
```
Common cause: `DATABASE_URL` wrong or DB not reachable. The migrate step will print a clear error.

**Database connection refused:**
- Bundled DB: make sure `db` service is healthy: `docker compose ps`
- External DB: verify the host/port/credentials and that the Lightsail firewall allows port 5432 from your instance

**Nginx shows 502 Bad Gateway:**
- App container hasn't started yet — wait 30s and refresh
- Check logs: `docker compose logs -f app`

**Mobile app can't connect:**
- Verify `APP_DOMAIN` / `EXPO_PUBLIC_DOMAIN` matches your actual domain
- HTTPS is required for Expo Go — make sure Certbot ran successfully
- Rebuild static bundles with the correct domain if they were built with the wrong one

**How to rebuild static bundles with new domain:**
```bash
# On development machine
APP_DOMAIN=newdomain.com npm run expo:static:build
# Upload static-build/ to server and restart
```

**Renewing SSL certificate:**
```bash
sudo certbot renew --dry-run   # test
sudo certbot renew             # renew
```
Certbot installs a cron job automatically — renewal happens without manual intervention.

---

## Project URL map

After deployment, the following URLs are available:

| URL | Description |
|-----|-------------|
| `https://yourdomain.com/` | Landing page + Expo Go QR code |
| `https://yourdomain.com/dashboard` | Organization web dashboard |
| `https://yourdomain.com/superadmin` | Super admin portal |
| `https://yourdomain.com/join/{branchId}` | Customer queue-join page |
| `https://yourdomain.com/reserve/{branchId}` | Customer reservation page |
| `https://yourdomain.com/api/*` | REST API endpoints |
