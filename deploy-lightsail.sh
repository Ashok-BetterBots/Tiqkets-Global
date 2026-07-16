#!/bin/bash
# =============================================================
# TIQKETS — AWS Lightsail One-Click Setup Script
# Run this on a fresh Lightsail Ubuntu 22.04 instance
# Usage:  bash deploy-lightsail.sh
# =============================================================

set -e

TIQKETS_DIR="/opt/tiqkets"
NGINX_CONF="/etc/nginx/sites-available/tiqkets"

# ── Colours ──────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ── Root check ────────────────────────────────────────────────
[ "$EUID" -ne 0 ] && error "Please run as root: sudo bash deploy-lightsail.sh"

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║         TIQKETS — Lightsail Setup          ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# ── 1. Collect configuration ──────────────────────────────────
read -rp "Your domain name (e.g. tiqkets.example.com): " DOMAIN
[ -z "$DOMAIN" ] && error "Domain is required."

read -rp "Use external PostgreSQL? (y/N): " USE_EXTERNAL_DB
USE_EXTERNAL_DB="${USE_EXTERNAL_DB,,}"

if [[ "$USE_EXTERNAL_DB" == "y" ]]; then
  read -rp "PostgreSQL connection URL (postgresql://user:pass@host:5432/db): " DATABASE_URL
  [ -z "$DATABASE_URL" ] && error "DATABASE_URL is required for external DB."
  COMPOSE_FILE="docker-compose.external-db.yml"
else
  read -rsp "PostgreSQL password for bundled DB [default: auto-generated]: " DB_PASSWORD
  echo ""
  if [ -z "$DB_PASSWORD" ]; then
    DB_PASSWORD=$(openssl rand -hex 24)
    warn "Generated DB password: $DB_PASSWORD  (saved to .env)"
  fi
  DATABASE_URL="postgresql://tiqkets:${DB_PASSWORD}@db:5432/tiqkets"
  COMPOSE_FILE="docker-compose.yml"
fi

read -rsp "ORG_SESSION_SECRET (64-char hex, blank = auto-generate): " ORG_SESSION_SECRET
echo ""
if [ -z "$ORG_SESSION_SECRET" ]; then
  ORG_SESSION_SECRET=$(openssl rand -hex 32)
  warn "Generated ORG_SESSION_SECRET (saved to .env)"
fi

read -rsp "SUPER_ADMIN_PORTAL_TOKEN (blank = auto-generate): " SUPER_ADMIN_PORTAL_TOKEN
echo ""
if [ -z "$SUPER_ADMIN_PORTAL_TOKEN" ]; then
  SUPER_ADMIN_PORTAL_TOKEN=$(openssl rand -hex 24)
  warn "Generated SUPER_ADMIN_PORTAL_TOKEN (saved to .env)"
fi

read -rp "Super Admin email [admin@${DOMAIN}]: " SUPER_ADMIN_EMAIL
SUPER_ADMIN_EMAIL="${SUPER_ADMIN_EMAIL:-admin@${DOMAIN}}"

read -rsp "Super Admin password: " SUPER_ADMIN_PASSWORD
echo ""
[ -z "$SUPER_ADMIN_PASSWORD" ] && error "Super Admin password is required."

read -rp "ZEPTOMAIL_SMTP_PASSWORD (blank = skip email): " ZEPTOMAIL_SMTP_PASSWORD
echo ""

read -rp "Setup HTTPS with Let's Encrypt? (Y/n): " SETUP_SSL
SETUP_SSL="${SETUP_SSL,,}"
SETUP_SSL="${SETUP_SSL:-y}"

read -rp "Your email for SSL certificate notifications: " SSL_EMAIL

echo ""
info "Installing system packages..."
apt-get update -qq
apt-get install -y -qq \
  curl ca-certificates gnupg lsb-release \
  nginx certbot python3-certbot-nginx \
  openssl ufw 2>/dev/null
success "System packages installed."

# ── 2. Install Docker ─────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  info "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  usermod -aG docker ubuntu 2>/dev/null || true
  success "Docker installed."
else
  success "Docker already installed."
fi

if ! command -v docker &>/dev/null || ! docker compose version &>/dev/null 2>&1; then
  info "Installing Docker Compose plugin..."
  apt-get install -y -qq docker-compose-plugin
fi
success "Docker Compose ready."

# ── 3. Copy project files ─────────────────────────────────────
info "Setting up application directory at $TIQKETS_DIR ..."
mkdir -p "$TIQKETS_DIR"

# If this script is in the project root, copy everything
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/docker-compose.yml" ]; then
  cp -r "$SCRIPT_DIR"/. "$TIQKETS_DIR/"
  success "Project files copied."
else
  warn "Run this script from the TIQKETS project root directory."
  warn "Expected docker-compose.yml alongside this script."
fi

cd "$TIQKETS_DIR"

# ── 4. Write .env ─────────────────────────────────────────────
info "Writing .env file..."
cat > .env <<EOF
DATABASE_URL=${DATABASE_URL}
DB_PASSWORD=${DB_PASSWORD:-}
APP_DOMAIN=${DOMAIN}
EXPO_PUBLIC_DOMAIN=${DOMAIN}
ALLOWED_ORIGINS=https://${DOMAIN}
PORT=5000
NODE_ENV=production
ORG_SESSION_SECRET=${ORG_SESSION_SECRET}
SUPER_ADMIN_PORTAL_TOKEN=${SUPER_ADMIN_PORTAL_TOKEN}
SUPER_ADMIN_EMAIL=${SUPER_ADMIN_EMAIL}
SUPER_ADMIN_PASSWORD=${SUPER_ADMIN_PASSWORD}
ZEPTOMAIL_SMTP_PASSWORD=${ZEPTOMAIL_SMTP_PASSWORD}
ZEPTOMAIL_FROM_EMAIL=noreply@${DOMAIN}
SUPPORT_EMAIL=support@${DOMAIN}
EOF
chmod 600 .env
success ".env written (permissions: 600)"

# ── 5. Configure firewall ─────────────────────────────────────
info "Configuring firewall..."
ufw allow OpenSSH
ufw allow "Nginx Full"
ufw --force enable
success "Firewall configured."

# ── 6. Nginx reverse proxy ────────────────────────────────────
info "Writing Nginx configuration..."
cat > "$NGINX_CONF" <<NGINX
server {
    listen 80;
    server_name ${DOMAIN};

    client_max_body_size 20M;

    location / {
        proxy_pass         http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_set_header   X-Forwarded-Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 120s;
    }
}
NGINX

ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/tiqkets
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
success "Nginx configured."

# ── 7. SSL with Certbot ───────────────────────────────────────
if [[ "$SETUP_SSL" != "n" ]]; then
  info "Requesting SSL certificate for $DOMAIN ..."
  if [ -n "$SSL_EMAIL" ]; then
    certbot --nginx -d "$DOMAIN" --non-interactive \
      --agree-tos --email "$SSL_EMAIL" --redirect || \
      warn "SSL setup failed — run 'sudo certbot --nginx -d $DOMAIN' manually."
  else
    warn "No email provided — skipping automatic SSL. Run certbot manually."
  fi
  success "SSL configured."
fi

# ── 8. Build and start Docker containers ──────────────────────
info "Building Docker image (this takes a few minutes)..."
docker compose -f "$COMPOSE_FILE" build --no-cache

info "Starting services..."
docker compose -f "$COMPOSE_FILE" up -d

# ── 9. Done ───────────────────────────────────────────────────
echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║              TIQKETS is now running!                  ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
success "Dashboard:   https://${DOMAIN}/dashboard"
success "Landing:     https://${DOMAIN}/"
success "Admin:       https://${DOMAIN}/superadmin"
echo ""
echo "Useful commands:"
echo "  cd $TIQKETS_DIR"
echo "  docker compose -f $COMPOSE_FILE logs -f        # view logs"
echo "  docker compose -f $COMPOSE_FILE restart app    # restart app"
echo "  docker compose -f $COMPOSE_FILE pull && docker compose -f $COMPOSE_FILE up -d  # update"
echo ""
warn "Store your .env file securely — it contains your secrets."
warn "Secrets file: $TIQKETS_DIR/.env"
