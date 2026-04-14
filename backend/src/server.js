import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = process.env.SQLITE_PATH || path.resolve(__dirname, '../data/app.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const allowedOrigins = String(process.env.CORS_ORIGIN || '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('CORS_NOT_ALLOWED'));
    },
  })
);
app.use(express.json({ limit: '1mb' }));

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const nowIso = () => new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL,
  category TEXT NOT NULL,
  image TEXT,
  quantity INTEGER,
  estimated_minutes INTEGER DEFAULT 20,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  table_number INTEGER NOT NULL,
  client_name TEXT,
  items_json TEXT NOT NULL,
  total REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT,
  notes TEXT,
  estimated_minutes INTEGER DEFAULT 20,
  payment_status TEXT DEFAULT 'pending',
  payment_reference TEXT,
  created_at TEXT NOT NULL,
  paid_at TEXT,
  validated_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  sender_type TEXT NOT NULL,
  sender_name TEXT,
  sender_table INTEGER,
  recipient_type TEXT,
  recipient_table INTEGER,
  content TEXT NOT NULL,
  reply_to_id TEXT,
  reply_to_message TEXT,
  reply_to_sender TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS connected_clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  table_number INTEGER NOT NULL UNIQUE,
  connected_at TEXT NOT NULL,
  last_seen TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS seller_accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'seller',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_numbers (
  provider TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS restaurant_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  table_count INTEGER NOT NULL,
  logo TEXT,
  vat_rate REAL NOT NULL,
  default_prep_time INTEGER NOT NULL,
  currency TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL,
  external_reference TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

const seedIfNeeded = () => {
  const productsCount = db.prepare('SELECT COUNT(*) AS count FROM products').get().count;
  const sellersCount = db.prepare('SELECT COUNT(*) AS count FROM seller_accounts').get().count;
  const paymentsCount = db.prepare('SELECT COUNT(*) AS count FROM payment_numbers').get().count;
  const categoriesCount = db.prepare('SELECT COUNT(*) AS count FROM categories').get().count;
  const settingsCount = db.prepare('SELECT COUNT(*) AS count FROM restaurant_settings').get().count;

  if (!sellersCount) {
    db.prepare('INSERT INTO seller_accounts (id, username, password, role, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(randomUUID(), 'admin', 'password', 'admin', nowIso());
  }

  if (!paymentsCount) {
    const stmt = db.prepare('INSERT INTO payment_numbers (provider, number, merchant_name, updated_at) VALUES (?, ?, ?, ?)');
    stmt.run('orange_money', '0323943234', 'Honora', nowIso());
    stmt.run('mvola', '0345861363', 'Honora', nowIso());
    stmt.run('airtel_money', '0333943234', 'Honora', nowIso());
  }

  if (!categoriesCount) {
    const stmt = db.prepare('INSERT INTO categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?)');
    [
      ['cat1', 'Pizza', '🍕', 1],
      ['cat2', 'Burgers', '🍔', 2],
      ['cat3', 'Boissons', '🥤', 3],
      ['cat4', 'Desserts', '🍰', 4],
      ['cat5', 'Salades', '🥗', 5],
    ].forEach((row) => stmt.run(...row));
  }

  if (!settingsCount) {
    db.prepare(
      'INSERT INTO restaurant_settings (id, name, table_count, logo, vat_rate, default_prep_time, currency, phone, address, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run('QuickOrder', 20, '', 20, 20, 'Ar', '', '', nowIso());
  }

  if (!productsCount) {
    const stmt = db.prepare(
      'INSERT INTO products (id, name, description, price, category, image, quantity, estimated_minutes, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const t = nowIso();
    [
      ['Pizza Margherita', 'Tomate, mozzarella, basilic frais', 25000, 'Pizzas', 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400', 50, 20],
      ['Pizza 4 Fromages', 'Mozzarella, gorgonzola, parmesan, chevre', 32000, 'Pizzas', 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400', 30, 20],
      ['Burger Classic', 'Boeuf, salade, tomate, oignon', 18000, 'Burgers', 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400', 40, 15],
      ['Coca-Cola', 'Bouteille 50cl', 3000, 'Boissons', 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400', 100, 1],
      ['Salade Cesar', 'Poulet grille, parmesan, croutons', 15000, 'Salades', 'https://images.unsplash.com/photo-1546793665-c74683f339c1?w=400', null, 10],
    ].forEach(([name, description, price, category, image, quantity, estimated]) => {
      stmt.run(randomUUID(), name, description, price, category, image, quantity, estimated, 1, t, t);
    });
  }
};

seedIfNeeded();

const clients = new Set();
const emit = (payload) => {
  const msg = `data: ${JSON.stringify({ ...payload, at: nowIso() })}\n\n`;
  clients.forEach((client) => client.write(msg));
};

const parseOrder = (row) => ({
  id: row.id,
  table_number: row.table_number,
  client_name: row.client_name,
  items: JSON.parse(row.items_json || '[]'),
  total: row.total,
  status: row.status,
  payment_method: row.payment_method,
  notes: row.notes,
  estimated_minutes: row.estimated_minutes,
  payment_status: row.payment_status,
  payment_reference: row.payment_reference,
  created_at: row.created_at,
  paid_at: row.paid_at,
  validated_at: row.validated_at,
  updated_at: row.updated_at,
});

app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(`data: ${JSON.stringify({ type: 'connected', at: nowIso() })}\n\n`);
  clients.add(res);
  req.on('close', () => clients.delete(res));
});

app.get('/api/products', (_req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  res.json(rows);
});

app.post('/api/products', (req, res) => {
  const { name, description, price, category, image, quantity, estimated_minutes, is_active } = req.body;
  const id = randomUUID();
  const now = nowIso();
  db.prepare('INSERT INTO products (id,name,description,price,category,image,quantity,estimated_minutes,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, name, description || '', price, category, image || '', quantity ?? null, estimated_minutes ?? 20, is_active ? 1 : 0, now, now);
  emit({ type: 'products_changed' });
  res.json({ id });
});

app.patch('/api/products/:id', (req, res) => {
  const id = req.params.id;
  const updates = req.body || {};
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'NOT_FOUND' });
  const next = { ...existing, ...updates, updated_at: nowIso() };
  db.prepare('UPDATE products SET name=?,description=?,price=?,category=?,image=?,quantity=?,estimated_minutes=?,is_active=?,updated_at=? WHERE id=?')
    .run(next.name, next.description, next.price, next.category, next.image, next.quantity ?? null, next.estimated_minutes ?? 20, next.is_active ? 1 : 0, next.updated_at, id);
  emit({ type: 'products_changed' });
  res.json({ ok: true });
});

app.delete('/api/products/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  emit({ type: 'products_changed' });
  res.json({ ok: true });
});

app.get('/api/orders', (_req, res) => {
  const rows = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  res.json(rows.map(parseOrder));
});

app.post('/api/orders', (req, res) => {
  const { tableNumber, clientName, items, total, paymentMethod, notes, estimatedMinutes } = req.body;
  const id = randomUUID();
  const now = nowIso();

  const tx = db.transaction(() => {
    for (const item of items || []) {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product.id);
      if (!product || !product.is_active) throw new Error(`PRODUIT_INACTIF:${item.product.name}`);
      if (product.quantity !== null && item.quantity > product.quantity) {
        throw new Error(`STOCK_INSUFFISANT:${item.product.name}`);
      }
      if (product.quantity !== null) {
        const newQuantity = Math.max(0, product.quantity - item.quantity);
        db.prepare('UPDATE products SET quantity = ?, updated_at = ? WHERE id = ?').run(newQuantity, nowIso(), product.id);
      }
    }

    db.prepare('INSERT INTO orders (id,table_number,client_name,items_json,total,status,payment_method,notes,estimated_minutes,payment_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, tableNumber, clientName || null, JSON.stringify(items || []), total, 'pending', paymentMethod, notes || null, estimatedMinutes ?? 20, 'pending', now, now);
  });

  try {
    tx();
  } catch (e) {
    return res.status(400).json({ error: e.message || 'ORDER_CREATE_FAILED' });
  }

  emit({ type: 'orders_changed' });
  emit({ type: 'products_changed' });
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  res.json(parseOrder(row));
});

app.patch('/api/orders/:id/status', (req, res) => {
  const { status } = req.body;
  const id = req.params.id;
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'NOT_FOUND' });
  const now = nowIso();
  db.prepare('UPDATE orders SET status = ?, payment_status = CASE WHEN ? = "paid" THEN "paid" WHEN ? = "cancelled" THEN "failed" ELSE payment_status END, paid_at = CASE WHEN ? = "paid" THEN ? ELSE paid_at END, validated_at = CASE WHEN ? = "completed" THEN ? ELSE validated_at END, updated_at = ? WHERE id = ?')
    .run(status, status, status, status, now, status, now, now, id);
  emit({ type: 'orders_changed' });
  res.json({ ok: true });
});

app.get('/api/messages', (_req, res) => {
  const rows = db.prepare('SELECT * FROM messages ORDER BY created_at ASC').all();
  res.json(rows);
});

app.post('/api/messages', (req, res) => {
  const msg = req.body;
  const row = {
    id: randomUUID(),
    sender_type: msg.sender_type,
    sender_name: msg.sender_name,
    sender_table: msg.sender_table ?? null,
    recipient_type: msg.recipient_type ?? 'seller',
    recipient_table: msg.recipient_table ?? null,
    content: msg.content,
    reply_to_id: msg.reply_to_id ?? null,
    reply_to_message: msg.reply_to_message ?? null,
    reply_to_sender: msg.reply_to_sender ?? null,
    created_at: nowIso(),
  };
  db.prepare('INSERT INTO messages (id,sender_type,sender_name,sender_table,recipient_type,recipient_table,content,reply_to_id,reply_to_message,reply_to_sender,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(row.id, row.sender_type, row.sender_name, row.sender_table, row.recipient_type, row.recipient_table, row.content, row.reply_to_id, row.reply_to_message, row.reply_to_sender, row.created_at);
  emit({ type: 'messages_changed' });
  res.json({ ok: true, id: row.id });
});

app.get('/api/connected-clients', (_req, res) => {
  const rows = db.prepare('SELECT * FROM connected_clients ORDER BY connected_at DESC').all();
  res.json(rows);
});

app.post('/api/connected-clients/reserve', (req, res) => {
  const { name, tableNumber } = req.body;
  const now = nowIso();
  const existing = db.prepare('SELECT * FROM connected_clients WHERE table_number = ?').get(tableNumber);
  if (existing && String(existing.name).toLowerCase() !== String(name).toLowerCase()) {
    return res.status(409).json({ error: 'TABLE_OCCUPIED' });
  }

  if (existing) {
    db.prepare('UPDATE connected_clients SET name = ?, connected_at = ?, last_seen = ? WHERE table_number = ?').run(name, now, now, tableNumber);
  } else {
    db.prepare('INSERT INTO connected_clients (id,name,table_number,connected_at,last_seen) VALUES (?,?,?,?,?)').run(randomUUID(), name, tableNumber, now, now);
  }

  emit({ type: 'connected_clients_changed' });
  res.json({ ok: true });
});

app.patch('/api/connected-clients/activity', (req, res) => {
  const { name, tableNumber } = req.body;
  db.prepare('UPDATE connected_clients SET last_seen = ? WHERE table_number = ? AND name = ?').run(nowIso(), tableNumber, name);
  emit({ type: 'connected_clients_changed' });
  res.json({ ok: true });
});

app.delete('/api/connected-clients/:tableNumber', (req, res) => {
  const tableNumber = Number(req.params.tableNumber);
  const name = String(req.query.name || '');
  db.prepare('DELETE FROM connected_clients WHERE table_number = ? AND name = ?').run(tableNumber, name);
  emit({ type: 'connected_clients_changed' });
  res.json({ ok: true });
});

app.get('/api/payment-numbers', (_req, res) => {
  const rows = db.prepare('SELECT * FROM payment_numbers').all();
  res.json(rows);
});

app.put('/api/payment-numbers/:provider', (req, res) => {
  const provider = req.params.provider;
  const { number, merchantName } = req.body;
  db.prepare('INSERT INTO payment_numbers (provider,number,merchant_name,updated_at) VALUES (?,?,?,?) ON CONFLICT(provider) DO UPDATE SET number=excluded.number, merchant_name=excluded.merchant_name, updated_at=excluded.updated_at')
    .run(provider, number, merchantName, nowIso());
  emit({ type: 'payment_numbers_changed' });
  res.json({ ok: true });
});

app.get('/api/seller-accounts', (_req, res) => {
  res.json(db.prepare('SELECT * FROM seller_accounts').all());
});

app.post('/api/seller-accounts', (req, res) => {
  const { username, password, role } = req.body;
  try {
    db.prepare('INSERT INTO seller_accounts (id,username,password,role,created_at) VALUES (?,?,?,?,?)')
      .run(randomUUID(), username, password, role || 'seller', nowIso());
    emit({ type: 'seller_accounts_changed' });
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: 'SELLER_EXISTS' });
  }
});

app.patch('/api/seller-accounts/:username', (req, res) => {
  const { username } = req.params;
  const { nextUsername, password } = req.body;
  const current = db.prepare('SELECT * FROM seller_accounts WHERE username = ?').get(username);
  if (!current) return res.status(404).json({ error: 'NOT_FOUND' });
  db.prepare('UPDATE seller_accounts SET username = ?, password = ? WHERE username = ?').run(nextUsername || username, password || current.password, username);
  emit({ type: 'seller_accounts_changed' });
  res.json({ ok: true });
});

app.delete('/api/seller-accounts/:username', (req, res) => {
  const { username } = req.params;
  if (username === 'admin') return res.status(400).json({ error: 'CANNOT_DELETE_ADMIN' });
  db.prepare('DELETE FROM seller_accounts WHERE username = ?').run(username);
  emit({ type: 'seller_accounts_changed' });
  res.json({ ok: true });
});

app.get('/api/categories', (_req, res) => {
  res.json(db.prepare('SELECT * FROM categories ORDER BY sort_order ASC').all());
});

app.post('/api/categories', (req, res) => {
  const { name, icon, sort_order } = req.body;
  db.prepare('INSERT INTO categories (id,name,icon,sort_order) VALUES (?,?,?,?)').run(randomUUID(), name, icon || null, sort_order ?? 0);
  emit({ type: 'categories_changed' });
  res.json({ ok: true });
});

app.patch('/api/categories/:id', (req, res) => {
  const { id } = req.params;
  const current = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!current) return res.status(404).json({ error: 'NOT_FOUND' });
  const next = { ...current, ...req.body };
  db.prepare('UPDATE categories SET name = ?, icon = ?, sort_order = ? WHERE id = ?').run(next.name, next.icon || null, next.sort_order ?? 0, id);
  emit({ type: 'categories_changed' });
  res.json({ ok: true });
});

app.delete('/api/categories/:id', (req, res) => {
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  emit({ type: 'categories_changed' });
  res.json({ ok: true });
});

app.get('/api/settings', (_req, res) => {
  const row = db.prepare('SELECT * FROM restaurant_settings WHERE id = 1').get();
  res.json(row);
});

app.patch('/api/settings', (req, res) => {
  const row = db.prepare('SELECT * FROM restaurant_settings WHERE id = 1').get();
  const next = { ...row, ...req.body, updated_at: nowIso() };
  db.prepare('UPDATE restaurant_settings SET name=?, table_count=?, logo=?, vat_rate=?, default_prep_time=?, currency=?, phone=?, address=?, updated_at=? WHERE id=1')
    .run(next.name, next.table_count, next.logo || '', next.vat_rate, next.default_prep_time, next.currency, next.phone || '', next.address || '', next.updated_at);
  emit({ type: 'settings_changed' });
  res.json({ ok: true });
});

app.post('/api/payments/initiate', (req, res) => {
  const { orderId, provider } = req.body;
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).json({ error: 'ORDER_NOT_FOUND' });

  const transactionId = randomUUID();
  const ref = `${provider}-${Date.now()}`;
  const now = nowIso();
  db.prepare('INSERT INTO payment_transactions (id,order_id,provider,amount,status,external_reference,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(transactionId, orderId, provider, order.total, 'pending', ref, now, now);

  db.prepare('UPDATE orders SET payment_status = ?, payment_reference = ?, updated_at = ? WHERE id = ?')
    .run('pending', ref, nowIso(), orderId);
  emit({ type: 'orders_changed' });

  // Simulation paiement automatique sans quitter le site.
  setTimeout(() => {
    db.prepare('UPDATE payment_transactions SET status = ?, updated_at = ? WHERE id = ?').run('paid', nowIso(), transactionId);
    db.prepare('UPDATE orders SET status = ?, payment_status = ?, paid_at = ?, updated_at = ? WHERE id = ?').run('paid', 'paid', nowIso(), nowIso(), orderId);
    emit({ type: 'orders_changed' });
  }, 6000);

  res.json({
    transactionId,
    orderId,
    paymentStatus: 'pending',
    externalReference: ref,
  });
});

app.get('/api/payments/:transactionId/status', (req, res) => {
  const row = db.prepare('SELECT * FROM payment_transactions WHERE id = ?').get(req.params.transactionId);
  if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json({
    id: row.id,
    status: row.status,
    provider: row.provider,
    externalReference: row.external_reference,
  });
});

app.get('/health', (_req, res) => res.json({ ok: true, service: 'sqlite-api' }));

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`SQLite API listening on :${port}`);
});
