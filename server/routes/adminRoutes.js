const express = require('express');
const { users, auditLog, products, promocodes, find, findOne, update, remove, insert, count } = require('../db');
const { verifyToken, requireAdmin } = require('../auth');
const { grantDiscordRole } = require('../discord');

const router = express.Router();
router.use(verifyToken, requireAdmin);

// ----------------------------
// GET /api/admin/stats
// ----------------------------
router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart  = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dayStart   = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const [totalUsers, totalVIPs, totalAdmins, todayUsers, weekUsers, recentLogins] = await Promise.all([
      count(users,    { role: 'user' }),
      count(users,    { role: 'vip' }),
      count(users,    { role: 'admin' }),
      count(users,    { role: { $in: ['user', 'vip'] }, created_at: { $gte: todayStart } }),
      count(users,    { role: { $in: ['user', 'vip'] }, created_at: { $gte: weekStart } }),
      count(auditLog, { action: 'login', created_at: { $gte: dayStart } }),
    ]);

    return res.json({ totalUsers, totalVIPs, totalAdmins, todayUsers, weekUsers, recentLogins });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur interne.' });
  }
});

// ----------------------------
// GET /api/admin/users
// ----------------------------
router.get('/users', async (req, res) => {
  try {
    const allUsers = await find(users, {}, { created_at: -1 });
    const safe = allUsers.map(({ password, ...u }) => ({ ...u, id: u._id }));
    return res.json({ users: safe });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur interne.' });
  }
});

// ----------------------------
// DELETE /api/admin/users/:id
// ----------------------------
router.delete('/users/:id', async (req, res) => {
  const { id } = req.params;
  if (id === req.user.id)
    return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' });

  try {
    const user = await findOne(users, { _id: id });
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé.' });

    await remove(users, { _id: id });
    await insert(auditLog, { user_id: req.user.id, action: 'admin_delete_user', ip: req.ip, created_at: new Date().toISOString(), username: req.user.username });

    return res.json({ message: 'Utilisateur supprimé avec succès.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur interne.' });
  }
});

// ----------------------------
// PATCH /api/admin/users/:id/role
// ----------------------------
router.patch('/users/:id/role', async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (!['user', 'vip', 'admin'].includes(role))
    return res.status(400).json({ error: 'Rôle invalide (user, vip ou admin).' });
  if (id === req.user.id)
    return res.status(400).json({ error: 'Vous ne pouvez pas modifier votre propre rôle.' });

  try {
    const user = await findOne(users, { _id: id });
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé.' });

    await update(users, { _id: id }, { $set: { role } });
    await insert(auditLog, { user_id: req.user.id, action: 'admin_change_role', ip: req.ip, created_at: new Date().toISOString(), username: req.user.username });

    return res.json({ message: `Rôle mis à jour : "${role}".` });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur interne.' });
  }
});

// ----------------------------
// PUT /api/admin/users/:id (Modification complète)
// ----------------------------
router.put('/users/:id', async (req, res) => {
  const { id } = req.params;
  const { username, discord_id, discord_key, role } = req.body;

  if (id === req.user.id)
    return res.status(400).json({ error: 'Vous ne pouvez pas modifier vos propres informations via ce panel.' });

  try {
    const user = await findOne(users, { _id: id });
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé.' });

    const updates = {};
    if (username !== undefined) {
      const u = username.trim();
      if (u.length < 3 || u.length > 32 || !/^[a-zA-Z0-9_.\-]+$/.test(u)) {
        return res.status(400).json({ error: 'Username invalide (3-32 chars, a-z/0-9/._-).' });
      }
      const existing = await findOne(users, { username: { $regex: new RegExp(`^${u}$`, 'i') }, _id: { $ne: id } });
      if (existing) return res.status(409).json({ error: 'Ce nom d\'utilisateur est déjà pris.' });
      updates.username = u;
    }

    if (discord_id !== undefined) {
      const did = discord_id.trim();
      if (!/^\d{17,20}$/.test(did)) {
        return res.status(400).json({ error: 'Discord ID invalide (17-20 chiffres).' });
      }
      updates.discord_id = did;
    }

    if (discord_key !== undefined) {
      const dk = discord_key.trim();
      if (dk.length < 1) {
        return res.status(400).json({ error: 'La clé ne peut pas être vide.' });
      }
      const existingKey = await findOne(users, { discord_key: dk, _id: { $ne: id } });
      if (existingKey) return res.status(409).json({ error: 'Cette clé est déjà utilisée par un autre compte.' });
      updates.discord_key = dk;

      if (dk !== user.discord_key) {
        updates.has_paid = true;
        updates.paid_at = new Date().toISOString();
        updates.payment_method = 'discord';
      }
    }

    if (role !== undefined) {
      if (!['user', 'vip', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Rôle invalide (user, vip ou admin).' });
      }
      updates.role = role;
    }

    // Force matching role based on key type for non-admin accounts
    const targetRole = updates.role !== undefined ? updates.role : user.role;
    const targetKey = updates.discord_key !== undefined ? updates.discord_key : user.discord_key;
    if (targetRole !== 'admin') {
      const cleanKey = targetKey ? targetKey.trim() : '';
      if (cleanKey !== '' && cleanKey !== 'none' && cleanKey !== 'no_key') {
        const isVip = cleanKey.length < 12;
        updates.role = isVip ? 'vip' : 'user';
      } else {
        updates.role = 'guest';
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Aucune modification reçue.' });
    }

    await update(users, { _id: id }, { $set: updates });
    await insert(auditLog, {
      user_id: req.user.id,
      action: 'admin_edit_user',
      ip: req.ip,
      created_at: new Date().toISOString(),
      username: req.user.username
    });

    const activeDiscordId = updates.discord_id !== undefined ? updates.discord_id : user.discord_id;
    const activeDiscordKey = updates.discord_key !== undefined ? updates.discord_key : user.discord_key;

    if (activeDiscordId && activeDiscordKey && activeDiscordKey.trim() !== '') {
      const activeRole = updates.role !== undefined ? updates.role : user.role;
      grantDiscordRole(activeDiscordId, activeRole, user.username).catch(err => {
        console.error('[AUTO_ROLE_ADMIN_EDIT_ERROR]', err);
      });
    }

    return res.json({ message: 'Utilisateur mis à jour avec succès.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur interne.' });
  }
});

// ----------------------------
// GET /api/admin/logs
// ----------------------------
router.get('/logs', async (req, res) => {
  try {
    const logs = await find(auditLog, {}, { created_at: -1 });
    return res.json({ logs: logs.slice(0, 100) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur interne.' });
  }
});

// ----------------------------
// GET /api/admin/products
// ----------------------------
router.get('/products', async (req, res) => {
  try {
    const allProducts = await find(products, {});
    return res.json({ products: allProducts });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur interne.' });
  }
});

// ----------------------------
// POST /api/admin/products
// ----------------------------
router.post('/products', async (req, res) => {
  try {
    const newProduct = req.body;
    if (!newProduct.id) {
      newProduct.id = 'prod_' + Math.random().toString(36).substring(2, 9);
    }
    await insert(products, newProduct);
    await insert(auditLog, { user_id: req.user.id, action: 'admin_add_product', ip: req.ip, created_at: new Date().toISOString(), username: req.user.username });
    return res.json({ message: 'Produit ajouté.', product: newProduct });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur interne.' });
  }
});

// ----------------------------
// PUT /api/admin/products/:id
// ----------------------------
router.put('/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const updates = req.body;
    delete updates._id; // avoid updating nedb internal id
    
    await update(products, { id }, { $set: updates });
    await insert(auditLog, { user_id: req.user.id, action: 'admin_edit_product', ip: req.ip, created_at: new Date().toISOString(), username: req.user.username });
    return res.json({ message: 'Produit mis à jour.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur interne.' });
  }
});

// ----------------------------
// DELETE /api/admin/products/:id
// ----------------------------
router.delete('/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await remove(products, { id });
    await insert(auditLog, { user_id: req.user.id, action: 'admin_delete_product', ip: req.ip, created_at: new Date().toISOString(), username: req.user.username });
    return res.json({ message: 'Produit supprimé.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur interne.' });
  }
});

// ─── PROXY RAILWAY API ────────────────────────────────────────────────────────
const RAILWAY_API_URL = 'https://fpsbn-auth-production.up.railway.app';
const RAILWAY_SECRET = 'Fpbsnlua095';

async function railwayRequest(endpoint, method = 'GET', body = null) {
  let url = `${RAILWAY_API_URL}${endpoint}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };
  if (method === 'GET') {
    const separator = url.includes('?') ? '&' : '?';
    url += `${separator}secret=${encodeURIComponent(RAILWAY_SECRET)}`;
  } else if (body) {
    options.body = JSON.stringify({ ...body, secret: RAILWAY_SECRET });
  }
  
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Railway API returned status ${response.status}`);
  }
  return await response.json();
}

// GET status (codes, banned_ips, logs)
router.get('/railway/status', async (req, res) => {
  try {
    const data = await railwayRequest('/status', 'GET');
    return res.json(data);
  } catch (err) {
    console.error('[RAILWAY_PROXY_ERR]', err);
    return res.status(502).json({ error: 'Impossible de joindre le serveur Railway.' });
  }
});

// POST generate keys
router.post('/railway/generate', async (req, res) => {
  const { count, duration_days } = req.body;
  try {
    const data = await railwayRequest('/generate', 'POST', { count, duration_days });
    return res.json(data);
  } catch (err) {
    console.error('[RAILWAY_PROXY_ERR]', err);
    return res.status(502).json({ error: 'Erreur de génération sur Railway.' });
  }
});

// POST add manual key
router.post('/railway/add', async (req, res) => {
  const { code, duration_days } = req.body;
  try {
    const data = await railwayRequest('/add', 'POST', { code, duration_days });
    return res.json(data);
  } catch (err) {
    console.error('[RAILWAY_PROXY_ERR]', err);
    return res.status(502).json({ error: 'Erreur d\'ajout sur Railway.' });
  }
});

// POST delete key
router.post('/railway/delete', async (req, res) => {
  const { code } = req.body;
  try {
    const data = await railwayRequest('/delete', 'POST', { code });
    
    // Dissocier automatiquement l'utilisateur ayant cette clé localement
    const userToDissociate = await findOne(users, { discord_key: code });
    if (userToDissociate) {
      const updates = {
        discord_key: '',
        has_paid: false,
        payment_method: ''
      };
      if (userToDissociate.role !== 'admin') {
        updates.role = 'guest';
      }
      await update(users, { _id: userToDissociate._id }, { $set: updates });
      await insert(auditLog, {
        user_id: req.user.id, // L'admin effectuant la suppression
        action: 'admin_dissociate_key_on_delete',
        ip: req.ip,
        created_at: new Date().toISOString(),
        username: req.user.username,
        details: { code, target_user: userToDissociate.username }
      });
    }

    return res.json(data);
  } catch (err) {
    console.error('[RAILWAY_PROXY_ERR]', err);
    return res.status(502).json({ error: 'Erreur de suppression sur Railway.' });
  }
});

// POST delete multiple keys
router.post('/railway/delete-multiple', async (req, res) => {
  const { codes } = req.body;
  if (!Array.isArray(codes) || codes.length === 0) {
    return res.status(400).json({ error: 'Aucune clé fournie.' });
  }

  try {
    const results = [];
    const dissociatedUsers = [];

    for (const code of codes) {
      try {
        await railwayRequest('/delete', 'POST', { code });
        results.push({ code, status: 'deleted' });

        // Dissocier l'utilisateur localement
        const userToDissociate = await findOne(users, { discord_key: code });
        if (userToDissociate) {
          const updates = {
            discord_key: '',
            has_paid: false,
            payment_method: ''
          };
          if (userToDissociate.role !== 'admin') {
            updates.role = 'guest';
          }
          await update(users, { _id: userToDissociate._id }, { $set: updates });
          dissociatedUsers.push(userToDissociate.username);
        }
      } catch (err) {
        console.error(`[RAILWAY_MULTI_DELETE_ERR] Failed to delete ${code}:`, err);
        results.push({ code, status: 'failed', error: err.message || 'Erreur Railway' });
      }
    }

    if (results.some(r => r.status === 'deleted')) {
      const deletedCodes = results.filter(r => r.status === 'deleted').map(r => r.code);
      await insert(auditLog, {
        user_id: req.user.id,
        action: 'admin_delete_multiple_keys',
        ip: req.ip,
        created_at: new Date().toISOString(),
        username: req.user.username,
        details: { codes: deletedCodes, target_users: dissociatedUsers }
      });
    }

    return res.json({ message: 'Traitement des suppressions terminé.', results });
  } catch (err) {
    console.error('[RAILWAY_PROXY_ERR]', err);
    return res.status(500).json({ error: 'Erreur interne lors de la suppression groupée.' });
  }
});

// POST reset key lock IP
router.post('/railway/reset', async (req, res) => {
  const { code } = req.body;
  try {
    const data = await railwayRequest('/reset', 'POST', { code });
    return res.json(data);
  } catch (err) {
    console.error('[RAILWAY_PROXY_ERR]', err);
    return res.status(502).json({ error: 'Erreur de reset sur Railway.' });
  }
});

// POST reset-all keys
router.post('/railway/reset-all', async (req, res) => {
  try {
    const data = await railwayRequest('/reset-all', 'POST');
    return res.json(data);
  } catch (err) {
    console.error('[RAILWAY_PROXY_ERR]', err);
    return res.status(502).json({ error: 'Erreur de reset global sur Railway.' });
  }
});

// POST ban IP
router.post('/railway/ban', async (req, res) => {
  const { ip } = req.body;
  try {
    const data = await railwayRequest('/ban-ip', 'POST', { ip });
    return res.json(data);
  } catch (err) {
    console.error('[RAILWAY_PROXY_ERR]', err);
    return res.status(502).json({ error: 'Erreur de bannissement IP sur Railway.' });
  }
});

// POST unban IP
router.post('/railway/unban', async (req, res) => {
  const { ip } = req.body;
  try {
    const data = await railwayRequest('/unban-ip', 'POST', { ip });
    return res.json(data);
  } catch (err) {
    console.error('[RAILWAY_PROXY_ERR]', err);
    return res.status(502).json({ error: 'Erreur de débannissement IP sur Railway.' });
  }
});

// ----------------------------
// GET /api/admin/promocodes
// ----------------------------
router.get('/promocodes', async (req, res) => {
  try {
    const allPromo = await find(promocodes, {}, { created_at: -1 });
    return res.json({ promocodes: allPromo });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur interne.' });
  }
});

// ----------------------------
// POST /api/admin/promocodes
// ----------------------------
router.post('/promocodes', async (req, res) => {
  try {
    const { code, type, value, max_uses, expiry_date } = req.body;
    if (!code || !type || value === undefined) {
      return res.status(400).json({ error: 'Champs obligatoires manquants.' });
    }
    const cleanCode = code.trim().toUpperCase();
    const existing = await findOne(promocodes, { code: cleanCode });
    if (existing) {
      return res.status(409).json({ error: 'Ce code promotionnel existe déjà.' });
    }
    const newPromo = {
      code: cleanCode,
      type,
      value: Number(value),
      max_uses: max_uses ? Number(max_uses) : null,
      uses: 0,
      expiry_date: expiry_date || null,
      created_at: new Date().toISOString()
    };
    const saved = await insert(promocodes, newPromo);
    await insert(auditLog, { user_id: req.user.id, action: 'admin_add_promocode', ip: req.ip, created_at: new Date().toISOString(), username: req.user.username, details: { code: cleanCode } });
    return res.json({ message: 'Code promotionnel créé.', promocode: saved });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur interne.' });
  }
});

// ----------------------------
// PUT /api/admin/promocodes/:id
// ----------------------------
router.put('/promocodes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { code, type, value, max_uses, expiry_date } = req.body;
    const cleanCode = code.trim().toUpperCase();
    
    const existing = await findOne(promocodes, { code: cleanCode, _id: { $ne: id } });
    if (existing) {
      return res.status(409).json({ error: 'Ce code promotionnel existe déjà.' });
    }

    const updates = {
      code: cleanCode,
      type,
      value: Number(value),
      max_uses: max_uses ? Number(max_uses) : null,
      expiry_date: expiry_date || null
    };

    await update(promocodes, { _id: id }, { $set: updates });
    await insert(auditLog, { user_id: req.user.id, action: 'admin_edit_promocode', ip: req.ip, created_at: new Date().toISOString(), username: req.user.username, details: { code: cleanCode } });
    return res.json({ message: 'Code promotionnel mis à jour.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur interne.' });
  }
});

// ----------------------------
// DELETE /api/admin/promocodes/:id
// ----------------------------
router.delete('/promocodes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const promo = await findOne(promocodes, { _id: id });
    if (!promo) return res.status(404).json({ error: 'Code promo non trouvé.' });

    await remove(promocodes, { _id: id });
    await insert(auditLog, { user_id: req.user.id, action: 'admin_delete_promocode', ip: req.ip, created_at: new Date().toISOString(), username: req.user.username, details: { code: promo.code } });
    return res.json({ message: 'Code promotionnel supprimé.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur interne.' });
  }
});

module.exports = router;
