import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = process.env.SQLITE_PATH || path.resolve(__dirname, './data/app.db');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const nowIso = () => new Date().toISOString();

console.log('🗄️  Initialisation de SQLite...');
console.log(`📁 Base: ${dbPath}`);

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

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_table ON messages(recipient_table);
CREATE INDEX IF NOT EXISTS idx_connected_clients_table_number ON connected_clients(table_number);
`);

const productsCount = db.prepare('SELECT COUNT(*) AS count FROM products').get().count;
const sellersCount = db.prepare('SELECT COUNT(*) AS count FROM seller_accounts').get().count;
const paymentsCount = db.prepare('SELECT COUNT(*) AS count FROM payment_numbers').get().count;
const categoriesCount = db.prepare('SELECT COUNT(*) AS count FROM categories').get().count;
const settingsCount = db.prepare('SELECT COUNT(*) AS count FROM restaurant_settings').get().count;

if (!sellersCount) {
  db.prepare('INSERT INTO seller_accounts (id, username, password, role, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(randomUUID(), 'admin', 'password', 'admin', nowIso());
  console.log('✅ Compte vendeur par défaut créé: admin / password');
}

if (!paymentsCount) {
  const stmt = db.prepare('INSERT INTO payment_numbers (provider, number, merchant_name, updated_at) VALUES (?, ?, ?, ?)');
  stmt.run('orange_money', '0323943234', 'Honora', nowIso());
  stmt.run('mvola', '0345861363', 'Honora', nowIso());
  stmt.run('airtel_money', '0333943234', 'Honora', nowIso());
  console.log('✅ Numéros de paiement initiaux ajoutés');
}

if (!categoriesCount) {
  const stmt = db.prepare('INSERT INTO categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?)');
  [
    ['cat1', 'Pizzas', '🍕', 1],
    ['cat2', 'Burgers', '🍔', 2],
    ['cat3', 'Boissons', '🥤', 3],
    ['cat4', 'Desserts', '🍰', 4],
    ['cat5', 'Salades', '🥗', 5],
  ].forEach((row) => stmt.run(...row));
  console.log('✅ Catégories par défaut ajoutées');
}

if (!settingsCount) {
  db.prepare(
    'INSERT INTO restaurant_settings (id, name, table_count, logo, vat_rate, default_prep_time, currency, phone, address, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run('QuickOrder', 20, '', 20, 20, 'Ar', '', '', nowIso());
  console.log('✅ Paramètres restaurant initialisés');
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
    ['Burger Double', 'Double boeuf, double fromage, bacon', 28000, 'Burgers', 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=400', 25, 18],
    ['Coca-Cola', 'Bouteille 50cl', 3000, 'Boissons', 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400', 100, 1],
    ['Eau Minerale', 'Bouteille 50cl', 2000, 'Boissons', 'https://images.unsplash.com/photo-1564419320461-6870880221ad?w=400', 200, 1],
    ['Jus Orange', 'Fraichement presse', 5000, 'Boissons', 'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=400', 50, 3],
    ['Tiramisu', 'Dessert italien au mascarpone et cafe', 12000, 'Desserts', 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=400', 20, 5],
    ['Glace Vanille', 'Trois boules avec chantilly', 8000, 'Desserts', 'https://images.unsplash.com/photo-1570197788417-0e82375c9371?w=400', 30, 4],
    ['Salade Cesar', 'Poulet grille, parmesan, croutons', 15000, 'Salades', 'https://images.unsplash.com/photo-1546793665-c74683f339c1?w=400', null, 10],
  ].forEach(([name, description, price, category, image, quantity, estimated]) => {
    stmt.run(randomUUID(), name, description, price, category, image, quantity, estimated, 1, t, t);
  });
  console.log('✅ Produits par défaut ajoutés');
}

const summary = {
  products: db.prepare('SELECT COUNT(*) AS count FROM products').get().count,
  orders: db.prepare('SELECT COUNT(*) AS count FROM orders').get().count,
  messages: db.prepare('SELECT COUNT(*) AS count FROM messages').get().count,
  connectedClients: db.prepare('SELECT COUNT(*) AS count FROM connected_clients').get().count,
  sellers: db.prepare('SELECT COUNT(*) AS count FROM seller_accounts').get().count,
  payments: db.prepare('SELECT COUNT(*) AS count FROM payment_numbers').get().count,
  categories: db.prepare('SELECT COUNT(*) AS count FROM categories').get().count,
};

console.log('🎉 SQLite prêt');
console.log('📊 Résumé:', summary);

db.close();
