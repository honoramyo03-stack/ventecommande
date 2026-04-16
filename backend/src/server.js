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
  .split(',').map((o) => o.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin))
      return callback(null, true);
    callback(new Error('CORS_NOT_ALLOWED'));
  },
}));
app.use(express.json({ limit: '1mb' }));

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const nowIso = () => new Date().toISOString();

const parseReactionButtons = (raw) => {
  if (!raw) return [];

  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((button) => ({
        id: String(button?.id || '').trim() || randomUUID(),
        label: String(button?.label || '').trim(),
        emoji: String(button?.emoji || '').trim() || '',
      }))
      .filter((button) => button.label)
      .slice(0, 6);
  } catch {
    return [];
  }
};

const normalizeCustomerKey = (customerName, tableNumber) => {
  const safeName = String(customerName || '').trim().toLowerCase();
  return `${Number(tableNumber) || 0}:${safeName}`;
};

const getAnnouncementReactionCounts = (announcementRevision, reactionButtons) => {
  const buttons = parseReactionButtons(reactionButtons);
  const counts = {};

  buttons.forEach((button) => {
    counts[button.id] = 0;
  });

  if (!announcementRevision) {
    return { counts, total: 0 };
  }

  const rows = db.prepare(`
    SELECT button_id, COUNT(*) AS count
    FROM announcement_reactions
    WHERE announcement_revision = ?
    GROUP BY button_id
  `).all(announcementRevision);

  let total = 0;
  rows.forEach((row) => {
    counts[row.button_id] = Number(row.count) || 0;
    total += Number(row.count) || 0;
  });

  return { counts, total };
};

const buildSettingsResponse = (row) => {
  const reactionButtons = parseReactionButtons(row.announcement_reaction_buttons);
  const { counts, total } = getAnnouncementReactionCounts(row.announcement_revision, reactionButtons);

  return {
    ...row,
    announcement_reaction_buttons: reactionButtons,
    announcement_reaction_counts: counts,
    announcement_reactions_total: total,
  };
};

/* ─── Schema ──────────────────────────────────────────────────── */
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
  payment_method TEXT NOT NULL DEFAULT 'cash',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  payment_reference TEXT,
  notes TEXT,
  estimated_minutes INTEGER,
  paid_at TEXT,
  validated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  sender_type TEXT NOT NULL,
  sender_name TEXT NOT NULL,
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
  announcement_enabled INTEGER NOT NULL DEFAULT 0,
  announcement_text TEXT,
  announcement_image TEXT,
  announcement_published_at TEXT,
  announcement_revision TEXT,
  announcement_reaction_buttons TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS announcement_reactions (
  id TEXT PRIMARY KEY,
  announcement_revision TEXT NOT NULL,
  button_id TEXT NOT NULL,
  customer_key TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  table_number INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(announcement_revision, customer_key)
);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  customer_phone TEXT,
  external_reference TEXT,
  user_reference TEXT,
  vendor_confirmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_announcement_reactions_revision ON announcement_reactions(announcement_revision);
CREATE INDEX IF NOT EXISTS idx_announcement_reactions_button ON announcement_reactions(announcement_revision, button_id);
`);

const ensureRestaurantSettingsColumns = () => {
  const columns = db.prepare("PRAGMA table_info('restaurant_settings')").all().map((row) => row.name);
  if (!columns.includes('announcement_enabled')) {
    db.prepare('ALTER TABLE restaurant_settings ADD COLUMN announcement_enabled INTEGER NOT NULL DEFAULT 0').run();
  }
  if (!columns.includes('announcement_text')) {
    db.prepare('ALTER TABLE restaurant_settings ADD COLUMN announcement_text TEXT').run();
  }
  if (!columns.includes('announcement_image')) {
    db.prepare('ALTER TABLE restaurant_settings ADD COLUMN announcement_image TEXT').run();
  }
  if (!columns.includes('announcement_published_at')) {
    db.prepare('ALTER TABLE restaurant_settings ADD COLUMN announcement_published_at TEXT').run();
  }
  if (!columns.includes('announcement_revision')) {
    db.prepare('ALTER TABLE restaurant_settings ADD COLUMN announcement_revision TEXT').run();
  }
  if (!columns.includes('announcement_reaction_buttons')) {
    db.prepare('ALTER TABLE restaurant_settings ADD COLUMN announcement_reaction_buttons TEXT').run();
  }
};

ensureRestaurantSettingsColumns();

/* ─── Seed ────────────────────────────────────────────────────── */
const seedIfNeeded = () => {
  if (!db.prepare('SELECT COUNT(*) AS c FROM seller_accounts').get().c)
    db.prepare('INSERT INTO seller_accounts (id,username,password,role,created_at) VALUES (?,?,?,?,?)')
      .run(randomUUID(), 'admin', 'password', 'admin', nowIso());

  if (!db.prepare('SELECT COUNT(*) AS c FROM payment_numbers').get().c) {
    const s = db.prepare('INSERT INTO payment_numbers (provider,number,merchant_name,updated_at) VALUES (?,?,?,?)');
    s.run('orange_money', '0323943234', 'Honora', nowIso());
    s.run('mvola', '0345861363', 'Honora', nowIso());
    s.run('airtel_money', '0333943234', 'Honora', nowIso());
  }

  if (!db.prepare('SELECT COUNT(*) AS c FROM categories').get().c) {
    const s = db.prepare('INSERT INTO categories (id,name,icon,sort_order) VALUES (?,?,?,?)');
    [['cat1','Pizza','🍕',1],['cat2','Burgers','🍔',2],['cat3','Boissons','🥤',3],['cat4','Desserts','🍰',4],['cat5','Salades','🥗',5]]
      .forEach((r) => s.run(...r));
  }

  if (!db.prepare('SELECT COUNT(*) AS c FROM restaurant_settings').get().c)
    db.prepare('INSERT INTO restaurant_settings (id,name,table_count,logo,vat_rate,default_prep_time,currency,phone,address,announcement_enabled,announcement_text,announcement_image,announcement_published_at,announcement_revision,announcement_reaction_buttons,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(1,'QuickOrder',20,'',0,20,'MGA','','',0,'','',null,randomUUID(),'[]',nowIso());

  if (!db.prepare('SELECT COUNT(*) AS c FROM products').get().c) {
    const s = db.prepare('INSERT INTO products (id,name,description,price,category,image,quantity,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
    const now = nowIso();
    s.run(randomUUID(),'Pizza Margherita','Tomate, mozzarella, basilic',15000,'cat1','https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400',50,1,now,now);
    s.run(randomUUID(),'Burger Classic','Bœuf, cheddar, salade, tomate',12000,'cat2','https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400',30,1,now,now);
    s.run(randomUUID(),'Coca-Cola','33cl',3000,'cat3','https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400',100,1,now,now);
  }
};
seedIfNeeded();

/* ─── SSE stream ──────────────────────────────────────────────── */
const clients = new Set();
const emit = (data) => {
  const msg = `data: ${JSON.stringify({ ...data, at: nowIso() })}\n\n`;
  clients.forEach((c) => { try { c.write(msg); } catch { clients.delete(c); } });
};

app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  clients.add(res);
  const hb = setInterval(() => { try { res.write(': ping\n\n'); } catch { clearInterval(hb); } }, 25000);
  req.on('close', () => { clients.delete(res); clearInterval(hb); });
});

/* ─── Products ────────────────────────────────────────────────── */
app.get('/api/products', (_req, res) => res.json(db.prepare('SELECT * FROM products ORDER BY created_at ASC').all()));

app.post('/api/products', (req, res) => {
  const p = req.body;
  const now = nowIso();
  const row = { id: randomUUID(), name: p.name, description: p.description ?? '', price: p.price, category: p.category, image: p.image ?? '', quantity: p.quantity ?? null, estimated_minutes: p.estimatedMinutes ?? 20, is_active: p.isActive !== false ? 1 : 0, created_at: now, updated_at: now };
  db.prepare('INSERT INTO products (id,name,description,price,category,image,quantity,estimated_minutes,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(row.id,row.name,row.description,row.price,row.category,row.image,row.quantity,row.estimated_minutes,row.is_active,row.created_at,row.updated_at);
  emit({ type: 'products_changed' });
  res.json({ ok: true, id: row.id });
});

app.patch('/api/products/:id', (req, res) => {
  const p = req.body;
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'NOT_FOUND' });
  const now = nowIso();
  db.prepare('UPDATE products SET name=?,description=?,price=?,category=?,image=?,quantity=?,estimated_minutes=?,is_active=?,updated_at=? WHERE id=?')
    .run(p.name??existing.name,p.description??existing.description,p.price??existing.price,p.category??existing.category,p.image??existing.image,p.quantity!==undefined?p.quantity:existing.quantity,p.estimatedMinutes??existing.estimated_minutes,p.isActive!==undefined?(p.isActive?1:0):existing.is_active,now,req.params.id);
  emit({ type: 'products_changed' });
  res.json({ ok: true });
});

app.delete('/api/products/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  emit({ type: 'products_changed' });
  res.json({ ok: true });
});

/* ─── Orders ──────────────────────────────────────────────────── */
app.get('/api/orders', (_req, res) => {
  const rows = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  res.json(rows.map((r) => ({ ...r, items: JSON.parse(r.items_json) })));
});

app.post('/api/orders', (req, res) => {
  const o = req.body;
  const now = nowIso();
  const id = randomUUID();
  db.prepare('INSERT INTO orders (id,table_number,client_name,items_json,total,status,payment_method,payment_status,notes,estimated_minutes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id,o.tableNumber,o.clientName??null,JSON.stringify(o.items),o.total,'pending',o.paymentMethod??'cash','pending',o.notes??null,o.estimatedMinutes??null,now,now);

  // Déduire le stock
  if (Array.isArray(o.items)) {
    for (const item of o.items) {
      const prod = db.prepare('SELECT quantity FROM products WHERE id = ?').get(item.product?.id ?? item.productId);
      if (prod?.quantity != null)
        db.prepare('UPDATE products SET quantity = MAX(0, quantity - ?), updated_at = ? WHERE id = ?').run(item.quantity, now, item.product?.id ?? item.productId);
    }
  }
  emit({ type: 'orders_changed' });
  emit({ type: 'products_changed' });
  const createdOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  res.json(createdOrder);
});

app.patch('/api/orders/:id/status', (req, res) => {
  const { status } = req.body;
  const id = req.params.id;
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'NOT_FOUND' });
  const now = nowIso();
  db.prepare(`UPDATE orders SET
    status = ?,
    payment_status = CASE WHEN ? = 'paid' THEN 'paid' WHEN ? = 'cancelled' THEN 'failed' ELSE payment_status END,
    paid_at = CASE WHEN ? = 'paid' THEN ? ELSE paid_at END,
    validated_at = CASE WHEN ? = 'completed' THEN ? ELSE validated_at END,
    updated_at = ?
    WHERE id = ?`)
    .run(status, status, status, status, now, status, now, now, id);
  emit({ type: 'orders_changed' });
  res.json({ ok: true });
});

/* ─── Messages ────────────────────────────────────────────────── */
app.get('/api/messages', (_req, res) => res.json(db.prepare('SELECT * FROM messages ORDER BY created_at ASC').all()));

app.post('/api/messages', (req, res) => {
  const msg = req.body;
  const row = { id: randomUUID(), sender_type: msg.sender_type, sender_name: msg.sender_name, sender_table: msg.sender_table??null, recipient_type: msg.recipient_type??'seller', recipient_table: msg.recipient_table??null, content: msg.content, reply_to_id: msg.reply_to_id??null, reply_to_message: msg.reply_to_message??null, reply_to_sender: msg.reply_to_sender??null, created_at: nowIso() };
  db.prepare('INSERT INTO messages (id,sender_type,sender_name,sender_table,recipient_type,recipient_table,content,reply_to_id,reply_to_message,reply_to_sender,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(row.id,row.sender_type,row.sender_name,row.sender_table,row.recipient_type,row.recipient_table,row.content,row.reply_to_id,row.reply_to_message,row.reply_to_sender,row.created_at);
  emit({ type: 'messages_changed' });
  res.json({ ok: true, id: row.id });
});

/* ─── Connected clients ───────────────────────────────────────── */
app.get('/api/connected-clients', (_req, res) => res.json(db.prepare('SELECT * FROM connected_clients ORDER BY connected_at DESC').all()));

app.post('/api/connected-clients/reserve', (req, res) => {
  const { name, tableNumber } = req.body;
  const now = nowIso();
  const existing = db.prepare('SELECT * FROM connected_clients WHERE table_number = ?').get(tableNumber);
  if (existing && String(existing.name).toLowerCase() !== String(name).toLowerCase())
    return res.status(409).json({ error: 'TABLE_OCCUPIED' });
  if (existing) db.prepare('UPDATE connected_clients SET name=?,connected_at=?,last_seen=? WHERE table_number=?').run(name,now,now,tableNumber);
  else db.prepare('INSERT INTO connected_clients (id,name,table_number,connected_at,last_seen) VALUES (?,?,?,?,?)').run(randomUUID(),name,tableNumber,now,now);
  emit({ type: 'connected_clients_changed' });
  res.json({ ok: true });
});

app.patch('/api/connected-clients/activity', (req, res) => {
  const { name, tableNumber } = req.body;
  db.prepare('UPDATE connected_clients SET last_seen=? WHERE table_number=? AND name=?').run(nowIso(),tableNumber,name);
  emit({ type: 'connected_clients_changed' });
  res.json({ ok: true });
});

app.delete('/api/connected-clients/:tableNumber', (req, res) => {
  db.prepare('DELETE FROM connected_clients WHERE table_number=? AND name=?').run(Number(req.params.tableNumber),String(req.query.name||''));
  emit({ type: 'connected_clients_changed' });
  res.json({ ok: true });
});

/* ─── Payment numbers ─────────────────────────────────────────── */
app.get('/api/payment-numbers', (_req, res) => res.json(db.prepare('SELECT * FROM payment_numbers').all()));

app.put('/api/payment-numbers/:provider', (req, res) => {
  const { number, merchantName } = req.body;
  db.prepare('INSERT INTO payment_numbers (provider,number,merchant_name,updated_at) VALUES (?,?,?,?) ON CONFLICT(provider) DO UPDATE SET number=excluded.number,merchant_name=excluded.merchant_name,updated_at=excluded.updated_at')
    .run(req.params.provider, number, merchantName, nowIso());
  emit({ type: 'payment_numbers_changed' });
  res.json({ ok: true });
});

/* ─── Seller accounts ─────────────────────────────────────────── */
app.get('/api/seller-accounts', (_req, res) => res.json(db.prepare('SELECT * FROM seller_accounts').all()));

app.post('/api/seller-accounts', (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'MISSING_FIELDS' });
  const existing = db.prepare('SELECT id FROM seller_accounts WHERE username=?').get(username);
  if (existing) return res.status(409).json({ error: 'USERNAME_TAKEN' });
  db.prepare('INSERT INTO seller_accounts (id,username,password,role,created_at) VALUES (?,?,?,?,?)').run(randomUUID(),username,password,role||'seller',nowIso());
  emit({ type: 'seller_accounts_changed' });
  res.json({ ok: true });
});

app.patch('/api/seller-accounts/:id', (req, res) => {
  const { username, password, role } = req.body;
  db.prepare('UPDATE seller_accounts SET username=COALESCE(?,username),password=COALESCE(?,password),role=COALESCE(?,role) WHERE id=?').run(username??null,password??null,role??null,req.params.id);
  emit({ type: 'seller_accounts_changed' });
  res.json({ ok: true });
});

app.delete('/api/seller-accounts/:id', (req, res) => {
  db.prepare('DELETE FROM seller_accounts WHERE id=?').run(req.params.id);
  emit({ type: 'seller_accounts_changed' });
  res.json({ ok: true });
});

app.post('/api/seller-accounts/login', (req, res) => {
  const { username, password } = req.body;
  const account = db.prepare('SELECT * FROM seller_accounts WHERE username=? AND password=?').get(username,password);
  if (!account) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
  res.json({ ok: true, account: { id: account.id, username: account.username, role: account.role } });
});

/* ─── Categories ──────────────────────────────────────────────── */
app.get('/api/categories', (_req, res) => res.json(db.prepare('SELECT * FROM categories ORDER BY sort_order ASC').all()));

app.post('/api/categories', (req, res) => {
  const { name, icon, order: sortOrder } = req.body;
  const id = randomUUID();
  db.prepare('INSERT INTO categories (id,name,icon,sort_order) VALUES (?,?,?,?)').run(id,name,icon??'',sortOrder??0);
  emit({ type: 'categories_changed' });
  res.json({ ok: true, id });
});

app.patch('/api/categories/:id', (req, res) => {
  const { name, icon, order: sortOrder } = req.body;
  db.prepare('UPDATE categories SET name=COALESCE(?,name),icon=COALESCE(?,icon),sort_order=COALESCE(?,sort_order) WHERE id=?').run(name??null,icon??null,sortOrder??null,req.params.id);
  emit({ type: 'categories_changed' });
  res.json({ ok: true });
});

app.delete('/api/categories/:id', (req, res) => {
  db.prepare('DELETE FROM categories WHERE id=?').run(req.params.id);
  emit({ type: 'categories_changed' });
  res.json({ ok: true });
});

/* ─── Settings ────────────────────────────────────────────────── */
app.get('/api/settings', (_req, res) => {
  const row = db.prepare('SELECT * FROM restaurant_settings WHERE id=1').get();
  res.json(buildSettingsResponse(row));
});

app.patch('/api/settings', (req, res) => {
  const row = db.prepare('SELECT * FROM restaurant_settings WHERE id=1').get();
  const publishNow = Boolean(req.body.announcement_publish_now);
  const next = { ...row, ...req.body, updated_at: nowIso() };
  const reactionButtons = parseReactionButtons(req.body.announcement_reaction_buttons ?? row.announcement_reaction_buttons);
  const reactionButtonsJson = JSON.stringify(reactionButtons);
  const existingEnabled = Number(row.announcement_enabled) === 1;
  const nextEnabled = Number(next.announcement_enabled ?? 0) === 1;
  const nextAnnouncementText = next.announcement_text ?? null;
  const nextAnnouncementImage = next.announcement_image ?? null;
  const announcementChanged =
    (row.announcement_text || '') !== (nextAnnouncementText || '') ||
    (row.announcement_image || '') !== (nextAnnouncementImage || '') ||
    (row.announcement_reaction_buttons || '[]') !== reactionButtonsJson;

  let nextAnnouncementRevision = row.announcement_revision || randomUUID();
  if (announcementChanged || publishNow) {
    nextAnnouncementRevision = randomUUID();
  }

  let nextPublishedAt = row.announcement_published_at || null;
  if (publishNow || (nextEnabled && (!existingEnabled || announcementChanged))) {
    nextPublishedAt = nowIso();
  }

  db.prepare('UPDATE restaurant_settings SET name=?,table_count=?,logo=?,vat_rate=?,default_prep_time=?,currency=?,phone=?,address=?,announcement_enabled=?,announcement_text=?,announcement_image=?,announcement_published_at=?,announcement_revision=?,announcement_reaction_buttons=?,updated_at=? WHERE id=1')
    .run(
      next.name,
      next.table_count,
      next.logo || '',
      next.vat_rate,
      next.default_prep_time,
      next.currency,
      next.phone || '',
      next.address || '',
      Number(next.announcement_enabled ?? 0),
      nextAnnouncementText,
      nextAnnouncementImage,
      nextPublishedAt,
      nextAnnouncementRevision,
      reactionButtonsJson,
      next.updated_at
    );
  emit({ type: 'settings_changed' });
  res.json({ ok: true });
});

app.get('/api/announcement/reactions/status', (req, res) => {
  const customerName = String(req.query.name || '').trim();
  const tableNumber = Number(req.query.tableNumber);
  if (!customerName || !Number.isFinite(tableNumber)) {
    return res.json({ selectedButtonId: null, announcementRevision: null });
  }

  const row = db.prepare('SELECT announcement_revision FROM restaurant_settings WHERE id=1').get();
  const announcementRevision = row?.announcement_revision || null;
  if (!announcementRevision) {
    return res.json({ selectedButtonId: null, announcementRevision: null });
  }

  const reaction = db.prepare(`
    SELECT button_id
    FROM announcement_reactions
    WHERE announcement_revision = ? AND customer_key = ?
  `).get(announcementRevision, normalizeCustomerKey(customerName, tableNumber));

  return res.json({
    selectedButtonId: reaction?.button_id || null,
    announcementRevision,
  });
});

app.post('/api/announcement/reactions', (req, res) => {
  const buttonId = String(req.body.buttonId || '').trim();
  const customerName = String(req.body.customerName || '').trim();
  const tableNumber = Number(req.body.tableNumber);

  if (!buttonId || !customerName || !Number.isFinite(tableNumber)) {
    return res.status(400).json({ error: 'INVALID_REACTION_PAYLOAD' });
  }

  const row = db.prepare('SELECT * FROM restaurant_settings WHERE id=1').get();
  const reactionButtons = parseReactionButtons(row.announcement_reaction_buttons);
  const targetButton = reactionButtons.find((button) => button.id === buttonId);
  const announcementRevision = row.announcement_revision || null;

  if (!Number(row.announcement_enabled) || !announcementRevision || !targetButton) {
    return res.status(400).json({ error: 'ANNOUNCEMENT_REACTION_UNAVAILABLE' });
  }

  const customerKey = normalizeCustomerKey(customerName, tableNumber);
  const existing = db.prepare(`
    SELECT id, button_id
    FROM announcement_reactions
    WHERE announcement_revision = ? AND customer_key = ?
  `).get(announcementRevision, customerKey);

  const now = nowIso();
  let selectedButtonId = buttonId;

  if (existing?.button_id === buttonId) {
    db.prepare('DELETE FROM announcement_reactions WHERE id = ?').run(existing.id);
    selectedButtonId = null;
  } else if (existing) {
    db.prepare(`
      UPDATE announcement_reactions
      SET button_id = ?, updated_at = ?
      WHERE id = ?
    `).run(buttonId, now, existing.id);
  } else {
    db.prepare(`
      INSERT INTO announcement_reactions (id,announcement_revision,button_id,customer_key,customer_name,table_number,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(randomUUID(), announcementRevision, buttonId, customerKey, customerName, tableNumber, now, now);
  }

  const { counts, total } = getAnnouncementReactionCounts(announcementRevision, reactionButtons);
  emit({ type: 'settings_changed' });
  return res.json({
    ok: true,
    selectedButtonId,
    announcementRevision,
    announcement_reaction_counts: counts,
    announcement_reactions_total: total,
  });
});

/* ══════════════════════════════════════════════════════════════
   PAIEMENTS MOBILE MONEY — Flux 100% en ligne
   ══════════════════════════════════════════════════════════════
   1. Client checkout → choisit opérateur, saisit son numéro
   2. Système génère le code USSD côté client (paymentApi.ts)
   3. Client compose le code sur son téléphone → valide avec PIN
   4. Client clique "J'ai payé" → POST /api/payments/initiate
      (enregistre la transaction en "pending")
   5. Vendeur voit la commande avec badge "Paiement en attente"
   6. Vendeur clique "Confirmer paiement reçu" → PATCH /api/payments/:id/confirm
      (status → paid, commande → paid)
   ══════════════════════════════════════════════════════════════ */

app.post('/api/payments/initiate', (req, res) => {
  const { orderId, provider, customerPhone, userReference } = req.body;
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
  if (!order) return res.status(404).json({ error: 'ORDER_NOT_FOUND' });

  const transactionId = randomUUID();
  const ref = `${provider.toUpperCase()}-${Date.now()}`;
  const now = nowIso();

  db.prepare('INSERT INTO payment_transactions (id,order_id,provider,amount,status,customer_phone,external_reference,user_reference,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(transactionId, orderId, provider, order.total, 'pending', customerPhone ?? null, ref, userReference ?? null, now, now);

  db.prepare('UPDATE orders SET payment_status=?,payment_reference=?,updated_at=? WHERE id=?')
    .run('pending', ref, now, orderId);
  emit({ type: 'orders_changed' });

  res.json({ transactionId, orderId, paymentStatus: 'pending', externalReference: ref });
});

// Vendeur confirme que le paiement a bien été reçu
app.patch('/api/payments/:transactionId/confirm', (req, res) => {
  const { transactionId } = req.params;
  const txn = db.prepare('SELECT * FROM payment_transactions WHERE id=?').get(transactionId);
  if (!txn) return res.status(404).json({ error: 'TRANSACTION_NOT_FOUND' });
  if (txn.status === 'paid') return res.json({ ok: true, alreadyPaid: true });

  const now = nowIso();
  db.prepare('UPDATE payment_transactions SET status=?,vendor_confirmed_at=?,updated_at=? WHERE id=?')
    .run('paid', now, now, transactionId);
  db.prepare("UPDATE orders SET status='paid',payment_status='paid',paid_at=?,updated_at=? WHERE id=?")
    .run(now, now, txn.order_id);
  emit({ type: 'orders_changed' });
  res.json({ ok: true });
});

// Vendeur rejette un paiement
app.patch('/api/payments/:transactionId/reject', (req, res) => {
  const { transactionId } = req.params;
  const txn = db.prepare('SELECT * FROM payment_transactions WHERE id=?').get(transactionId);
  if (!txn) return res.status(404).json({ error: 'TRANSACTION_NOT_FOUND' });
  const now = nowIso();
  db.prepare('UPDATE payment_transactions SET status=?,updated_at=? WHERE id=?').run('failed', now, transactionId);
  db.prepare("UPDATE orders SET payment_status='failed',updated_at=? WHERE id=?").run(now, txn.order_id);
  emit({ type: 'orders_changed' });
  res.json({ ok: true });
});

// Lister les transactions d'un vendeur
app.get('/api/payments', (_req, res) => {
  const rows = db.prepare('SELECT pt.*, o.table_number, o.client_name, o.total AS order_total FROM payment_transactions pt JOIN orders o ON o.id = pt.order_id ORDER BY pt.created_at DESC LIMIT 100').all();
  res.json(rows);
});

app.patch('/api/payments/:transactionId/user-reference', (req, res) => {
  const { transactionId } = req.params;
  const { userReference } = req.body;
  const txn = db.prepare('SELECT * FROM payment_transactions WHERE id=?').get(transactionId);
  if (!txn) return res.status(404).json({ error: 'TRANSACTION_NOT_FOUND' });
  const now = nowIso();
  db.prepare('UPDATE payment_transactions SET user_reference=?, updated_at=? WHERE id=?')
    .run(userReference, now, transactionId);
  emit({ type: 'orders_changed' });
  res.json({ ok: true });
});

/* ─── Health ──────────────────────────────────────────────────── */
app.get('/health', (_req, res) => res.json({ ok: true, service: 'sqlite-api', ts: nowIso() }));

const port = Number(process.env.PORT || 4000);
app.listen(port, '0.0.0.0', () => {
  console.log(`✅ SQLite API listening on 0.0.0.0:${port}`);
});
