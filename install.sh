#!/usr/bin/env bash
# ============================================================
#  LM Studio Pocket — One-command installer
#  Installs npm dependencies + SearXNG (Docker) web search
# ============================================================
set -euo pipefail

# ── Colors ───────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; }

# ── 1. Check prerequisites ──────────────────────────────────
echo -e "\n${BOLD}🚀 LM Studio Pocket — Installer${NC}\n"

MISSING=0

if ! command -v node &>/dev/null; then
    err "Node.js is not installed. Install it from https://nodejs.org/"
    MISSING=1
fi

if ! command -v npm &>/dev/null; then
    err "npm is not installed. It comes bundled with Node.js — install Node.js first."
    MISSING=1
fi

if ! command -v docker &>/dev/null; then
    err "Docker is not installed."
    echo -e "       Install it following the official guide:"
    echo -e "       ${CYAN}https://docs.docker.com/engine/install/${NC}"
    MISSING=1
fi

if [ "$MISSING" -eq 1 ]; then
    echo ""
    err "Please install the missing dependencies above and re-run this script."
    exit 1
fi

ok "Node.js $(node -v) detected"
ok "npm $(npm -v) detected"
ok "Docker $(docker --version | awk '{print $3}' | tr -d ',') detected"

# Check Docker daemon is running
if ! docker info &>/dev/null; then
    err "Docker daemon is not running. Please start Docker and re-run this script."
    echo -e "       Try: ${CYAN}sudo systemctl start docker${NC}"
    exit 1
fi
ok "Docker daemon is running"

# ── 2. Install npm dependencies ─────────────────────────────
echo ""
info "Installing npm dependencies..."
npm install --legacy-peer-deps
ok "npm dependencies installed"

# ── 3. Auto-detect LAN IP ───────────────────────────────────
LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}' || echo "")

if [ -z "$LAN_IP" ]; then
    warn "Could not auto-detect your LAN IP. Using localhost."
    LAN_IP="localhost"
fi
ok "Detected LAN IP: ${LAN_IP}"

# ── 4. Create / update .env ─────────────────────────────────
ENV_FILE=".env"
echo "VITE_SERVER_URL=http://${LAN_IP}:1234" > "$ENV_FILE"
ok "Created ${ENV_FILE} → VITE_SERVER_URL=http://${LAN_IP}:1234"
echo -e "   ${YELLOW}(Change the IP/port in .env if your LM Studio runs on a different address)${NC}"

# ── 5. Configure & start SearXNG (Docker) ───────────────────
SEARXNG_DIR="./searxng"
SEARXNG_SETTINGS="$SEARXNG_DIR/settings.yml"
CONTAINER_NAME="searxng-pocket"
SEARXNG_PORT=8080

info "Setting up SearXNG..."

mkdir -p "$SEARXNG_DIR"

# Create SearXNG settings with JSON output enabled
cat > "$SEARXNG_SETTINGS" << 'SETTINGS_EOF'
# SearXNG settings for LM Studio Pocket
use_default_settings: true

search:
  formats:
    - html
    - json

server:
  secret_key: "lm-studio-pocket-searxng-key"
  limiter: false
  image_proxy: true
  port: 8080
  bind_address: "0.0.0.0"
SETTINGS_EOF

ok "SearXNG configuration written to ${SEARXNG_SETTINGS}"

# Stop & remove existing container if it exists
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    info "Removing existing SearXNG container..."
    docker rm -f "$CONTAINER_NAME" &>/dev/null || true
fi

info "Pulling SearXNG Docker image..."
docker pull docker.io/searxng/searxng:latest

info "Starting SearXNG container on port ${SEARXNG_PORT}..."
docker run -d \
    --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    -p "${SEARXNG_PORT}:8080" \
    -v "$(pwd)/${SEARXNG_DIR}/settings.yml:/etc/searxng/settings.yml:ro" \
    docker.io/searxng/searxng:latest

# Wait a moment for the container to start
sleep 2

if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    ok "SearXNG is running on http://localhost:${SEARXNG_PORT}"
else
    warn "SearXNG container may not have started correctly. Check with: docker logs ${CONTAINER_NAME}"
fi

# ── 6. Configure & start Crawl4AI (Docker) ───────────────────
CRAWL4AI_CONTAINER="crawl4ai-pocket"
CRAWL4AI_PORT=11235

info "Setting up Crawl4AI..."

if docker ps -a --format '{{.Names}}' | grep -q "^${CRAWL4AI_CONTAINER}$"; then
    info "Removing existing Crawl4AI container..."
    docker rm -f "$CRAWL4AI_CONTAINER" &>/dev/null || true
fi

info "Pulling Crawl4AI Docker image..."
docker pull unclecode/crawl4ai:latest

info "Starting Crawl4AI container on port ${CRAWL4AI_PORT}..."
docker run -d \
    --name "$CRAWL4AI_CONTAINER" \
    --restart unless-stopped \
    --shm-size=1g \
    -p "${CRAWL4AI_PORT}:11235" \
    unclecode/crawl4ai:latest

# Wait a moment for the container to start
sleep 2

if docker ps --format '{{.Names}}' | grep -q "^${CRAWL4AI_CONTAINER}$"; then
    ok "Crawl4AI is running on http://localhost:${CRAWL4AI_PORT}"
else
    warn "Crawl4AI container may not have started correctly. Check with: docker logs ${CRAWL4AI_CONTAINER}"
fi

# ── 7. Summary ──────────────────────────────────────────────
echo ""
echo -e "${BOLD}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  ✅ Installation complete!${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}SearXNG${NC}  → http://localhost:${SEARXNG_PORT}"
echo -e "  ${BOLD}Crawl4AI${NC} → http://localhost:${CRAWL4AI_PORT}"
echo -e "  ${BOLD}.env${NC}     → VITE_SERVER_URL=http://${LAN_IP}:1234"
echo ""
echo -e "  ${BOLD}Next steps:${NC}"
echo -e "  1. Make sure ${CYAN}LM Studio${NC} is running on your PC (port 1234)"
echo -e "  2. Start the app:"
echo -e "     ${CYAN}npm run dev${NC}"
echo -e "  3. Open ${CYAN}http://${LAN_IP}:5173${NC} on your phone"
echo -e "  4. Enable ${CYAN}Web Search${NC} and ${CYAN}Crawl4AI${NC} in Settings to use SearXNG and Crawl4AI"
echo ""
