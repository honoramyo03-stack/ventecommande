#!/usr/bin/env bash
set -e
RESET="\033[0m"; GREEN="\033[32m"; CYAN="\033[36m"; BOLD="\033[1m"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/backend"

echo -e "${BOLD}▶ QuickOrder — Backend uniquement${RESET}"
echo ""

if [ ! -d "node_modules" ]; then
  echo -e "${CYAN}▶ Installation des dépendances...${RESET}"
  npm install
fi

echo -e "${GREEN}✔  API sur http://localhost:4000${RESET}"
echo -e "${GREEN}✔  Health : http://localhost:4000/health${RESET}"
echo ""
node src/server.js
