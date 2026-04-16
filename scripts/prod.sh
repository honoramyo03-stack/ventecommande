#!/usr/bin/env bash
set -e
RESET="\033[0m"; GREEN="\033[32m"; YELLOW="\033[33m"; CYAN="\033[36m"; BOLD="\033[1m"

echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║   QuickOrder — Mode Production (Docker)   ║${RESET}"
echo -e "${BOLD}╚═══════════════════════════════════════════╝${RESET}"
echo ""

# Vérifier Docker
if ! command -v docker &>/dev/null; then
  echo -e "${YELLOW}⚠  Docker non trouvé. Installez-le depuis https://docs.docker.com/get-docker/${RESET}"
  exit 1
fi
if ! docker compose version &>/dev/null; then
  echo -e "${YELLOW}⚠  Docker Compose non trouvé (v2 requis).${RESET}"
  exit 1
fi
echo -e "${GREEN}✔  Docker $(docker --version | awk '{print $3}' | tr -d ',')${RESET}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo -e "${CYAN}▶ Démarrage des containers...${RESET}"
docker compose up -d

echo -e "${CYAN}▶ Attente de la santé des services...${RESET}"
for i in $(seq 1 30); do
  if docker compose ps | grep -q "healthy"; then
    break
  fi
  sleep 2
done

echo ""
echo -e "${BOLD}════════════════════════════════════════════${RESET}"
IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo '<votre-IP>')
echo -e "  ${GREEN}Application${RESET} : http://localhost"
echo -e "  ${CYAN}Accès réseau${RESET} : http://${IP}"
echo -e "  Vendeur     : admin / password"
echo -e "${BOLD}════════════════════════════════════════════${RESET}"
echo ""
echo -e "  Logs  : docker compose logs -f"
echo -e "  Stop  : docker compose down"
echo ""
