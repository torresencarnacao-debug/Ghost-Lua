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
const products = new Datastore({
  filename: path.join(DB_DIR, 'products.db'),
  autoload: true
});
const promocodes = new Datastore({
  filename: path.join(DB_DIR, 'promocodes.db'),
  autoload: true
});

// ─── Indexes ─────────────────────────────────────────────────────────────────
users.ensureIndex({ fieldName: 'username', unique: true });
products.ensureIndex({ fieldName: 'id', unique: true });
promocodes.ensureIndex({ fieldName: 'code', unique: true });

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

// ─── Seed Products ─────────────────────────────────────────────────────────────
async function seedProducts() {
  const prodCount = await count(products, {});
  if (prodCount === 0) {
    await insert(products, {
        id: 'ghost_lua',
        name: 'Ghost Lua',
        icon: 'fa-solid fa-ghost',
        image: 'ghost_lua.jpg',
        badge: 'Exclusif',
        category: 'utilities',
        frameworks: ['qb', 'esx', 'qbox'],
        shortDesc: 'L\'outil ultime de Ghost Shop. Fluide et 100% indétectable.',
        longDesc: 'Ghost Lua est la ressource phare de Ghost Shop. Conçu pour offrir un contrôle total sur votre serveur FiveM, ce script dispose d\'un menu intuitif et d\'options avancées de gestion des entités. Entièrement sécurisé.',
        version: '1.0.0',
        escrow: 'Oui',
        dependencies: 'Aucune',
        price: '19.99',
        stripeLink: 'https://buy.stripe.com/bJe6oJ50EceP1Vqbmz9Ve00',
        features: [
            'Gestion avancée du serveur en temps réel',
            'Menu d\'administration Ghost intuitif et sécurisé',
            'Indétectable et compatible QB-Core, ESX et Qbox',
            'Zéro fuite mémoire garantie',
            'Support technique premium inclus'
        ]
    });
    console.log(`[DB] Default product (Ghost Lua) seeded.`);
  }
}

seedAdmin().catch(console.error);
seedProducts().catch(console.error);

module.exports = { users, auditLog, products, promocodes, findOne, find, insert, update, remove, count };
