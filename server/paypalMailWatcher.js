// ─── PAYPAL EMAIL WATCHER ─────────────────────────────────────────────────────
// Surveille la boîte Gmail pour détecter les paiements PayPal automatiquement.
// Quand un email PayPal "Vous avez reçu..." est trouvé avec une note connue,
// le paiement est confirmé et le client est redirigé automatiquement.

const Imap = require('imap');
const { simpleParser } = require('mailparser');

// Ces fonctions sont injectées depuis index.js
let _findOne, _update, _usersCollection;

function init({ findOne, update, users }) {
  _findOne = findOne;
  _update = update;
  _usersCollection = users;
}

// ─── Extrait la note PayPal depuis le corps de l'email ────────────────────────
// Format réel PayPal FR : "Message de [Prénom Nom] [note]"
function extractNoteFromEmail(text) {
  if (!text) return null;

  // Pattern principal : "Message de Prénom Nom note" sur une ligne
  // On prend le DERNIER mot (ou les derniers mots) après le nom (2 mots = prénom + nom)
  const messageMatch = text.match(/Message de (\S+)\s+(\S+)\s+(.+)/i);
  if (messageMatch) {
    const note = messageMatch[3].trim();
    if (note) return note;
  }

  // Fallback : chercher la ligne "Message de ..." et prendre ce qui suit
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^Message de /i.test(trimmed)) {
      // Supprimer "Message de Prénom Nom" et récupérer le reste
      const parts = trimmed.split(/\s+/);
      // parts[0]=Message, parts[1]=de, parts[2]=Prénom, parts[3]=Nom, parts[4+]=note
      if (parts.length >= 5) {
        return parts.slice(4).join(' ').trim();
      }
    }
  }
  return null;
}

// ─── Cherche si l'email contient une des notes en attente ────────────────────
async function findMatchingNote(emailText) {
  try {
    // Récupérer tous les utilisateurs avec une note PayPal en attente
    const { find } = require('./db');
    const pendingUsers = await find(require('./db').users, {
      paypal_pending_note: { $exists: true },
      paypal_confirmed: { $ne: true },
      has_paid: { $ne: true }
    });

    for (const user of pendingUsers) {
      const note = user.paypal_pending_note;
      if (!note) continue;
      // Vérifier si la note apparaît dans le corps de l'email
      if (emailText.toLowerCase().includes(note.toLowerCase())) {
        console.log(`[PAYPAL_WATCHER] ✅ Note trouvée dans l'email: "${note}" → utilisateur: ${user.username}`);
        return note;
      }
    }
  } catch (e) {
    console.error('[PAYPAL_WATCHER] Erreur recherche notes:', e);
  }
  return null;
}


// ─── Vérifie si l'email vient bien de PayPal ──────────────────────────────────
function isPaypalEmail(from) {
  if (!from) return false;
  const f = from.toLowerCase();
  return f.includes('@paypal.') || f.includes('paypal.com') || f.includes('paypal.fr');
}

// ─── Confirme le paiement en base + génère une clé Railway ───────────────────
async function confirmPaymentByNote(note) {
  try {
    const user = await _findOne(_usersCollection, { paypal_pending_note: note.trim() });
    if (!user) {
      console.log(`[PAYPAL_WATCHER] Aucun utilisateur trouvé pour la note: "${note}"`);
      return;
    }
    if (user.paypal_confirmed) {
      console.log(`[PAYPAL_WATCHER] Paiement déjà confirmé pour ${user.username}`);
      return;
    }

    // Générer une clé Railway
    const RAILWAY_API_URL = 'https://fpsbn-auth-production.up.railway.app';
    const RAILWAY_SECRET = 'Fpbsnlua095';
    let newKey = null;
    try {
      const response = await fetch(`${RAILWAY_API_URL}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 1, duration_days: null, secret: RAILWAY_SECRET })
      });
      const data = await response.json();
      newKey = (data.codes && data.codes[0]) || data.code || null;
    } catch (e) {
      console.error('[PAYPAL_WATCHER] Erreur génération clé Railway:', e.message);
    }

    await _update(_usersCollection, { _id: user._id }, {
      $set: {
        has_paid: true,
        paid_at: new Date().toISOString(),
        paypal_confirmed: true,
        payment_method: 'paypal',
        ...(newKey ? { discord_key: newKey } : {})
      }
    });

    console.log(`[PAYPAL_WATCHER] ✅ Paiement confirmé pour ${user.username} (note: "${note}") — clé: ${newKey || 'non générée'}`);
  } catch (err) {
    console.error('[PAYPAL_WATCHER] Erreur lors de la confirmation:', err);
  }
}

// ─── Parse et traite un email ─────────────────────────────────────────────────
async function processEmail(buffer) {
  try {
    const parsed = await simpleParser(buffer);
    const from = parsed.from?.text || '';
    const subject = (parsed.subject || '').toLowerCase();

    if (!isPaypalEmail(from)) return;

    // Seulement les emails de réception d'argent
    const isPaymentReceived =
      subject.includes('reçu') ||
      subject.includes('received') ||
      subject.includes('vous avez reçu') ||
      subject.includes("you've received") ||
      subject.includes('payment received') ||
      subject.includes('paiement reçu') ||
      subject.includes('virement reçu') ||
      subject.includes('money received');

    if (!isPaymentReceived) {
      console.log(`[PAYPAL_WATCHER] Email PayPal ignoré (pas un paiement): "${parsed.subject}"`);
      return;
    }

    console.log(`[PAYPAL_WATCHER] 💳 Email de paiement reçu: "${parsed.subject}"`);

    // Chercher la note dans le texte de l'email
    const bodyText = parsed.text || parsed.html?.replace(/<[^>]*>/g, ' ') || '';
    
    let note = extractNoteFromEmail(bodyText);

    if (!note) {
      console.log(`[PAYPAL_WATCHER] ⚠️ Extracteur regex a échoué. Recherche par scan des notes en attente...`);
      note = await findMatchingNote(bodyText);
    }

    if (!note) {
      console.log(`[PAYPAL_WATCHER] ❌ Aucune note trouvée dans l'email PayPal`);
      return;
    }

    console.log(`[PAYPAL_WATCHER] Note extraite: "${note}"`);
    await confirmPaymentByNote(note);
  } catch (err) {
    console.error('[PAYPAL_WATCHER] Erreur parsing email:', err);
  }
}

// ─── Connexion IMAP et surveillance ───────────────────────────────────────────
function startWatcher(gmailUser, gmailAppPassword) {
  if (!gmailUser || !gmailAppPassword) {
    console.log('[PAYPAL_WATCHER] ⚠️ Identifiants Gmail non configurés — surveillance désactivée.');
    console.log('[PAYPAL_WATCHER] Ajoutez GMAIL_USER et GMAIL_APP_PASSWORD dans le fichier .env');
    return;
  }

  const imap = new Imap({
    user: gmailUser,
    password: gmailAppPassword,
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
    keepalive: { interval: 10000, idleInterval: 300000, forceNoop: true }
  });

  function openInbox(cb) {
    imap.openBox('INBOX', false, cb);
  }

  imap.once('ready', () => {
    console.log('[PAYPAL_WATCHER] 📬 Connecté à Gmail — surveillance PayPal active');
    openInbox((err) => {
      if (err) { console.error('[PAYPAL_WATCHER] Erreur ouverture INBOX:', err); return; }

      // Surveiller les nouveaux emails en temps réel
      imap.on('mail', (numNew) => {
        console.log(`[PAYPAL_WATCHER] ${numNew} nouvel(s) email(s) reçu(s), vérification...`);
        imap.search(['UNSEEN', ['FROM', 'paypal']], (err, uids) => {
          if (err || !uids || uids.length === 0) return;

          const fetch = imap.fetch(uids, { bodies: '', markSeen: false });
          fetch.on('message', (msg) => {
            const chunks = [];
            msg.on('body', (stream) => {
              stream.on('data', (chunk) => chunks.push(chunk));
              stream.once('end', () => processEmail(Buffer.concat(chunks)));
            });
          });
          fetch.once('error', (e) => console.error('[PAYPAL_WATCHER] Fetch error:', e));
        });
      });
    });
  });

  imap.once('error', (err) => {
    console.error('[PAYPAL_WATCHER] Erreur IMAP:', err.message);
    // Reconnexion après 30 secondes
    setTimeout(() => startWatcher(gmailUser, gmailAppPassword), 30000);
  });

  imap.once('end', () => {
    console.log('[PAYPAL_WATCHER] Connexion fermée — reconnexion dans 15s...');
    setTimeout(() => startWatcher(gmailUser, gmailAppPassword), 15000);
  });

  imap.connect();
}

module.exports = { init, startWatcher };
