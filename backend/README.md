## SQLite Backend (Orders + Chat + Payments)

This backend replaces Supabase and stores all application data in SQLite.
It also provides an in-site automatic payment simulation endpoint.

## Core Endpoints

- `GET /api/stream` (SSE realtime events)
- `GET /api/products`
- `POST /api/products`
- `PATCH /api/products/:id`
- `DELETE /api/products/:id`
- `GET /api/orders`
- `POST /api/orders`
- `PATCH /api/orders/:id/status`
- `GET /api/messages`
- `POST /api/messages`
- `GET /api/connected-clients`
- `POST /api/connected-clients/reserve`
- `PATCH /api/connected-clients/activity`
- `DELETE /api/connected-clients/:tableNumber?name=...`
- `GET /api/payment-numbers`
- `PUT /api/payment-numbers/:provider`
- `GET /api/seller-accounts`
- `POST /api/seller-accounts`
- `PATCH /api/seller-accounts/:username`
- `DELETE /api/seller-accounts/:username`
- `GET /api/categories`
- `POST /api/categories`
- `PATCH /api/categories/:id`
- `DELETE /api/categories/:id`
- `GET /api/settings`
- `PATCH /api/settings`
- `POST /api/payments/initiate`
- `GET /api/payments/:transactionId/status`
- `GET /health`

## Local start

1. Copy `.env.example` to `.env`.
2. Fill values.
3. Install and run:

```bash
cd backend
npm install
npm run dev
```

## Render deployment (exact)

1. Push project to GitHub.
2. On Render: New + > Web Service.
3. Select repo.
4. Configure:
- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`
5. Add environment variables (from `.env.example`).
6. Deploy.

## Railway deployment (exact)

1. New Project > Deploy from GitHub.
2. Select repo.
3. Set Root Directory to `backend`.
4. Railway reads `backend/railway.json`.
5. Add environment variables (from `.env.example`).
6. Deploy.

## Copy/paste .env (template)

```env
PORT=4000
SQLITE_PATH=./data/app.db

CORS_ORIGIN=https://your-frontend.vercel.app,http://localhost:5173
```

## Frontend config after backend deploy

Set in frontend env:

```env
VITE_API_BASE_URL=https://your-backend-domain.onrender.com
VITE_PAYMENT_API_URL=https://your-backend-domain.onrender.com
```

Then redeploy frontend.

## Notes

- Payment is fully in-site (no redirect) and auto-set to paid after a short delay.
- For production gateways, replace the payment simulation in `/api/payments/initiate`.
- Restrict `CORS_ORIGIN` to your real frontend domains.