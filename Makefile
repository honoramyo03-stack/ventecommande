# ═══════════════════════════════════════════════════════════════
#  QuickOrder — Makefile
#  Usage : make <target>
# ═══════════════════════════════════════════════════════════════

.PHONY: help install dev prod prod-full frontend backend stop clean logs logs-backend logs-frontend status

# ── Couleurs ──────────────────────────────────────────────────
BOLD  := \033[1m
GREEN := \033[32m
CYAN  := \033[36m
RESET := \033[0m

help: ## Afficher l'aide
	@echo ""
	@echo "$(BOLD)╔══════════════════════════════════════╗$(RESET)"
	@echo "$(BOLD)║        QuickOrder — Commandes        ║$(RESET)"
	@echo "$(BOLD)╚══════════════════════════════════════╝$(RESET)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(CYAN)%-20s$(RESET) %s\n", $$1, $$2}'
	@echo ""

# ── Installation ──────────────────────────────────────────────
install: ## Installer toutes les dépendances (frontend + backend)
	@echo "$(GREEN)▶ Installation frontend...$(RESET)"
	npm install
	@echo "$(GREEN)▶ Installation backend...$(RESET)"
	cd backend && npm install
	@echo "$(GREEN)✅ Dépendances installées$(RESET)"

# ── Développement ─────────────────────────────────────────────
dev: ## Démarrer en mode développement (backend + frontend)
	@echo "$(GREEN)▶ Démarrage en mode développement...$(RESET)"
	@bash scripts/dev.sh

backend: ## Démarrer uniquement le backend
	@echo "$(GREEN)▶ Backend sur :4000$(RESET)"
	cd backend && node src/server.js

frontend: ## Démarrer uniquement le frontend (dev)
	@echo "$(GREEN)▶ Frontend sur :5173$(RESET)"
	npm run dev

# ── Build ─────────────────────────────────────────────────────
build: ## Compiler le frontend pour la production
	@echo "$(GREEN)▶ Build frontend...$(RESET)"
	npm run build
	@echo "$(GREEN)✅ Build dans ./dist$(RESET)"

# ── Production (Docker) ───────────────────────────────────────
prod: ## Démarrer en production avec Docker Compose
	@echo "$(GREEN)▶ Démarrage production (Docker)...$(RESET)"
	@bash scripts/prod.sh

prod-build: ## Rebuild et démarrer en production
	@echo "$(GREEN)▶ Build + démarrage production...$(RESET)"
	docker compose up --build -d
	@echo "$(GREEN)✅ Application disponible sur http://localhost$(RESET)"

prod-full: ## Build complet + démarrage production
	@bash scripts/prod-full.sh

# ── Gestion Docker ────────────────────────────────────────────
stop: ## Arrêter tous les containers
	docker compose down

restart: ## Redémarrer les containers
	docker compose restart

logs: ## Afficher tous les logs Docker
	docker compose logs -f

logs-backend: ## Logs du backend uniquement
	docker compose logs -f backend

logs-frontend: ## Logs du frontend (nginx) uniquement
	docker compose logs -f frontend

status: ## Statut des containers
	docker compose ps

# ── Nettoyage ─────────────────────────────────────────────────
clean: ## Supprimer les artifacts de build
	rm -rf dist node_modules backend/node_modules
	@echo "$(GREEN)✅ Nettoyé$(RESET)"

clean-docker: ## Supprimer containers, images et volumes
	docker compose down -v --rmi all
	@echo "$(GREEN)✅ Docker nettoyé$(RESET)"

# ── Déploiement ───────────────────────────────────────────────
deploy-check: ## Vérifier les pré-requis de déploiement
	@bash scripts/deploy-check.sh
