// ─── AUTH GUARD ───────────────────────────────────────────────────────────────
const token = localStorage.getItem('token');
if (!token) { window.location.href = '/'; }

function getUser() {
  try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
}

// ─── STATE ────────────────────────────────────────────────────────────────────
let userData = null;
let discordKeyVisible = false;
let sessionStart = Date.now();

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const res = await fetch('/api/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      localStorage.clear();
      window.location.href = '/';
      return;
    }
    const data = await res.json();
    userData = data.user;
    renderProfile();
    updateDate();
  } catch {
    localStorage.clear();
    window.location.href = '/';
  }
}

// ─── RENDER ───────────────────────────────────────────────────────────────────
function renderProfile() {
  const u = userData;
  const initial = u.username.charAt(0).toUpperCase();
  
  let roleLabel = '👤 User';
  if (u.role === 'admin') roleLabel = '👑 Admin';
  if (u.role === 'vip') roleLabel = '⭐ VIP';

  // Navbar
  loadDiscordAvatar(u.discord_id, u.username, 'nav-avatar', 'profile-avatar');
  document.getElementById('nav-username').textContent   = u.username;
  const badge = document.getElementById('nav-badge');
  if (u.role === 'admin') {
    badge.className = 'badge badge-admin';
    badge.textContent = 'Admin';
  } else if (u.role === 'vip') {
    badge.className = 'badge badge-vip';
    badge.textContent = 'VIP';
  } else {
    badge.className = 'badge badge-user';
    badge.textContent = 'User';
  }

  // Show admin button if admin
  if (u.role === 'admin') {
    document.getElementById('admin-btn').style.display = 'inline-flex';
  }

  // Header
  document.getElementById('header-name').textContent    = u.username;

  // Profile card
  document.getElementById('profile-username').textContent  = u.username;
  document.getElementById('profile-since').textContent     = formatDate(u.created_at);
  const roleBadge = document.getElementById('profile-role');
  if (u.role === 'admin') {
    roleBadge.className = 'badge badge-admin';
    roleBadge.textContent = '👑 Admin';
  } else if (u.role === 'vip') {
    roleBadge.className = 'badge badge-vip';
    roleBadge.textContent = '⭐ VIP';
  } else {
    roleBadge.className = 'badge badge-user';
    roleBadge.textContent = '👤 User';
  }

  // Info grid
  document.getElementById('info-discord-id').textContent = u.discord_id;

  // Store discord key for toggle
  document.getElementById('discord-key-display').dataset.key = u.discord_key;

  // Calculate remaining IP resets
  const now = Date.now();
  const limit = u.role === 'admin' ? Infinity : (u.role === 'vip' ? 3 : 1);
  const ipResets = u.ip_resets || [];
  const last24h = ipResets.filter(t => (now - new Date(t).getTime()) < 24 * 60 * 60 * 1000);
  const remaining = limit === Infinity ? 'Illimité' : (limit - last24h.length);
  
  document.getElementById('reset-limit-display').innerHTML = `
    <strong>${remaining} / ${limit === Infinity ? '∞' : limit}</strong> restant(s)<br>
    <span style="font-size:0.7rem; color:var(--text-muted);">Réinitialisé ${last24h.length} fois ces dernières 24h</span>
  `;
}





function updateDate() {
  const now = new Date();
  document.getElementById('header-date').textContent = now.toLocaleDateString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}



// ─── DISCORD KEY TOGGLE ───────────────────────────────────────────────────────
function toggleKey() {
  const display = document.getElementById('discord-key-display');
  const btn = document.getElementById('key-toggle-btn');
  if (discordKeyVisible) {
    display.textContent = '••••••••••••';
    btn.textContent = 'Afficher';
    discordKeyVisible = false;
  } else {
    display.textContent = display.dataset.key || userData?.discord_key || '—';
    btn.textContent = 'Masquer';
    discordKeyVisible = true;
  }
}

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
function logout() {
  document.getElementById('logout-modal').classList.add('active');
}
function closeLogoutModal() {
  document.getElementById('logout-modal').classList.remove('active');
}
function confirmLogout() {
  localStorage.clear();
  window.location.href = '/';
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}
function formatDateTime(dateStr) {
  return new Date(dateStr).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Close modal on backdrop click
document.getElementById('logout-modal').addEventListener('click', function(e) {
  if (e.target === this) closeLogoutModal();
});

// ─── KEY COPY FUNCTION ────────────────────────────────────────────────────────
function copyKey() {
  const key = userData?.discord_key || '';
  navigator.clipboard.writeText(key).then(() => {
    const btn = document.getElementById('key-copy-btn');
    btn.innerHTML = 'Copié !';
    btn.style.color = '#10b981';
    btn.style.borderColor = '#10b981';
    setTimeout(() => {
      btn.innerHTML = 'Copier';
      btn.style.color = '';
      btn.style.borderColor = '';
    }, 2000);
  }).catch(err => {
    console.error('Erreur de copie:', err);
  });
}

// ─── LUA COPY FUNCTION ────────────────────────────────────────────────────────
function copyLuaCode() {
  const code = document.getElementById('lua-code-block').innerText;
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.getElementById('copy-btn');
    btn.innerHTML = '✅ Copié !';
    btn.style.color = '#10b981';
    btn.style.borderColor = '#10b981';
    setTimeout(() => {
      btn.innerHTML = '📋 Copier';
      btn.style.color = '';
      btn.style.borderColor = '';
    }, 2000);
  }).catch(err => {
    console.error('Erreur de copie:', err);
  });
}

// ─── CHANGE KEY MODAL ─────────────────────────────────────────────────────────
function openChangeKeyModal() {
  document.getElementById('new-key-input').value = userData?.discord_key || '';
  document.getElementById('change-key-error').style.display = 'none';
  document.getElementById('change-key-modal').classList.add('active');
}
function closeChangeKeyModal() {
  document.getElementById('change-key-modal').classList.remove('active');
}
async function submitChangeKey() {
  const newKey = document.getElementById('new-key-input').value.trim();
  const errEl = document.getElementById('change-key-error');
  const btn = document.getElementById('change-key-btn');

  if (!newKey) {
    errEl.textContent = 'La clé ne peut pas être vide.';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Enregistrement...';
  errEl.style.display = 'none';

  try {
    const res = await fetch('/api/me/update', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ discord_key: newKey })
    });
    
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error || 'Erreur lors de la mise à jour.';
      errEl.style.display = 'block';
      return;
    }

    closeChangeKeyModal();
    // Reload user data completely to update the view
    await init();
  } catch (err) {
    errEl.textContent = 'Erreur réseau ou serveur indisponible.';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enregistrer';
  }
}

// ─── IP RESET FUNCTION ────────────────────────────────────────────────────────
async function triggerKeyIpReset() {
  const btn = document.getElementById('reset-ip-btn');
  const origText = btn.textContent;
  
  if (!confirm("Voulez-vous réinitialiser l'IP verrouillée sur votre clé Railway ?")) return;

  btn.disabled = true;
  btn.textContent = '🔄 Réinitialisation...';

  try {
    const res = await fetch('/api/me/reset-key-ip', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Erreur lors de la réinitialisation de l\'IP.');
      return;
    }

    alert(data.message || 'IP réinitialisée avec succès !');
    // Reload user data completely to update the view
    await init();
  } catch (err) {
    alert('Erreur réseau lors de la réinitialisation.');
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
}

// Close change key modal on backdrop click
document.getElementById('change-key-modal').addEventListener('click', function(e) {
  if (e.target === this) closeChangeKeyModal();
});

init();

function loadDiscordAvatar(discordId, username, navElementId, profileElementId) {
  const initial = username ? username.charAt(0).toUpperCase() : '?';
  let defaultIdx = 0;
  if (discordId && /^\d+$/.test(discordId)) {
    try {
      defaultIdx = Number((BigInt(discordId) >> 22n) % 6n);
    } catch(e) {}
  }
  const defaultUrl = `https://cdn.discordapp.com/embed/avatars/${defaultIdx}.png`;
  const proxyUrl = discordId && /^\d+$/.test(discordId) ? `/api/auth/discord-avatar/${discordId}` : defaultUrl;

  function updateImg(url) {
    const navEl = document.getElementById(navElementId);
    const profileEl = document.getElementById(profileElementId);
    const imgStyle = 'width:100%; height:100%; border-radius:50%; object-fit:cover;';
    
    if (navEl) {
      navEl.innerHTML = `<img src="${url}" style="${imgStyle}" onerror="this.onerror=null; this.src='${defaultUrl}';" />`;
      navEl.style.background = 'transparent';
    }
    if (profileEl) {
      profileEl.innerHTML = `<img src="${url}" style="${imgStyle}" onerror="this.onerror=null; this.src='${defaultUrl}';" />`;
      profileEl.style.background = 'transparent';
    }
  }

  // Set proxy/default first
  updateImg(proxyUrl);

  if (discordId && /^\d+$/.test(discordId)) {
    fetch(`https://api.lanyard.rest/v1/users/${discordId}`)
      .then(res => res.json())
      .then(body => {
        if (body.success && body.data && body.data.discord_user && body.data.discord_user.avatar) {
          const hash = body.data.discord_user.avatar;
          const ext = hash.startsWith('a_') ? 'gif' : 'png';
          const realUrl = `https://cdn.discordapp.com/avatars/${discordId}/${hash}.${ext}?size=128`;
          updateImg(realUrl);
        }
      })
      .catch(() => {});
  }
}


