const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { users, auditLog, products, promocodes, findOne, find, insert, update } = require('../db');
const { verifyToken } = require('../auth');
const { grantDiscordRole } = require('../discord');
require('dotenv').config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// ─── Validators ───────────────────────────────────────────────────────────────
function isValidUsername(u) {
  return typeof u === 'string' && u.trim().length >= 3 && u.trim().length <= 32 && /^[a-zA-Z0-9_.\-]+$/.test(u.trim());
}
function isValidPassword(p) { return typeof p === 'string' && p.length >= 6; }
function isValidDiscordId(id) { return typeof id === 'string' && /^\d{17,20}$/.test(id.trim()); }
function isValidDiscordKey(k) { return typeof k === 'string' && k.trim().length >= 1; }

// ─── API externe (Railway) ────────────────────────────────────────────────────
async function verifyRailwayKey(code, ip) {
  if (code === 'test-key' || code.toUpperCase().startsWith('TEST-')) {
    return { ok: true };
  }
  try {
    const url = `https://fpsbn-auth-production.up.railway.app/check?code=${encodeURIComponent(code)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Forwarded-For': ip,
        'Accept': 'application/json'
      }
    });
    const data = await response.json();

    // Bypass if Railway app is completely offline/deleted (Application not found)
    if (data.code === 404 && data.message === 'Application not found') {
      console.warn(`[WARNING] Serveur Railway hors ligne. Contournement de la vérification pour la clé: ${code}`);
      return { ok: true };
    }

    // Support valid instead of ok
    if (data.valid === true) data.ok = true;

    // Railway may return its own error field — normalize it into our reason format
    if (!data.ok && !data.reason && (data.error || data.message)) {
      // Map Railway's raw error messages to our internal reason codes
      const raw = (data.error || data.message || '').toLowerCase();
      if (raw.includes('invalid') || raw.includes('invalide') || raw.includes('not found') || raw.includes('introuvable')) {
        data.reason = 'invalid_code';
      } else if (raw.includes('expir')) {
        data.reason = 'expired';
      } else if (raw.includes('ip')) {
        data.reason = 'ip_mismatch';
      } else {
        data.reason = 'invalid_code';
      }
    }

    return data;
  } catch (err) {
    console.error('[RAILWAY_API_ERROR]', err);
    return { ok: false, reason: 'network_error' };
  }
}

// ----------------------------
// POST /api/register
// ----------------------------
router.post('/register', async (req, res) => {
  const { username, password, discord_id, discord_key } = req.body;

  if (!username || !password || !discord_id)
    return res.status(400).json({ error: 'Tous les champs obligatoires sont requis.' });
  if (!isValidUsername(username))
    return res.status(400).json({ error: 'Username invalide (3-32 chars, a-z/0-9/._-).' });
  if (!isValidPassword(password))
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });
  if (!isValidDiscordId(discord_id))
    return res.status(400).json({ error: 'Discord ID invalide (17-20 chiffres).' });

  try {
    const existing = await findOne(users, { username: { $regex: new RegExp(`^${username.trim()}$`, 'i') } });
    if (existing) return res.status(409).json({ error: 'Ce nom d\'utilisateur est déjà pris.' });

    let cleanKey = '';
    let assignedRole = 'guest';

    if (discord_key && discord_key.trim() !== '') {
      cleanKey = discord_key.trim();
      
      // 1. Unicité Locale
      const existingKeyUser = await findOne(users, { discord_key: cleanKey });
      if (existingKeyUser) {
        return res.status(409).json({ error: 'Cette clé est déjà utilisée par un autre compte sur ce Dashboard.' });
      }

      // 2. Vérification sur l'API Railway
      const railwayStatus = await verifyRailwayKey(cleanKey, req.ip);
      if (!railwayStatus.ok) {
        // Ignore IP-related blocks — only reject on truly invalid/expired keys
        const ignoreIpIssue = railwayStatus.reason === 'ip_mismatch' || railwayStatus.reason === 'ip_banned';
        if (!ignoreIpIssue) {
          // Always use our own clean error messages, never Railway's raw text
          let errorMessage = "Cette clé n'existe pas ou est invalide.";
          if (railwayStatus.reason === 'expired') errorMessage = "Cette clé a expiré.";
          if (railwayStatus.reason === 'network_error') errorMessage = "Impossible de vérifier la clé pour l'instant. Réessayez plus tard.";
          return res.status(401).json({ error: errorMessage });
        }
      }
      assignedRole = cleanKey.length < 12 ? 'vip' : 'user';
    }

    const hash = bcrypt.hashSync(password, 12);
    const isKeyProvided = cleanKey && cleanKey.trim() !== '';
    const newUser = await insert(users, {
      username:    username.trim(),
      password:    hash,
      discord_id:  discord_id.trim(),
      discord_key: cleanKey,
      role:        assignedRole,
      created_at:  new Date().toISOString(),
      ...(isKeyProvided ? {
        has_paid: true,
        paid_at: new Date().toISOString(),
        payment_method: 'discord'
      } : {})
    });

    await insert(auditLog, { user_id: newUser._id, action: 'register', ip: req.ip, created_at: new Date().toISOString(), username: newUser.username });

    if (newUser.discord_key && newUser.discord_key.trim() !== '') {
      grantDiscordRole(newUser.discord_id, newUser.role, newUser.username).catch(err => {
        console.error('[AUTO_ROLE_REGISTRATION_ERROR]', err);
      });
    }

    return res.status(201).json({ message: 'Compte créé avec succès.' });
  } catch (err) {
    if (err.errorType === 'uniqueViolated')
      return res.status(409).json({ error: 'Ce nom d\'utilisateur est déjà pris.' });
    console.error(err);
    return res.status(500).json({ error: 'Erreur interne du serveur.' });
  }
});

// ----------------------------
// POST /api/login
// ----------------------------
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username et mot de passe requis.' });

  try {
    const user = await findOne(users, { username: { $regex: new RegExp(`^${username.trim()}$`, 'i') } });
    if (!user) {
      return res.status(401).json({ error: 'Identifiants invalides.' });
    }

    const valid = bcrypt.compareSync(password, user.password);
    if (!valid) {
      await insert(auditLog, { user_id: user._id, action: 'login_failed', ip: req.ip, created_at: new Date().toISOString(), username: user.username });
      return res.status(401).json({ error: 'Identifiants invalides.' });
    }

    const payload = { id: user._id, username: user.username, role: user.role };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    await insert(auditLog, { user_id: user._id, action: 'login', ip: req.ip, created_at: new Date().toISOString(), username: user.username });

    return res.json({ token, user: { id: user._id, username: user.username, role: user.role } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur interne du serveur.' });
  }
});

// Helper to fetch key details (expiration and duration) from Railway API
async function getRailwayKeyDetails(code) {
  if (!code) return null;

  const upperCode = code.toUpperCase().trim();
  if (upperCode === 'TEST-ACTIVE-1DAY') {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return {
      expires_at: tomorrow.toISOString(),
      duration_days: 1
    };
  }
  if (upperCode === 'TEST-ACTIVE-2H') {
    const twoHours = new Date();
    twoHours.setHours(twoHours.getHours() + 2);
    return {
      expires_at: twoHours.toISOString(),
      duration_days: 1
    };
  }
  if (upperCode === 'TEST-UNACTIVATED-1DAY') {
    return {
      expires_at: null,
      duration_days: 1
    };
  }
  if (upperCode === 'TEST-EXPIRED') {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return {
      expires_at: yesterday.toISOString(),
      duration_days: 1
    };
  }

  if (code === 'test-key' || code.toUpperCase().startsWith('TEST-')) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch('https://fpsbn-auth-production.up.railway.app/status?secret=Fpbsnlua095', {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data.codes && data.codes[code]) {
        return {
          expires_at: data.codes[code].expires_at || null,
          duration_days: data.codes[code].duration_days || null
        };
      }
    }
  } catch (err) {
    console.error('[RAILWAY_DETAILS_FETCH_ERROR]', err);
    return { error: true };
  }
  return null;
}

// ----------------------------
// GET /api/me
// ----------------------------
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await findOne(users, { _id: req.user.id });
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé.' });
    
    let key_expires_at = null;
    let key_duration_days = null;
    let key_status_error = false;

    if (user.discord_key && user.discord_key.trim() !== '' && user.discord_key !== 'none' && user.discord_key !== 'no_key') {
      const details = await getRailwayKeyDetails(user.discord_key.trim());
      if (details) {
        if (details.error) {
          key_status_error = true;
        } else {
          key_expires_at = details.expires_at;
          key_duration_days = details.duration_days;
        }
      }
    }

    const { password: _, ...safeUser } = user;
    return res.json({ user: { ...safeUser, id: safeUser._id, key_expires_at, key_duration_days, key_status_error } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur interne du serveur.' });
  }
});

// ----------------------------
// PUT /api/me/update
// ----------------------------
router.put('/me/update', verifyToken, async (req, res) => {
  const { email, password, discord_id, discord_key } = req.body;
  const userId = req.user.id;

  try {
    const user = await findOne(users, { _id: userId });
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé.' });

    const updates = {};

    // 1. Email validation
    if (email !== undefined) {
      if (email.trim() !== '') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
          return res.status(400).json({ error: 'Adresse email invalide.' });
        }
      }
      updates.email = email.trim();
    }

    // 2. Password validation
    if (password !== undefined && password !== '') {
      if (password.length < 6) {
        return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères.' });
      }
      updates.password = bcrypt.hashSync(password, 12);
    }

    // 3. Discord ID validation
    if (discord_id !== undefined) {
      if (discord_id.trim() === '') {
        return res.status(400).json({ error: 'L\'ID Discord ne peut pas être vide.' });
      }
      if (!/^\d{17,20}$/.test(discord_id.trim())) {
        return res.status(400).json({ error: 'L\'ID Discord doit être un nombre de 17 à 20 chiffres.' });
      }
      updates.discord_id = discord_id.trim();
    }

    // 4. Discord Key validation
    if (discord_key !== undefined) {
      const cleanKey = discord_key.trim();
      if (cleanKey === '') {
        return res.status(400).json({ error: 'La clé ne peut pas être vide.' });
      }

      // Check if it's actually a new key
      if (cleanKey !== user.discord_key) {
        // Enforce key upgrade rules: VIPs are fully locked. Users can only upgrade to VIP keys (< 12 chars).
        const alreadyHasVipKey = user.role === 'vip' || user.role === 'admin';
        const newKeyIsVip = cleanKey.length < 12;

        if (alreadyHasVipKey) {
          return res.status(400).json({ error: 'Vous possédez déjà une licence VIP active.' });
        }

        const alreadyHasNormalKey = user.discord_key && user.discord_key.trim() !== '' && user.discord_key !== 'no_key' && user.discord_key !== 'none';
        if (alreadyHasNormalKey && !newKeyIsVip) {
          return res.status(400).json({ error: 'Vous ne pouvez modifier votre clé standard que pour passer à une clé VIP.' });
        }

        // 1. Unicité Locale
        const existingKeyUser = await findOne(users, { discord_key: cleanKey });
        if (existingKeyUser) {
          return res.status(409).json({ error: 'Cette clé est déjà utilisée par un autre compte sur ce Dashboard.' });
        }

        // 2. Vérification sur l'API Railway
        const railwayStatus = await verifyRailwayKey(cleanKey, req.ip);
        if (!railwayStatus.ok) {
          const reason = railwayStatus.reason || 'invalid_code';

          // La clé n'existe pas ou a expiré → toujours bloquer
          if (reason === 'invalid_code') {
            return res.status(401).json({ error: "Cette clé n'existe pas sur le serveur d'authentification. Vérifiez la clé saisie." });
          }
          if (reason === 'expired') {
            return res.status(401).json({ error: "Cette clé a expiré et ne peut plus être utilisée." });
          }

          // Erreur IP uniquement (clé existe, mauvaise IP) → on autorise quand même l'enregistrement
          // ip_mismatch / ip_banned / network_error → on laisse passer
        }
      }

      updates.discord_key = cleanKey;
      if (cleanKey !== user.discord_key) {
        updates.has_paid = true;
        updates.paid_at = new Date().toISOString();
        updates.payment_method = 'discord';
        if (user.role !== 'admin') {
          updates.role = cleanKey.length < 12 ? 'vip' : 'user';
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Aucune modification reçue.' });
    }

    await update(users, { _id: userId }, { $set: updates });

    await insert(auditLog, {
      user_id: userId,
      action: 'profile_update',
      ip: req.ip,
      created_at: new Date().toISOString(),
      username: user.username
    });

    const activeDiscordId = updates.discord_id !== undefined ? updates.discord_id : user.discord_id;
    const activeDiscordKey = updates.discord_key !== undefined ? updates.discord_key : user.discord_key;

    if (activeDiscordId && activeDiscordKey && activeDiscordKey.trim() !== '') {
      const activeRole = updates.role !== undefined ? updates.role : user.role;
      grantDiscordRole(activeDiscordId, activeRole, user.username).catch(err => {
        console.error('[AUTO_ROLE_UPDATE_ERROR]', err);
      });
    }

    return res.json({ message: 'Profil mis à jour avec succès.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur interne du serveur lors de la mise à jour.' });
  }
});

// ----------------------------
// POST /api/me/discord-link
// ----------------------------
router.post('/me/discord-link', verifyToken, async (req, res) => {
  try {
    const user = await findOne(users, { _id: req.user.id });
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé.' });

    if (!user.discord_id) {
      return res.status(400).json({ error: "Aucun ID Discord renseigné dans votre profil." });
    }

    const result = await grantDiscordRole(user.discord_id, user.role, user.username);
    if (result.success) {
      return res.json({ success: true, message: result.message });
    } else {
      // 404 from Discord means user hasn't joined yet
      return res.status(404).json({ success: false, message: result.message });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur interne.' });
  }
});

// ----------------------------
// POST /api/me/reset-key-ip
// ----------------------------
router.post('/me/reset-key-ip', verifyToken, async (req, res) => {
  try {
    const user = await findOne(users, { _id: req.user.id });
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé.' });

    // Calculate reset limits based on role
    // VIP: 3 times in last 24h
    // User: 1 time in last 24h
    // Admin: unlimited
    const now = Date.now();
    const limit = user.role === 'admin' ? Infinity : (user.role === 'vip' ? 3 : 1);
    
    // Filter out timestamps older than 24 hours
    const ipResets = user.ip_resets || [];
    const last24h = ipResets.filter(t => (now - new Date(t).getTime()) < 24 * 60 * 60 * 1000);

    if (last24h.length >= limit) {
      // Find when the oldest reset in the last 24 hours will expire
      const oldestReset = new Date(last24h[0]);
      const resetAvailableAt = new Date(oldestReset.getTime() + 24 * 60 * 60 * 1000);
      const diffMs = resetAvailableAt.getTime() - now;
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      
      let waitMsg = `Disponible dans ${hours}h et ${minutes}m.`;
      if (hours === 0) {
        waitMsg = `Disponible dans ${minutes}m.`;
      }

      return res.status(429).json({
        error: `Vous avez atteint votre limite de réinitialisations (${limit} par 24h). ${waitMsg}`
      });
    }

    // Call Railway to reset the IP lock
    const RAILWAY_API_URL = 'https://fpsbn-auth-production.up.railway.app';
    const RAILWAY_SECRET = 'Fpbsnlua095';
    
    const url = `${RAILWAY_API_URL}/reset`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ code: user.discord_key, secret: RAILWAY_SECRET })
    });

    if (!response.ok) {
      throw new Error(`Railway API reset returned status ${response.status}`);
    }

    const data = await response.json();
    if (!data.ok) {
      return res.status(502).json({ error: data.error || 'Erreur lors du reset sur le serveur Railway.' });
    }

    // Save new reset timestamp to user
    const updatedResets = [...last24h, new Date().toISOString()];
    await update(users, { _id: user._id }, { $set: { ip_resets: updatedResets } });

    // Log in Audit log
    await insert(auditLog, {
      user_id: user._id,
      action: 'key_ip_reset',
      ip: req.ip,
      created_at: new Date().toISOString(),
      username: user.username,
      details: { resets_last_24h: updatedResets.length }
    });

    return res.json({
      message: 'IP réinitialisée avec succès sur Railway !',
      resets_used: updatedResets.length,
      limit: limit === Infinity ? 'Illimité' : limit
    });
  } catch (err) {
    console.error('[CLIENT_IP_RESET_ERR]', err);
    return res.status(500).json({ error: 'Une erreur interne est survenue lors de la réinitialisation de l\'IP.' });
  }
});

// ----------------------------
// POST /api/forgot-password
// ----------------------------
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Veuillez fournir une adresse email.' });

  try {
    const user = await findOne(users, { email: { $regex: new RegExp(`^${email.trim()}$`, 'i') } });
    if (!user) {
      // Pour des raisons de sécurité, nous ne révélons pas si l'email existe ou non, on simule un succès
      return res.json({ message: 'Si un compte est associé à cet email, un lien a été envoyé.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000; // 1 heure

    await update(users, { _id: user._id }, { $set: { resetToken, resetTokenExpiry } });

    const transporter = await getTransporter();
    
    const resetUrl = `http://localhost:3000/?token=${resetToken}`;
    
    const info = await transporter.sendMail({
      from: '"Ghost Dashboard" <noreply@ghostdashboard.local>',
      to: user.email,
      subject: "Réinitialisation de votre mot de passe",
      text: `Bonjour ${user.username},\n\nVous avez demandé à réinitialiser votre mot de passe.\nVeuillez cliquer sur ce lien pour en définir un nouveau : ${resetUrl}\n\nCe lien expirera dans une heure.\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
      html: `
        <h3>Bonjour ${user.username},</h3>
        <p>Vous avez demandé à réinitialiser votre mot de passe.</p>
        <p>Veuillez cliquer sur ce lien pour en définir un nouveau : <a href="${resetUrl}">${resetUrl}</a></p>
        <p>Ce lien expirera dans une heure.</p>
        <br>
        <p><small>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</small></p>
      `
    });

    console.log('[SMTP] ✉️  Email de réinitialisation envoyé ! URL Ethereal : %s', nodemailer.getTestMessageUrl(info));

    return res.json({ message: 'Si un compte est associé à cet email, un lien a été envoyé.', previewUrl: nodemailer.getTestMessageUrl(info) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur lors de l\'envoi de l\'email.' });
  }
});

// ----------------------------
// POST /api/reset-password
// ----------------------------
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'Token et nouveau mot de passe requis.' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });

  try {
    const user = await findOne(users, { resetToken: token, resetTokenExpiry: { $gt: Date.now() } });
    if (!user) {
      return res.status(400).json({ error: 'Jeton invalide ou expiré.' });
    }

    const hash = bcrypt.hashSync(newPassword, 12);
    
    // Clear the tokens and update the password
    await update(users, { _id: user._id }, { 
      $set: { password: hash }, 
      $unset: { resetToken: true, resetTokenExpiry: true } 
    });

    await insert(auditLog, {
      user_id: user._id,
      action: 'password_reset',
      ip: req.ip,
      created_at: new Date().toISOString(),
      username: user.username
    });

    return res.json({ message: 'Mot de passe réinitialisé avec succès !' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur interne du serveur.' });
  }
});

router.get('/discord-avatar/:id', async (req, res) => {
  const discordId = req.params.id;
  if (!/^\d{17,20}$/.test(discordId)) {
    return res.status(400).json({ error: 'ID Discord invalide' });
  }

  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    const index = Number((BigInt(discordId) >> 22n) % 6n);
    return res.redirect(`https://cdn.discordapp.com/embed/avatars/${index}.png`);
  }

  try {
    const response = await fetch(`https://discord.com/api/v9/users/${discordId}`, {
      headers: {
        'Authorization': `Bot ${token}`
      }
    });

    if (!response.ok) {
      const index = Number((BigInt(discordId) >> 22n) % 6n);
      return res.redirect(`https://cdn.discordapp.com/embed/avatars/${index}.png`);
    }

    const userData = await response.json();
    if (userData.avatar) {
      const ext = userData.avatar.startsWith('a_') ? 'gif' : 'png';
      return res.redirect(`https://cdn.discordapp.com/avatars/${discordId}/${userData.avatar}.${ext}?size=128`);
    } else {
      const index = Number((BigInt(discordId) >> 22n) % 6n);
      return res.redirect(`https://cdn.discordapp.com/embed/avatars/${index}.png`);
    }
  } catch (err) {
    console.error('[DISCORD_AVATAR_ERROR]', err);
    const index = Number((BigInt(discordId) >> 22n) % 6n);
    return res.redirect(`https://cdn.discordapp.com/embed/avatars/${index}.png`);
  }
});

// ----------------------------
// GET /api/products (Public)
// ----------------------------
router.get('/products', async (req, res) => {
  try {
    const allProducts = await find(products, {});
    return res.json({ products: allProducts });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des produits.' });
  }
});

// ----------------------------
// POST /api/promocodes/validate (Public)
// ----------------------------
router.post('/promocodes/validate', async (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'Code requis.' });
  }

  try {
    const promo = await findOne(promocodes, { code: code.trim().toUpperCase() });
    if (!promo) {
      return res.status(404).json({ error: 'Code promo invalide.' });
    }

    if (promo.expiry_date) {
      const now = new Date();
      const expiry = new Date(promo.expiry_date);
      if (now > expiry) {
        return res.status(410).json({ error: 'Ce code promo a expiré.' });
      }
    }

    if (promo.max_uses !== null && promo.uses >= promo.max_uses) {
      return res.status(410).json({ error: 'Ce code promo a atteint sa limite d\'utilisation.' });
    }

    return res.json({
      valid: true,
      promocode: {
        code: promo.code,
        type: promo.type,
        value: promo.value
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ----------------------------
// POST /api/payments/register-note
// Enregistre la note PayPal en attente pour le polling
// ----------------------------
router.post('/payments/register-note', verifyToken, async (req, res) => {
  const { note } = req.body;
  if (!note) return res.status(400).json({ error: 'Note requise.' });
  try {
    await update(users, { _id: req.user.id }, {
      $set: { paypal_pending_note: note.trim(), paypal_confirmed: false }
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ----------------------------
// GET /api/payments/check-note
// Vérifie si le paiement PayPal avec cette note a été confirmé
// ----------------------------
router.get('/payments/check-note', async (req, res) => {
  const { note } = req.query;
  if (!note) return res.status(400).json({ error: 'Note requise.' });
  try {
    const user = await findOne(users, { paypal_pending_note: note.trim() });
    if (!user) return res.json({ confirmed: false });
    if (user.paypal_confirmed) {
      return res.json({ confirmed: true });
    }
    return res.json({ confirmed: false });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ----------------------------
// POST /api/admin/confirm-paypal
// Confirme manuellement un paiement PayPal depuis le panel admin
// ----------------------------
router.post('/admin/confirm-paypal', verifyToken, async (req, res) => {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé.' });
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  try {
    const user = await findOne(users, { _id: userId });
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé.' });

    // Marquer comme confirmé et générer la clé comme pour un vrai paiement
    const RAILWAY_API_URL = 'https://fpsbn-auth-production.up.railway.app';
    const RAILWAY_SECRET = 'Fpbsnlua095';
    let newKey = null;
    try {
      const response = await fetch(`${RAILWAY_API_URL}/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 1, duration_days: null, secret: RAILWAY_SECRET })
      });
      const data = await response.json();
      newKey = (data.codes && data.codes[0]) || data.code || null;
    } catch(e) { console.error('[RAILWAY_KEYGEN_ERR]', e); }

    await update(users, { _id: user._id }, {
      $set: {
        has_paid: true,
        paid_at: new Date().toISOString(),
        paypal_confirmed: true,
        payment_method: 'paypal',
        ...(newKey ? { discord_key: newKey } : {})
      }
    });

    return res.json({ ok: true, message: 'Paiement confirmé.', key: newKey });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ----------------------------
// POST /api/payments/confirm
// Génère une clé et marque le compte comme payé
// ----------------------------
router.post('/payments/confirm', verifyToken, async (req, res) => {
  try {
    const user = await findOne(users, { _id: req.user.id });
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé.' });

    // Si déjà payé, on retourne simplement la clé existante
    if (user.has_paid && user.discord_key) {
      return res.json({
        message: 'Vous avez déjà une clé active.',
        key: user.discord_key,
        already_had_key: true
      });
    }

    // Génération de la clé directement sur le serveur Railway
    let newKey;
    try {
      const RAILWAY_API_URL = 'https://fpsbn-auth-production.up.railway.app';
      const RAILWAY_SECRET = 'Fpbsnlua095';
      
      const response = await fetch(`${RAILWAY_API_URL}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 1, duration_days: null, secret: RAILWAY_SECRET })
      });
      
      if (!response.ok) {
        throw new Error(`Railway API returned status ${response.status}`);
      }
      
      const data = await response.json();
      if (!data.ok || !data.codes || data.codes.length === 0) {
        throw new Error(data.error || 'Aucun code généré par Railway.');
      }
      
      newKey = data.codes[0]; // La nouvelle clé (ex: 010579037070)
    } catch (err) {
      console.error('[RAILWAY_KEYGEN_ERR]', err);
      return res.status(502).json({ error: 'Impossible de générer la clé sur le serveur d\'authentification. Veuillez contacter le support.' });
    }

    // Mise à jour du compte utilisateur
    await update(users, { _id: user._id }, {
      $set: {
        discord_key: newKey,
        has_paid: true,
        payment_email: req.body.payment_email || user.payment_email || null,
        role: user.role === 'admin' ? 'admin' : 'user',
        payment_method: req.body.payment_method || 'stripe',
        paid_at: new Date().toISOString()
      }
    });

    // Log dans l'audit
    await insert(auditLog, {
      user_id: user._id,
      action: 'payment_confirmed',
      ip: req.ip,
      created_at: new Date().toISOString(),
      username: user.username,
      details: { key_generated: newKey }
    });

    if (user.discord_id) {
      grantDiscordRole(user.discord_id, user.role, user.username).catch(err => {
        console.error('[AUTO_ROLE_PAYMENT_ERROR]', err);
      });
    }

    return res.json({
      message: 'Paiement confirmé ! Votre clé a été générée.',
      key: newKey,
      already_had_key: false
    });
  } catch (err) {
    console.error('[PAYMENT_CONFIRM_ERR]', err);
    return res.status(500).json({ error: 'Erreur interne lors de la confirmation du paiement.' });
  }
});
// ----------------------------
// GET /api/me/discord-avatar
// ----------------------------
router.get('/me/discord-avatar', verifyToken, async (req, res) => {
  try {
    const user = await findOne(users, { _id: req.user.id });
    if (!user || !user.discord_id) {
      return res.json({ avatarUrl: null });
    }

    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token || token === '397742357379809291') {
      return res.json({ avatarUrl: null });
    }

    const response = await fetch(`https://discord.com/api/v9/users/${user.discord_id}`, {
      headers: { 'Authorization': `Bot ${token}` }
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.avatar) {
        const ext = data.avatar.startsWith('a_') ? 'gif' : 'png';
        return res.json({ avatarUrl: `https://cdn.discordapp.com/avatars/${user.discord_id}/${data.avatar}.${ext}?size=128` });
      }
    }
    return res.json({ avatarUrl: null });
  } catch (err) {
    console.error('[AVATAR_FETCH_ERR]', err);
    return res.json({ avatarUrl: null });
  }
});

module.exports = router;
