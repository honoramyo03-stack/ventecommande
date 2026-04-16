#!/usr/bin/env bash
RESET="\033[0m"; GREEN="\033[32m"; RED="\033[31m"; YELLOW="\033[33m"; BOLD="\033[1m"
OK=0; WARN=0; FAIL=0

check_ok()   { echo -e "  ${GREEN}✔${RESET}  $1"; ((OK++)); }
check_warn() { echo -e "  ${YELLOW}⚠${RESET}  $1"; ((WARN++)); }
check_fail() { echo -e "  ${RED}✗${RESET}  $1"; ((FAIL++)); }

echo ""
echo -e "${BOLD}═══════════════════════════════════════════${RESET}"
echo -e "${BOLD}  QuickOrder — Vérification déploiement    ${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════${RESET}"
echo ""

# Node.js
if command -v node &>/dev/null; then
  check_ok "Node.js $(node -v)"
else
  check_fail "Node.js non trouvé"
fi

# Docker
if command -v docker &>/dev/null; then
  check_ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"
else
  check_warn "Docker non trouvé (requis pour la production)"
fi

# Docker Compose v2
if docker compose version &>/dev/null; then
  check_ok "Docker Compose v2"
elif command -v docker-compose &>/dev/null; then
  check_warn "docker-compose v1 détecté (préférer Compose v2)"
else
  check_warn "Docker Compose non trouvé"
fi

# Fichiers clés
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
for f in "docker-compose.yml" "Dockerfile.frontend" "backend/Dockerfile" "nginx.conf" "vite.config.ts"; do
  [ -f "$ROOT_DIR/$f" ] && check_ok "$f présent" || check_fail "$f manquant"
done

# Port 80 libre
if ! ss -tlnp 2>/dev/null | grep -q ':80 '; then
  check_ok "Port 80 disponible"
else
  check_warn "Port 80 déjà utilisé (modifiez docker-compose.yml)"
fi

# Port 4000 libre
if ! ss -tlnp 2>/dev/null | grep -q ':4000 '; then
  check_ok "Port 4000 disponible"
else
  check_warn "Port 4000 déjà utilisé"
fi

echo ""
echo -e "${BOLD}Résultat :${RESET} ${GREEN}${OK} OK${RESET}  ${YELLOW}${WARN} avertissements${RESET}  ${RED}${FAIL} erreurs${RESET}"
[ $FAIL -eq 0 ] && echo -e "${GREEN}✅ Prêt pour le déploiement${RESET}" || echo -e "${RED}✗  Corrigez les erreurs avant de continuer${RESET}"
echo ""
