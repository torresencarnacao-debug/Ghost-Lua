const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Init DB (runs schema + seed)
const db = require('./db');
const { findOne, update, users } = db;

const authRoutes  = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const paypalWatcher = require('./paypalMailWatcher');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── API Routes ────────────────────────────────────────────────────────────────
app.use('/api', authRoutes);
app.use('/api/admin', adminRoutes);

// ─── SPA Fallback ──────────────────────────────────────────────────────────────
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ─── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}`);
  console.log(`📊 Dashboard  → http://localhost:${PORT}/dashboard`);
  console.log(`👑 Admin Panel → http://localhost:${PORT}/admin`);
  console.log(`🔑 Default Admin: admin / Admin@1234\n`);

  // ─── Surveillance PayPal Gmail ───────────────────────────────────────────────
  paypalWatcher.init({ findOne, update, users });
  paypalWatcher.startWatcher(
    process.env.GMAIL_USER,
    process.env.GMAIL_APP_PASSWORD
  );
});
