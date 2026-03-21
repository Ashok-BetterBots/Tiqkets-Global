# TIQKETS - Deployment Guide

This guide covers how to export and deploy TIQKETS on your own server.

---

## Prerequisites

- **Node.js** 20+ (LTS recommended)
- **PostgreSQL** 14+ database
- **npm** (comes with Node.js)

---

## 1. Export the Project

Download or clone the entire project directory from Replit. You need all files and folders.

---

## 2. Install Dependencies

```bash
npm install
```

---

## 3. Configure Environment Variables

Copy the example environment file and edit it:

```bash
cp .env.example .env
```

Edit `.env` with your values:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string: `postgresql://user:pass@host:5432/tiqkets` |
| `APP_DOMAIN` | Yes | Your server domain (e.g., `yourdomain.com` or `localhost:5000` for local dev) |
| `PORT` | No | Server port (default: `5000`) |
| `EXPO_PUBLIC_DOMAIN` | Yes | Same as APP_DOMAIN. The mobile app uses this to reach the API server |
| `ALLOWED_ORIGINS` | No | Comma-separated allowed CORS origins (e.g., `https://yourdomain.com`) |
| `WHATSAPP_PHONE_NUMBER_ID` | No | WhatsApp Business API phone number ID |
| `WHATSAPP_ACCESS_TOKEN` | No | WhatsApp Business API access token |
| `WHATSAPP_VERIFY_TOKEN` | No | WhatsApp webhook verification token |
| `RAZORPAY_KEY_ID` | No | Razorpay payment gateway key |
| `RAZORPAY_KEY_SECRET` | No | Razorpay payment gateway secret |

---

## 4. Set Up the Database

Create a PostgreSQL database:

```bash
createdb tiqkets
```

Push the schema to the database:

```bash
npm run db:push
```

This creates all required tables automatically using Drizzle ORM.

---

## 5. Running in Development

Start both the backend and frontend dev servers:

**Terminal 1 - Backend:**
```bash
EXPO_PUBLIC_DOMAIN=localhost:5000 npm run server:dev
```

**Terminal 2 - Expo Dev Server (for mobile app development):**
```bash
EXPO_PUBLIC_DOMAIN=localhost:5000 npx expo start
```

The backend serves on port 5000. The Expo dev server runs on port 8081.

- **Web dashboard**: http://localhost:5000/dashboard
- **Mobile app (web)**: http://localhost:8081
- **Mobile app (device)**: Scan QR code from Expo CLI with Expo Go app

---

## 6. Building for Production

### Step 1: Build the server

```bash
npm run server:build
```

This compiles the TypeScript server into `server_dist/index.js`.

### Step 2: Build the Expo static bundles

```bash
APP_DOMAIN=yourdomain.com npm run expo:static:build
```

This creates pre-built iOS/Android bundles in `static-build/` so the mobile app works without a running Metro server.

### Step 3: Start the production server

```bash
NODE_ENV=production \
DATABASE_URL=postgresql://user:pass@host:5432/tiqkets \
APP_DOMAIN=yourdomain.com \
EXPO_PUBLIC_DOMAIN=yourdomain.com \
npm run server:prod
```

The production server serves:
- API endpoints at `/api/*`
- Web dashboard at `/dashboard`
- QR join page at `/join/{branchId}`
- Reservation page at `/reserve/{branchId}`
- Landing page at `/`
- Static Expo bundles for mobile app via Expo Go

---

## 7. Production Deployment Options

### Option A: Using PM2 (recommended)

```bash
npm install -g pm2

pm2 start server_dist/index.js \
  --name tiqkets \
  --env NODE_ENV=production

pm2 save
pm2 startup
```

### Option B: Using systemd

Create `/etc/systemd/system/tiqkets.service`:

```ini
[Unit]
Description=TIQKETS Queue Management
After=network.target postgresql.service

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/tiqkets
EnvironmentFile=/path/to/tiqkets/.env
ExecStart=/usr/bin/node server_dist/index.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl enable tiqkets
sudo systemctl start tiqkets
```

### Option C: Using Docker

Create a `Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run server:build

EXPOSE 5000
ENV NODE_ENV=production
CMD ["node", "server_dist/index.js"]
```

Build and run:
```bash
docker build -t tiqkets .
docker run -d \
  --name tiqkets \
  -p 5000:5000 \
  --env-file .env \
  tiqkets
```

---

## 8. Reverse Proxy (Nginx)

For HTTPS, set up Nginx as a reverse proxy:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Get SSL certificates with Let's Encrypt:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## 9. Mobile App via Expo Go

After deploying, users can access the mobile app by:

1. Installing **Expo Go** on their phone (iOS or Android)
2. Opening `https://yourdomain.com` in a browser
3. Scanning the QR code shown on the landing page

The app connects to your server automatically using the domain configured in the static build.

---

## 10. WhatsApp Integration

To enable WhatsApp notifications:

1. Create a Meta Business account at https://business.facebook.com
2. Set up WhatsApp Business API through Meta Cloud API
3. Create a phone number and get the Phone Number ID
4. Generate a permanent access token
5. Set the webhook URL to: `https://yourdomain.com/api/whatsapp/webhook`
6. Configure the environment variables: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`

---

## Project Structure

```
tiqkets/
├── client/              # React Native / Expo mobile app
│   ├── components/      # Reusable UI components
│   ├── contexts/        # React Context providers
│   ├── lib/             # Utilities (API client, etc.)
│   ├── navigation/      # React Navigation setup
│   └── screens/         # App screens
├── server/              # Express.js backend
│   ├── index.ts         # Server entry point
│   ├── routes.ts        # API routes
│   ├── db.ts            # Database connection
│   ├── storage.ts       # Data access layer
│   ├── notifications.ts # Push notification logic
│   ├── whatsapp.ts      # WhatsApp integration
│   ├── templates/       # HTML templates (dashboard, landing page)
│   └── uploads/         # User-uploaded files
├── shared/
│   └── schema.ts        # Database schema (Drizzle ORM)
├── scripts/
│   └── build.js         # Static Expo build script
├── assets/              # App icons, splash screens, images
├── static-build/        # Generated static bundles (after build)
├── drizzle.config.ts    # Database migration config
├── app.json             # Expo app configuration
├── package.json         # Dependencies and scripts
└── .env.example         # Environment variable template
```

---

## Troubleshooting

**Database connection fails:**
- Verify `DATABASE_URL` is correct
- Ensure PostgreSQL is running and accessible
- Check that the database exists: `psql -l`

**Mobile app can't connect to server:**
- Verify `EXPO_PUBLIC_DOMAIN` / `APP_DOMAIN` matches your actual server domain
- Ensure HTTPS is configured (Expo Go requires HTTPS for production)
- Check CORS settings in `ALLOWED_ORIGINS`

**Static build fails:**
- Ensure Metro bundler can start (port 8081 must be free)
- Check that `APP_DOMAIN` is set before running the build
- Try clearing caches: `rm -rf node_modules/.cache .metro-cache`

**WhatsApp notifications not sending:**
- Verify all three WhatsApp env vars are set
- Check Meta Business API dashboard for error logs
- Ensure webhook URL is correctly configured
