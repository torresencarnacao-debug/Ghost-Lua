// ─── AUTH GUARD ───────────────────────────────────────────────────────────────
const API = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';
let token = localStorage.getItem('token');
let currentUser = (() => { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } })();

// Redirect to login if not authenticated or not admin
if (!token || !currentUser || currentUser.role !== 'admin') {
  localStorage.clear();
  window.location.href = 'admin-login.html';
}

// ─── STATE ────────────────────────────────────────────────────────────────────
let allUsers = [];
let railwayCodes = {};
let allProducts = [];
let deleteTargetId = null;
let roleTargetId = null;
let railwayKeysExpanded = false;
let railwayLogs = [];
let railwayLogsExpanded = false;



// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  // Set admin info in navbar
  const avatarChar = currentUser.username.charAt(0).toUpperCase();
  document.getElementById('nav-avatar').textContent = avatarChar;
  document.getElementById('nav-username').innerHTML = `<span class="badge badge-admin" style="margin-right: 6px; transform: scale(0.85); display: inline-block; vertical-align: middle;">👑 ADMIN</span>${currentUser.username}`;
  
  // Set sidebar info
  const sidebarAvatar = document.getElementById('sidebar-avatar');
  if (sidebarAvatar) sidebarAvatar.textContent = avatarChar;
  const sidebarUsername = document.getElementById('sidebar-username');
  if (sidebarUsername) sidebarUsername.innerHTML = `${currentUser.username} <span class="badge badge-admin" style="margin-left: 6px; transform: scale(0.85); display: inline-block; vertical-align: middle;">👑 ADMIN</span>`;
  const sidebarSinceDate = document.getElementById('sidebar-since-date');
  if (sidebarSinceDate) {
    const createdDate = currentUser.created_at ? new Date(currentUser.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '19 mai 2026';
    sidebarSinceDate.textContent = createdDate;
  }

  // Load avatar image via Discord Bot proxy
  loadDiscordAvatar(currentUser.discord_id, currentUser.username, 'nav-avatar', 'sidebar-avatar');

  await loadData();
  await loadLogs();
}

async function loadData() {
  await Promise.all([loadStats(), loadUsers()]);
}

// ─── API HELPER ───────────────────────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  const targetUrl = url.startsWith('/') ? `${API}${url}` : url;
  const res = await fetch(targetUrl, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  if (res.status === 401 || res.status === 403) {
    // Token expiré ou accès refusé → redirection vers login
    localStorage.clear();
    window.location.href = 'admin-login.html';
    return null;
  }
  return res;
}

// ─── STATS ────────────────────────────────────────────────────────────────────
// ─── TABS NAVIGATION ──────────────────────────────────────────────────────────
let activeTab = 'users';
function switchAdminTab(tabName) {
  activeTab = tabName;
  document.querySelectorAll('.tab-pane').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.sidebar-nav a').forEach(b => b.classList.remove('active'));
  
  if (tabName === 'users') {
    document.getElementById('pane-users').style.display = 'block';
    document.getElementById('tab-btn-users').classList.add('active');
    loadData();
  } else if (tabName === 'customers') {
    document.getElementById('pane-customers').style.display = 'block';
    document.getElementById('tab-btn-customers').classList.add('active');
    loadData();
  } else if (tabName === 'railway') {
    document.getElementById('pane-railway').style.display = 'block';
    document.getElementById('tab-btn-railway').classList.add('active');
    loadRailwayData();
  } else if (tabName === 'products') {
    document.getElementById('pane-products').style.display = 'block';
    document.getElementById('tab-btn-products').classList.add('active');
    loadProducts();
    loadPromocodes();
  }
}

function toggleAuditLogs() {
  const wrapper = document.getElementById('logs-table-wrapper');
  const icon = document.getElementById('logs-toggle-icon');
  const btn = document.getElementById('logs-toggle-btn');
  if (!wrapper || !icon) return;

  if (wrapper.style.display === 'none') {
    wrapper.style.display = 'block';
    icon.style.transform = 'rotate(90deg)';
    if (btn) btn.innerHTML = '👁️ Replier';
  } else {
    wrapper.style.display = 'none';
    icon.style.transform = 'rotate(0deg)';
    if (btn) btn.innerHTML = '👁️ Déplier';
  }
}

// ─── STATS ────────────────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const res = await apiFetch('/api/admin/stats');
    if (!res) return;
    const data = await res.json();
    document.getElementById('stat-total').textContent  = data.totalUsers ?? '—';
    document.getElementById('stat-vips').textContent   = data.totalVIPs ?? '—';
    document.getElementById('stat-admins').textContent = data.totalAdmins ?? '—';
  } catch {
    console.error('Failed to load stats');
  }

  // Check Railway service availability
  try {
    const res = await apiFetch('/api/admin/railway/status');
    const el = document.getElementById('stat-railway');
    const icon = document.getElementById('railway-status-icon');
    if (res && res.ok) {
      el.textContent = 'En Ligne';
      el.style.color = '#10b981';
      icon.style.color = '#10b981';
    } else {
      el.textContent = 'Indisponible';
      el.style.color = '#ef4444';
      icon.style.color = '#ef4444';
    }
  } catch {
    const el = document.getElementById('stat-railway');
    el.textContent = 'Hors Ligne';
    el.style.color = '#ef4444';
  }
}

// ─── USERS TABLE ─────────────────────────────────────────────────────────────
async function loadUsers() {
  try {
    const [usersRes, railwayRes] = await Promise.all([
      apiFetch('/api/admin/users'),
      apiFetch('/api/admin/railway/status').catch(() => null)
    ]);
    if (!usersRes) return;
    const data = await usersRes.json();
    allUsers = data.users || [];

    railwayCodes = {};
    if (railwayRes && railwayRes.ok) {
      const railwayData = await railwayRes.json();
      if (railwayData.codes) {
        railwayCodes = railwayData.codes;
      }
    }

    document.getElementById('users-count').textContent = `${allUsers.length} utilisateur(s) enregistré(s)`;
    renderUsers(allUsers);
    if (typeof renderCustomers === 'function') renderCustomers();
  } catch {
    showAdminAlert('Erreur lors du chargement des utilisateurs.', 'error');
  }
}

function renderUsers(users) {
  const tbody = document.getElementById('users-tbody');
  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-muted); padding: 40px;">Aucun utilisateur trouvé.</td></tr>`;
    return;
  }

  tbody.innerHTML = users.map(u => {
    const isSelf = u.id === currentUser.id;
    let roleBadge = `<span class="badge badge-user">👤 User</span>`;
    if (u.role === 'admin') roleBadge = `<span class="badge badge-admin">👑 Admin</span>`;
    if (u.role === 'vip') roleBadge = `<span class="badge badge-vip">⭐ VIP</span>`;

    const dateStr = formatDate(u.created_at);

    // Railway IP for this user's key
    const rwInfo   = railwayCodes[u.discord_key];
    const lockedIp = rwInfo && rwInfo.locked_ip ? rwInfo.locked_ip : null;
    const ipContent = lockedIp
      ? `<div style="display:flex;align-items:center;gap:6px;flex-wrap:nowrap;">
           <code style="font-size:0.78rem; color:var(--accent-3);">${escHtml(lockedIp)}</code>
           <button class="btn btn-ghost btn-sm" onclick="resetRailwayLock('${escHtml(u.discord_key)}')" style="padding:2px 8px;font-size:0.68rem;white-space:nowrap;" title="Déverrouiller l'IP">🔓 Reset</button>
           <button class="btn btn-ghost btn-sm" onclick="copyAdminKey('${escHtml(lockedIp)}', this)" style="padding:2px 8px;font-size:0.68rem;white-space:nowrap;">📋</button>
         </div>`
      : `<span class="badge" style="background:rgba(16,185,129,0.15); color:#10b981; border:1px solid rgba(16,185,129,0.3); font-size:0.7rem; white-space:nowrap;">✅ Libre</span>`;
    const ipCell = `<div style="min-width:280px; display:inline-block;">${ipContent}</div>`;

    const actions = isSelf 
      ? `<span style="font-size:0.75rem; color:var(--text-muted);">Votre compte</span>`
      : `
        <div class="table-actions">
          <button class="btn btn-ghost btn-sm" onclick="openEditUserModal('${u.id}', '${escHtml(u.username)}', '${escHtml(u.discord_id)}', '${escHtml(u.discord_key)}', '${u.role}')" title="Modifier l'utilisateur">
            ✏️ Modifier
          </button>
          <button class="btn btn-danger btn-sm" onclick="openDeleteModal('${u.id}', '${escHtml(u.username)}')" title="Supprimer">
            🗑️
          </button>
        </div>
      `;

    const defaultIdx = (u.discord_id && /^\d+$/.test(u.discord_id)) ? Number((BigInt(u.discord_id) >> 22n) % 6n) : 0;
    const defaultUrl = `https://cdn.discordapp.com/embed/avatars/${defaultIdx}.png`;
    const avatarUrl = u.discord_id && /^\d+$/.test(u.discord_id) ? `${API}/api/auth/discord-avatar/${u.discord_id}` : defaultUrl;

    return `
      <tr>
        <td>
          <div style="display:flex; align-items:center; gap:10px;">
            <div class="avatar" style="width:28px; height:28px; flex-shrink:0; background:transparent;">
              <img class="user-avatar-img" data-discord-id="${escHtml(u.discord_id)}" src="${avatarUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" onerror="this.onerror=null; this.src='${defaultUrl}';" />
            </div>
            <strong>${escHtml(u.username)}</strong>
            ${isSelf ? '<span style="font-size:0.7rem; color:var(--accent-3);">(vous)</span>' : ''}
          </div>
        </td>
        <td><code style="font-size:0.8rem; color:var(--accent-3);">${escHtml(u.discord_id)}</code></td>
        <td>
          <span style="font-family:monospace; font-size:0.8rem; color:var(--text-primary); letter-spacing:0.05em;" title="Clé complète">${escHtml(u.discord_key)}</span>
        </td>
        <td>${ipCell}</td>
        <td>${roleBadge}</td>
        <td style="font-size:0.8rem;">${dateStr}</td>
        <td>${actions}</td>
      </tr>
    `;
  }).join('');

  // Asynchronously fetch actual avatars from Lanyard
  users.forEach(u => {
    if (u.discord_id && /^\d+$/.test(u.discord_id)) {
      fetch(`https://api.lanyard.rest/v1/users/${u.discord_id}`)
        .then(res => res.json())
        .then(body => {
          if (body.success && body.data && body.data.discord_user && body.data.discord_user.avatar) {
            const hash = body.data.discord_user.avatar;
            const ext = hash.startsWith('a_') ? 'gif' : 'png';
            const realUrl = `https://cdn.discordapp.com/avatars/${u.discord_id}/${hash}.${ext}?size=64`;
            document.querySelectorAll(`img[data-discord-id="${u.discord_id}"]`).forEach(img => {
              img.src = realUrl;
            });
          }
        })
        .catch(() => {});
    }
  });
}

function renderCustomers() {
  const tbody = document.getElementById('customers-tbody');
  const searchInput = document.getElementById('search-customers-input');
  const term = searchInput ? searchInput.value.toLowerCase() : '';

  // Show all created accounts
  let customers = allUsers;

  if (term) {
    customers = customers.filter(u => {
      const uShopId = u.shop_id || `GHOST-${(u.id || '').substring(0, 4).toUpperCase()}`;
      return uShopId.toLowerCase().includes(term) || u.username.toLowerCase().includes(term);
    });
  }

  const countEl = document.getElementById('customers-count');
  if (countEl) countEl.textContent = `${customers.length} compte(s) trouvé(s)`;

  if (customers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-muted); padding: 40px;">Aucun compte trouvé.</td></tr>`;
    return;
  }

  tbody.innerHTML = customers.map(u => {
    const keyBadge = u.discord_key 
      ? `<code style="background: rgba(168,85,247,0.1); color: var(--accent-1); padding: 2px 6px; border-radius: 4px; font-size: 0.8rem;">${escHtml(u.discord_key)}</code>`
      : `<span style="color: var(--text-muted); font-size: 0.8rem;">Aucune</span>`;

    const defaultIdx = (u.discord_id && /^\d+$/.test(u.discord_id)) ? Number((BigInt(u.discord_id) >> 22n) % 6n) : 0;
    const defaultUrl = `https://cdn.discordapp.com/embed/avatars/${defaultIdx}.png`;
    const avatarUrl = u.discord_id && /^\d+$/.test(u.discord_id) ? `${API}/api/auth/discord-avatar/${u.discord_id}` : defaultUrl;

    const shopId = u.shop_id || `GHOST-${(u.id || '').substring(0, 4).toUpperCase()}`;

    return `
      <tr style="cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
        <td onclick="showCustomerDetails('${u.id}')">
          <div style="display:flex; align-items:center; gap:10px;">
            <div class="avatar" style="width:28px; height:28px; flex-shrink:0; background:transparent;">
              <img class="user-avatar-img" data-discord-id="${escHtml(u.discord_id)}" src="${avatarUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" onerror="this.onerror=null; this.src='${defaultUrl}';" />
            </div>
            <strong>${escHtml(u.username)}</strong>
          </div>
        </td>
        <td onclick="showCustomerDetails('${u.id}')" style="font-family: monospace; color: var(--accent-1); font-weight: bold;">${escHtml(shopId)}</td>
        <td onclick="showCustomerDetails('${u.id}')"><span style="font-size: 0.85rem; color: var(--text-primary);"><i class="fa-regular fa-envelope" style="color:var(--text-muted); margin-right:6px;"></i>${escHtml(u.payment_email || 'Non renseigné')}</span></td>
        <td onclick="showCustomerDetails('${u.id}')">${keyBadge}</td>
        <td>
          <div class="table-actions">
            <button class="btn btn-ghost btn-sm" onclick="showCustomerDetails('${u.id}')" title="Voir la fiche">
              👁️ Fiche
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ─── MODAL CUSTOMER DETAILS ──────────────────────────────────────────────────
let currentDetailUserId = null;
function showCustomerDetails(userId) {
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;
  currentDetailUserId = userId;

  const modalTitle = document.querySelector('#customer-details-modal .modal-title');
  if (modalTitle) {
    modalTitle.textContent = user.has_paid ? "👤 Fiche de l'Acheteur" : "👤 Fiche de l'Utilisateur";
  }

  const defaultIdx = (user.discord_id && /^\d+$/.test(user.discord_id)) ? Number((BigInt(user.discord_id) >> 22n) % 6n) : 0;
  const defaultUrl = `https://cdn.discordapp.com/embed/avatars/${defaultIdx}.png`;
  const avatarUrl = user.discord_id && /^\d+$/.test(user.discord_id) ? `${API}/api/auth/discord-avatar/${user.discord_id}` : defaultUrl;

  document.getElementById('detail-avatar').src = avatarUrl;
  document.getElementById('detail-username').textContent = user.username;
  
  let roleText = '👤 User';
  if (user.role === 'admin') roleText = '👑 Admin';
  if (user.role === 'vip') roleText = '⭐ VIP';
  document.getElementById('detail-role').textContent = roleText;

  const shopId = user.shop_id || `GHOST-${(user.id || '').substring(0, 4).toUpperCase()}`;
  document.getElementById('detail-shop-id').textContent = shopId;
  
  document.getElementById('detail-discord-id').textContent = user.discord_id || '—';
  document.getElementById('detail-email').textContent = user.payment_email || 'Non renseigné';
  
  const paidDate = user.paid_at ? new Date(user.paid_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  document.getElementById('detail-paid-at').textContent = paidDate;
  
  const createdDate = user.created_at ? new Date(user.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  document.getElementById('detail-created-at').textContent = createdDate;

  // Moyen de paiement avec de magnifiques logos SVG officiels
  const methodEl = document.getElementById('detail-payment-method');
  if (methodEl) {
    if (user.has_paid) {
      const method = user.payment_method || (user.paypal_confirmed || user.paypal_pending_note ? 'paypal' : 'stripe');
      if (method === 'paypal') {
        methodEl.innerHTML = `
          <span class="badge" style="background: rgba(0, 112, 186, 0.1); color: #0070ba; border: 1px solid rgba(0, 112, 186, 0.25); font-weight: 700; font-size: 0.85rem; padding: 6px 12px; border-radius: 6px; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 0 10px rgba(0, 112, 186, 0.05);">
            <img src="img/paypal.png" alt="PayPal" style="width: 14px; height: 14px; object-fit: contain; background: #fff; padding: 1px; border-radius: 2px;">
            PayPal
          </span>`;
      } else if (method === 'discord') {
        methodEl.innerHTML = `
          <span class="badge" style="background: rgba(88, 101, 242, 0.15); color: #5865f2; border: 1px solid rgba(88, 101, 242, 0.3); font-weight: 700; font-size: 0.85rem; padding: 6px 12px; border-radius: 6px; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 0 10px rgba(88, 101, 242, 0.05);">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 127.14 96.36" width="14" height="14" style="fill: #5865f2;"><path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,53.22,6.83,77.19,77.19,0,0,0,49.88,0,105.15,105.15,0,0,0,19.44,8.07C3.66,31.58-1.86,54.65,1,77.53A105.73,105.73,0,0,0,32,96.36a77.7,77.7,0,0,0,6.63-10.85,68.43,68.43,0,0,1-10.5-5c.88-.65,1.72-1.33,2.53-2a75.7,75.7,0,0,0,72.93,0c.81.71,1.65,1.39,2.53,2a68.43,68.43,0,0,1-10.5,5,77.7,77.7,0,0,0,6.63,10.85,105.73,105.73,0,0,0,31-18.83C129.07,54.65,123.56,31.58,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.83,46,53.83,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.07,46,96.07,53,91,65.69,84.69,65.69Z"/></svg>
            Discord
          </span>`;
      } else {
        methodEl.innerHTML = `
          <span class="badge" style="background: rgba(99, 91, 255, 0.15); color: #7c73ff; border: 1px solid rgba(99, 91, 255, 0.3); font-weight: 700; font-size: 0.85rem; padding: 6px 12px; border-radius: 6px; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 0 10px rgba(99, 91, 255, 0.05);">
            <img src="img/stripe.png" alt="Stripe" style="width: 14px; height: 14px; object-fit: contain; border-radius: 2px;">
            Stripe
          </span>`;
      }
    } else {
      methodEl.innerHTML = `
        <span class="badge" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.25); font-weight: 700; font-size: 0.85rem; padding: 6px 12px; border-radius: 6px; display: inline-flex; align-items: center; gap: 6px;">
          ❌ Non payé
        </span>`;
    }
  }


  const keyBadge = user.discord_key 
    ? `<code style="background: rgba(168,85,247,0.1); color: var(--accent-1); padding: 4px 8px; border-radius: 4px; font-size: 0.9rem;">${escHtml(user.discord_key)}</code>`
    : `<span style="color: var(--text-muted); font-size: 0.9rem;">Aucune</span>`;
  document.getElementById('detail-key').innerHTML = keyBadge;

  // Afficher la note PayPal en attente si présente
  const noteRow = document.getElementById('detail-paypal-note-row');
  const confirmBtn = document.getElementById('confirm-paypal-btn');
  if (user.paypal_pending_note && !user.paypal_confirmed && !user.has_paid) {
    document.getElementById('detail-paypal-note').textContent = user.paypal_pending_note;
    if (noteRow) noteRow.style.display = 'block';
    if (confirmBtn) confirmBtn.style.display = 'inline-flex';
  } else {
    if (noteRow) noteRow.style.display = 'none';
    if (confirmBtn) confirmBtn.style.display = 'none';
  }

  openModal('customer-details-modal');
}

async function confirmPaypalPayment() {
  if (!currentDetailUserId) return;
  const btn = document.getElementById('confirm-paypal-btn');
  btn.disabled = true;
  btn.textContent = 'Confirmation...';
  try {
    const res = await apiFetch('/api/admin/confirm-paypal', {
      method: 'POST',
      body: JSON.stringify({ userId: currentDetailUserId })
    });
    if (!res) return;
    const data = await res.json();
    if (res.ok) {
      showAdminAlert(`✅ Paiement confirmé ! Clé générée : ${data.key || 'N/A'}`, 'success');
      closeModal('customer-details-modal');
      await loadUsers();
    } else {
      showAdminAlert(data.error || 'Erreur lors de la confirmation.', 'error');
    }
  } catch(e) {
    showAdminAlert('Erreur réseau.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '✅ Confirmer paiement PayPal';
  }
}

// ─── SEARCH / FILTER ─────────────────────────────────────────────────────────
function getCleanValueBadge(value) {
  const val = value || 'Banner:Banner:True';
  if (val === 'Fpsbn:Fpsbn:True') {
    return `<span class="badge badge-fpsbn">🚀 FPSBN Premium</span>`;
  }
  if (val === 'Banner:Banner:True') {
    return `<span class="badge badge-banner-premium">✨ Banner Premium</span>`;
  }
  
  // Generic parsing for any other values that might be added
  const parts = val.split(':');
  if (parts.length >= 3 && parts[2].toLowerCase() === 'true') {
    const name = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
    return `<span class="badge badge-banner-premium">✨ ${escHtml(name)} Premium</span>`;
  }
  if (parts.length >= 3 && parts[2].toLowerCase() === 'false') {
    const name = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
    return `<span class="badge badge-user">${escHtml(name)} Standard</span>`;
  }
  
  // Basic fallback
  return `<span class="badge badge-user">${escHtml(val)}</span>`;
}

function filterUsers() {
  const q = document.getElementById('search-input').value.toLowerCase().trim();
  const filtered = allUsers.filter(u => {
    const rwInfo = railwayCodes[u.discord_key];
    const lockedIp = rwInfo && rwInfo.locked_ip ? rwInfo.locked_ip.toLowerCase() : '';
    return (
      u.username.toLowerCase().includes(q) ||
      u.discord_id.includes(q) ||
      u.role.includes(q) ||
      (u.discord_key && u.discord_key.toLowerCase().includes(q)) ||
      lockedIp.includes(q)
    );
  });
  renderUsers(filtered);
}

function filterRailwayKeys() {
  const input = document.getElementById('search-keys-input');
  const q = input ? input.value.toLowerCase().trim() : '';
  if (!q) {
    renderRailwayKeys(railwayCodes);
    return;
  }

  const filtered = {};
  Object.keys(railwayCodes).forEach(code => {
    const info = railwayCodes[code];
    const valLabel = info.value === "Fpsbn:Fpsbn:True" ? "Fpsbn Premium" : (info.value || 'Banner:Banner:True');
    if (
      code.toLowerCase().includes(q) ||
      (info.locked_ip && info.locked_ip.toLowerCase().includes(q)) ||
      (info.player_name && info.player_name.toLowerCase().includes(q)) ||
      valLabel.toLowerCase().includes(q)
    ) {
      filtered[code] = info;
    }
  });

  renderRailwayKeys(filtered);
}

function toggleRailwayKeysExpand() {
  railwayKeysExpanded = !railwayKeysExpanded;
  filterRailwayKeys();
}


// ─── DELETE ───────────────────────────────────────────────────────────────────
function openDeleteModal(id, username) {
  deleteTargetId = id;
  document.getElementById('delete-username').textContent = username;
  document.getElementById('delete-modal').classList.add('active');
}
async function confirmDelete() {
  if (!deleteTargetId) return;
  try {
    const res = await apiFetch(`/api/admin/users/${deleteTargetId}`, { method: 'DELETE' });
    if (!res) return;
    const data = await res.json();
    if (!res.ok) { showAdminAlert(data.error, 'error'); return; }
    showAdminAlert('Utilisateur supprimé avec succès.', 'success');
    closeModal('delete-modal');
    await loadData();
  } catch {
    showAdminAlert('Erreur lors de la suppression.', 'error');
  }
}

// ─── EDIT USER MODAL ──────────────────────────────────────────────────────────
function openEditUserModal(id, username, discordId, discordKey, role) {
  document.getElementById('edit-user-id').value = id;
  document.getElementById('edit-username').value = username;
  document.getElementById('edit-discord-id').value = discordId;
  document.getElementById('edit-discord-key').value = discordKey;
  document.getElementById('edit-role').value = role;
  document.getElementById('edit-user-modal').classList.add('active');
}

async function submitEditUser() {
  const id = document.getElementById('edit-user-id').value;
  const username = document.getElementById('edit-username').value.trim();
  const discord_id = document.getElementById('edit-discord-id').value.trim();
  const discord_key = document.getElementById('edit-discord-key').value.trim();
  const role = document.getElementById('edit-role').value;

  const btn = document.getElementById('edit-user-btn');
  btn.disabled = true;
  btn.textContent = 'Enregistrement...';

  try {
    const res = await apiFetch(`/api/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ username, discord_id, discord_key, role })
    });
    if (!res) return;
    const data = await res.json();
    if (!res.ok) {
      showAdminAlert(data.error || 'Erreur lors de la mise à jour.', 'error');
      return;
    }
    showAdminAlert('Compte utilisateur modifié avec succès.', 'success');
    closeModal('edit-user-modal');
    await loadData();
  } catch {
    showAdminAlert('Une erreur est survenue lors de la communication serveur.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enregistrer';
  }
}

// ─── AUDIT LOGS ───────────────────────────────────────────────────────────────
async function loadLogs() {
  try {
    const res = await apiFetch('/api/admin/logs');
    if (!res) return;
    const data = await res.json();
    renderLogs(data.logs || []);
  } catch {
    console.error('Failed to load logs');
  }
}

function renderLogs(logs) {
  const tbody = document.getElementById('logs-tbody');
  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:30px;">Aucun log disponible.</td></tr>`;
    return;
  }
  const actionIcons = {
    register:          { icon: '✨', label: 'Inscription' },
    login:             { icon: '🔐', label: 'Connexion' },
    login_failed:      { icon: '⚠️', label: 'Échec connexion' },
    admin_delete_user: { icon: '🗑️', label: 'Suppression' },
    admin_change_role: { icon: '🔄', label: 'Rôle modifié' },
  };

  tbody.innerHTML = logs.map(log => {
    const info = actionIcons[log.action] || { icon: '📋', label: log.action };
    const cssClass = `log-${log.action}`;
    return `
      <tr>
        <td>
          <span class="log-action ${cssClass}">
            ${info.icon} ${info.label}
          </span>
        </td>
        <td>${log.username ? escHtml(log.username) : '<span style="color:var(--text-muted)">—</span>'}</td>
        <td style="font-family:monospace; font-size:0.8rem; color:var(--text-muted);">${log.ip || '—'}</td>
        <td style="font-size:0.8rem; color:var(--text-muted);">${formatDateTime(log.created_at)}</td>
      </tr>
    `;
  }).join('');
}

// ─── MODALS ───────────────────────────────────────────────────────────────────
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}
function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}
document.querySelectorAll('.modal-backdrop').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('active'); });
});

// ─── ALERT ────────────────────────────────────────────────────────────────────
function showAdminAlert(msg, type = 'error') {
  const el = document.getElementById('admin-alert');
  const icon = type === 'error' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️';
  el.className = `alert alert-${type}`;
  el.innerHTML = `${icon} ${msg}`;
  el.style.display = 'flex';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
function logout() { localStorage.clear(); window.location.href = 'admin-login.html'; }

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function maskString(str) {
  if (!str) return '—';
  if (str.length <= 4) return '****';
  return str.slice(0, 3) + '•'.repeat(Math.min(str.length - 3, 8));
}
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function copyAdminKey(key, btn) {
  navigator.clipboard.writeText(key).then(() => {
    const orig = btn.textContent;
    btn.textContent = '✅';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  });
}
function formatDate(d) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function formatDateTime(d) {
  return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ─── RAILWAY CONTROL FUNCTIONS ────────────────────────────────────────────────
async function loadRailwayData() {
  const tbodyKeys = document.getElementById('railway-keys-tbody');
  const tbodyIps = document.getElementById('railway-ips-tbody');
  const tbodyLogs = document.getElementById('railway-logs-tbody');

  tbodyKeys.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px;">Chargement en cours...</td></tr>`;
  tbodyIps.innerHTML = `<tr><td colspan="2" style="text-align:center; padding: 20px;">Chargement...</td></tr>`;
  tbodyLogs.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 20px;">Chargement...</td></tr>`;

  try {
    const res = await apiFetch('/api/admin/railway/status');
    if (!res) return;
    const data = await res.json();
    if (!res.ok) {
      showAdminAlert(data.error || 'Erreur lors de la récupération des données Railway.', 'error');
      return;
    }

    railwayCodes = data.codes || {};
    filterRailwayKeys();
    renderRailwayBannedIps(data.banned_ips || []);
    railwayLogs = data.logs || [];
    renderRailwayLogs(railwayLogs);
  } catch (err) {
    showAdminAlert('Impossible de charger les données de la clé Railway.', 'error');
  }
}


function renderRailwayKeys(codes) {
  const tbody = document.getElementById('railway-keys-tbody');
  const countEl = document.getElementById('railway-keys-count');
  const keys = Object.keys(codes);

  countEl.textContent = `${keys.length} clé(s) active(s) sur Railway`;

  // Reset selection states
  const masterCheckbox = document.getElementById('select-all-keys');
  if (masterCheckbox) masterCheckbox.checked = false;
  updateBulkDeleteButton();

  if (keys.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-muted); padding: 40px;">Aucune clé configurée sur Railway.</td></tr>`;
    const expandContainer = document.getElementById('railway-keys-expand-container');
    if (expandContainer) expandContainer.style.display = 'none';
    return;
  }

  // Determine if we should paginate/collapse
  const searchInput = document.getElementById('search-keys-input');
  const q = searchInput ? searchInput.value.toLowerCase().trim() : '';
  
  let displayKeys = keys;
  const isFiltering = q.length > 0;
  
  const expandContainer = document.getElementById('railway-keys-expand-container');
  const expandBtn = document.getElementById('railway-keys-expand-btn');

  if (!isFiltering && keys.length > 5) {
    if (expandContainer) expandContainer.style.display = 'block';
    if (!railwayKeysExpanded) {
      displayKeys = keys.slice(0, 5);
      if (expandBtn) expandBtn.innerHTML = `👁️ Déplier (${keys.length - 5} clés masquées)`;
    } else {
      if (expandBtn) expandBtn.innerHTML = `👁️ Replier`;
    }
  } else {
    if (expandContainer) expandContainer.style.display = 'none';
  }

  tbody.innerHTML = displayKeys.map(code => {
    const info = codes[code];
      
    const lockIpStr = info.locked_ip
      ? `<code style="color: var(--accent-3);">${escHtml(info.locked_ip)}</code>`
      : `<span style="color: var(--text-muted); font-style: italic;">Non verrouillé</span>`;

    const playerStr = info.player_name
      ? `<strong>${escHtml(info.player_name)}</strong>`
      : `<span style="color: var(--text-muted);">—</span>`;

    let expStr = `<span style="color: var(--text-muted);">Illimité</span>`;
    if (info.expires_at) {
      expStr = formatDate(info.expires_at);
    } else if (info.duration_days) {
      expStr = `<span style="color: var(--accent-3);">${info.duration_days} jour${info.duration_days > 1 ? 's' : ''} (non activée)</span>`;
    }

    // Actions
    const resetAction = info.locked_ip
      ? `<button class="btn btn-ghost btn-sm" onclick="resetRailwayLock('${escHtml(code)}')" title="Déverrouiller l'IP">🔓 Reset</button>`
      : `<button class="btn btn-ghost btn-sm" disabled style="opacity: 0.5;">🔓 Reset</button>`;

    const deleteAction = `<button class="btn btn-danger btn-sm" onclick="deleteRailwayKey('${escHtml(code)}')" title="Supprimer">🗑️</button>`;

    return `
      <tr>
        <td style="text-align: center;">
          <input type="checkbox" class="key-checkbox" value="${escHtml(code)}" onchange="updateBulkDeleteButton()">
        </td>
        <td><strong style="color: var(--text-primary); font-family: monospace;">${escHtml(code)}</strong></td>
        <td>${lockIpStr}</td>
        <td>${playerStr}</td>
        <td>${expStr}</td>
        <td>
          <div class="table-actions">
            ${resetAction}
            ${deleteAction}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function toggleSelectAllKeys(masterCheckbox) {
  const checkboxes = document.querySelectorAll('.key-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = masterCheckbox.checked;
  });
  updateBulkDeleteButton();
}

function updateBulkDeleteButton() {
  const checkboxes = document.querySelectorAll('.key-checkbox:checked');
  const btn = document.getElementById('bulk-delete-keys-btn');
  const masterCheckbox = document.getElementById('select-all-keys');
  
  if (!btn) return;
  
  if (checkboxes.length > 0) {
    btn.style.display = 'inline-flex';
    btn.textContent = `🗑️ Supprimer la sélection (${checkboxes.length})`;
  } else {
    btn.style.display = 'none';
  }

  const allCheckboxes = document.querySelectorAll('.key-checkbox');
  if (masterCheckbox && allCheckboxes.length > 0) {
    masterCheckbox.checked = (checkboxes.length === allCheckboxes.length);
  }
}

async function bulkDeleteSelectedKeys() {
  const checkboxes = document.querySelectorAll('.key-checkbox:checked');
  const codes = Array.from(checkboxes).map(cb => cb.value);
  
  if (codes.length === 0) {
    showAdminAlert('Aucune clé sélectionnée.', 'error');
    return;
  }
  
  const msg = codes.length === 1 
    ? `Supprimer définitivement la clé sélectionnée ?` 
    : `Supprimer définitivement les ${codes.length} clés sélectionnées ?`;
    
  if (!confirm(msg)) return;
  
  const btn = document.getElementById('bulk-delete-keys-btn');
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Suppression...';
  
  try {
    const res = await apiFetch('/api/admin/railway/delete-multiple', {
      method: 'POST',
      body: JSON.stringify({ codes })
    });
    
    if (!res) return;
    const data = await res.json();
    
    if (!res.ok) {
      showAdminAlert(data.error || 'Erreur lors de la suppression groupée.', 'error');
      return;
    }
    
    const results = data.results || [];
    const deletedCount = results.filter(r => r.status === 'deleted').length;
    const failedCount = results.filter(r => r.status === 'failed').length;
    
    if (failedCount > 0) {
      showAdminAlert(`Suppression partielle : ${deletedCount} clés supprimées, ${failedCount} échecs.`, 'warning');
    } else {
      showAdminAlert(`Toutes les ${deletedCount} clés ont été supprimées avec succès !`, 'success');
    }
    
    await loadRailwayData();
    await loadStats();
    await loadUsers();
  } catch (err) {
    console.error(err);
    showAdminAlert('Erreur de communication.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
}

function renderRailwayBannedIps(banned_ips) {
  const tbody = document.getElementById('railway-ips-tbody');
  if (banned_ips.length === 0) {
    tbody.innerHTML = `<tr><td colspan="2" style="text-align:center; color: var(--text-muted); padding: 20px;">Aucune IP bannie.</td></tr>`;
    return;
  }

  tbody.innerHTML = banned_ips.map(ip => {
    return `
      <tr>
        <td><code style="font-size: 0.85rem; color: var(--error);">${escHtml(ip)}</code></td>
        <td>
          <button class="btn btn-ghost btn-sm" style="color: var(--success);" onclick="unbanRailwayIP('${escHtml(ip)}')" title="Débannir">✅ Débannir</button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderRailwayLogs(logs) {
  const tbody = document.getElementById('railway-logs-tbody');
  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--text-muted); padding: 20px;">Aucun log sur Railway.</td></tr>`;
    const expandContainer = document.getElementById('railway-logs-expand-container');
    if (expandContainer) expandContainer.style.display = 'none';
    return;
  }

  const cappedLogs = logs.slice(0, 40);
  let displayLogs = cappedLogs;
  
  const expandContainer = document.getElementById('railway-logs-expand-container');
  const expandBtn = document.getElementById('railway-logs-expand-btn');

  if (cappedLogs.length > 5) {
    if (expandContainer) expandContainer.style.display = 'block';
    if (!railwayLogsExpanded) {
      displayLogs = cappedLogs.slice(0, 5);
      if (expandBtn) expandBtn.innerHTML = `👁️ Déplier (${cappedLogs.length - 5} logs masqués)`;
    } else {
      if (expandBtn) expandBtn.innerHTML = `👁️ Replier`;
    }
  } else {
    if (expandContainer) expandContainer.style.display = 'none';
  }

  tbody.innerHTML = displayLogs.map(log => {
    const timestampStr = formatDateTime(log.timestamp);
    const actionLabel = escHtml(log.action || 'LOG');
    let colorStyle = '';
    if (actionLabel.includes('FAIL')) colorStyle = 'color: var(--error);';
    if (actionLabel.includes('GEN') || actionLabel.includes('ADD')) colorStyle = 'color: var(--success);';

    return `
      <tr>
        <td><span style="font-weight:700; font-size:0.75rem; ${colorStyle}">${actionLabel}</span></td>
        <td><span style="font-size:0.8rem; color:var(--text-secondary);">${escHtml(log.message || '')}</span></td>
        <td><code style="font-size:0.75rem; color:var(--text-muted);">${escHtml(log.ip || '—')}</code></td>
        <td><span style="font-family:monospace; font-size:0.75rem; color:var(--text-muted);">${escHtml(log.code || '—')}</span></td>
      </tr>
    `;
  }).join('');
}

function toggleRailwayLogsExpand() {
  railwayLogsExpanded = !railwayLogsExpanded;
  renderRailwayLogs(railwayLogs);
}


function toggleCustomDurationInput(prefix) {
  const select = document.getElementById(`railway-${prefix}-duration-preset`);
  const container = document.getElementById(`railway-${prefix}-custom-container`);
  if (!select || !container) return;

  if (select.value === 'custom') {
    container.style.display = 'block';
    container.style.opacity = '0';
    container.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      container.style.transition = 'all 0.3s ease';
      container.style.opacity = '1';
      container.style.transform = 'translateY(0)';
    }, 10);
  } else {
    container.style.display = 'none';
  }
}


// Actions wrappers
async function generateRailwayKeys() {
  const count = parseInt(document.getElementById('railway-gen-count').value) || 1;
  const preset = document.getElementById('railway-gen-duration-preset').value;
  let duration_days = null;

  if (preset === 'custom') {
    const daysVal = document.getElementById('railway-gen-days').value.trim();
    duration_days = daysVal === '' ? null : parseInt(daysVal);
  } else if (preset !== 'unlimited') {
    duration_days = parseInt(preset);
  }

  const btn = document.getElementById('railway-gen-btn');
  btn.disabled = true;
  btn.textContent = 'Génération...';

  try {
    const res = await apiFetch('/api/admin/railway/generate', {
      method: 'POST',
      body: JSON.stringify({ count, duration_days })
    });
    if (!res) return;
    const data = await res.json();
    if (!res.ok) {
      showAdminAlert(data.error || 'Erreur lors de la génération.', 'error');
      return;
    }
    showAdminAlert(`Génération réussie ! Clé(s) générée(s) : ${data.codes ? data.codes.join(', ') : ''}`, 'success');
    await loadRailwayData();
    await loadStats();
  } catch {
    showAdminAlert('Erreur de communication.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Générer les clés';
  }
}

async function addRailwayKey() {
  const code = document.getElementById('railway-add-code').value.trim();
  const preset = document.getElementById('railway-add-duration-preset').value;
  let duration_days = null;

  if (preset === 'custom') {
    const daysVal = document.getElementById('railway-add-days').value.trim();
    duration_days = daysVal === '' ? null : parseInt(daysVal);
  } else if (preset !== 'unlimited') {
    duration_days = parseInt(preset);
  }

  if (!code) {
    showAdminAlert('Veuillez entrer une clé.', 'error');
    return;
  }

  const btn = document.getElementById('railway-add-btn');
  btn.disabled = true;
  btn.textContent = 'Ajout...';

  try {
    const res = await apiFetch('/api/admin/railway/add', {
      method: 'POST',
      body: JSON.stringify({ code, duration_days })
    });
    if (!res) return;
    const data = await res.json();
    if (!res.ok) {
      showAdminAlert(data.error || 'Erreur lors de l\'ajout.', 'error');
      return;
    }
    showAdminAlert('Clé personnalisée ajoutée avec succès !', 'success');
    document.getElementById('railway-add-code').value = '';
    await loadRailwayData();
    await loadStats();
  } catch {
    showAdminAlert('Erreur de communication.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ajouter la clé';
  }
}

async function banRailwayIP() {
  const ip = document.getElementById('railway-ban-ip').value.trim();
  if (!ip) {
    showAdminAlert('Veuillez entrer une IP.', 'error');
    return;
  }

  const btn = document.getElementById('railway-ban-btn');
  btn.disabled = true;
  btn.textContent = 'Bannissement...';

  try {
    const res = await apiFetch('/api/admin/railway/ban', {
      method: 'POST',
      body: JSON.stringify({ ip })
    });
    if (!res) return;
    const data = await res.json();
    if (!res.ok) {
      showAdminAlert(data.error || 'Erreur de bannissement.', 'error');
      return;
    }
    showAdminAlert(`IP ${ip} bannie avec succès sur Railway.`, 'success');
    document.getElementById('railway-ban-ip').value = '';
    await loadRailwayData();
  } catch {
    showAdminAlert('Erreur de communication.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Bannir l\'IP';
  }
}

async function unbanRailwayIP(ip) {
  try {
    const res = await apiFetch('/api/admin/railway/unban', {
      method: 'POST',
      body: JSON.stringify({ ip })
    });
    if (!res) return;
    const data = await res.json();
    if (!res.ok) {
      showAdminAlert(data.error || 'Erreur de débannissement.', 'error');
      return;
    }
    showAdminAlert(`IP ${ip} débannie avec succès sur Railway.`, 'success');
    await loadRailwayData();
  } catch {
    showAdminAlert('Erreur de communication.', 'error');
  }
}

async function resetRailwayLock(code) {
  try {
    const res = await apiFetch('/api/admin/railway/reset', {
      method: 'POST',
      body: JSON.stringify({ code })
    });
    if (!res) return;
    const data = await res.json();
    if (!res.ok) {
      showAdminAlert(data.error || 'Erreur de reset.', 'error');
      return;
    }
    showAdminAlert(`IP verrouillée libérée pour la clé ${code}.`, 'success');
    await loadRailwayData();
  } catch {
    showAdminAlert('Erreur de communication.', 'error');
  }
}

async function resetAllRailwayLocks() {
  if (!confirm('Êtes-vous sûr de vouloir libérer les adresses IP verrouillées de TOUTES les clés ?')) return;
  try {
    const res = await apiFetch('/api/admin/railway/reset-all', { method: 'POST' });
    if (!res) return;
    const data = await res.json();
    if (!res.ok) {
      showAdminAlert(data.error || 'Erreur lors du reset global.', 'error');
      return;
    }
    showAdminAlert('Toutes les clés ont été déverrouillées avec succès !', 'success');
    await loadRailwayData();
  } catch {
    showAdminAlert('Erreur de communication.', 'error');
  }
}

async function deleteRailwayKey(code) {
  if (!confirm(`Supprimer définitivement la clé "${code}" de Railway ?`)) return;
  try {
    const res = await apiFetch('/api/admin/railway/delete', {
      method: 'POST',
      body: JSON.stringify({ code })
    });
    if (!res) return;
    const data = await res.json();
    if (!res.ok) {
      showAdminAlert(data.error || 'Erreur de suppression.', 'error');
      return;
    }
    showAdminAlert(`Clé "${code}" supprimée avec succès sur Railway.`, 'success');
    await loadRailwayData();
    await loadStats();
  } catch {
    showAdminAlert('Erreur de communication.', 'error');
  }
}

// ─── PRODUCTS ──────────────────────────────────────────────────────────────────
async function loadProducts() {
  try {
    const res = await apiFetch('/api/admin/products');
    if (!res) return;
    const data = await res.json();
    allProducts = data.products || [];
    document.getElementById('products-count').textContent = `${allProducts.length} produit(s) dans la boutique`;
    renderProducts(allProducts);
  } catch {
    showAdminAlert('Erreur lors du chargement des produits.', 'error');
  }
}

function renderProducts(products) {
  const tbody = document.getElementById('products-tbody');
  if (products.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-muted); padding: 40px;">Aucun produit trouvé.</td></tr>`;
    return;
  }

  tbody.innerHTML = products.map(p => {
    return `
      <tr>
        <td>
          <div style="display:flex; align-items:center; gap:10px;">
            ${p.image ? `<img src="${p.image.startsWith('http') ? p.image : '/img/' + p.image}" style="width:32px; height:32px; border-radius:4px; object-fit:cover;" onerror="this.style.display='none'">` : '<div style="width:32px; height:32px; background:var(--bg-secondary); border-radius:4px; display:flex; align-items:center; justify-content:center;">📦</div>'}
            <div>
              <strong>${escHtml(p.name)}</strong>
              <br><small style="color:var(--text-muted); font-family:monospace;">${escHtml(p.id)}</small>
            </div>
          </div>
        </td>
        <td><span class="badge" style="background:var(--bg-secondary);">${escHtml(p.category || 'N/A')}</span></td>
        <td><strong>${p.price}€</strong></td>
        <td>${escHtml(p.version || '1.0.0')}</td>
        <td>
          <div class="table-actions">
            <button class="btn btn-ghost btn-sm" onclick="openProductModal('${p.id}')" title="Modifier">✏️</button>
            <button class="btn btn-danger btn-sm" onclick="openDeleteProductModal('${p.id}', '${escHtml(p.name.replace(/'/g, "\\'"))}')" title="Supprimer">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openProductModal(prodId = null) {
  if (prodId) {
    const p = allProducts.find(x => x.id === prodId);
    if (p) {
      document.getElementById('edit-product-_id').value = p.id;
      document.getElementById('edit-product-id').value = p.id;
      document.getElementById('edit-product-name').value = p.name || '';
      document.getElementById('edit-product-category').value = p.category || 'utilities';
      document.getElementById('edit-product-price').value = p.price || 0;
      document.getElementById('edit-product-image').value = p.image || '';
      document.getElementById('edit-product-link').value = p.stripeLink || '';
      document.getElementById('edit-product-short').value = p.shortDesc || '';
      document.getElementById('edit-product-long').value = p.longDesc || '';
      document.getElementById('edit-product-features').value = p.features ? p.features.join(', ') : '';
    }
  } else {
    // New product
    document.getElementById('edit-product-_id').value = '';
    document.getElementById('edit-product-id').value = '';
    document.getElementById('edit-product-name').value = '';
    document.getElementById('edit-product-category').value = 'utilities';
    document.getElementById('edit-product-price').value = '';
    document.getElementById('edit-product-image').value = '';
    document.getElementById('edit-product-link').value = '';
    document.getElementById('edit-product-short').value = '';
    document.getElementById('edit-product-long').value = '';
    document.getElementById('edit-product-features').value = '';
  }
  document.getElementById('edit-product-modal').classList.add('active');
}

async function submitEditProduct() {
  const _id = document.getElementById('edit-product-_id').value;
  const id = document.getElementById('edit-product-id').value.trim();
  const name = document.getElementById('edit-product-name').value.trim();
  const category = document.getElementById('edit-product-category').value;
  const price = document.getElementById('edit-product-price').value;
  const image = document.getElementById('edit-product-image').value.trim();
  const stripeLink = document.getElementById('edit-product-link').value.trim();
  const shortDesc = document.getElementById('edit-product-short').value.trim();
  const longDesc = document.getElementById('edit-product-long').value.trim();
  const featuresStr = document.getElementById('edit-product-features').value;

  if (!id || !name || !price) {
    showAdminAlert('L\'ID, le nom et le prix sont obligatoires.', 'error');
    return;
  }

  const features = featuresStr.split(',').map(f => f.trim()).filter(f => f.length > 0);

  const payload = {
    id, name, category, price, image, stripeLink, shortDesc, longDesc, features,
    version: '1.0.0', escrow: 'Oui', dependencies: 'Aucune'
  };

  const btn = document.getElementById('edit-product-btn');
  btn.disabled = true;
  btn.textContent = 'Enregistrement...';

  try {
    let res;
    if (_id) { // Edit
      res = await apiFetch(`/api/admin/products/${_id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    } else { // Create
      res = await apiFetch('/api/admin/products', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    }
    
    if (!res) return;
    const data = await res.json();
    if (!res.ok) {
      showAdminAlert(data.error || 'Erreur lors de l\'enregistrement.', 'error');
      return;
    }
    
    showAdminAlert('Produit enregistré avec succès.', 'success');
    closeModal('edit-product-modal');
    await loadProducts();
  } catch {
    showAdminAlert('Erreur de communication.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enregistrer';
  }
}

function openDeleteProductModal(id, name) {
  deleteTargetId = id;
  document.getElementById('delete-product-name').textContent = name;
  document.getElementById('delete-product-modal').classList.add('active');
}

async function confirmDeleteProduct() {
  if (!deleteTargetId) return;
  try {
    const res = await apiFetch(`/api/admin/products/${deleteTargetId}`, { method: 'DELETE' });
    if (!res) return;
    if (!res.ok) {
      const data = await res.json();
      showAdminAlert(data.error || 'Erreur de suppression.', 'error');
      return;
    }
    showAdminAlert('Produit supprimé.', 'success');
    closeModal('delete-product-modal');
    await loadProducts();
  } catch {
    showAdminAlert('Erreur lors de la suppression.', 'error');
  }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  // Set admin info in navbar
  document.getElementById('nav-username').textContent = currentUser.username;
  loadDiscordAvatar(currentUser.discord_id, currentUser.username, 'nav-avatar');
  await loadData();
  await loadLogs();
}

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

// ─── PROMO CODES ──────────────────────────────────────────────────────────────
let allPromocodes = [];
let deletePromoTargetId = null;

async function loadPromocodes() {
  try {
    const res = await apiFetch('/api/admin/promocodes');
    if (!res) return;
    const data = await res.json();
    allPromocodes = data.promocodes || [];
    document.getElementById('promocodes-count').textContent = `${allPromocodes.length} code(s) promotionnel(s)`;
    renderPromocodes(allPromocodes);
  } catch (err) {
    console.error(err);
    showAdminAlert('Erreur lors du chargement des codes promo.', 'error');
  }
}

function renderPromocodes(promos) {
  const tbody = document.getElementById('promocodes-tbody');
  if (promos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--text-muted); padding: 40px;">Aucun code promo trouvé.</td></tr>`;
    return;
  }

  tbody.innerHTML = promos.map(p => {
    const typeLabel = p.type === 'percentage' ? 'Pourcentage (%)' : 'Montant fixe (€)';
    const valSuffix = p.type === 'percentage' ? '%' : '€';
    const expiry = p.expiry_date ? new Date(p.expiry_date).toLocaleDateString('fr-FR') : 'Jamais';
    const limit = p.max_uses !== null ? p.max_uses : 'Illimité';
    return `
      <tr>
        <td><strong>${escHtml(p.code)}</strong></td>
        <td><span class="badge" style="background:var(--bg-secondary);">${typeLabel}</span></td>
        <td><strong>${p.value}${valSuffix}</strong></td>
        <td>${p.uses}</td>
        <td>${limit}</td>
        <td>${expiry}</td>
        <td>
          <div class="table-actions">
            <button class="btn btn-ghost btn-sm" onclick="openPromoModal('${p._id}')" title="Modifier">✏️</button>
            <button class="btn btn-danger btn-sm" onclick="openDeletePromoModal('${p._id}', '${escHtml(p.code.replace(/'/g, "\\'"))}')" title="Supprimer">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openPromoModal(promoId = null) {
  if (promoId) {
    const p = allPromocodes.find(x => x._id === promoId);
    if (p) {
      document.getElementById('promo-modal-title').textContent = '✏️ Modifier le Code Promo';
      document.getElementById('edit-promo-_id').value = p._id;
      document.getElementById('edit-promo-code').value = p.code;
      document.getElementById('edit-promo-type').value = p.type;
      document.getElementById('edit-promo-value').value = p.value;
      document.getElementById('edit-promo-max-uses').value = p.max_uses !== null ? p.max_uses : '';
      document.getElementById('edit-promo-expiry').value = p.expiry_date ? p.expiry_date.split('T')[0] : '';
    }
  } else {
    document.getElementById('promo-modal-title').textContent = '🏷️ Créer un Code Promo';
    document.getElementById('edit-promo-_id').value = '';
    document.getElementById('edit-promo-code').value = '';
    document.getElementById('edit-promo-type').value = 'percentage';
    document.getElementById('edit-promo-value').value = '';
    document.getElementById('edit-promo-max-uses').value = '';
    document.getElementById('edit-promo-expiry').value = '';
  }
  document.getElementById('edit-promo-modal').classList.add('active');
}

async function submitEditPromo() {
  const _id = document.getElementById('edit-promo-_id').value;
  const code = document.getElementById('edit-promo-code').value.trim();
  const type = document.getElementById('edit-promo-type').value;
  const value = document.getElementById('edit-promo-value').value;
  const maxUses = document.getElementById('edit-promo-max-uses').value;
  const expiry = document.getElementById('edit-promo-expiry').value;

  if (!code || !value) {
    showAdminAlert('Le code et la valeur de remise sont obligatoires.', 'error');
    return;
  }

  const payload = {
    code,
    type,
    value: Number(value),
    max_uses: maxUses ? Number(maxUses) : null,
    expiry_date: expiry || null
  };

  const btn = document.getElementById('edit-promo-btn');
  btn.disabled = true;
  btn.textContent = 'Enregistrement...';

  try {
    let res;
    if (_id) {
      res = await apiFetch(`/api/admin/promocodes/${_id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    } else {
      res = await apiFetch('/api/admin/promocodes', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    }

    if (res && res.ok) {
      showAdminAlert(_id ? 'Code promo mis à jour.' : 'Code promo créé.', 'success');
      closeModal('edit-promo-modal');
      await loadPromocodes();
    } else {
      const errData = await res.json();
      showAdminAlert(errData.error || 'Erreur lors de l\'enregistrement.', 'error');
    }
  } catch (err) {
    console.error(err);
    showAdminAlert('Erreur de communication.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enregistrement';
  }
}

function openDeletePromoModal(id, code) {
  deletePromoTargetId = id;
  document.getElementById('delete-promo-name').textContent = code;
  document.getElementById('delete-promo-modal').classList.add('active');
}

async function confirmDeletePromo() {
  if (!deletePromoTargetId) return;
  try {
    const res = await apiFetch(`/api/admin/promocodes/${deletePromoTargetId}`, {
      method: 'DELETE'
    });
    if (res && res.ok) {
      showAdminAlert('Code promo supprimé.', 'success');
      closeModal('delete-promo-modal');
      await loadPromocodes();
    } else {
      showAdminAlert('Erreur lors de la suppression.', 'error');
    }
  } catch (err) {
    console.error(err);
    showAdminAlert('Erreur de communication.', 'error');
  }
}

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
