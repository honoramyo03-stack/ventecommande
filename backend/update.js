import Database from 'better-sqlite3';

const db = new Database('./data/app.db');

const stmt = db.prepare("UPDATE orders SET payment_method = 'orange_money' WHERE payment_method IS NULL");

const result = stmt.run();

console.log(`Updated ${result.changes} rows`);

db.close();