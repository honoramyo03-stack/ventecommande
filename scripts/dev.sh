#!/usr/bin/env bash
set -e
RESET="\033[0m"; GREEN="\033[32m"; YELLOW="\033[33m"; CYAN="\033[36m"; BOLD="\033[1m"

echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║   QuickOrder — Mode Développement         ║${RESET}"
echo -e "${BOLD}╚═══════════════════════════════════════════╝${RESET}"
echo ""

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Vérifier Node.js
if ! command -v node &>/dev/null; then
  echo -e "${YELLOW}⚠  Node.js non trouvé. Installez-le depuis https://nodejs.org${RESET}"
  exit 1
fi
echo -e "${GREEN}✔  Node.js $(node -v)${RESET}"

# Installer les dépendances si nécessaire
if [ ! -d "node_modules" ]; then
  echo -e "${CYAN}▶ Installation des dépendances frontend...${RESET}"
  npm install
fi
if [ ! -d "backend/node_modules" ]; then
  echo -e "${CYAN}▶ Installation des dépendances backend...${RESET}"
  cd backend && npm install && cd ..
fi

# Créer le fichier .env si absent
if [ ! -f ".env.local" ]; then
  echo "VITE_API_URL=" > .env.local
  echo -e "${CYAN}▶ .env.local créé${RESET}"
fi

# Lancer backend en arrière-plan
echo -e "${CYAN}▶ Démarrage backend (port 4000)...${RESET}"
cd backend
node src/server.js &
BACKEND_PID=$!
cd ..

# Attendre que le backend réponde
echo -e "${CYAN}▶ Attente du backend...${RESET}"
for i in $(seq 1 15); do
  if curl -sf http://localhost:4000/health &>/dev/null; then
    echo -e "${GREEN}✔  Backend prêt${RESET}"
    break
  fi
  sleep 1
done

# Lancer frontend
echo -e "${CYAN}▶ Démarrage frontend (port 5173)...${RESET}"
echo ""
echo -e "${BOLD}════════════════════════════════════════════${RESET}"
echo -e "  ${GREEN}Frontend${RESET} : http://localhost:5173"
echo -e "  ${GREEN}Backend ${RESET} : http://localhost:4000/api"
echo -e "  ${CYAN}Accès LAN${RESET} : http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo '<votre-IP>'):5173"
echo -e "  Vendeur   : admin / password"
echo -e "${BOLD}════════════════════════════════════════════${RESET}"
echo ""

# Trap pour tuer le backend à la sortie
trap "kill $BACKEND_PID 2>/dev/null; echo -e '\n${GREEN}Serveurs arrêtés${RESET}'" EXIT INT TERM

npm run dev
