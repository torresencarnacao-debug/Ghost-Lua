// ─── AUTH GUARD ───────────────────────────────────────────────────────────────
const token = localStorage.getItem('token');
const currentUser = (() => { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } })();
if (!token || !currentUser || currentUser.role !== 'admin') {
  window.location.href = '/';
}

// ─── STATE ────────────────────────────────────────────────────────────────────
let allUsers = [];
let railwayCodes = {};
let deleteTargetId = null;
let roleTargetId = null;

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  // Set admin info in navbar
  document.getElementById('nav-avatar').textContent  = currentUser.username.charAt(0).toUpperCase();
  document.getElementById('nav-username').textContent = currentUser.username;
  await loadData();
  await loadLogs();
}

async function loadData() {
  await Promise.all([loadStats(), loadUsers()]);
}

// ─── API HELPER ───────────────────────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  if (res.status === 401 || res.status === 403) {
    localStorage.clear();
    window.location.href = '/';
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
  document.querySelectorAll('.auth-tabs button').forEach(b => b.classList.remove('active'));
  
  if (tabName === 'users') {
    document.getElementById('pane-users').style.display = 'block';
    document.getElementById('tab-btn-users').classList.add('active');
    loadData();
  } else if (tabName === 'railway') {
    document.getElementById('pane-railway').style.display = 'block';
    document.getElementById('tab-btn-railway').classList.add('active');
    loadRailwayData();
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
    const avatarUrl = u.discord_id && /^\d+$/.test(u.discord_id) ? `/api/auth/discord-avatar/${u.discord_id}` : defaultUrl;

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

// ─── SEARCH / FILTER ─────────────────────────────────────────────────────────
function filterUsers() {
  const q = document.getElementById('search-input').value.toLowerCase();
  const filtered = allUsers.filter(u =>
    u.username.toLowerCase().includes(q) ||
    u.discord_id.includes(q) ||
    u.role.includes(q)
  );
  renderUsers(filtered);
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
function closeModal(id) {
  document.getElementById(id).classList.remove('active');
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
function logout() { localStorage.clear(); window.location.href = '/'; }

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

    renderRailwayKeys(data.codes || {});
    renderRailwayBannedIps(data.banned_ips || []);
    renderRailwayLogs(data.logs || []);
  } catch (err) {
    showAdminAlert('Impossible de charger les données de la clé Railway.', 'error');
  }
}

function renderRailwayKeys(codes) {
  const tbody = document.getElementById('railway-keys-tbody');
  const countEl = document.getElementById('railway-keys-count');
  const keys = Object.keys(codes);

  countEl.textContent = `${keys.length} clé(s) active(s) sur Railway`;

  if (keys.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-muted); padding: 40px;">Aucune clé configurée sur Railway.</td></tr>`;
    return;
  }

  tbody.innerHTML = keys.map(code => {
    const info = codes[code];
    const isSpecialValue = info.value === "Fpsbn:Fpsbn:True";
    const valueBadge = isSpecialValue
      ? `<span class="badge badge-vip">Fpsbn Premium</span>`
      : `<span class="badge badge-user">${escHtml(info.value || 'Banner:Banner:True')}</span>`;
      
    const lockIpStr = info.locked_ip
      ? `<code style="color: var(--accent-3);">${escHtml(info.locked_ip)}</code>`
      : `<span style="color: var(--text-muted); font-style: italic;">Non verrouillé</span>`;

    const playerStr = info.player_name
      ? `<strong>${escHtml(info.player_name)}</strong>`
      : `<span style="color: var(--text-muted);">—</span>`;

    const expStr = info.expires_at
      ? formatDate(info.expires_at)
      : `<span style="color: var(--text-muted);">Illimité</span>`;

    // Actions
    const resetAction = info.locked_ip
      ? `<button class="btn btn-ghost btn-sm" onclick="resetRailwayLock('${escHtml(code)}')" title="Déverrouiller l'IP">🔓 Reset</button>`
      : `<button class="btn btn-ghost btn-sm" disabled style="opacity: 0.5;">🔓 Reset</button>`;

    const deleteAction = `<button class="btn btn-danger btn-sm" onclick="deleteRailwayKey('${escHtml(code)}')" title="Supprimer">🗑️</button>`;

    return `
      <tr>
        <td><strong style="color: var(--text-primary); font-family: monospace;">${escHtml(code)}</strong></td>
        <td>${valueBadge}</td>
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
    return;
  }

  const sliced = logs.slice(0, 40);

  tbody.innerHTML = sliced.map(log => {
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

// Actions wrappers
async function generateRailwayKeys() {
  const count = parseInt(document.getElementById('railway-gen-count').value) || 1;
  const daysVal = document.getElementById('railway-gen-days').value.trim();
  const duration_days = daysVal === '' ? null : parseInt(daysVal);

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
  const daysVal = document.getElementById('railway-add-days').value.trim();
  const duration_days = daysVal === '' ? null : parseInt(daysVal);

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
