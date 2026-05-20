const API = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';

function setToken(token) { localStorage.setItem('token', token); }
function getToken() { return localStorage.getItem('token'); }
function setUser(user) { localStorage.setItem('user', JSON.stringify(user)); }
function getUser() {
  try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
}

function showAlert(msg, type = 'error') {
  const box = document.getElementById('alert-box');
  if (!box) return;
  const icon = type === 'error' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️';
  box.className = `alert alert-${type}`;
  box.innerHTML = `${icon} ${msg}`;
  box.style.display = 'flex';
  setTimeout(() => { box.style.display = 'none'; }, 5000);
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn.dataset.original = btn.innerHTML;
    btn.innerHTML = `<span class="spinner"></span> Chargement...`;
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.original;
  }
}

function togglePass(inputId, icon) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  if (inp.type === 'password') { inp.type = 'text'; icon.textContent = '🙈'; }
  else { inp.type = 'password'; icon.textContent = '👁️'; }
}

// ─── PASSWORD STRENGTH ───────────────────────────────────────────────────────
const pwdInput = document.getElementById('reg-password');
if (pwdInput) {
  pwdInput.addEventListener('input', () => {
    const val = pwdInput.value;
    const bar = document.getElementById('pwd-strength');
    const fill = document.getElementById('pwd-fill');
    const label = document.getElementById('pwd-label');
    if (!bar) return;

    if (val.length === 0) { bar.style.display = 'none'; label.textContent = ''; return; }
    bar.style.display = 'block';

    let score = 0;
    if (val.length >= 6)  score++;
    if (val.length >= 10) score++;
    if (/[A-Z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;

    const levels = [
      { pct: '20%', color: '#ef4444', txt: 'Très faible', color2: '#ef4444' },
      { pct: '40%', color: '#f97316', txt: 'Faible', color2: '#f97316' },
      { pct: '60%', color: '#f59e0b', txt: 'Moyen', color2: '#f59e0b' },
      { pct: '80%', color: '#10b981', txt: 'Fort', color2: '#10b981' },
      { pct: '100%', color: '#6366f1', txt: 'Très fort 🔥', color2: '#6366f1' },
    ];
    const lvl = levels[Math.min(score - 1, 4)] || levels[0];
    fill.style.width = lvl.pct;
    fill.style.background = lvl.color;
    label.textContent = lvl.txt;
    label.style.color = lvl.color2;
  });
}

// ─── TAB SWITCH ──────────────────────────────────────────────────────────────
function switchTab(tab) {
  const loginForm = document.getElementById('login-form');
  const regForm   = document.getElementById('register-form');
  const tabLogin  = document.getElementById('tab-login');
  const tabReg    = document.getElementById('tab-register');
  const alertBox  = document.getElementById('alert-box');

  if (alertBox) alertBox.style.display = 'none';

  if (tab === 'login') {
    loginForm.style.display = 'flex';
    regForm.style.display   = 'none';
    tabLogin.classList.add('active');
    tabReg.classList.remove('active');
  } else {
    loginForm.style.display = 'none';
    regForm.style.display   = 'flex';
    tabLogin.classList.remove('active');
    tabReg.classList.add('active');
  }
}

// ─── REDIRECT IF ALREADY LOGGED IN ───────────────────────────────────────────
(function checkAuth() {
  const token = getToken();
  const user  = getUser();
  if (token && user) {
    if (user.role === 'admin') window.location.href = 'admin.html';
    else window.location.href = 'dashboard.html';
  }
})();

// ─── LOGIN ───────────────────────────────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  if (!username || !password) return showAlert('Veuillez remplir tous les champs.');

  setLoading('login-btn', true);
  try {
    const res = await fetch(`${API}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (!res.ok) {
      showAlert(data.error || 'Erreur de connexion.');
      return;
    }

    // Se rappeler de moi logic
    const rememberCheckbox = document.getElementById('remember-me');
    if (rememberCheckbox && rememberCheckbox.checked) {
      localStorage.setItem('rememberMe', 'true');
      localStorage.setItem('savedUsername', username);
    } else {
      localStorage.removeItem('rememberMe');
      localStorage.removeItem('savedUsername');
    }

    setToken(data.token);
    setUser(data.user);
    showAlert('Connexion réussie ! Redirection...', 'success');

    setTimeout(() => {
      const redirectUrl = localStorage.getItem('redirect_after_login');
      if (redirectUrl && data.user.role !== 'admin') {
        localStorage.removeItem('redirect_after_login');
        window.location.href = redirectUrl;
      } else {
        window.location.href = data.user.role === 'admin' ? 'admin.html' : 'dashboard.html';
      }
    }, 800);
  } catch (err) {
    showAlert('Erreur réseau. Vérifiez votre connexion.');
  } finally {
    setLoading('login-btn', false);
  }
}

// ─── REGISTER ────────────────────────────────────────────────────────────────
async function handleRegister(e) {
  e.preventDefault();
  const username    = document.getElementById('reg-username').value.trim();
  const password    = document.getElementById('reg-password').value;
  const discord_id  = document.getElementById('reg-discord-id').value.trim();
  const discord_key = '';

  if (!username || !password || !discord_id) {
    return showAlert('Veuillez remplir tous les champs obligatoires.');
  }
  if (password.length < 6) {
    return showAlert('Le mot de passe doit contenir au moins 6 caractères.');
  }
  if (!/^\d{17,20}$/.test(discord_id)) {
    return showAlert('L\'ID Discord doit être un nombre de 17 à 20 chiffres.');
  }

  setLoading('register-btn', true);
  try {
    const res = await fetch(`${API}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, discord_id, discord_key: discord_key || '' })
    });
    const data = await res.json();

    if (!res.ok) {
      showAlert(data.error || 'Erreur lors de l\'inscription.');
      return;
    }

    showAlert('Compte créé ! Vous pouvez maintenant vous connecter.', 'success');
    document.getElementById('register-form').reset();
    setTimeout(() => switchTab('login'), 1500);
  } catch (err) {
    showAlert('Erreur réseau. Vérifiez votre connexion.');
  } finally {
    setLoading('register-btn', false);
  }
}

// ─── INITIALIZE REMEMBER ME ──────────────────────────────────────────────────
(function initRememberMe() {
  const remember = localStorage.getItem('rememberMe') === 'true';
  const savedUser = localStorage.getItem('savedUsername');
  const checkbox = document.getElementById('remember-me');
  const usernameInput = document.getElementById('login-username');
  if (remember && checkbox && usernameInput && savedUser) {
    checkbox.checked = true;
    usernameInput.value = savedUser;
  }
})();


