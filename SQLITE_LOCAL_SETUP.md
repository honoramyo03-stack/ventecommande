# Setup Local SQLite (Option B)

Ce projet fonctionne en mode API + SQLite pour toutes les donnees partagees.

## 1. Lancer le backend SQLite

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Le backend doit repondre sur:

```text
http://localhost:4000/health
```

## 2. Configurer le front local

Creer `.env.local` a la racine du projet front:

```env
VITE_API_BASE_URL=http://localhost:4000
VITE_PAYMENT_API_URL=http://localhost:4000
```

Puis lancer le front:

```bash
npm install
npm run dev
```

## 3. Tests rapides avant installation plateforme locale

1. Login client (table libre)
2. Table occupee devient non cliquable sur un autre appareil
3. Creation commande
4. Stock diminue
5. Vendeur voit la commande en temps quasi reel
6. Chat client/vendeur fonctionne

## 4. Notes importantes

- Les donnees partagees n'utilisent pas le localStorage comme source principale.
- SQLite est stocke dans `backend/data/app.db`.
- Si vous voulez repartir propre:

```bash
rm backend/data/app.db
```

Au redemarrage du backend, les tables + seeds sont recrees.