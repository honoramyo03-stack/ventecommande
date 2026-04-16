#!/usr/bin/env bash
set -e
RESET="\033[0m"; GREEN="\033[32m"; CYAN="\033[36m"; YELLOW="\033[33m"; BOLD="\033[1m"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo -e "${BOLD}▶ QuickOrder — Frontend uniquement${RESET}"
echo ""

# Vérifier que le backend tourne
if ! curl -sf http://localhost:4000/health &>/dev/null; then
  echo -e "${YELLOW}⚠  Le backend ne répond pas sur :4000.${RESET}"
  echo -e "   Démarrez-le d'abord : cd backend && node src/server.js"
  echo ""
fi

if [ ! -d "node_modules" ]; then
  echo -e "${CYAN}▶ Installation des dépendances...${RESET}"
  npm install
fi

echo -e "${CYAN}▶ Démarrage du frontend...${RESET}"
echo -e "  ${GREEN}URL${RESET} : http://localhost:5173"
echo -e "  ${CYAN}LAN${RESET} : http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo '<IP>'):5173"
echo ""
npm run dev
