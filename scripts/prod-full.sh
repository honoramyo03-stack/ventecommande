#!/usr/bin/env bash
set -e
RESET="\033[0m"; GREEN="\033[32m"; CYAN="\033[36m"; BOLD="\033[1m"

echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║   QuickOrder — Build complet + Production Docker  ║${RESET}"
echo -e "${BOLD}╚═══════════════════════════════════════════════════╝${RESET}"
echo ""

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo -e "${CYAN}[1/3] Stop des containers existants...${RESET}"
docker compose down 2>/dev/null || true

echo -e "${CYAN}[2/3] Build des images Docker...${RESET}"
docker compose build --no-cache

echo -e "${CYAN}[3/3] Démarrage des containers...${RESET}"
docker compose up -d

IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo '<votre-IP>')
echo ""
echo -e "${BOLD}════════════════════════════════════════════${RESET}"
echo -e "  ${GREEN}✅ Application démarrée${RESET}"
echo -e "  URL locale  : http://localhost"
echo -e "  URL réseau  : http://${IP}"
echo -e "  Vendeur     : admin / password"
echo -e "${BOLD}════════════════════════════════════════════${RESET}"
echo ""
