const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { users, auditLog, findOne, insert, update } = require('../db');
const { verifyToken } = require('../auth');
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

    // Railway may return its own error field — normalize it into our reason format
    if (!data.ok && !data.reason && data.error) {
      // Map Railway's raw error messages to our internal reason codes
      const raw = (data.error || '').toLowerCase();
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

  if (!username || !password || !discord_id || !discord_key)
    return res.status(400).json({ error: 'Tous les champs sont requis.' });
  if (!isValidUsername(username))
    return res.status(400).json({ error: 'Username invalide (3-32 chars, a-z/0-9/._-).' });
  if (!isValidPassword(password))
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });
  if (!isValidDiscordId(discord_id))
    return res.status(400).json({ error: 'Discord ID invalide (17-20 chiffres).' });
  if (!isValidDiscordKey(discord_key))
    return res.status(400).json({ error: 'La clé ne peut pas être vide.' });

  try {
    const existing = await findOne(users, { username: { $regex: new RegExp(`^${username.trim()}$`, 'i') } });
    if (existing) return res.status(409).json({ error: 'Ce nom d\'utilisateur est déjà pris.' });

    // 1. Unicité Locale
    const cleanKey = discord_key.trim();
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

    const hash = bcrypt.hashSync(password, 12);
    const assignedRole = cleanKey.length < 12 ? 'vip' : 'user';
    const newUser = await insert(users, {
      username:    username.trim(),
      password:    hash,
      discord_id:  discord_id.trim(),
      discord_key: discord_key.trim(),
      role:        assignedRole,
      created_at:  new Date().toISOString()
    });

    await insert(auditLog, { user_id: newUser._id, action: 'register', ip: req.ip, created_at: new Date().toISOString(), username: newUser.username });
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

// ----------------------------
// GET /api/me
// ----------------------------
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await findOne(users, { _id: req.user.id });
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé.' });
    const { password: _, ...safeUser } = user;
    return res.json({ user: { ...safeUser, id: safeUser._id } });
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
        // 1. Unicité Locale
        const existingKeyUser = await findOne(users, { discord_key: cleanKey });
        if (existingKeyUser) {
          return res.status(409).json({ error: 'Cette clé est déjà utilisée par un autre compte sur ce Dashboard.' });
        }

        // 2. Vérification sur l'API Railway
        const railwayStatus = await verifyRailwayKey(cleanKey, req.ip);
        if (!railwayStatus.ok) {
          // On ignore les blocages liés à l'IP (mismatch ou bannie) pour ne vérifier que l'existence et l'expiration de la clé
          const ignoreIpIssue = railwayStatus.reason === "ip_mismatch" || railwayStatus.reason === "ip_banned";
          if (!ignoreIpIssue) {
            let errorMessage = "La clé fournie n'est pas reconnue ou invalide.";
            if (railwayStatus.reason === "invalid_code") errorMessage = "Clé invalide ou introuvable sur le serveur d'authentification.";
            if (railwayStatus.reason === "expired") errorMessage = "Cette clé a expiré.";
            return res.status(401).json({ error: errorMessage });
          }
        }
      }

      updates.discord_key = cleanKey;
      if (cleanKey !== user.discord_key && user.role !== 'admin') {
        updates.role = cleanKey.length < 12 ? 'vip' : 'user';
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

    return res.json({ message: 'Profil mis à jour avec succès.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur interne du serveur lors de la mise à jour.' });
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

module.exports = router;
