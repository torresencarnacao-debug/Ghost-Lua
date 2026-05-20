// ─── AUTH GUARD ───────────────────────────────────────────────────────────────
const API = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';
let token = localStorage.getItem('token');

// Redirect to login if no token found — no auto-login bypass
if (!token) {
  window.location.href = 'admin-login.html';
}

function getUser() {
  try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
}

// ─── STATE ────────────────────────────────────────────────────────────────────
let userData = null;
let discordKeyVisible = false;
let sessionStart = Date.now();
let expirationIntervalId = null;

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const res = await fetch(`${API}/api/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      // Token expiré ou invalide → redirection vers login
      localStorage.clear();
      window.location.href = 'admin-login.html';
      return;
    }
    const data = await res.json();
    userData = data.user;
    localStorage.setItem('user', JSON.stringify(userData)); // Mettre à jour le cache local pour les autres pages
    renderProfile();
    updateDate();
  } catch {
    // Backend hors-ligne : utiliser les données mises en cache localement
    if (!userData) {
      userData = getUser();
      if (!userData) {
        // Aucune donnée disponible → redirection vers login
        window.location.href = 'admin-login.html';
        return;
      }
      renderProfile();
      updateDate();
    }
  }
}

// ─── EXPIRATION COUNTDOWN ─────────────────────────────────────────────────────
function startExpirationCountdown(expiresAtStr, durationDays, isError) {
  if (expirationIntervalId) {
    clearInterval(expirationIntervalId);
    expirationIntervalId = null;
  }

  const sidebarEl = document.getElementById('sidebar-status-duration');
  const statEl = document.getElementById('stat-license-expiration');
  const navDurationEl = document.getElementById('nav-status-duration');

  if (isError) {
    if (sidebarEl) sidebarEl.textContent = '⏳ Indisponible';
    if (statEl) {
      statEl.textContent = 'Indisponible (Erreur Railway)';
      statEl.style.color = 'var(--error)';
    }
    if (navDurationEl) navDurationEl.textContent = 'Indisponible';
    return;
  }

  if (!expiresAtStr) {
    if (durationDays) {
      const durationText = `${durationDays} jour${durationDays > 1 ? 's' : ''}`;
      if (sidebarEl) sidebarEl.textContent = `⏳ ${durationText} (non activée)`;
      if (statEl) {
        statEl.innerHTML = `
          <div style="font-size: 1.4rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; line-height: 1;">En attente...</div>
          <div style="font-size: 0.9rem; font-family: var(--font-mono); font-weight: 600; color: var(--text-secondary); background: rgba(255, 255, 255, 0.05); padding: 6px 12px; border-radius: 6px; display: inline-flex; align-items: center; gap: 8px; letter-spacing: 0.05em; border: 1px solid rgba(255, 255, 255, 0.1);">
            <i class="fa-regular fa-clock" style="opacity: 0.9;"></i> ${durationText} (après activation)
          </div>
        `;
        statEl.style.color = '';
      }
      if (navDurationEl) navDurationEl.textContent = `${durationText} (non activée)`;
    } else {
      if (sidebarEl) sidebarEl.textContent = 'Illimité';
      if (statEl) {
        statEl.innerHTML = `
          <div style="font-size: 1.4rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; line-height: 1;">Lifetime</div>
          <div style="font-size: 0.9rem; font-family: var(--font-mono); font-weight: 600; color: var(--success); background: rgba(16, 185, 129, 0.1); padding: 6px 12px; border-radius: 6px; display: inline-flex; align-items: center; gap: 8px; letter-spacing: 0.05em; border: 1px solid rgba(16, 185, 129, 0.3); box-shadow: 0 0 10px rgba(16, 185, 129, 0.1);">
            <i class="fa-solid fa-infinity" style="opacity: 0.9;"></i> Accès Illimité
          </div>
        `;
        statEl.style.color = '';
      }
      if (navDurationEl) navDurationEl.textContent = 'Lifetime';
    }
    return;
  }

  function updateDisplay() {
    const now = new Date();
    const expiresAt = new Date(expiresAtStr);
    const diffMs = expiresAt.getTime() - now.getTime();

    if (diffMs <= 0) {
      if (sidebarEl) sidebarEl.textContent = 'Expiré ❌';
      if (statEl) {
        const dateFormatted = new Date(expiresAtStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        statEl.innerHTML = `
          <div style="font-size: 1.4rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; line-height: 1;">${dateFormatted}</div>
          <div style="font-size: 0.9rem; font-family: var(--font-mono); font-weight: 600; color: var(--error); background: rgba(239, 68, 68, 0.1); padding: 6px 12px; border-radius: 6px; display: inline-flex; align-items: center; gap: 8px; letter-spacing: 0.05em; border: 1px solid rgba(239, 68, 68, 0.3); box-shadow: 0 0 10px rgba(239, 68, 68, 0.1);">
            <i class="fa-solid fa-circle-xmark" style="opacity: 0.9;"></i> Expiré
          </div>
        `;
        statEl.style.color = '';
      }
      if (navDurationEl) navDurationEl.textContent = 'Expiré ❌';
      clearInterval(expirationIntervalId);
      expirationIntervalId = null;
      return;
    }

    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    const hours = diffHours % 24;
    const mins = diffMins % 60;
    const secs = diffSecs % 60;

    const pad = (n) => String(n).padStart(2, '0');

    // Always construct a live ticking countdown
    const timeStr = diffDays > 0 
      ? `${diffDays}j ${pad(hours)}h ${pad(mins)}m ${pad(secs)}s`
      : `${pad(hours)}h ${pad(mins)}m ${pad(secs)}s`;

    if (sidebarEl) sidebarEl.textContent = `⏳ ${timeStr}`;
    if (navDurationEl) navDurationEl.textContent = timeStr;
    if (statEl) {
      const dateFormatted = expiresAt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const badgeStyle = diffDays === 0 
        ? 'background: rgba(245, 158, 11, 0.1); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); box-shadow: 0 0 10px rgba(245,158,11,0.1);' 
        : 'background: hsla(285, 100%, 65%, 0.15); color: var(--accent-2); border: 1px solid hsla(285, 100%, 65%, 0.4); box-shadow: 0 0 12px hsla(285, 100%, 65%, 0.2);';

      statEl.innerHTML = `
        <div style="font-size: 1.4rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; line-height: 1;">${dateFormatted}</div>
        <div style="font-size: 0.9rem; font-family: var(--font-mono); font-weight: 600; padding: 6px 12px; border-radius: 6px; display: inline-flex; align-items: center; gap: 8px; letter-spacing: 0.05em; ${badgeStyle}">
          <i class="fa-solid fa-hourglass-half fa-spin-pulse" style="font-size: 0.85rem; opacity: 0.9;"></i> ${timeStr}
        </div>
      `;
      statEl.style.color = '';
    }
  }

  updateDisplay();
  expirationIntervalId = setInterval(updateDisplay, 1000);
}

// ─── RENDER ───────────────────────────────────────────────────────────────────
function renderProfile() {
  const u = userData;
  
  // Create role badges HTML (one for left position, one for right)
  const roleBadgeHTMLLeft = u.role === 'admin' ? '<span class="badge badge-admin" style="margin-right: 6px; transform: scale(0.85); display: inline-block; vertical-align: middle;">👑 ADMIN</span>' : 
                            u.role === 'vip' ? '<span class="badge badge-vip" style="margin-right: 6px; transform: scale(0.85); display: inline-block; vertical-align: middle;">⭐ VIP</span>' : 
                            u.role === 'user' ? '<span class="badge badge-user" style="margin-right: 6px; transform: scale(0.85); display: inline-block; vertical-align: middle;">👤 USER</span>' : 
                            '<span class="badge badge-guest" style="margin-right: 6px; transform: scale(0.85); display: inline-block; vertical-align: middle;">👻 GUEST</span>';

  const roleBadgeHTMLRight = u.role === 'admin' ? '<span class="badge badge-admin" style="margin-left: 6px; transform: scale(0.85); display: inline-block; vertical-align: middle;">👑 ADMIN</span>' : 
                             u.role === 'vip' ? '<span class="badge badge-vip" style="margin-left: 6px; transform: scale(0.85); display: inline-block; vertical-align: middle;">⭐ VIP</span>' : 
                             u.role === 'user' ? '<span class="badge badge-user" style="margin-left: 6px; transform: scale(0.85); display: inline-block; vertical-align: middle;">👤 USER</span>' : 
                             '<span class="badge badge-guest" style="margin-left: 6px; transform: scale(0.85); display: inline-block; vertical-align: middle;">👻 GUEST</span>';

  // Navbar (Badge to the left)
  loadDiscordAvatar(u.discord_id, u.username, 'nav-avatar', 'sidebar-avatar');
  document.getElementById('nav-username').innerHTML = `${roleBadgeHTMLLeft}${u.username}`;
  
  // Show admin button if admin
  if (u.role === 'admin') {
    document.getElementById('admin-btn').style.display = 'inline-flex';
  }

  // Sidebar Profile (Badge to the right)
  document.getElementById('sidebar-username').innerHTML  = `${u.username} ${roleBadgeHTMLRight}`;
  const createdDate = formatDate(u.created_at);
  document.getElementById('sidebar-since-date').textContent = createdDate;

  // Generate deterministic Shop ID from User ID
  const shopId = u.shop_id || `GHOST-${(u.id || '').substring(0, 4).toUpperCase()}`;
  document.getElementById('sidebar-shop-id').textContent = shopId;

  // Pre-fill settings Key input based on upgrade states
  const settingsKeyInput = document.getElementById('settings-key-input');
  const redeemKeyBtn = document.getElementById('redeem-key-btn');
  if (settingsKeyInput) {
    if (u.role === 'vip' || u.role === 'admin') {
      // Already VIP/Admin: Lock completely
      settingsKeyInput.value = u.discord_key || '';
      settingsKeyInput.disabled = true;
      settingsKeyInput.placeholder = 'Clé active';
      if (redeemKeyBtn) {
        redeemKeyBtn.disabled = true;
        redeemKeyBtn.textContent = 'Compte VIP actif';
      }
    } else if (u.role === 'user') {
      // Has standard key: Allow upgrade to VIP key
      settingsKeyInput.value = ''; // Let them type the new VIP key
      settingsKeyInput.disabled = false;
      settingsKeyInput.placeholder = 'Saisir une clé VIP pour passer VIP';
      if (redeemKeyBtn) {
        redeemKeyBtn.disabled = false;
        redeemKeyBtn.textContent = 'Passer VIP (Upgrade)';
      }
    } else {
      // Guest: Allow registering any key
      settingsKeyInput.value = '';
      settingsKeyInput.disabled = false;
      settingsKeyInput.placeholder = 'Ex: 123456789012';
      if (redeemKeyBtn) {
        redeemKeyBtn.disabled = false;
        redeemKeyBtn.textContent = 'Valider la Clé';
      }
    }
  }

  // Stat Card Created Date
  document.getElementById('stat-created-date').textContent = createdDate;

  // Stat Card Payment Method
  const paymentMethodEl = document.getElementById('stat-payment-method');
  if (paymentMethodEl) {
    const method = u.payment_method || (u.paypal_confirmed || u.paypal_pending_note ? 'paypal' : 'stripe');
    if (method === 'paypal') {
      paymentMethodEl.innerHTML = `
        <span class="badge" style="background: rgba(0, 112, 186, 0.15); color: #0070ba; border: 1px solid rgba(0, 112, 186, 0.3); font-weight: 700; font-size: 0.8rem; padding: 4px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 0 10px rgba(0, 112, 186, 0.05); text-transform: none;">
          <img src="img/paypal.png" alt="PayPal" style="width: 12px; height: 12px; object-fit: contain; background: #fff; padding: 1px; border-radius: 2px;">
          PayPal
        </span>`;
    } else if (method === 'discord') {
      paymentMethodEl.innerHTML = `
        <span class="badge" style="background: rgba(88, 101, 242, 0.15); color: #5865f2; border: 1px solid rgba(88, 101, 242, 0.35); font-weight: 700; font-size: 0.8rem; padding: 4px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 0 10px rgba(88, 101, 242, 0.05); text-transform: none;">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 127.14 96.36" width="12" height="12" style="fill: #5865f2;"><path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,53.22,6.83,77.19,77.19,0,0,0,49.88,0,105.15,105.15,0,0,0,19.44,8.07C3.66,31.58-1.86,54.65,1,77.53A105.73,105.73,0,0,0,32,96.36a77.7,77.7,0,0,0,6.63-10.85,68.43,68.43,0,0,1-10.5-5c.88-.65,1.72-1.33,2.53-2a75.7,75.7,0,0,0,72.93,0c.81.71,1.65,1.39,2.53,2a68.43,68.43,0,0,1-10.5,5,77.7,77.7,0,0,0,6.63,10.85,105.73,105.73,0,0,0,31-18.83C129.07,54.65,123.56,31.58,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.83,46,53.83,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.07,46,96.07,53,91,65.69,84.69,65.69Z"/></svg>
          Discord
        </span>`;
    } else {
      paymentMethodEl.innerHTML = `
        <span class="badge" style="background: rgba(99, 91, 255, 0.15); color: #7c73ff; border: 1px solid rgba(99, 91, 255, 0.35); font-weight: 700; font-size: 0.8rem; padding: 4px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 0 10px rgba(99, 91, 255, 0.05); text-transform: none;">
          <img src="img/stripe.png" alt="Stripe" style="width: 12px; height: 12px; object-fit: contain; border-radius: 2px;">
          Stripe
        </span>`;
    }
  }

  // Check if user has purchased anything
  const hasPurchased = u.discord_key && u.discord_key.trim() !== '' && u.discord_key !== 'no_key' && u.discord_key !== 'none';

  if (!hasPurchased) {
    // Hide Link Discord tab in sidebar
    const tabDiscord = document.getElementById('tab-btn-discord');
    if (tabDiscord) tabDiscord.style.display = 'none';

    // Hide Purchased Content
    document.getElementById('purchased-content').style.display = 'none';
    // Show no-purchase banner
    document.getElementById('no-purchase-banner').style.display = 'block';
    
    // Sidebar status
    const statusBox = document.getElementById('sidebar-status-box');
    statusBox.classList.remove('active');
    statusBox.classList.add('inactive');
    document.getElementById('sidebar-status-text').textContent = 'Inactif';
    document.getElementById('sidebar-status-duration').textContent = '—';

    // Clear expiration interval if active
    if (expirationIntervalId) {
      clearInterval(expirationIntervalId);
      expirationIntervalId = null;
    }
    const statEl = document.getElementById('stat-license-expiration');
    if (statEl) {
      statEl.textContent = '—';
      statEl.style.color = '';
    }
    const navDurationEl = document.getElementById('nav-status-duration');
    if (navDurationEl) {
      navDurationEl.textContent = '—';
    }
  } else {
    // Show Link Discord tab in sidebar
    const tabDiscord = document.getElementById('tab-btn-discord');
    if (tabDiscord) tabDiscord.style.display = 'flex';

    // Show Purchased Content
    document.getElementById('purchased-content').style.display = 'block';
    // Hide no-purchase banner
    document.getElementById('no-purchase-banner').style.display = 'none';

    // Sidebar status
    const statusBox = document.getElementById('sidebar-status-box');
    statusBox.classList.remove('inactive');
    statusBox.classList.add('active');
    document.getElementById('sidebar-status-text').textContent = 'Actif';
    
    // Start dynamic countdown
    startExpirationCountdown(u.key_expires_at, u.key_duration_days, u.key_status_error);

    // Store discord key for toggle
    document.getElementById('discord-key-display').dataset.key = u.discord_key;

    // Calculate remaining IP resets
    const now = Date.now();
    const limit = u.role === 'admin' ? Infinity : (u.role === 'vip' ? 3 : 1);
    const ipResets = u.ip_resets || [];
    const last24h = ipResets.filter(t => (now - new Date(t).getTime()) < 24 * 60 * 60 * 1000);
    const remaining = limit === Infinity ? 'Illimité' : (limit - last24h.length);
    
    document.getElementById('reset-limit-display').innerHTML = `Limite : <strong>${remaining} / ${limit === Infinity ? '∞' : limit}</strong> par 24h`;
  }
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
  window.location.href = 'admin-login.html';
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return 'Mai 2026';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Mai 2026';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}
function formatDateTime(dateStr) {
  if (!dateStr) return 'Mai 2026';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Mai 2026';
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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
  document.getElementById('new-discord-id-input').value = userData?.discord_id || '';
  document.getElementById('change-key-error').style.display = 'none';
  document.getElementById('change-key-modal').classList.add('active');
}
function closeChangeKeyModal() {
  document.getElementById('change-key-modal').classList.remove('active');
}
async function submitChangeKey() {
  const newKey = document.getElementById('new-key-input').value.trim();
  const newDiscordId = document.getElementById('new-discord-id-input').value.trim();
  const errEl = document.getElementById('change-key-error');
  const btn = document.getElementById('change-key-btn');

  if (!newKey && !newDiscordId) {
    errEl.textContent = 'Veuillez remplir au moins un champ.';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Enregistrement...';
  errEl.style.display = 'none';

  try {
    const payload = {};
    if (newKey) payload.discord_key = newKey;
    if (newDiscordId) payload.discord_id = newDiscordId;

    const res = await fetch(`${API}/api/me/update`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
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
function triggerKeyIpReset() {
  openResetIpModal();
}

function openResetIpModal() {
  showResetIpConfirmStep();
  document.getElementById('reset-ip-modal').classList.add('active');
}

function closeResetIpModal() {
  document.getElementById('reset-ip-modal').classList.remove('active');
}

function showResetIpConfirmStep() {
  document.getElementById('reset-ip-step-confirm').style.display = 'block';
  document.getElementById('reset-ip-step-loading').style.display = 'none';
  document.getElementById('reset-ip-step-success').style.display = 'none';
  document.getElementById('reset-ip-step-error').style.display = 'none';
}

async function confirmKeyIpReset() {
  // Hide confirm step, show loading
  document.getElementById('reset-ip-step-confirm').style.display = 'none';
  document.getElementById('reset-ip-step-loading').style.display = 'block';

  try {
    const res = await fetch(`${API}/api/me/reset-key-ip`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await res.json();
    if (!res.ok) {
      document.getElementById('reset-ip-step-loading').style.display = 'none';
      document.getElementById('reset-ip-error-msg').textContent = data.error || 'Erreur lors de la réinitialisation de l\'IP.';
      document.getElementById('reset-ip-step-error').style.display = 'block';
      return;
    }

    document.getElementById('reset-ip-step-loading').style.display = 'none';
    document.getElementById('reset-ip-success-msg').textContent = data.message || 'IP réinitialisée avec succès !';
    document.getElementById('reset-ip-step-success').style.display = 'block';
    
    // Reload user data completely to update the view
    await init();
  } catch (err) {
    document.getElementById('reset-ip-step-loading').style.display = 'none';
    document.getElementById('reset-ip-error-msg').textContent = 'Erreur réseau lors de la réinitialisation.';
    document.getElementById('reset-ip-step-error').style.display = 'block';
  }
}

// Close change key modal on backdrop click
document.getElementById('change-key-modal').addEventListener('click', function(e) {
  if (e.target === this) closeChangeKeyModal();
});

// Close reset IP modal on backdrop click
document.getElementById('reset-ip-modal').addEventListener('click', function(e) {
  if (e.target === this) closeResetIpModal();
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
  const proxyUrl = discordId && /^\d+$/.test(discordId) ? `${API}/api/auth/discord-avatar/${discordId}` : defaultUrl;

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

  // Fetch reliable avatar from our backend via Discord Bot
  if (discordId && /^\d+$/.test(discordId)) {
    fetch(`${API}/api/me/discord-avatar`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.avatarUrl) {
          updateImg(data.avatarUrl);
        }
      })
      .catch(err => console.error('Failed to load avatar:', err));
  }
}

// ─── DISCORD LINK FLOW ────────────────────────────────────────────────────────
function joinDiscordAndLink() {
  window.open("https://discord.gg/yrjffGSnr2", "_blank");
  
  if (userData && userData.discord_id) {
    // Start trying to link the Discord role in the background 
    // It will check every 5 seconds for a minute until the user joins
    attemptDiscordLink(12);
  } else {
    alert("Veuillez d'abord renseigner votre ID Discord dans vos paramètres (Modifier License Key).");
  }
}

async function attemptDiscordLink(retries) {
  if (retries <= 0) return;
  
  try {
    const res = await fetch(`${API}/api/me/discord-link`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (res.ok) {
      console.log('✅ Rôle Discord attribué avec succès suite à votre arrivée !');
      // On success, we don't need to retry
      return;
    } else if (res.status === 404) {
      // 404 means the user hasn't joined the server yet, so we retry
      console.log(`En attente de votre arrivée sur le serveur... (Tentatives restantes: ${retries - 1})`);
      setTimeout(() => attemptDiscordLink(retries - 1), 5000);
    }
  } catch (err) {
    console.error('Erreur lors de la vérification Discord:', err);
  }
}

// ─── TAB NAVIGATION ─────────────────────────────────────────────────────────
function switchDashboardTab(tabName) {
  const overviewTab = document.getElementById('tab-overview');
  const settingsTab = document.getElementById('tab-settings');
  const overviewView = document.getElementById('overview-tab-view');
  const settingsView = document.getElementById('settings-tab-view');
  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');

  if (tabName === 'settings') {
    overviewTab.classList.remove('active');
    settingsTab.classList.add('active');
    overviewView.style.display = 'none';
    settingsView.style.display = 'block';
    pageTitle.textContent = 'Settings';
    pageSubtitle.textContent = 'Gérez vos licences et liez vos comptes';
    
    // Clear alerts
    document.getElementById('settings-key-success').style.display = 'none';
    document.getElementById('settings-key-error').style.display = 'none';
  } else {
    settingsTab.classList.remove('active');
    overviewTab.classList.add('active');
    settingsView.style.display = 'none';
    overviewView.style.display = 'block';
    pageTitle.textContent = 'DASHBOARD';
    pageSubtitle.textContent = 'Résumé du compte et statut de la licence';
  }
}

// ─── SETTINGS FORM SUBMISSIONS ────────────────────────────────────────────────
async function submitRedeemKey() {
  const newKey = document.getElementById('settings-key-input').value.trim();
  const successEl = document.getElementById('settings-key-success');
  const errorEl = document.getElementById('settings-key-error');
  const btn = document.getElementById('redeem-key-btn');

  if (!newKey) {
    errorEl.textContent = 'Veuillez saisir une clé de licence.';
    errorEl.style.display = 'block';
    successEl.style.display = 'none';
    return;
  }

  const originalText = btn.textContent;
  let isSuccess = false;

  btn.disabled = true;
  btn.textContent = 'Validation...';
  errorEl.style.display = 'none';
  successEl.style.display = 'none';

  try {
    const res = await fetch(`${API}/api/me/update`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ discord_key: newKey })
    });
    
    const data = await res.json();
    if (!res.ok) {
      errorEl.textContent = data.error || 'Erreur lors de la mise à jour.';
      errorEl.style.display = 'block';
      return;
    }

    successEl.textContent = 'Clé validée et enregistrée avec succès ! Votre rôle a été mis à jour.';
    successEl.style.display = 'block';
    document.getElementById('settings-key-input').value = '';
    
    isSuccess = true;
    // Reload user data completely to update the view
    await init();
  } catch (err) {
    errorEl.textContent = 'Erreur réseau ou serveur indisponible.';
    errorEl.style.display = 'block';
  } finally {
    if (!isSuccess) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
}

async function submitSettingsDiscordId() {
  const newDiscordId = document.getElementById('settings-discord-id-input').value.trim();
  const successEl = document.getElementById('settings-discord-success');
  const errorEl = document.getElementById('settings-discord-error');
  const btn = document.getElementById('save-discord-btn');

  if (!newDiscordId) {
    errorEl.textContent = 'Veuillez saisir un identifiant Discord numérique.';
    errorEl.style.display = 'block';
    successEl.style.display = 'none';
    return;
  }

  if (!/^\d{17,20}$/.test(newDiscordId)) {
    errorEl.textContent = "L'identifiant Discord doit contenir entre 17 et 20 chiffres.";
    errorEl.style.display = 'block';
    successEl.style.display = 'none';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Enregistrement...';
  errorEl.style.display = 'none';
  successEl.style.display = 'none';

  try {
    const res = await fetch(`${API}/api/me/update`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ discord_id: newDiscordId })
    });
    
    const data = await res.json();
    if (!res.ok) {
      errorEl.textContent = data.error || 'Erreur lors de la mise à jour.';
      errorEl.style.display = 'block';
      return;
    }

    successEl.textContent = 'Identifiant Discord mis à jour avec succès !';
    successEl.style.display = 'block';
    
    // Reload user data completely to update the view
    await init();
  } catch (err) {
    errorEl.textContent = 'Erreur réseau ou serveur indisponible.';
    errorEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = "Enregistrer l'ID";
  }
}


