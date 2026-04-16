# Accès Multi-Utilisateur (IP Externe)

## Problème d'origine

`VITE_API_URL=http://localhost:4000` était compilé en dur dans le bundle JS.
Quand un utilisateur externe ouvrait l'app, son navigateur essayait de joindre
`localhost:4000` sur **sa propre machine** → connexion impossible.

## Solution appliquée : URL relative + proxy

Le frontend appelle maintenant `/api/...` (chemin relatif au lieu d'une URL absolue).
- En **développement** : Vite proxy (`vite.config.ts`) redirige `/api/*` → `http://localhost:4000`
- En **production** : Nginx (`nginx.conf`) redirige `/api/*` → `http://backend:4000`

Ainsi, peu importe l'IP ou le domaine depuis lequel l'utilisateur accède, les
appels API arrivent toujours au bon serveur.

---

## Mode Développement (réseau local / LAN)

```bash
# Terminal 1 - Backend
cd backend
npm install
node src/server.js
# → écoute sur 0.0.0.0:4000

# Terminal 2 - Frontend
npm install
npm run dev
# → écoute sur 0.0.0.0:5173 (host: "0.0.0.0" dans vite.config.ts)
```

Ou utiliser `start_dev.bat` sous Windows.

**Accès depuis d'autres machines sur le réseau :**
```
http://<VOTRE-IP-LOCALE>:5173
```
Trouvez votre IP locale avec `ipconfig` (Windows) ou `ip addr` (Linux/Mac).

---

## Mode Production (Docker Compose)

```bash
docker compose up --build -d
```

Le frontend est servi sur le **port 80**. Nginx proxy `/api/*` vers le backend.

**Accès :**
```
http://<IP-DU-SERVEUR>
```

Pour exposer sur Internet, configurez votre pare-feu pour ouvrir le port 80 (et
443 si vous ajoutez HTTPS/SSL).

---

## Sécurisation CORS (recommandé en production)

Dans `docker-compose.yml`, remplacer :
```yaml
- CORS_ORIGIN=*
```
Par votre domaine exact :
```yaml
- CORS_ORIGIN=https://votredomaine.com
```

---

## Fichiers modifiés

| Fichier | Modification |
|---|---|
| `.env.local` | `VITE_API_URL=` (vide) |
| `.env.production` | `VITE_API_URL=` (vide) |
| `src/lib/api.ts` | Fallback `''` au lieu de `http://localhost:4000` |
| `vite.config.ts` | `host: "0.0.0.0"` + `server.proxy` pour `/api` |
| `nginx.conf` | `location /api/` avec `proxy_pass http://backend:4000` |
| `docker-compose.yml` | Frontend port `80:80`, commentaires explicatifs |
| `start_dev.bat` | Info accès IP externe |
