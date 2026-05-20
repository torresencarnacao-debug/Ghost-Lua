/* 
   ==========================================================================
   APP CORE LOGIC - NOVA DEVELOPMENT
   Premium Cyberpunk Glassmorphic Theme for FiveM Lua Scripts
   ========================================================================== 
*/

const API = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';

// ==========================================================================
// 1. Data Inventory - Scripts
// ==========================================================================
let scriptsData = [
    {
        id: 'ghost_lua',
        name: 'Ghost Lua',
        icon: 'fa-solid fa-ghost',
        image: 'ghost_lua.jpg',
        badge: 'Exclusif',
        category: 'utilities',
        frameworks: ['GTA V', 'FiveM', 'Online'],
        shortDesc: 'L\'outil ultime de Ghost Shop. Fluide et 100% indétectable.',
        longDesc: 'Ghost Lua est le mod menu phare de Ghost Shop. Conçu pour offrir un contrôle total sur GTA V FiveM, il dispose d\'un menu avancé avec des options de triche en temps réel, entièrement indétectable et maintenu à jour.',
        version: '4.0.0',
        escrow: 'Oui',
        dependencies: 'Aucune',
        price: '19.99',
        stripeLink: 'https://buy.stripe.com/bJe6oJ50EceP1Vqbmz9Ve00',
        features: [
            'God Mode & Santé infinie',
            'Argent illimité & RP instantané',
            'Spawn de véhicules & armes',
            'Téléportation & No Clip',
            'Anti-détection & indétectable',
            'Menu joueurs avancé',
            'Météo & heure personnalisables',
            'Support premium inclus'
        ]
    }
];

// ==========================================================================
// 2. Global State Variables
// ==========================================================================
let activeFilter = 'all';
let searchWord = '';

// ==========================================================================
// 3. Document Elements & Initialization
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    // 3.1 Setup Canvas Particles
    initParticlesCanvas();
    
    // 3.2 Initialize Navbar scroll detection
    window.addEventListener('scroll', handleNavbarScroll);
    
    // 3.3 Register mobile burger event
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    if (menuToggleBtn) {
        menuToggleBtn.addEventListener('click', toggleMobileMenu);
    }
    
    // 3.4 Populate script catalog (with static fallback initially)
    renderScriptCards();
    
    // Fetch products dynamically from the API to display real-time database products
    function loadRealtimeProducts() {
        fetch(`${API}/api/products`)
            .then(res => res.json())
            .then(data => {
                if (data && Array.isArray(data.products)) {
                    // Check if products actually changed to avoid unnecessary renders
                    const currentIds = scriptsData.map(s => s.id + s.price + s.badge).join(',');
                    const newIds = data.products.map(s => s.id + s.price + s.badge).join(',');
                    if (currentIds !== newIds) {
                        scriptsData = data.products;
                        renderScriptCards();
                    }
                }
            })
            .catch(err => {
                console.warn('Could not fetch real-time products from API:', err);
            });
    }
    loadRealtimeProducts();
    // Poll for changes every 4 seconds to reflect admin panel modifications in real-time
    setInterval(loadRealtimeProducts, 4000);
    
    // 3.5 Setup filters & search
    setupCatalogControls();
    
    // 3.6 Setup dynamic configurator
    initLuaConfigurator();
    
    // 3.7 Render Performance charts
    renderPerformanceChart();
    
    // 3.8 Setup Docs navigation tabs
    setupDocsMenu();
    
    // 3.9 Setup FAQ Accordions
    setupFaqAccordions();
    
    // 3.10 Setup Modal Close Buttons
    const modalCloseBtn = document.getElementById('modal-close-btn');
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', closeScriptModal);
    }
    
    const scriptDetailModal = document.getElementById('script-detail-modal');
    if (scriptDetailModal) {
        scriptDetailModal.addEventListener('click', (e) => {
            if (e.target.id === 'script-detail-modal') closeScriptModal();
        });
    }
});

// ==========================================================================
// 4. Background Particles (Canvas 2D)
// ==========================================================================
function initParticlesCanvas() {
    const canvas = document.getElementById('particles-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    let particlesArray = [];
    const colors = ['#7c3aed', '#a855f7', '#d946ef']; // purple, bright lavender, magenta-pink
    
    // Set responsive width
    function setCanvasSize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    setCanvasSize();
    window.addEventListener('resize', setCanvasSize);
    
    class Particle {
        constructor() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.random() * 2 + 1;
            this.speedX = Math.random() * 0.3 - 0.15;
            this.speedY = Math.random() * 0.3 - 0.15;
            this.color = colors[Math.floor(Math.random() * colors.length)];
        }
        
        update() {
            this.x += this.speedX;
            this.y += this.speedY;
            
            // Loop boundaries
            if (this.x > canvas.width) this.x = 0;
            else if (this.x < 0) this.x = canvas.width;
            
            if (this.y > canvas.height) this.y = 0;
            else if (this.y < 0) this.y = canvas.height;
        }
        
        draw() {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    // Generate particles population
    const particlesCount = Math.min(60, Math.floor(window.innerWidth / 20));
    for (let i = 0; i < particlesCount; i++) {
        particlesArray.push(new Particle());
    }
    
    function animateParticles() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        for (let i = 0; i < particlesArray.length; i++) {
            particlesArray[i].update();
            particlesArray[i].draw();
        }
        requestAnimationFrame(animateParticles);
    }
    animateParticles();
}

// ==========================================================================
// 5. Scroll and Mobile Navigation Handlers
// ==========================================================================
function handleNavbarScroll() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;
    
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
    
    // Update active state in navlinks
    const sections = document.querySelectorAll('section');
    const navLinks = document.querySelectorAll('.nav-links a');
    
    let currentSectionId = '';
    sections.forEach(sec => {
        const sectionTop = sec.offsetTop - 150;
        const sectionHeight = sec.clientHeight;
        if (window.scrollY >= sectionTop && window.scrollY < sectionTop + sectionHeight) {
            currentSectionId = sec.getAttribute('id');
        }
    });
    
    if (currentSectionId) {
        navLinks.forEach(link => {
            link.classList.remove('active-link');
            if (link.getAttribute('href') === `#${currentSectionId}`) {
                link.classList.add('active-link');
            }
        });
    }
}

function toggleMobileMenu() {
    const drawer = document.getElementById('mobile-drawer');
    if (!drawer) return;
    
    drawer.classList.toggle('active');
    document.body.classList.toggle('mobile-menu-active');
    
    const burgerIcon = document.querySelector('#menu-toggle-btn i');
    if (burgerIcon) {
        if (drawer.classList.contains('active')) {
            burgerIcon.className = 'fa-solid fa-xmark';
        } else {
            burgerIcon.className = 'fa-solid fa-bars';
        }
    }
}

// ==========================================================================
// 6. Script Catalog Rendering & Interaction
// ==========================================================================
function renderScriptCards() {
    const container = document.getElementById('scripts-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Filter & Search
    const filtered = scriptsData.filter(script => {
        const matchesCategory = (activeFilter === 'all' || script.category === activeFilter);
        const matchesSearch = (script.name.toLowerCase().includes(searchWord.toLowerCase()) || 
                               script.shortDesc.toLowerCase().includes(searchWord.toLowerCase()));
        return matchesCategory && matchesSearch;
    });
    
    if (filtered.length === 0) {
        const isSearchingOrFiltering = (searchWord !== '' || activeFilter !== 'all');
        const emptyMessage = isSearchingOrFiltering 
            ? "Aucun produit ne correspond à votre recherche." 
            : "Aucun produit disponible pour le moment. Bientôt disponible !";
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--text-muted);">
                <i class="fa-solid fa-circle-exclamation" style="font-size: 2.5rem; margin-bottom: 15px; color: var(--accent-pink);"></i>
                <p style="font-size: 1.1rem; font-family: var(--font-heading);">${emptyMessage}</p>
            </div>
        `;
        return;
    }
    
    filtered.forEach(script => {
        const frameworks = Array.isArray(script.frameworks) ? script.frameworks : ['GTA V', 'FiveM', 'Online'];
        const frameworksList = frameworks.map(fw => {
            const key = fw.toLowerCase().replace(/[^a-z0-9]/g, '');
            return `<span class="framework-tag" data-fw="${fw.toLowerCase()}">${fw}</span>`;
        }).join('');
        
        const card = document.createElement('div');
        card.className = 'script-card';
        card.setAttribute('data-id', script.id);
        card.style.animation = 'fadeIn 0.5s ease-out';
        
        const bannerContent = script.image 
            ? `<img src="${script.image}" alt="${script.name}" class="card-banner-img" style="width: 100%; height: 100%; object-fit: cover;">`
            : `<div class="card-banner-graphic"></div><i class="${script.icon}"></i>`;

        card.innerHTML = `
            <div class="card-banner">
                ${bannerContent}
                <span class="card-badge" ${script.badge ? '' : 'style="display: none;"'}>${script.badge || ''}</span>
            </div>
            
            <div class="card-body">
                <div class="card-title">
                    <h3>${script.name}</h3>
                </div>
                <div class="card-frameworks">
                    ${frameworksList}
                </div>
                <p class="card-desc">${script.shortDesc}</p>
                <div class="card-footer">
                    <div class="card-price">${script.price}<span>€</span></div>
                    <button class="card-btn" onclick="openScriptModal('${script.id}')">
                        Détails <i class="fa-solid fa-arrow-right"></i>
                    </button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

function setupCatalogControls() {
    // Search input listener
    const searchBar = document.getElementById('search-bar');
    if (searchBar) {
        searchBar.addEventListener('input', (e) => {
            searchWord = e.target.value;
            renderScriptCards();
        });
    }
    
    // Categories Pill listeners
    const pills = document.querySelectorAll('.filter-pill');
    pills.forEach(pill => {
        pill.addEventListener('click', () => {
            pills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            activeFilter = pill.getAttribute('data-filter');
            renderScriptCards();
        });
    });
}

// ==========================================================================
// 7. Modal Control Manager
// ==========================================================================
function openScriptModal(scriptId) {
    const script = scriptsData.find(s => s.id === scriptId);
    if (!script) return;
    
    const overlay = document.getElementById('script-detail-modal');
    if (!overlay) return;
    
    // Header: badge + title
    document.getElementById('modal-script-category').textContent = script.badge || 'Produit';
    document.getElementById('modal-script-name').textContent = script.name;

    // Description & specs
    document.getElementById('modal-script-desc').textContent = script.longDesc;
    document.getElementById('modal-spec-version').textContent = script.version;
    document.getElementById('modal-spec-escrow').textContent = script.escrow;
    document.getElementById('modal-spec-deps').textContent = script.dependencies;

    // Price (new element: modal-script-price is a <span>)
    document.getElementById('modal-script-price').innerHTML = `${script.price}<span>€</span>`;

    // Image wrapper — set as background-image so it fills the rounded div
    const imgWrapper = document.getElementById('modal-hero-banner');
    if (imgWrapper) {
        if (script.image) {
            imgWrapper.style.backgroundImage = `url('${script.image}')`;
            imgWrapper.style.backgroundSize = 'cover';
            imgWrapper.style.backgroundPosition = 'center';
        } else {
            imgWrapper.style.backgroundImage = 'linear-gradient(135deg, #2e1065, #030712)';
        }
    }

    // Frameworks
    const frameworkBox = document.getElementById('modal-script-frameworks');
    const fws = Array.isArray(script.frameworks) ? script.frameworks : ['GTA V', 'FiveM', 'Online'];
    frameworkBox.innerHTML = fws.map(fw => {
        return `<span class="framework-tag" data-fw="${fw.toLowerCase()}">${fw}</span>`;
    }).join('');

    // Features checklist
    const featuresBox = document.getElementById('modal-script-features');
    const rawFeats = Array.isArray(script.features) ? script.features : [];
    
    // Parse features to handle strings that contain newlines and clean up bullet points/dashes
    const featsList = [];
    rawFeats.forEach(item => {
        if (typeof item === 'string') {
            const lines = item.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
            featsList.push(...lines);
        } else {
            featsList.push(item);
        }
    });

    // Clean up leading dashes, bullets or stars from each item
    const finalFeats = featsList.map(feat => {
        let clean = feat.trim();
        if (clean.startsWith('-') || clean.startsWith('•') || clean.startsWith('*')) {
            clean = clean.substring(1).trim();
        }
        return clean;
    }).filter(clean => clean.length > 0);

    featuresBox.innerHTML = finalFeats.map(feat => `
        <li class="modal-feature-item">
            <i class="fa-solid fa-circle-check"></i> ${feat}
        </li>
    `).join('');

    // Buy button
    const buyBtn = document.getElementById('modal-buy-btn');
    if (buyBtn) {
        buyBtn.onclick = () => {
            const params = new URLSearchParams({
                name: script.name,
                price: script.price,
                image: script.image || 'ghost_lua.jpg',
                link: script.stripeLink || 'https://buy.stripe.com/bJe6oJ50EceP1Vqbmz9Ve00'
            });
            window.open(`checkout.html?${params.toString()}`, '_blank');
        };
    }

    // Open modal
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeScriptModal() {
    const overlay = document.getElementById('script-detail-modal');
    if (!overlay) return;
    
    overlay.classList.remove('active');
    document.body.style.overflow = '';
}

// ==========================================================================
// 8. Live Lua Configurator reactive form & compiler
// ==========================================================================
const configOptionsData = {
    nova_robbery: {
        fileName: 'config.lua',
        defaults: {
            framework: 'QB-Core',
            policeAlert: true,
            requiredPolice: 3,
            cooldown: 60,
            allowLockpick: true,
            maxLoot: 1500
        },
        renderForm: function() {
            return `
                <div class="form-group">
                    <label class="form-label" for="param-framework">Framework Bridge</label>
                    <p class="form-desc">Détecte automatiquement les cœurs ESX ou QB ou Qbox.</p>
                    <select class="form-input" id="param-framework">
                        <option value="QB-Core">QB-Core (Config.Framework = 'qb-core')</option>
                        <option value="ESX">ESX Legacy (Config.Framework = 'esx')</option>
                        <option value="Qbox">Qbox Framework (Config.Framework = 'qbox')</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label class="toggle-switch">
                        <input type="checkbox" id="param-police-alert" checked>
                        <span class="slider-toggle"></span>
                        <span class="toggle-label">Alerte de police intégrée</span>
                    </label>
                    <p class="form-desc" style="margin-top: 6px;">Déclenche des exports ps-dispatch, cd_dispatch ou custom lors des casses.</p>
                </div>
                
                <div class="form-group">
                    <label class="form-label" for="param-required-police">Policiers Minimum Requis</label>
                    <p class="form-desc">Le nombre minimum de policiers connectés requis pour lancer un cambriolage.</p>
                    <input type="number" class="form-input" id="param-required-police" min="0" max="20" value="3">
                </div>
                
                <div class="form-group">
                    <label class="form-label" for="param-cooldown">Temps de Cooldown (Minutes)</label>
                    <p class="form-desc">Délai obligatoire entre deux cambriolages d'une même maison.</p>
                    <input type="number" class="form-input" id="param-cooldown" min="5" max="300" value="60">
                </div>
                
                <div class="form-group">
                    <label class="toggle-switch">
                        <input type="checkbox" id="param-allow-lockpick" checked>
                        <span class="slider-toggle"></span>
                        <span class="toggle-label">Crochetage des serrures</span>
                    </label>
                    <p class="form-desc" style="margin-top: 6px;">Autoriser l'utilisation de lockpicks pour forcer les portes.</p>
                </div>
                
                <div class="form-group">
                    <label class="form-label" for="param-max-loot">Butin Maximum par Maison (€)</label>
                    <p class="form-desc">Valeur aléatoire maximale cumulée des objets trouvés.</p>
                    <input type="number" class="form-input" id="param-max-loot" min="500" max="10000" step="500" value="1500">
                </div>
            `;
        },
        compileLua: function() {
            const fw = document.getElementById('param-framework')?.value || 'QB-Core';
            const alert = document.getElementById('param-police-alert')?.checked ? 'true' : 'false';
            const police = document.getElementById('param-required-police')?.value || '3';
            const cool = document.getElementById('param-cooldown')?.value || '60';
            const lock = document.getElementById('param-allow-lockpick')?.checked ? 'true' : 'false';
            const loot = document.getElementById('param-max-loot')?.value || '1500';
            
            return `<span class="lua-comment">-- ==========================================</span>
<span class="lua-comment">-- NOVA ROBBERY CONFIGURATION FILE</span>
<span class="lua-comment">-- Generated Live at NovaDev Studio</span>
<span class="lua-comment">-- ==========================================</span>

<span class="lua-table">Config</span> = {}

<span class="lua-table">Config.Debug</span> = <span class="lua-bool">false</span>
<span class="lua-table">Config.Framework</span> = <span class="lua-string">"${fw.toLowerCase()}"</span> <span class="lua-comment">-- options: "qb-core", "esx", "qbox"</span>

<span class="lua-table">Config.Police</span> = {
    <span class="lua-table">AlertEnabled</span> = <span class="lua-bool">${alert}</span>,
    <span class="lua-table">RequiredCops</span> = <span class="lua-number">${police}</span>,
    <span class="lua-table">JobName</span> = <span class="lua-string">"police"</span>
}

<span class="lua-table">Config.Robbery</span> = {
    <span class="lua-table">Cooldown</span> = <span class="lua-number">${cool}</span>, <span class="lua-comment">-- in minutes</span>
    <span class="lua-table">AllowLockpick</span> = <span class="lua-bool">${lock}</span>,
    <span class="lua-table">LockpickBreakChance</span> = <span class="lua-number">35</span>,
    <span class="lua-table">MaximumLootValue</span> = <span class="lua-number">${loot}</span>
}

<span class="lua-table">Config.LootItems</span> = {
    { <span class="lua-table">item</span> = <span class="lua-string">"rolex"</span>, <span class="lua-table">chance</span> = <span class="lua-number">40</span>, <span class="lua-table">maxAmount</span> = <span class="lua-number">3</span> },
    { <span class="lua-table">item</span> = <span class="lua-string">"goldchain"</span>, <span class="lua-table">chance</span> = <span class="lua-number">65</span>, <span class="lua-table">maxAmount</span> = <span class="lua-number">5</span> },
    { <span class="lua-table">item</span> = <span class="lua-string">"diamond_ring"</span>, <span class="lua-table">chance</span> = <span class="lua-number">20</span>, <span class="lua-table">maxAmount</span> = <span class="lua-number">2</span> }
}
`;
        }
    },
    nova_hud: {
        fileName: 'config.lua',
        defaults: {
            theme: 'glassmorphism',
            showCompass: true,
            seatbeltAlarm: true,
            refreshRate: 200,
            kmh: true
        },
        renderForm: function() {
            return `
                <div class="form-group">
                    <label class="form-label" for="param-hud-theme">Thème Graphique</label>
                    <p class="form-desc">Sélectionnez le style de l'interface utilisateur.</p>
                    <select class="form-input" id="param-hud-theme">
                        <option value="glassmorphism">Glassmorphism (Flou arrière-plan)</option>
                        <option value="cyberpunk">Cyberpunk neon (Accents flashy)</option>
                        <option value="minimalist">Minimalist (Discret & petit)</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label class="toggle-switch">
                        <input type="checkbox" id="param-hud-compass" checked>
                        <span class="slider-toggle"></span>
                        <span class="toggle-label">Afficher la boussole 3D</span>
                    </label>
                    <p class="form-desc" style="margin-top: 6px;">Active l'indicateur d'orientation dynamique en haut de l'écran.</p>
                </div>
                
                <div class="form-group">
                    <label class="toggle-switch">
                        <input type="checkbox" id="param-hud-alarm" checked>
                        <span class="slider-toggle"></span>
                        <span class="toggle-label">Alarme sonore ceinture</span>
                    </label>
                    <p class="form-desc" style="margin-top: 6px;">Déclenche des bips répétitifs si le joueur roule sans ceinture.</p>
                </div>
                
                <div class="form-group">
                    <label class="form-label" for="param-hud-refresh">Fréquence de Rafraîchissement (ms)</label>
                    <p class="form-desc">Intervalle de mise à jour des statistiques vitales. Plus bas = plus réactif.</p>
                    <select class="form-input" id="param-hud-refresh">
                        <option value="100">100 ms (Super fluide)</option>
                        <option value="200" selected>200 ms (Équilibré - Recommandé)</option>
                        <option value="500">500 ms (Éco-Performance)</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label class="toggle-switch">
                        <input type="checkbox" id="param-hud-speed" checked>
                        <span class="slider-toggle"></span>
                        <span class="toggle-label">Mesure en KM/H</span>
                    </label>
                    <p class="form-desc" style="margin-top: 6px;">Si désactivé, l'indicateur de vitesse basculera en MPH (Millles par heure).</p>
                </div>
            `;
        },
        compileLua: function() {
            const theme = document.getElementById('param-hud-theme')?.value || 'glassmorphism';
            const compass = document.getElementById('param-hud-compass')?.checked ? 'true' : 'false';
            const alarm = document.getElementById('param-hud-alarm')?.checked ? 'true' : 'false';
            const refresh = document.getElementById('param-hud-refresh')?.value || '200';
            const speed = document.getElementById('param-hud-speed')?.checked ? 'true' : 'false';
            
            return `<span class="lua-comment">-- ==========================================</span>
<span class="lua-comment">-- NOVA HUD CONFIGURATION FILE</span>
<span class="lua-comment">-- Generated Live at NovaDev Studio</span>
<span class="lua-comment">-- ==========================================</span>

<span class="lua-table">Config</span> = {}

<span class="lua-table">Config.Theme</span> = <span class="lua-string">"${theme}"</span> <span class="lua-comment">-- options: "glassmorphism", "cyberpunk", "minimalist"</span>
<span class="lua-table">Config.RefreshRate</span> = <span class="lua-number">${refresh}</span> <span class="lua-comment">-- update rates in milliseconds</span>

<span class="lua-table">Config.Indicators</span> = {
    <span class="lua-table">Compass</span> = <span class="lua-bool">${compass}</span>,
    <span class="lua-table">SeatbeltAlarm</span> = <span class="lua-bool">${alarm}</span>,
    <span class="lua-table">ShowOxygen</span> = <span class="lua-bool">false</span>,
    <span class="lua-table">ShowStress</span> = <span class="lua-bool">true</span>
}

<span class="lua-table">Config.Speedometer</span> = {
    <span class="lua-table">Enabled</span> = <span class="lua-bool">true</span>,
    <span class="lua-table">UseKMH</span> = <span class="lua-bool">${speed}</span>,
    <span class="lua-table">MaxSpeedLimit</span> = <span class="lua-number">320</span>
}
`;
        }
    },
    nova_admin: {
        fileName: 'config.lua',
        defaults: {
            permission: 'admin',
            logs: true,
            webhook: 'https://discord.com/api/webhooks/xxxx',
            noclipSpeed: 3
        },
        renderForm: function() {
            return `
                <div class="form-group">
                    <label class="form-label" for="param-perm">Grade Requis Minimal</label>
                    <p class="form-desc">Le rôle d'administration par défaut pour ouvrir le menu.</p>
                    <select class="form-input" id="param-perm">
                        <option value="admin">Admin (Général)</option>
                        <option value="mod">Moderator (Limité)</option>
                        <option value="superadmin">Super Admin (Complet)</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label class="toggle-switch">
                        <input type="checkbox" id="param-logs" checked>
                        <span class="slider-toggle"></span>
                        <span class="toggle-label">Logs Discord Webhook</span>
                    </label>
                    <p class="form-desc" style="margin-top: 6px;">Traçabilité absolue : consigne chaque commande exécutée par le staff.</p>
                </div>
                
                <div class="form-group">
                    <label class="form-label" for="param-webhook">URL Discord Webhook</label>
                    <p class="form-desc">L'adresse de votre salon de logs.</p>
                    <input type="text" class="form-input" id="param-webhook" value="https://discord.com/api/webhooks/12345...">
                </div>
                
                <div class="form-group">
                    <label class="form-label" for="param-noclip">Vitesse du Noclip (Base)</label>
                    <p class="form-desc">Multiplicateur de vitesse par défaut pour le vol libre.</p>
                    <input type="number" class="form-input" id="param-noclip" min="1" max="10" value="3">
                </div>
            `;
        },
        compileLua: function() {
            const perm = document.getElementById('param-perm')?.value || 'admin';
            const logs = document.getElementById('param-logs')?.checked ? 'true' : 'false';
            const webhook = document.getElementById('param-webhook')?.value || 'https://discord.com/api/webhooks/xxxx';
            const noclip = document.getElementById('param-noclip')?.value || '3';
            
            return `<span class="lua-comment">-- ==========================================</span>
<span class="lua-comment">-- NOVA ADMIN MENU CONFIGURATION FILE</span>
<span class="lua-comment">-- Generated Live at NovaDev Studio</span>
<span class="lua-comment">-- ==========================================</span>

<span class="lua-table">Config</span> = {}

<span class="lua-table">Config.DefaultPermission</span> = <span class="lua-string">"${perm}"</span> <span class="lua-comment">-- options: "mod", "admin", "superadmin"</span>
<span class="lua-table">Config.Keybind</span> = <span class="lua-string">"F10"</span> <span class="lua-comment">-- default key to open panel</span>

<span class="lua-table">Config.Noclip</span> = {
    <span class="lua-table">BaseSpeed</span> = <span class="lua-number">${noclip}.0</span>,
    <span class="lua-table">SprintMultiplier</span> = <span class="lua-number">3.0</span>,
    <span class="lua-table">Invisible</span> = <span class="lua-bool">true</span>
}

<span class="lua-table">Config.Logging</span> = {
    <span class="lua-table">DiscordWebhookEnabled</span> = <span class="lua-bool">${logs}</span>,
    <span class="lua-table">DiscordWebhookUrl</span> = <span class="lua-string">"${webhook}"</span>,
    <span class="lua-table">LogKicks</span> = <span class="lua-bool">true</span>,
    <span class="lua-table">LogBans</span> = <span class="lua-bool">true</span>
}
`;
        }
    }
};

function initLuaConfigurator() {
    const selector = document.getElementById('config-script-select');
    if (!selector) return;
    
    // Register change listener on select
    selector.addEventListener('change', () => {
        loadConfigForm(selector.value);
    });
    
    // Initial load
    loadConfigForm(selector.value);
    
    // Copy button handler
    const copyBtn = document.getElementById('copy-config-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const rawText = document.getElementById('config-code-block').innerText;
            navigator.clipboard.writeText(rawText).then(() => {
                copyBtn.classList.add('copy-success');
                copyBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i> Copié !`;
                
                setTimeout(() => {
                    copyBtn.classList.remove('copy-success');
                    copyBtn.innerHTML = `<i class="fa-solid fa-copy"></i> Copier`;
                }, 2000);
            }).catch(err => {
                console.error("Impossible de copier la configuration", err);
            });
        });
    }
}

function loadConfigForm(scriptKey) {
    const scriptConfObj = configOptionsData[scriptKey];
    if (!scriptConfObj) return;
    
    // Update filename tag
    document.getElementById('config-file-name').textContent = scriptConfObj.fileName;
    
    // Inject form HTML inputs
    const formBox = document.getElementById('dynamic-form-options');
    formBox.innerHTML = scriptConfObj.renderForm();
    
    // Trigger compilation
    updateLuaCodePreview(scriptKey);
    
    // Bind listeners to all newly added inputs
    formBox.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('change', () => updateLuaCodePreview(scriptKey));
        input.addEventListener('input', () => updateLuaCodePreview(scriptKey));
    });
}

function updateLuaCodePreview(scriptKey) {
    const scriptConfObj = configOptionsData[scriptKey];
    if (!scriptConfObj) return;
    
    const previewArea = document.getElementById('config-code-block');
    previewArea.innerHTML = scriptConfObj.compileLua();
}

// ==========================================================================
// 9. Interactive Performance Chart animations
// ==========================================================================
const performanceData = [
    { name: 'Cambriolages (illégal)', optimized: 15, unoptimized: 90 },
    { name: 'Interface HUD active', optimized: 10, unoptimized: 75 },
    { name: 'Menu Administration', optimized: 5, unoptimized: 40 },
    { name: 'Collecte des Ordures', optimized: 8, unoptimized: 60 }
];

function renderPerformanceChart() {
    const chartBox = document.getElementById('performance-chart');
    if (!chartBox) return;
    
    chartBox.innerHTML = '';
    
    performanceData.forEach(data => {
        const row = document.createElement('div');
        row.className = 'chart-row';
        
        row.innerHTML = `
            <div class="row-labels">
                <span class="script-name">${data.name}</span>
                <div>
                    <span class="metric-val" style="margin-right: 15px;">Nova : ${data.optimized/1000}ms</span>
                    <span class="metric-val high">Standard : ${data.unoptimized/1000}ms</span>
                </div>
            </div>
            
            <div class="bar-track">
                <!-- Nova Optimized bar -->
                <div class="bar-fill cyan" style="width: 0%; height: 50%;"></div>
                <!-- Standard alternative bar -->
                <div class="bar-fill pink" style="width: 0%; height: 50%;"></div>
            </div>
        `;
        
        chartBox.appendChild(row);
    });
    
    // Intersection Observer to trigger progress bar animations on scroll
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateChartBars();
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });
    
    observer.observe(chartBox);
}

function animateChartBars() {
    const rows = document.querySelectorAll('#performance-chart .chart-row');
    rows.forEach((row, idx) => {
        const data = performanceData[idx];
        
        const optimizedFill = row.querySelector('.bar-fill.cyan');
        const standardFill = row.querySelector('.bar-fill.pink');
        
        // Scale so that 100% represents 0.15ms (150 on our scale)
        const scaleMax = 100;
        const optPercent = Math.min(100, (data.optimized / scaleMax) * 100);
        const unoptPercent = Math.min(100, (data.unoptimized / scaleMax) * 100);
        
        setTimeout(() => {
            optimizedFill.style.width = `${optPercent}%`;
            standardFill.style.width = `${unoptPercent}%`;
        }, idx * 150); // cascading delays
    });
}

// ==========================================================================
// 10. Documentation Side-menu tabs controller
// ==========================================================================
function setupDocsMenu() {
    const menuItems = document.querySelectorAll('.docs-menu-item');
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            menuItems.forEach(mi => mi.classList.remove('active'));
            item.classList.add('active');
            
            const docKey = item.getAttribute('data-doc');
            switchDocPanel(docKey);
        });
    });
}

function switchDocPanel(docKey) {
    const panels = document.querySelectorAll('#docs-content-container .doc-pane');
    panels.forEach(panel => {
        panel.classList.remove('active');
    });
    
    const targetPanel = document.getElementById(`pane-${docKey}`);
    if (targetPanel) {
        targetPanel.classList.add('active');
    }
}

// ==========================================================================
// 11. FAQ Accordion Control Panel
// ==========================================================================
function setupFaqAccordions() {
    const items = document.querySelectorAll('.faq-item');
    items.forEach(item => {
        const question = item.querySelector('.faq-question');
        question.addEventListener('click', () => {
            const wasActive = item.classList.contains('active');
            
            // Close all
            items.forEach(i => i.classList.remove('active'));
            
            // Toggle clicked
            if (!wasActive) {
                item.classList.add('active');
            }
        });
    });
}
