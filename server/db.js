const Datastore = require('@seald-io/nedb');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config();

const DB_DIR = path.join(__dirname, '..', 'data');

// ─── Collections ─────────────────────────────────────────────────────────────
const users = new Datastore({
  filename: path.join(DB_DIR, 'users.db'),
  autoload: true
});
const auditLog = new Datastore({
  filename: path.join(DB_DIR, 'audit.db'),
  autoload: true
});

// ─── Indexes ─────────────────────────────────────────────────────────────────
users.ensureIndex({ fieldName: 'username', unique: true });

// ─── Promisified helpers ──────────────────────────────────────────────────────
function findOne(db, query) {
  return new Promise((resolve, reject) => {
    db.findOne(query, (err, doc) => { if (err) reject(err); else resolve(doc); });
  });
}
function find(db, query, sort = {}) {
  return new Promise((resolve, reject) => {
    let cursor = db.find(query);
    if (Object.keys(sort).length) cursor = cursor.sort(sort);
    cursor.exec((err, docs) => { if (err) reject(err); else resolve(docs); });
  });
}
function insert(db, doc) {
  return new Promise((resolve, reject) => {
    db.insert(doc, (err, newDoc) => { if (err) reject(err); else resolve(newDoc); });
  });
}
function update(db, query, update, options = {}) {
  return new Promise((resolve, reject) => {
    db.update(query, update, options, (err, n) => { if (err) reject(err); else resolve(n); });
  });
}
function remove(db, query, options = {}) {
  return new Promise((resolve, reject) => {
    db.remove(query, options, (err, n) => { if (err) reject(err); else resolve(n); });
  });
}
function count(db, query) {
  return new Promise((resolve, reject) => {
    db.count(query, (err, n) => { if (err) reject(err); else resolve(n); });
  });
}

// ─── Seed admin ───────────────────────────────────────────────────────────────
async function seedAdmin() {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@1234';

  const existing = await findOne(users, { role: 'admin' });
  if (!existing) {
    const hash = bcrypt.hashSync(adminPassword, 12);
    await insert(users, {
      username:    adminUsername,
      password:    hash,
      discord_id:  '000000000000000000',
      discord_key: 'admin-default-key',
      role:        'admin',
      created_at:  new Date().toISOString()
    });
    console.log(`[DB] Admin created → username: "${adminUsername}", password: "${adminPassword}"`);
  }
}

seedAdmin().catch(console.error);

module.exports = { users, auditLog, findOne, find, insert, update, remove, count };
