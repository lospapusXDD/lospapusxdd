// ===== LOS PAPUS GUI SYSTEM (PAPUSBANK LAYOUT LOGIC) =====

window.addEventListener('error', (e) => {
    const box = document.getElementById('debug-error');
    if (box) { box.style.display = 'block'; box.innerText = 'JS ERROR: ' + (e.message || e.type); }
});

document.addEventListener('DOMContentLoaded', () => {
    initAuthEvents();
    closeAuthOverlay();
    initTyped();
    restoreSession();
    syncUsersFromFB();
    loadChat();
    startChatPolling();
    initAdmin();
    applySavedTheme();
    applyMaintenance();
    if (typeof AOS !== 'undefined') AOS.init({ duration: 800, once: true });
    forceLogin();
});

// ===== NAVEGACIÃ“N ENTRE PÃGINAS =====
function switchPage(pageId, el) {
    const pages = document.querySelectorAll('.page');
    pages.forEach(p => p.classList.remove('active'));

    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) targetPage.classList.add('active');

    const links = document.querySelectorAll('.sidebar-link');
    links.forEach(l => l.classList.remove('active'));
    const match = document.querySelector(`.sidebar-link[data-page="${pageId}"]`);
    if (el && el.classList.contains('sidebar-link')) el.classList.add('active');
    else if (match) match.classList.add('active');
}

// ===== TOGGLE SIDEBAR =====
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('collapsed');
}

// ===== AUTH / LOGIN =====
let _authHideTimer = null;

function showAuthOverlay() {
    if (_authHideTimer) { clearTimeout(_authHideTimer); _authHideTimer = null; }
    const overlay = document.getElementById('auth-overlay');
    if (overlay) {
        overlay.style.display = 'flex';
        overlay.style.opacity = '1';
    }
}

function closeAuthOverlay() {
    const overlay = document.getElementById('auth-overlay');
    if (overlay) {
        overlay.style.opacity = '0';
        if (_authHideTimer) clearTimeout(_authHideTimer);
        _authHideTimer = setTimeout(() => overlay.style.display = 'none', 300);
    }
}

function initAuthEvents() {
    const container = document.getElementById('authContainer');
    const rightBtn = document.getElementById('toggleBtnRight');
    const leftBtn = document.getElementById('toggleBtnLeft');

    if (rightBtn && container) rightBtn.addEventListener('click', () => container.classList.add('right-panel-active'));
    if (leftBtn && container) leftBtn.addEventListener('click', () => container.classList.remove('right-panel-active'));

    const overlay = document.getElementById('auth-overlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeAuthOverlay(); });
    }
}

function togglePassVis() {
    const input = document.getElementById('login-pass');
    const icon = document.getElementById('pass-eye-icon');
    if (input && icon) {
        if (input.type === 'password') { input.type = 'text'; icon.className = 'fa-solid fa-eye-slash'; }
        else { input.type = 'password'; icon.className = 'fa-solid fa-eye'; }
    }
}

function saveSession(nick, hash) {
    localStorage.setItem('papus_session', JSON.stringify({ nick, hash, ts: Date.now() }));
    applySessionUI(nick);
    closeAuthOverlay();
    syncUsersFromFB().then(() => renderAllContent());
}

function applySessionUI(nick) {
    const userWidgetName = document.getElementById('nav-user-name');
    const logoutBtn = document.getElementById('logout-btn');
    const userWidget = document.getElementById('user-widget');
    const profileBtn = document.getElementById('profile-btn');
    if (userWidgetName) {
        userWidgetName.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--secondary);font-size:12px;"></i> ${esc(nick)}`;
    }
    if (logoutBtn) logoutBtn.style.display = 'inline-block';
    if (profileBtn) profileBtn.style.display = 'inline-block';
    if (userWidget) userWidget.style.display = 'none';
}

function restoreSession() {
    const session = JSON.parse(localStorage.getItem('papus_session') || 'null');
    if (session && session.nick) {
        if (localStorage.getItem('papus_jwt')) window._apiToken = localStorage.getItem('papus_jwt');
        applySessionUI(session.nick);
        closeAuthOverlay();
        syncUsersFromFB();
        checkOnboarding(session.nick);
        return true;
    }
    return false;
}

function forceLogin() {
    const session = JSON.parse(localStorage.getItem('papus_session') || 'null');
    if (!session || !session.nick) showAuthOverlay();
}

function logout() {
    localStorage.removeItem('papus_session');
    localStorage.removeItem('papus_jwt');
    window._apiToken = null;
    if (window._apiCache) window._apiCache = {};
    if (window._apiCacheKeys) window._apiCacheKeys = {};
    clanMembers = [];
    _lastChatCount = -1;
    if (_chatPollTimer) { clearInterval(_chatPollTimer); _chatPollTimer = null; }
    const userWidgetName = document.getElementById('nav-user-name');
    const logoutBtn = document.getElementById('logout-btn');
    const userWidget = document.getElementById('user-widget');
    const profileBtn = document.getElementById('profile-btn');
    if (userWidgetName) userWidgetName.innerHTML = 'Ingresar';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (profileBtn) profileBtn.style.display = 'none';
    if (userWidget) userWidget.style.display = 'flex';
    closeOnboarding();
    showAuthOverlay();
    renderAllContent();
}

function hashPass(p, salt) {
    const salted = (salt || '') + p + (salt || '').split('').reverse().join('');
    let h = 5381;
    for (let i = 0; i < salted.length; i++) h = ((h << 5) + h) ^ salted.charCodeAt(i);
    let h2 = 0x811c9dc5;
    for (let i = 0; i < salted.length; i++) h2 = Math.imul(h2 ^ salted.charCodeAt(i), 0x01000193);
    return 's2_' + (h >>> 0).toString(36) + (h2 >>> 0).toString(36) + salted.length.toString(36);
}

function fbReady() { return !!(window._db && window._fbGetDoc && window._fbDoc); }

async function doLogin() {
    const nick = (document.getElementById('login-nick')?.value || '').trim();
    const pass = (document.getElementById('login-pass')?.value || '').trim();
    const err = document.getElementById('login-error');
    if (!nick || !pass) { if (err) err.innerText = 'Completa todos los campos.'; return; }
    if (nick.length < 3) { if (err) err.innerText = 'El nick debe tener al menos 3 caracteres.'; return; }
    if (err) err.innerText = 'Ingresando...';

    try {
        let res = null;
        try {
            res = await apiFetch('POST', '/auth/login', { nick: nick, password: pass });
        } catch (e1) {
            const low = nick.toLowerCase();
            if (low !== nick) {
                res = await apiFetch('POST', '/auth/login', { nick: low, password: pass });
            } else {
                throw e1;
            }
        }
        const storedNick = (res && res.nick) || nick.toLowerCase();
        if (res.twofaRequired || res.twofa_required) {
            if (err) err.innerText = 'Tu cuenta tiene verificación de 2 pasos activada.';
            const code = prompt('Ingresá el código de 6 dígitos de tu app autenticadora:');
            if (!code) return;
            try {
                const conf = await apiFetch('POST', '/auth/2fa/confirm', { tempToken: res.tempToken, code: String(code).trim() });
                const token = conf && (conf.accessToken || conf.token);
                if (!token) { if (err) err.innerText = 'Código incorrecto.'; return; }
                window._apiToken = token;
                localStorage.setItem('papus_jwt', token);
                saveSession(storedNick, res.hash || hashPass(pass, nick.toLowerCase()));
                checkOnboarding(storedNick);
            } catch (e2) {
                if (err) err.innerText = 'Código 2FA incorrecto o expirado.';
            }
            return;
        }
        const token = res && (res.accessToken || res.token);
        if (!token) { if (err) err.innerText = 'Credenciales incorrectas.'; return; }
        window._apiToken = token;
        localStorage.setItem('papus_jwt', token);
        saveSession(storedNick, res.hash || hashPass(pass, nick.toLowerCase()));
        checkOnboarding(storedNick);
    } catch (e) {
        const msg = String(e.message || '');
        if (/interno|interna|500/i.test(msg)) {
            if (err) err.innerText = 'Usuario o contraseña incorrectos.';
        } else {
            if (err) err.innerText = msg || 'Error de conexión. ¿Está el backend activo?';
        }
    }
}

async function doRegister() {
    const nick = (document.getElementById('register-nick')?.value || '').trim();
    const pass = (document.getElementById('register-pass')?.value || '').trim();
    const confirmPass = (document.getElementById('register-confirm-pass')?.value || '').trim();
    const err = document.getElementById('register-error');
    if (!nick || !pass || !confirmPass) { if (err) err.innerText = 'Completa todos los campos.'; return; }
    if (nick.length < 3) { if (err) err.innerText = 'El nick debe tener al menos 3 caracteres.'; return; }
    if (pass.length < 4) { if (err) err.innerText = 'La contraseña debe tener al menos 4 caracteres.'; return; }
    if (pass !== confirmPass) { if (err) err.innerText = 'Las contraseñas no coinciden.'; return; }
    const key = nick.toLowerCase();
    if (err) err.innerText = 'Creando cuenta...';

    try {
        const res = await apiFetch('POST', '/auth/register', { nick: key, password: pass, hash: hashPass(pass, key) });
        const token = res && (res.accessToken || res.token);
        if (token) {
            window._apiToken = token;
            localStorage.setItem('papus_jwt', token);
        } else {
            if (err) err.innerText = 'La cuenta se creó, pero el servidor no dio sesión. Iniciá sesión.';
        }
        saveSession(key, hashPass(pass, key));
        if (err) err.innerText = '';
        checkOnboarding(key);
    } catch (e) {
        if (err) err.innerText = e.message || 'Error al crear la cuenta.';
    }
}

// ===== ONBOARDING (perfil de integrante) =====
const profileFields = ['ob-roblox', 'ob-cumple', 'ob-comida', 'ob-personajes', 'ob-titulo', 'ob-desc'];

function getSessionNick() {
    const session = JSON.parse(localStorage.getItem('papus_session') || 'null');
    return session && session.nick ? session.nick : null;
}

async function checkOnboarding(nick) {
    if (!nick || !fbReady()) return;
    try {
        const snap = await window._fbGetDoc(window._fbDoc(window._db, 'users', nick));
        if (snap.error && /token|unauthor|401|403/i.test(snap.error || '')) {
            localStorage.removeItem('papus_jwt');
            window._apiToken = null;
            showAuthOverlay();
            return;
        }
        if (snap.status === 404) {
            localStorage.removeItem('papus_session');
            localStorage.removeItem('papus_jwt');
            window._apiToken = null;
            showAuthOverlay();
            return;
        }
        const data = snap.exists() ? snap.data() : null;
        if (data && data.onboarded) {
            syncUsersFromFB();
            return;
        }
        openOnboarding(false, data);
    } catch (e) {
        console.warn('[checkOnboarding] Error:', e);
    }
}

async function openOnboarding(editing, userData) {
    const overlay = document.getElementById('onboarding-overlay');
    if (!overlay) return;
    const nick = getSessionNick();
    if (!nick) return;
    if (editing && !userData) {
        const m = memberByNick(nick);
        if (m) {
            userData = m.data;
        } else {
            try {
                const snap = await window._fbGetDoc(window._fbDoc(window._db, 'users', nick));
                userData = snap.exists() ? snap.data() : null;
            } catch (e) { userData = null; }
        }
    }
    const nickEl = document.getElementById('ob-nick');
    if (nickEl) {
        nickEl.value = editing ? (userData && userData.nick) || nick || '' : nick || '';
        if (!editing) nickEl.readOnly = true;
        else nickEl.readOnly = false;
    }
    const d = userData || {};
    const map = { 'ob-roblox': d.nickRoblox || d.nick_roblox || '', 'ob-cumple': d.cumple || d.birthday || '', 'ob-comida': d.comida || '', 'ob-personajes': d.personajes || '', 'ob-titulo': d.titulo || d.rankingTitle || d.ranking_title || '', 'ob-desc': d.desc || d.descripcion || d.bio || '' };
    profileFields.forEach(id => { const el = document.getElementById(id); if (el) el.value = map[id] || ''; });
    const skipBtn = document.getElementById('ob-skip');
    if (skipBtn) skipBtn.style.display = editing ? 'none' : 'block';
    const err = document.getElementById('ob-error');
    if (err) err.innerText = '';
    const btn = document.getElementById('ob-btn');
    if (btn) btn.innerHTML = editing ? '<i class="fa-solid fa-floppy-disk"></i> GUARDAR CAMBIOS' : '<i class="fa-solid fa-check"></i> GUARDAR MI PERFIL';
    overlay.style.display = 'flex';
}

function closeOnboarding() {
    const overlay = document.getElementById('onboarding-overlay');
    if (overlay) overlay.style.display = 'none';
}

function skipOnboarding() {
    closeOnboarding();
    const err = document.getElementById('ob-error');
    if (err) err.innerText = '';
    syncUsersFromFB();
}

async function saveOnboarding() {
    const nick = getSessionNick();
    if (!nick) return;
    const err = document.getElementById('ob-error');
    if (err) err.innerText = '';

    const nickEl = document.getElementById('ob-nick');
    const data = {};
    const session = JSON.parse(localStorage.getItem('papus_session') || 'null');
    if (nickEl && nickEl.value.trim() && !nickEl.readOnly) data.nick = nickEl.value.trim();
    if (session && session.hash) data.hash = session.hash;

    const get = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    const roblox = get('ob-roblox'), cumple = get('ob-cumple'), comida = get('ob-comida'),
          personajes = get('ob-personajes'), titulo = get('ob-titulo'), desc = get('ob-desc');

    if (!roblox && !cumple && !comida && !personajes && !titulo && !desc) {
        if (err) err.innerText = 'Completa al menos un campo para continuar.';
        return;
    }

    try {
        await apiFetch('PUT', '/users/' + encodeURIComponent(nick), {
            nickRoblox: roblox, cumple: cumple, comida: comida, personajes: personajes,
            titulo: titulo, desc: desc, onboarded: true
        });
        closeOnboarding();
        if (err) err.innerText = '';
        syncUsersFromFB();
        renderAllContent();
    } catch (e) {
        const msg = (e.message || 'Error al guardar.');
        if (/unauthor|token|sesi|401|403/i.test(msg)) {
            if (err) err.innerText = 'Sesión expirada o sin permisos. Volvé a iniciar sesión y reintentá.';
        } else {
            if (err) err.innerText = 'Error al guardar. Revisá tu conexión e intentá de nuevo.';
        }
    }
}

function initTyped() {
    if (typeof Typed !== 'undefined') {
        new Typed('.typing', {
            strings: ['en Roblox ðŸ’€', 'cuando pierde en Blox Fruits ðŸŽ', 'con los combos de Gabriel ðŸ‘‘', 'y domina el server ðŸ”¥'],
            typeSpeed: 60,
            backSpeed: 40,
            loop: true
        });
    }
}

// ===== SCRIPTS =====
function filterScripts(category) {
    document.querySelectorAll('.script-card').forEach(card => {
        const game = card.getAttribute('data-game');
        card.style.display = (category === 'all' || game === category) ? 'block' : 'none';
    });

    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`sf-${category}`);
    if (activeBtn) activeBtn.classList.add('active');
}

function copyScriptText(btn) {
    const textContainer = btn.closest('.card')?.querySelector('.script-text');
    const textToCopy = textContainer ? textContainer.innerText.trim() : (btn.previousElementSibling?.innerText || '');
    navigator.clipboard.writeText(textToCopy).catch(() => {});
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Â¡Copiado!';
    btn.style.background = 'var(--secondary)';
    btn.style.color = '#000';
    setTimeout(() => { btn.innerHTML = originalText; btn.style.background = ''; btn.style.color = ''; }, 2000);
}

// ===== CHAT EN VIVO (clan_chat — base de datos del clan) =====
let _chatPollTimer = null;
let _lastChatCount = -1;

async function loadChat() {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;
    if (!getSessionNick()) {
        container.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:20px;">Inicia sesión para ver el chat del clan.</div>';
        return;
    }
    try {
        const snap = await window._fbGetDocs(window._fbCollection(window._db, 'clan_chat'));
        const msgs = snap.docs.slice().sort((a, b) => {
            const ta = a.data().created_at || a.data().timestamp || '';
            const tb = b.data().created_at || b.data().timestamp || '';
            return new Date(ta).getTime() - new Date(tb).getTime();
        });
        if (msgs.length === _lastChatCount && container.innerHTML !== '') return;
        _lastChatCount = msgs.length;
        container.innerHTML = '';
        if (msgs.length === 0) {
            container.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:20px;">Sin mensajes todavía. ¡Escribe el primero!</div>';
            return;
        }
        msgs.forEach(d => {
            const m = d.data();
            appendChatMessage(m.nick || 'Sistema', m.msg || m.text || '', fmtChatTime(m.created_at || m.timestamp), true);
        });
    } catch (e) {
        if (container.innerHTML === '') container.innerHTML = '<div style="text-align:center;color:var(--danger);font-size:12px;padding:20px;">Error cargando el chat.</div>';
    }
}

function startChatPolling() {
    if (_chatPollTimer) return;
    _chatPollTimer = setInterval(() => { if (getSessionNick()) loadChat(); }, 5000);
}

function fmtChatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function esc(txt) {
    const d = document.createElement('div');
    d.textContent = txt;
    return d.innerHTML;
}

function jsAttr(name) {
    return esc(String(name || '')).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function appendChatMessage(nick, text, timeStr, skipSave) {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;

    const hashColors = ['var(--primary)', 'var(--secondary)', 'var(--danger)', 'var(--gold)', 'var(--purple)', '#ffb6c1', '#90ee90'];
    const color = hashColors[Math.abs(nick.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % hashColors.length];

    const msgDiv = document.createElement('div');
    msgDiv.style.cssText = 'display:flex;gap:12px;';
    msgDiv.innerHTML = `
        <div style="width:36px;height:36px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;color:#000;font-weight:bold;font-size:14px;flex-shrink:0;">${esc(nick.charAt(0).toUpperCase())}</div>
        <div style="min-width:0;">
            <div style="font-size:12px;font-weight:700;color:${color};">${esc(nick)} <span style="font-size:10px;color:var(--text-muted);margin-left:6px;">${esc(timeStr)}</span></div>
            <div style="background:rgba(0,212,255,0.08);border:1px solid rgba(0,212,255,0.18);padding:8px 12px;border-radius:0 12px 12px 12px;font-size:13px;margin-top:4px;color:#fff;word-break:break-word;">${esc(text)}</div>
        </div>
    `;
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const nick = getSessionNick();
    const text = input?.value?.trim();

    if (!text) return;
    if (text.length > 200) { input.value = text.slice(0, 200); return; }
    if (!nick) { showAuthOverlay(); return; }

    try {
        await apiFetch('POST', '/clan_chat', { msg: text });
        if (input) input.value = '';
        loadChat();
    } catch (e) {
        alert('Error al enviar: ' + (e.message || ''));
    }
}

// ===== SUGERENCIAS =====
function upvoteSugerencia(btn) {
    const span = btn.querySelector('span');
    if (span) {
        const count = (parseInt(span.innerText) || 0) + 1;
        span.innerText = count;
        btn.style.background = 'var(--secondary)';
        btn.style.color = '#000';
    }
}

function submitSugerencia() {
    const input = document.getElementById('sug-input-text');
    const wall = document.getElementById('sugerencias-wall-container');
    const userName = document.getElementById('nav-user-name')?.innerText?.replace(/<[^>]+>/g, '').trim() || 'AnÃ³nimo';

    if (!input || !wall) return;
    const text = input.value.trim();
    if (text.length < 5) { input.focus(); return; }

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <span style="font-size:11px;background:rgba(0,212,255,0.1);color:var(--primary);padding:2px 8px;border-radius:10px;font-weight:bold;">EN REVISIÃ“N</span>
            <span style="font-size:11px;color:var(--text-muted);">por ${esc(userName)}</span>
        </div>
        <p style="font-size:13px;color:#fff;font-weight:600;">"${esc(text)}"</p>
        <div style="display:flex;align-items:center;gap:15px;margin-top:15px;">
            <button class="filter-btn" onclick="upvoteSugerencia(this)"><i class="fa-solid fa-thumbs-up"></i> <span>1</span></button>
        </div>
    `;
    wall.prepend(card);
    input.value = '';
}

// ===== ADMIN PANEL (gate real: admin:true en la base) =====
function initAdmin() {
    renderAdminStats();
    applyGlobalAnnouncement();
}

function isAdminAuthed() {
    return isCurrentUserAdmin();
}

function adminLogin() {
    renderAdminStats();
}

function adminResetPass() {
    const err = document.getElementById('admin-pass-error');
    if (err) err.innerText = 'El panel ya no usa contraseña: entrá con una cuenta admin del clan.';
}

function adminLogout() {
    sessionStorage.removeItem('pap_admin_auth');
    renderAdminStats();
    switchPage('home');
}

function renderAdminStats() {
    const authed = isAdminAuthed();
    const gate = document.getElementById('admin-gate');
    const body = document.getElementById('admin-body');
    if (!gate || !body) return;

    if (!authed && clanMembers.length === 0 && getSessionNick()) {
        syncUsersFromFB().then(members => { if (members.length) renderAdminStats(); });
    }

    if (!authed) {
        gate.style.display = 'flex';
        body.style.display = 'none';
        const gateErr = document.getElementById('admin-pass-error');
        if (gateErr) gateErr.innerText = 'Este panel es solo para cuentas con admin:true en la base de datos del clan.';
    } else {
        gate.style.display = 'none';
        body.style.display = 'block';
        const ann = localStorage.getItem('pap_announcement') || '';
        const members = getMembersWithInfo();
        const totalDeaths = members.reduce((a, m) => a + (parseInt(m.data.deaths) || 0), 0);

        const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };

        setText('ad-members', getMembersWithInfo().length);
        setText('ad-users', clanMembers.length);
        setText('ad-chat', 'cargando...');
        setText('ad-votes', 'en polls');
        setText('ad-deaths', totalDeaths);
        setText('ad-ann', ann ? 'ACTIVO' : 'SIN ANUNCIO');
        setText('ad-status', fbReady() ? 'BASE DE DATOS ONLINE — PapusBank API' : 'SERVIDOR ONLINE');

        window._fbGetDocs(window._fbCollection(window._db, 'clan_chat')).then(snap => {
            setText('ad-chat', snap.docs.length);
        }).catch(() => {
            setText('ad-chat', '0');
        });
    }
}

let clanMembers = []; // [{nick, data}]
let _syncingMembers = null;

async function syncUsersFromFB() {
    if (_syncingMembers) return _syncingMembers;
    _syncingMembers = (async () => {
        if (!fbReady()) return [];
        try {
            const snap = await window._fbGetDocs(window._fbCollection(window._db, 'users'));
            const members = [];
            snap.forEach(d => {
                const data = d.data() || {};
                const nick = data.nick || d.id || '';
                if (!nick) return;
                members.push({ nick, data });
            });
            clanMembers = members;
            renderAllContent();
            return members;
        } catch (e) { console.warn('[syncUsersFromFB] Error:', e); return []; }
    })();
    try { return await _syncingMembers; } finally { _syncingMembers = null; }
}

function adminTab(btn, tabId) {
    document.querySelectorAll('.admin-tab-body').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
    const tab = document.getElementById(`tab-${tabId}`);
    if (tab) tab.classList.add('active');
    if (btn) btn.classList.add('active');
if (tabId === 'usuarios') renderAdminUsers();
    if (tabId === 'miembros') buildAdminEditor('admin-miembros-editor', 'miembros', 'DescripciÃ³n');
    if (tabId === 'nicks') buildAdminEditor('admin-nicks-editor', 'nicks', 'Nick de Roblox');
    if (tabId === 'cumples') buildAdminEditor('admin-cumples-editor', 'cumples', 'Fecha de cumpleaÃ±os');
    if (tabId === 'comida') buildAdminEditor('admin-comida-editor', 'comida', 'Comida favorita');
    if (tabId === 'personajes') buildAdminEditor('admin-personajes-editor', 'personajes', 'Personajes');
    if (tabId === 'ranking') buildAdminEditor('admin-ranking-editor', 'ranking', 'TÃ­tulo del puesto');
    if (tabId === 'bot') renderBotEditor();
    if (tabId === 'excusas') renderExcusasEditor();
    if (tabId === 'tema') renderTemaPicker();
    if (tabId === 'logs') renderLogs();
}

function renderAdminUsers() {
    const list = document.getElementById('admin-users-list');
    if (!list) return;
    if (clanMembers.length === 0) {
        list.innerHTML = '<div style="font-size:12px; color:var(--text-muted); padding:10px; text-align:center;">No hay usuarios todavía.</div>';
        return;
    }
    list.innerHTML = '';
    clanMembers.forEach(m => {
        const u = m.data;
        const badge = (u.admin === true || u.admin === 'true') ? '<span style="font-size:10px;color:var(--secondary);margin-left:8px;">ADMIN</span>' : '';
        const onboard = u.onboarded ? '<span style="font-size:10px;color:var(--primary);margin-left:8px;">PERFIL ✓</span>' : '<span style="font-size:10px;color:var(--danger);margin-left:8px;">SIN PERFIL</span>';
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; gap:12px; background:rgba(3,9,20,0.7); border:1px solid var(--dark-border); padding:10px 14px; border-radius:10px;';
        row.innerHTML = `
            <div style="width:30px;height:30px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;color:#000;font-weight:bold;font-size:12px;flex-shrink:0;">${esc((m.nick).charAt(0).toUpperCase())}</div>
            <div style="flex:1; min-width:0;">
                <div style="font-size:13px;font-weight:700;color:#fff;word-break:break-all;">${esc(m.nick)} ${badge}${onboard}</div>
                <div style="font-size:10px;color:var(--text-muted);">Creada: ${u.createdAt ? new Date(u.createdAt).toLocaleDateString('es') : '—'}</div>
            </div>
            <button style="background:rgba(255,68,102,0.15); border:1px solid rgba(255,68,102,0.4); color:var(--danger); padding:6px 12px; border-radius:8px; cursor:pointer; font-size:11px;" onclick="adminDeleteUser('${jsAttr(m.nick)}')"><i class="fa-solid fa-trash"></i> Eliminar</button>
        `;
        list.appendChild(row);
    });
}

async function adminDeleteUser(nick) {
    if (!isCurrentUserAdmin()) return;
    if (!confirm('¿Eliminar al usuario ' + nick + '? No se puede deshacer.')) return;
    try {
        await window._fbDeleteDoc(window._fbDoc(window._db, 'users', String(nick)));
        await syncUsersFromFB();
        renderAdminStats();
        const ok = document.getElementById('admin-users-ok');
        if (ok) { ok.innerText = '✓ Usuario eliminado'; setTimeout(() => ok.innerText = '', 2500); }
    } catch (e) {
        const ok = document.getElementById('admin-users-ok');
        if (ok) { ok.innerText = 'Error: ' + (e.message || 'no se pudo eliminar'); setTimeout(() => ok.innerText = '', 3000); }
    }
}

function saveAnnouncement() {
    const input = document.getElementById('admin-ann-input');
    if (!input) return;
    localStorage.setItem('pap_announcement', input.value.trim());
    applyGlobalAnnouncement();
    const ok = document.getElementById('admin-ann-ok');
    if (ok) { ok.innerText = 'âœ“ Anuncio guardado'; setTimeout(() => ok.innerText = '', 2500); }
}

function clearAnnouncement() {
    localStorage.removeItem('pap_announcement');
    applyGlobalAnnouncement();
    const input = document.getElementById('admin-ann-input');
    if (input) input.value = '';
}

function applyGlobalAnnouncement() {
    const ann = localStorage.getItem('pap_announcement') || '';
    const banner = document.getElementById('global-announcement');
    if (!banner) return;
    if (ann) {
        banner.style.display = 'block';
        banner.querySelector('span').innerText = ann;
    } else {
        banner.style.display = 'none';
    }
}

async function clearChatAdmin() {
    if (!isCurrentUserAdmin()) return;
    if (!confirm('¿Borrar TODOS los mensajes del chat del clan?')) return;
    const ok = document.getElementById('admin-chat-ok');
    try {
        const snap = await window._fbGetDocs(window._fbCollection(window._db, 'clan_chat'));
        for (const d of snap.docs) {
            await window._fbDeleteDoc(window._fbDoc(window._db, 'clan_chat', d.id));
        }
        _lastChatCount = 0;
        loadChat();
        if (ok) { ok.innerText = '✓ Chat eliminado'; setTimeout(() => ok.innerText = '', 2500); }
    } catch (e) {
        if (ok) { ok.innerText = 'Error: ' + (e.message || 'Solo el admin puede borrar el chat'); setTimeout(() => ok.innerText = '', 3500); }
    }
}

function resetAdminPass() {
    const ok = document.getElementById('admin-pass-ok');
    if (ok) { ok.innerText = 'El panel se controla con tu rol admin en la base de datos, no con contraseña local.'; setTimeout(() => ok.innerText = '', 3500); }
}

// ===== TERMINAL EMULADO CON MÃS COMANDOS =====
const terminalCommands = [
    { cmd: 'help', out: 'Comandos: help Â· clan Â· members Â· scripts Â· ranking Â· linux Â· clear' },
    { cmd: 'clan', out: 'LOS PAPUS CLAN - Fundado oficialmente por Gabriel y mantenido por Emilio.' },
    { cmd: 'members', out: '1. Emilio (Dev) / 2. Gabriel (Founder) / 3. Jero (PVP Lead) / 4. Sami (Peace) / 5. Isabella (Admin)' },
    { cmd: 'scripts', out: 'Foxname Hub (99 Nights), QuantumOnyx (Blox Fruits), Speed Hub X, Z3US Hub (Rivals), Arc.' },
    { cmd: 'ranking', out: 'Top Toxicidad: 1. Jero (Max) / 2. Gabriel (Combos) / 3. Emilio (Dev)' },
    { cmd: 'linux', out: 'Ubuntu Server 24.04 LTS â€” Node.js & PowerShell HTTP servers activos.' },
    { cmd: 'clear', out: '' }
];
function runTerminalCommand() {
    const input = document.getElementById('terminal-input');
    const out = document.getElementById('terminal-output');
    if (!input || !out) return;
    const cmd = input.value.trim().toLowerCase();
    
    if (cmd === 'clear') {
        out.innerText = 'papu@server:~$ ';
        input.value = '';
        return;
    }

    const match = terminalCommands.find(c => c.cmd === cmd);
    const reply = match ? match.out : (`comando "${cmd}" no encontrado. Escribe 'help' para ayuda.`);
    out.innerText += `\npapu@server:~$ ${cmd}\n${reply}\n`;
    input.value = '';
}

// ===== GENERADOR DE EXCUSAS =====
const excusas = [
    'Se me fue el internet justo cuando iba a ganar.',
    'Estaba comiendo y me tomÃ³ por sorpresa.',
    'La compu se reiniciÃ³ por actualizaciÃ³n de Windows.',
    'El teclado no me registrÃ³ la tecla de salto.',
    'Se cayÃ³ el servidor de Roblox, no fui yo.',
    'Me dio un pico de lag brutal de 900ms.',
    'Estaba farmeando y me cayÃ³ un combo inesperado.'
];
function getExcusas() {
    try {
        const saved = JSON.parse(localStorage.getItem('pap_excusas') || 'null');
        if (Array.isArray(saved) && saved.length > 0) return saved;
    } catch (e) {}
    return excusas;
}
function removeExcusa(i) {
    const list = getExcusas().slice();
    list.splice(i, 1);
    localStorage.setItem('pap_excusas', JSON.stringify(list));
    renderExcusasEditor();
    const ok = document.getElementById('admin-excusas-ok');
    if (ok) { ok.innerText = 'âœ“ Excusa eliminada'; setTimeout(() => ok.innerText = '', 2000); }
}
function addExcusa() {
    const input = document.getElementById('admin-new-excusa');
    if (!input || !input.value.trim()) return;
    const list = getExcusas().slice();
    list.push(input.value.trim());
    localStorage.setItem('pap_excusas', JSON.stringify(list));
    input.value = '';
    renderExcusasEditor();
    const ok = document.getElementById('admin-excusas-ok');
    if (ok) { ok.innerText = 'âœ“ Excusa agregada'; setTimeout(() => ok.innerText = '', 2000); }
}
function generarExcusa() {
    const el = document.getElementById('excusa-text');
    if (!el) return;
    const list = getExcusas();
    el.innerText = '"' + list[Math.floor(Math.random() * list.length)] + '"';
}

// ===== RANKING DE TOXICIDAD (VOTOS REALES EN POLLS DEL BACKEND) =====
const rankIconos = {};
const TOXIC_POLL_QUESTION = 'Quien es el mas toxico del clan?';

function rankPapus() {
    const members = getMembersWithInfo();
    return members.length > 0 ? members.map(m => m.nick) : [];
}

async function getToxicPoll() {
    try {
        const list = await apiFetch('GET', '/polls');
        const arr = Array.isArray(list) ? list : (list.items || Object.values(list));
        const found = arr.find(p => p && p.question === TOXIC_POLL_QUESTION);
        if (found) return found;
    } catch (e) {}
    if (isCurrentUserAdmin()) {
        try {
            const created = await apiFetch('POST', '/polls', {
                question: TOXIC_POLL_QUESTION,
                options: rankPapus(),
                created_by: 'system'
            });
            if (created && created.id) return created;
            const list = await apiFetch('GET', '/polls');
            const arr = Array.isArray(list) ? list : (list.items || Object.values(list));
            return arr.find(p => p && p.question === TOXIC_POLL_QUESTION) || null;
        } catch (e) { return null; }
    }
    return null;
}

function hasVotedPoll(poll) {
    if (!poll) return false;
    const nick = getSessionNick();
    if (!nick) return false;
    const votesRaw = poll.votesRaw || {};
    return votesRaw[nick] !== undefined;
}

async function renderRanking() {
    const grid = document.getElementById('ranking-grid');
    if (!grid) return;
    grid.innerHTML = '<div class="card" style="grid-column:1/-1;text-align:center;padding:30px;"><i class="fa-solid fa-spinner fa-spin" style="color:var(--primary);"></i> Cargando votos...</div>';
    const poll = await getToxicPoll();
    if (!poll) {
        const logged = getSessionNick();
        grid.innerHTML = '<div class="card" style="grid-column:1/-1;text-align:center;padding:30px;"><p style="font-size:12px;color:var(--danger);">' + (logged ? 'La encuesta de toxicidad aún no existe. El admin debe abrir esta página para crearla.' : 'Iniciá sesión para ver la encuesta de toxicidad.') + '</p></div>';
        return;
    }
    const voted = hasVotedPoll(poll);
    const totalEl = document.getElementById('total-votos');
    const votesArr = poll.votes || {};
    const counts = {};
    (poll.options || []).forEach((_, i) => { counts[i] = (votesArr[i] || []).length; });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (totalEl) totalEl.textContent = total;

    const data = rankPapus().map(n => ({ name: n, v: counts[(poll.options || []).indexOf(n)] || 0 }));
    data.sort((a, b) => b.v - a.v);
    const maxV = data[0]?.v || 1;

    grid.innerHTML = '';
    data.forEach((p, i) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.cssText = 'text-align:center;position:relative;overflow:hidden;';
        const m = memberByNick(p.name);
        const titulo = (m && (m.data.titulo || m.data.rankingTitle || m.data.ranking_title)) || 'Miembro';
        card.innerHTML = `
            <div style="font-size:30px;margin-bottom:8px;color:${i === 0 && p.v > 0 ? 'var(--danger)' : 'var(--gold)'};">${rankIconos[p.name] || '<i class="fa-solid fa-gamepad"></i>'}</div>
            <div class="text" style="font-size:15px;">${esc(p.name)}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">${esc(titulo)}</div>
            <div style="font-size:30px;font-weight:900;font-family:'Orbitron',sans-serif;color:var(--gold);margin:6px 0;">${p.v}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px;">${i === 0 && p.v > 0 ? '<i class="fa-solid fa-skull"></i> MÁS TÓXICO' : 'votos de toxicidad'}</div>
            <div style="height:6px;background:rgba(255,255,255,0.06);border-radius:6px;overflow:hidden;margin-bottom:14px;">
                <div style="height:100%;width:${maxV > 0 ? (p.v / maxV * 100) : 0}%;background:linear-gradient(90deg,var(--danger),var(--secondary));border-radius:6px;"></div>
            </div>
            <button class="btn-submit" style="width:100%;padding:10px;cursor:${voted ? 'not-allowed;opacity:0.5' : 'pointer'};" onclick="votarToxico('${jsAttr(p.name)}')" ${voted ? 'disabled' : ''}>
                ${voted ? '<i class="fa-solid fa-check"></i> Ya votaste' : '<i class="fa-solid fa-skull-crossbones"></i> Votar tóxico'}
            </button>
        `;
        grid.appendChild(card);
    });
}

async function votarToxico(name) {
    const nick = getSessionNick();
    if (!nick) { showAuthOverlay(); return; }
    const poll = await getToxicPoll();
    if (!poll) return;
    if (hasVotedPoll(poll)) { renderRanking(); return; }
    const option = (poll.options || []).indexOf(name);
    if (option < 0) return;
    try {
        await apiFetch('POST', '/polls/' + poll.id + '/vote', { nick: nick, option: option });
        renderRanking();
    } catch (e) {
        if (/ya vot|conflict|409/i.test(String((e && e.message) || ''))) { renderRanking(); return; }
        alert('Error al votar: ' + (e && e.message || ''));
    }
}

function resetVotos() {
    if (!isCurrentUserAdmin()) return;
    if (!confirm('¿Resetear todos los votos de toxicidad?')) return;
    alert('Los votos viven en la base de datos compartida. Si querés empezar de cero, pedile al backend que elimine la encuesta del clan (o resetee sus votos).');
}

// ===== BITÃCORA DE MUERTES (CAMPO deaths EN USERS — SOLO ADMIN EDITA) =====
function deathPapus() {
    const members = getMembersWithInfo();
    return members.length > 0 ? members.map(m => m.nick) : [];
}

function isCurrentUserAdmin() {
    const nick = getSessionNick();
    if (!nick) return false;
    const m = memberByNick(nick);
    if (!m) return false;
    const d = m.data || {};
    return d.is_admin === true || d.isAdmin === true || d.admin === true ||
           d.is_admin === 'true' || d.isAdmin === 'true' || d.admin === 'true' ||
           d.rank === 'admin' || d.rank === 'owner';
}

function renderMuertes() {
    const grid = document.getElementById('muertes-grid');
    if (!grid) return;
    const admin = isCurrentUserAdmin();
    const names = deathPapus();
    if (names.length === 0) {
        grid.innerHTML = '<div class="card" style="grid-column:1/-1;text-align:center;padding:30px;"><p style="font-size:12px;color:var(--text-muted);">Sin integrantes con perfil todavía.</p></div>';
        return;
    }
    const sorted = [...names].sort((a, b) => {
        const m1 = memberByNick(a), m2 = memberByNick(b);
        return ((m2 && (parseInt(m2.data.deaths) || 0)) - (m1 && (parseInt(m1.data.deaths) || 0)));
    });

    grid.innerHTML = '';
    sorted.forEach(name => {
        const m = memberByNick(name);
        const deaths = m && m.data.deaths ? parseInt(m.data.deaths) || 0 : 0;
        const card = document.createElement('div');
        card.className = 'card';
        card.style.cssText = 'text-align:center;';
        card.innerHTML = `
            <div style="font-size:26px;margin-bottom:8px;color:var(--danger);"><i class="fa-solid fa-skull"></i></div>
            <div class="text" style="font-size:15px;">${esc(name)}</div>
            <div style="font-size:34px;font-weight:900;font-family:'Orbitron',sans-serif;color:var(--danger);margin:6px 0;">${deaths}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px;">muertes</div>
            ${admin ? `
            <div style="display:flex;gap:8px;">
                <button style="flex:1;padding:8px;background:rgba(255,255,255,0.06);border:1px solid var(--dark-border);border-radius:8px;color:#fff;cursor:pointer;font-size:14px;" onclick="changeDeath('${jsAttr(name)}',-1)"><i class="fa-solid fa-minus"></i></button>
                <button style="flex:2;padding:8px;background:linear-gradient(135deg,var(--danger),#ff3355);border:none;border-radius:8px;color:#fff;cursor:pointer;font-size:12px;font-weight:700;" onclick="changeDeath('${jsAttr(name)}',+1)"><i class="fa-solid fa-plus"></i> +1</button>
            </div>` : `<div style="font-size:11px;color:var(--text-muted);">Solo el admin puede registrar muertes.</div>`}
        `;
        grid.appendChild(card);
    });
}

async function changeDeath(name, delta) {
    if (!isCurrentUserAdmin()) return;
    const m = memberByNick(name);
    if (!m) return;
    const cur = parseInt(m.data.deaths) || 0;
    const next = Math.max(0, cur + delta);
    try {
        await apiFetch('PUT', '/users/' + encodeURIComponent(name), { deaths: next });
        await syncUsersFromFB();
        if (delta > 0) {
            try {
                const ac = new (window.AudioContext || window.webkitAudioContext)();
                const o = ac.createOscillator();
                const g = ac.createGain();
                o.connect(g); g.connect(ac.destination);
                o.frequency.value = 120;
                o.type = 'square';
                g.gain.setValueAtTime(0.07, ac.currentTime);
                g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.3);
                o.start(); o.stop(ac.currentTime + 0.3);
            } catch (e) {}
        }
    } catch (e) { console.warn('[changeDeath] Error:', e); }
}

async function resetMuertes() {
    if (!isCurrentUserAdmin()) return;
    if (!confirm('¿Resetear todas las muertes del clan?')) return;
    const names = deathPapus();
    await Promise.all(names.map(name =>
        apiFetch('PUT', '/users/' + encodeURIComponent(name), { deaths: 0 }).catch(() => {})
    ));
    await syncUsersFromFB();
}

// ===== SISTEMA DE CONTENIDO DINÁMICO (desde la base de datos del clan) =====
function getMembersWithInfo() {
    return clanMembers.filter(m => m.data.onboarded === true || m.data.onboarded === 'true' || m.data.desc || m.data.cumple || m.data.comida || m.data.personajes);
}

function memberByNick(nick) {
    const nickKey = (nick || '').toLowerCase();
    return clanMembers.find(m => (m.nick || '').toLowerCase() === nickKey) || null;
}

function contentIcon(name) {
    const icons = ['fa-crown', 'fa-skull', 'fa-keyboard', 'fa-heart', 'fa-shield-halved', 'fa-bolt'];
    const colors = ['var(--gold)', 'var(--danger)', 'var(--primary)', 'var(--secondary)', 'var(--purple)', '#ffd700'];
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = (h * 31 + (name.charCodeAt(i) || 0)) % 997;
    return { i: icons[h % icons.length], c: colors[h % colors.length] };
}

function renderNosotros() {
    const grid = document.getElementById('nosotros-grid');
    if (!grid) return;
    const members = getMembersWithInfo();
    grid.innerHTML = '';
    if (members.length === 0) {
        grid.innerHTML = '<div class="card" style="grid-column:1/-1; text-align:center; padding:30px;"><p style="font-size:13px; color:var(--text-muted);">Aún no hay integrantes con perfil completo. <b style="color:var(--primary);">Ingresá y completá tu perfil</b> para aparecer acá.</p></div>';
        return;
    }
    members.forEach(m => {
        const ic = contentIcon(m.nick);
        grid.innerHTML += `<div class="card"><i class="fa-solid ${ic.i}" style="color:${ic.c};"></i><div class="text">${esc(m.nick)}</div><p>${esc(m.data.desc || 'Sin descripción todavía — editala desde "Mi Perfil".')}</p></div>`;
    });
}

function renderNicks() {
    const grid = document.getElementById('nicks-grid');
    if (!grid) return;
    const members = getMembersWithInfo();
    grid.innerHTML = '';
    if (members.length === 0) {
        grid.innerHTML = '<div class="card" style="grid-column:1/-1; text-align:center; padding:30px;"><p style="font-size:13px; color:var(--text-muted);">Sin nicks todavía.</p></div>';
        return;
    }
    members.forEach(m => {
        const ic = contentIcon(m.nick);
        const roblox = m.data.nickRoblox || m.data.nick_roblox || 'Pendiente...';
        grid.innerHTML += `
            <div class="card" style="text-align:center;">
                <div style="font-size:28px;margin-bottom:8px;color:${ic.c};"><i class="fa-solid ${ic.i}"></i></div>
                <div style="font-family:'Orbitron',sans-serif;font-size:13px;color:#fff;font-weight:700;margin-bottom:4px;">${esc(m.nick)}</div>
                <div style="font-family:'Courier New',monospace;font-size:11px;color:var(--primary);background:rgba(0,212,255,0.08);padding:4px 10px;border-radius:4px;">${esc(roblox)}</div>
            </div>`;
    });
}

function renderCumples() {
    const grid = document.getElementById('cumples-grid');
    if (!grid) return;
    const members = getMembersWithInfo();
    grid.innerHTML = '';
    if (members.length === 0) {
        grid.innerHTML = '<div class="card" style="grid-column:1/-1; text-align:center; padding:30px;"><p style="font-size:13px; color:var(--text-muted);">Sin cumpleaños todavía.</p></div>';
        return;
    }
    members.forEach(m => {
        const ic = contentIcon(m.nick);
        grid.innerHTML += `<div class="card" style="text-align:center;"><div style="font-size:26px;color:${ic.c};"><i class="fa-solid ${ic.i}"></i></div><div class="text">${esc(m.nick)}</div><p>${esc(m.data.cumple || m.data.birthday || 'Pendiente...')}</p></div>`;
    });
}

function renderComida() {
    const grid = document.getElementById('comida-grid');
    if (!grid) return;
    const members = getMembersWithInfo();
    grid.innerHTML = '';
    if (members.length === 0) {
        grid.innerHTML = '<div class="card" style="grid-column:1/-1; text-align:center; padding:30px;"><p style="font-size:13px; color:var(--text-muted);">Sin comidas todavía.</p></div>';
        return;
    }
    members.forEach(m => {
        const ic = contentIcon(m.nick);
        grid.innerHTML += `<div class="card" style="text-align:center;"><div style="font-size:26px;color:${ic.c};"><i class="fa-solid ${ic.i}"></i></div><div class="text">${esc(m.nick)}</div><p>${esc(m.data.comida || 'Pendiente...')}</p></div>`;
    });
}

function renderPersonajes() {
    const grid = document.getElementById('personajes-grid');
    if (!grid) return;
    const members = getMembersWithInfo();
    grid.innerHTML = '';
    if (members.length === 0) {
        grid.innerHTML = '<div class="card" style="grid-column:1/-1; text-align:center; padding:30px;"><p style="font-size:13px; color:var(--text-muted);">Sin personajes todavía.</p></div>';
        return;
    }
    members.forEach(m => {
        const ic = contentIcon(m.nick);
        grid.innerHTML += `<div class="card" style="text-align:center;"><div style="font-size:26px;color:${ic.c};"><i class="fa-solid ${ic.i}"></i></div><div class="text">${esc(m.nick)}</div><p>${esc(m.data.personajes || 'Pendiente...')}</p></div>`;
    });
}

// ===== EDITORES DE CONTENIDO (ADMIN — escriben directo a la base) =====
const fieldMap = {
    'miembros':  { dbField: 'desc',        placeholder: 'Descripción' },
    'nicks':     { dbField: 'nickRoblox',  placeholder: 'Nick de Roblox' },
    'cumples':   { dbField: 'cumple',      placeholder: 'Fecha de cumpleaños' },
    'comida':    { dbField: 'comida',      placeholder: 'Comida favorita' },
    'personajes':{ dbField: 'personajes',  placeholder: 'Personajes' },
    'ranking':   { dbField: 'titulo',      placeholder: 'Título del puesto' }
};

function renderMiembrosEditor() {
    const box = document.getElementById('admin-miembros-editor');
    if (!box) return;
    buildAdminEditorRows(box, 'miembros', 'Descripción', 'desc');
}

function buildAdminEditor(containerId, section, placeholder) {
    const box = document.getElementById(containerId);
    if (!box) return;
    const fm = fieldMap[section];
    buildAdminEditorRows(box, section, placeholder, fm ? fm.dbField : null);
}

function buildAdminEditorRows(box, section, placeholder, dbField) {
    box.innerHTML = '';
    const members = clanMembers.length > 0 ? clanMembers : getMembersWithInfo();
    if (members.length === 0) {
        box.innerHTML = '<p style="font-size:12px; color:var(--text-muted);">Sin cuentas todavía. Cuando alguien se registre aparecerá acá para editarlo.</p>';
        return;
    }
    members.forEach(m => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; gap:10px; margin-bottom:10px; flex-wrap:wrap;';
        const value = m.data[dbField] || m.data[dbField.replace(/([A-Z])/g, '_$1').toLowerCase()] || '';
        row.innerHTML = `
            <span style="font-size:13px;font-weight:700;color:#fff;min-width:130px;">${esc(m.nick)}</span>
            <input type="text" value="${esc(value)}" data-nick="${esc(m.nick)}" data-field="${dbField}" placeholder="${placeholder}" style="flex:1; min-width:160px; background:rgba(3,9,20,0.8); border:1px solid var(--dark-border); color:#fff; padding:10px 12px; border-radius:8px; outline:none; font-size:12px;">
            <button class="filter-btn" onclick="saveContentField(this)"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
        `;
        box.appendChild(row);
    });
}

async function saveContentField(btn) {
    const input = btn.previousElementSibling;
    const nick = input.dataset.nick;
    const field = input.dataset.field;
    const value = input.value.trim();
    try {
        await apiFetch('PUT', '/users/' + encodeURIComponent(nick), { [field]: value, onboarded: true });
        syncUsersFromFB();
        logAdminAction('Editó ' + field + ' de ' + nick);
        const ok = document.createElement('div');
        ok.style.cssText = 'font-size:12px;color:var(--secondary);margin-top:8px;';
        ok.innerText = '✓ Guardado';
        btn.closest('.card').appendChild(ok);
        setTimeout(() => ok.remove(), 2000);
    } catch (e) {
        const ok = document.createElement('div');
        ok.style.cssText = 'font-size:12px;color:var(--danger);margin-top:8px;';
        ok.innerText = 'Error: ' + (e.message || 'no se pudo guardar');
        btn.closest('.card').appendChild(ok);
        setTimeout(() => ok.remove(), 3000);
    }
}

function renderAllContent() {
    const countEl = document.getElementById('home-member-count');
    if (countEl) countEl.innerText = getMembersWithInfo().length;
    renderNosotros();
    renderNicks();
    renderCumples();
    renderComida();
    renderPersonajes();
    renderRanking();
    renderMuertes();
    if (typeof renderAdminStats === 'function') renderAdminStats();
}

// ===== EDITORES DE EXCUSAS =====
function renderBotEditor() {
    const box = document.getElementById('admin-bot-editor');
    if (!box) return;
    box.innerHTML = '<p style="font-size:12px; color:var(--text-muted);">El chat del clan ya no usa respuestas automáticas: ahora es un chat real entre integrantes, guardado en la base de datos.</p>';
}

function saveBotField() {}

function renderExcusasEditor() {
    const box = document.getElementById('admin-excusas-editor');
    if (!box) return;
    const list = getExcusas();
    box.innerHTML = '';
    list.forEach((ex, i) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; gap:10px; margin-bottom:8px;';
        row.innerHTML = `
            <span style="font-size:12px;color:var(--text-muted);width:24px;">${i + 1}.</span>
            <span style="flex:1; font-size:12px; color:#fff; word-break:break-word;">${esc(ex)}</span>
            <button style="background:rgba(255,68,102,0.15);border:1px solid rgba(255,68,102,0.4);color:var(--danger);padding:4px 10px;border-radius:6px;cursor:pointer;font-size:10px;" onclick="removeExcusa(${i})"><i class="fa-solid fa-xmark"></i></button>
        `;
        box.appendChild(row);
    });
    const addRow = document.createElement('div');
    addRow.style.cssText = 'display:flex; gap:10px; margin-top:10px;';
    addRow.innerHTML = `
        <input type="text" id="admin-new-excusa" placeholder="Nueva excusa..." style="flex:1; background:rgba(3,9,20,0.8); border:1px solid var(--dark-border); color:#fff; padding:10px 12px; border-radius:8px; outline:none; font-size:12px;">
        <button class="btn-submit" style="width:auto; padding:10px 16px;" onclick="addExcusa()"><i class="fa-solid fa-plus"></i> Agregar</button>
    `;
    box.appendChild(addRow);
}

// ===== TEMA =====
const themes = {
    cian:   { name: 'Cian (default)',  primary: '#00d4ff', secondary: '#00ffaa', danger: '#ff4466', bg: '#060e1a' },
    violeta: { name: 'Violeta gamer',   primary: '#8a2be2', secondary: '#d946ef', danger: '#ff4655', bg: '#0a0915' },
    verde:  { name: 'Verde tÃ³xico',     primary: '#00ff88', secondary: '#00ffcc', danger: '#ff5544', bg: '#041a0e' },
    rojo:   { name: 'Rojo fuego',       primary: '#ff4444', secondary: '#ff8844', danger: '#ff2222', bg: '#1a0606' },
    dorado: { name: 'Dorado',           primary: '#ffd700', secondary: '#ffaa00', danger: '#ff6644', bg: '#1a1200' }
};

function renderTemaPicker() {
    const box = document.getElementById('admin-tema-picker');
    if (!box) return;
    box.innerHTML = '';
    Object.keys(themes).forEach(key => {
        const t = themes[key];
        const btn = document.createElement('button');
        btn.className = 'filter-btn';
        btn.style.cssText = 'padding:12px 18px; margin:4px;';
        btn.innerHTML = `<i class="fa-solid fa-circle" style="color:${t.primary};"></i> ${t.name}`;
        btn.onclick = () => applyTheme(key);
        box.appendChild(btn);
    });
}

function applyTheme(key) {
    const t = themes[key] || themes.cian;
    localStorage.setItem('pap_theme', key);
    const root = document.documentElement;
    root.style.setProperty('--primary', t.primary);
    root.style.setProperty('--secondary', t.secondary);
    root.style.setProperty('--danger', t.danger);
    root.style.setProperty('--bg', t.bg);
    root.style.setProperty('--dark-bg', t.bg);
    logAdminAction('CambiÃ³ el tema a ' + t.name);
}

function applySavedTheme() {
    const key = localStorage.getItem('pap_theme') || 'cian';
    if (key !== 'cian') applyTheme(key);
}

// ===== SONIDOS =====
function getSoundSettings() {
    try { return JSON.parse(localStorage.getItem('pap_sounds') || '{}'); } catch (e) { return {}; }
}
function toggleSound(type) {
    const s = getSoundSettings();
    s[type] = !s[type];
    localStorage.setItem('pap_sounds', JSON.stringify(s));
    const btn = document.getElementById('sound-' + type + '-btn');
    if (btn) btn.innerText = (type.charAt(0).toUpperCase() + type.slice(1)) + ': ' + (s[type] ? 'OFF' : 'ON');
    logAdminAction('CambiÃ³ sonido ' + type);
    const ok = document.getElementById('admin-sound-ok');
    if (ok) { ok.innerText = 'âœ“ Sonido ' + type + (s[type] ? ' desactivado' : ' activado'); setTimeout(() => ok.innerText = '', 2000); }
}

// ===== MANTENIMIENTO =====
function setMaintenance() {
    const input = document.getElementById('admin-maint-input');
    if (!input?.value.trim()) return;
    localStorage.setItem('pap_maint', input.value.trim());
    applyMaintenance();
    logAdminAction('ActivÃ³ mantenimiento');
    const ok = document.getElementById('admin-maint-ok');
    if (ok) { ok.innerText = 'âœ“ Aviso activado'; setTimeout(() => ok.innerText = '', 2500); }
}
function clearMaintenance() {
    localStorage.removeItem('pap_maint');
    applyMaintenance();
    const input = document.getElementById('admin-maint-input');
    if (input) input.value = '';
    logAdminAction('QuitÃ³ mantenimiento');
    const ok = document.getElementById('admin-maint-ok');
    if (ok) { ok.innerText = 'âœ“ Aviso quitado'; setTimeout(() => ok.innerText = '', 2500); }
}
function applyMaintenance() {
    const msg = localStorage.getItem('pap_maint');
    const banner = document.getElementById('global-maint');
    if (!banner) return;
    if (msg) {
        banner.style.display = 'block';
        banner.querySelector('span').innerText = msg;
    } else {
        banner.style.display = 'none';
    }
}

// ===== LOGS =====
function logAdminAction(action) {
    const logs = JSON.parse(localStorage.getItem('pap_logs') || '[]');
    logs.unshift({ t: new Date().toLocaleString('es'), a: action });
    if (logs.length > 60) logs.length = 60;
    localStorage.setItem('pap_logs', JSON.stringify(logs));
}
function renderLogs() {
    const list = document.getElementById('admin-logs-list');
    if (!list) return;
    const logs = JSON.parse(localStorage.getItem('pap_logs') || '[]');
    if (logs.length === 0) {
        list.innerHTML = '<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:10px;">Sin acciones registradas.</div>';
        return;
    }
    list.innerHTML = '';
    logs.forEach(log => {
        const row = document.createElement('div');
        row.style.cssText = 'font-size:11px;background:rgba(3,9,20,0.7);border:1px solid var(--dark-border);padding:8px 12px;border-radius:8px;';
        row.innerHTML = `<span style="color:var(--primary);">${esc(log.t)}</span> <span style="color:#fff;">â€” ${esc(log.a)}</span>`;
        list.appendChild(row);
    });
}
function clearLogs() {
    localStorage.removeItem('pap_logs');
    renderLogs();
}

// ===== BACKUP =====
function exportBackup() {
    const keys = ['pap_announcement', 'pap_theme', 'pap_maint', 'pap_excusas', 'pap_sounds'];
    const data = {};
    keys.forEach(k => { const v = localStorage.getItem(k); if (v) data[k] = v; });
    const textarea = document.getElementById('admin-backup-text');
    if (textarea) textarea.value = JSON.stringify(data);
    logAdminAction('ExportÃ³ backup');
    const ok = document.getElementById('admin-backup-ok');
    if (ok) { ok.innerText = 'âœ“ Backup exportado (copia el texto)'; setTimeout(() => ok.innerText = '', 3000); }
}
function importBackup() {
    const textarea = document.getElementById('admin-backup-text');
    if (!textarea?.value) return;
    try {
        const data = JSON.parse(textarea.value);
        Object.keys(data).forEach(k => localStorage.setItem(k, data[k]));
        renderAllContent();
        applySavedTheme();
        applyMaintenance();
        applyGlobalAnnouncement();
        renderAdminStats();
        loadChat();
        logAdminAction('ImportÃ³ backup');
        const ok = document.getElementById('admin-backup-ok');
        if (ok) { ok.innerText = 'âœ“ Backup restaurado'; setTimeout(() => ok.innerText = '', 3000); }
    } catch (e) {
        const ok = document.getElementById('admin-backup-ok');
        if (ok) { ok.style.color = 'var(--danger)'; ok.innerText = 'âœ— JSON invÃ¡lido'; setTimeout(() => { ok.innerText = ''; ok.style.color = 'var(--secondary)'; }, 3000); }
    }
}


