const firebaseConfig = {
    apiKey: "AIzaSyDwl-hYHoqIRbhOwq0qsf0WHSCXnJrTEUo",
    authDomain: "atb-med.firebaseapp.com",
    projectId: "atb-med",
    storageBucket: "atb-med.firebasestorage.app",
    messagingSenderId: "152259249782",
    appId: "1:152259249782:web:963f3acfc41ba75d304157"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let ABX = {};
let ESTAB = [];
let estabTipoFilter = '';
let currentUser = null;
let editingName = null;
let editingEstabId = null;
let selName = null;
let activeFam = null;

// ── HELPERS ─────────────────────────────────────────────────────────────
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function renderAjusteRenal(d) {
    // 1. Si existe la tabla estructurada, la usamos
    if (d.ajuste_renal_table && typeof d.ajuste_renal_table === 'object') {
        const table = d.ajuste_renal_table;
        const headers = table.headers || [];
        const rows = table.rows || [];
        if (headers.length && rows.length) {
            let html = '<div style="overflow-x:auto;"><table class="renal-table" style="width:100%; border-collapse:collapse; font-size:12px;">';
            html += '<thead><tr>' + headers.map(h => `<th style="border:1px solid var(--g2); padding:6px 8px; background:var(--paper2);">${escapeHtml(h)}</th>`).join('') + '</thead>';
            html += '<tbody>';
            for (const row of rows) {
                html += '<tr>' + row.map(cell => `<td style="border:1px solid var(--g2); padding:6px 8px;">${escapeHtml(cell || '—')}</td>`).join('') + '</tr>';
            }
            html += '</tbody></table></div>';
            return html;
        }
    }
    // 2. Si no hay tabla, mostrar ajuste_renal_raw con formato pre
    if (d.ajuste_renal_raw) {
        return `<pre style="white-space:pre-wrap; font-family:'DM Mono',monospace; font-size:12px; background:var(--paper); padding:12px; border-radius:8px; overflow-x:auto;">${escapeHtml(d.ajuste_renal_raw)}</pre>`;
    }
    // 3. Fallback: ajuste_renal (texto plano)
    return `<div class="body-txt">${escapeHtml(d.ajuste_renal || '—')}</div>`;
}

function getValue(d, keys, defaultValue = '—') {
    for (let key of keys) {
        if (d[key] && d[key].toString().trim()) return d[key];
    }
    return defaultValue;
}

// ── LOGIN ───────────────────────────────────────────────────────────────
async function doLogin() {
    const email = document.getElementById('usr').value.trim();
    const password = document.getElementById('pwd').value;
    const btn = document.querySelector('.lbtn');
    btn.innerText = 'Verificando...'; btn.disabled = true;
    try {
        const cred = await auth.signInWithEmailAndPassword(email, password);
        currentUser = cred.user;
        await Promise.all([loadDataFromFirestore(), loadEstabilidades()]);
        document.getElementById('login').style.display = 'none';
        document.getElementById('app').style.display = 'flex';
        if (email === 'farmaceuticasiaf@gmail.com') {
            document.getElementById('adminBtn').style.display = '';
        }
        initApp();
    } catch {
        const e = document.getElementById('lerr');
        e.style.display = 'block';
        setTimeout(() => e.style.display = 'none', 4000);
    } finally {
        btn.innerText = 'Ingresar →'; btn.disabled = false;
    }
}
function doLogout() { auth.signOut().then(() => location.reload()); }
document.getElementById('pwd').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
document.getElementById('usr').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('pwd').focus(); });

// ── PAGE SWITCHING ─────────────────────────────────────────────────────
function switchPage(pageId, btn, isMobile = false) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
    document.getElementById(pageId).classList.add('on');
    if (isMobile) {
        document.querySelectorAll('.bnav-btn').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
        document.querySelectorAll('.hnav-btn').forEach(b => b.classList.remove('on'));
        const topId = pageId === 'page-abx' ? 'nav-abx' : 'nav-estab';
        const topBtn = document.getElementById(topId);
        if (topBtn) topBtn.classList.add('on');
    } else {
        document.querySelectorAll('.hnav-btn').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
        document.querySelectorAll('.bnav-btn').forEach(b => b.classList.remove('on'));
        const botId = pageId === 'page-abx' ? 'bnav-abx' : 'bnav-estab';
        const botBtn = document.getElementById(botId);
        if (botBtn) botBtn.classList.add('on');
    }
    if (pageId === 'page-estab') renderEstabTable();
}

// ── FIRESTORE: ANTIBIÓTICOS ────────────────────────────────────────────
async function loadDataFromFirestore() {
    const snap = await db.collection('antibioticos').get();
    ABX = {};
    snap.forEach(doc => { ABX[doc.id] = doc.data(); });
}

// ── FIRESTORE: ESTABILIDADES ───────────────────────────────────────────
async function loadEstabilidades() {
    try {
        const snap = await db.collection('estabilidad').get();
        ESTAB = [];
        snap.forEach(doc => { ESTAB.push({ _id: doc.id, ...doc.data() }); });
        ESTAB.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
        document.getElementById('estab-loading').style.display = 'none';
        buildEstabAdminSelect();
    } catch (err) {
        document.getElementById('estab-loading').innerText = 'Error al cargar estabilidades.';
    }
}

// ── ANTIBIÓTICOS: UI ───────────────────────────────────────────────────
function initApp() { buildFamFilters(); filterList(); }

function buildFamFilters() {
    const fams = new Set();
    for (const n in ABX) { if (ABX[n].familia) fams.add(ABX[n].familia); }
    const row = document.getElementById('fam-row');
    row.innerHTML = `<button class="fbtn ${!activeFam ? 'on' : ''}" onclick="filterFam(null)">Todas</button>`;
    Array.from(fams).sort().forEach(f => {
        row.innerHTML += `<button class="fbtn ${activeFam === f ? 'on' : ''}" onclick="filterFam('${f.replace(/'/g, "\\'")}')">${f}</button>`;
    });
}
function filterFam(fam) { activeFam = fam; buildFamFilters(); filterList(); }

function clearSelection() {
    selName = null;
    filterList();
    document.getElementById('main').innerHTML = '<div class="empty"><div class="empty-ico">💊</div><div class="empty-txt">Seleccioná un antibiótico para ver su ficha</div><div class="empty-hint">Usá el buscador o filtrá por familia</div></div>';
}

function filterList() {
    const q = document.getElementById('srch').value.toLowerCase();
    const list = document.getElementById('abx-list');
    const metaDiv = document.getElementById('list-meta');
    list.innerHTML = '';
    let count = 0;

    if (selName) {
        const d = ABX[selName];
        if (d && (activeFam ? d.familia === activeFam : true)) {
            count = 1;
            list.innerHTML = `<div class="abx-item sel" onclick="renderDetail('${selName.replace(/'/g, "\\'")}')"><div class="aname">${escapeHtml(selName)}</div><div class="atag">${escapeHtml(d.familia || '')}</div></div>`;
        }
        metaDiv.innerHTML = `<span>${count} antibiótico</span><button class="clear-btn" onclick="clearSelection()">✖ Limpiar</button>`;
        return;
    }

    Object.keys(ABX).sort().forEach(name => {
        const d = ABX[name];
        const searchableText = [
            name, d.familia,
            getValue(d, ['dosificacion', 'dosis']),
            getValue(d, ['mecanismo_accion', 'mecanismo']),
            d.administracion, d.ajuste_renal, d.ajuste_obesos,
            d.embarazo, d.lactancia, d.observaciones, d.interacciones,
            d.farmacocinetica, d.contenido_completo
        ].filter(Boolean).join(' ').toLowerCase();

        if (searchableText.includes(q) && (activeFam ? d.familia === activeFam : true)) {
            count++;
            list.innerHTML += `<div class="abx-item" onclick="renderDetail('${name.replace(/'/g, "\\'")}')"><div class="aname">${escapeHtml(name)}</div><div class="atag">${escapeHtml(d.familia || '')}</div></div>`;
        }
    });
    metaDiv.innerHTML = `<span>${count} antibiótico${count !== 1 ? 's' : ''}</span>`;
}

function renderDetail(name) {
    const d = ABX[name];
    if (!d) return;
    selName = name;

    const mecanismo = getValue(d, ['mecanismo_accion', 'mecanismo']);
    const dosificacion = getValue(d, ['dosificacion', 'dosis']);
    const administracion = getValue(d, ['administracion']);
    const preparacion = getValue(d, ['preparacion']);
    const ajuste_hepatico = getValue(d, ['ajuste_hepatico']);
    const ajuste_obesos = getValue(d, ['ajuste_obesos']);
    const embarazo = getValue(d, ['embarazo']);
    const lactancia = getValue(d, ['lactancia']);
    const observaciones = getValue(d, ['observaciones']);
    const interacciones = getValue(d, ['interacciones']);
    const farmacocinetica = getValue(d, ['farmacocinetica']);
    const contenido_completo = getValue(d, ['contenido_completo']);

    const extraHTML = contenido_completo !== '—' ? `<div class="section-divider"><span>Monografía</span></div><div class="card"><div class="card-ttl">Contenido Completo</div><div class="body-txt">${escapeHtml(contenido_completo)}</div></div>` : '';

    document.getElementById('main').innerHTML = `
        <div class="detail">
            <div class="d-hdr">
                <div class="d-fam">${escapeHtml(d.familia || 'Sin familia')}</div>
                <h2 class="d-name">${escapeHtml(name)}</h2>
            </div>
            <div class="detail-tabs">
                <button class="dtab on" onclick="switchDTab(event,'dt-general')">💊 General</button>
                <button class="dtab" onclick="switchDTab(event,'dt-ajustes')">⚖️ Ajustes</button>
                <button class="dtab" onclick="switchDTab(event,'dt-seguridad')">⚠️ Seguridad</button>
                <button class="dtab" onclick="switchDTab(event,'dt-pk')">📈 Farmacocinética</button>
                <button class="dtab" onclick="switchDTab(event,'dt-calcular')">🧮 Calcular</button>
            </div>

            <!-- General -->
            <div class="dtab-panel on" id="dt-general">
                <div class="cards-grid two-col">
                    <div class="card"><div class="card-ttl">Mecanismo de acción</div><div class="body-txt">${escapeHtml(mecanismo)}</div></div>
                    <div class="card"><div class="card-ttl">Dosificación</div><div class="body-txt">${escapeHtml(dosificacion)}</div></div>
                    <div class="card"><div class="card-ttl">Administración</div><div class="body-txt">${escapeHtml(administracion)}</div></div>
                    <div class="card"><div class="card-ttl">Preparación / Reconstitución</div><div class="body-txt">${escapeHtml(preparacion)}</div></div>
                </div>
                ${extraHTML}
            </div>

            <!-- Ajustes -->
            <div class="dtab-panel" id="dt-ajustes">
                <div class="cards-grid two-col">
                    <div class="card"><div class="card-ttl">Ajuste Renal</div>${renderAjusteRenal(d)}</div>
                    <div class="card"><div class="card-ttl">Ajuste Hepático</div><div class="body-txt">${escapeHtml(ajuste_hepatico)}</div></div>
                    <div class="card"><div class="card-ttl">Ajuste en Obesos</div><div class="body-txt">${escapeHtml(ajuste_obesos)}</div></div>
                </div>
            </div>

            <!-- Seguridad -->
            <div class="dtab-panel" id="dt-seguridad">
                <div class="cards-grid two-col">
                    <div class="card"><div class="card-ttl">Embarazo</div><div class="body-txt">${escapeHtml(embarazo)}</div></div>
                    <div class="card"><div class="card-ttl">Lactancia</div><div class="body-txt">${escapeHtml(lactancia)}</div></div>
                    <div class="card"><div class="card-ttl">Observaciones</div><div class="body-txt">${escapeHtml(observaciones)}</div></div>
                    <div class="card"><div class="card-ttl">Interacciones</div><div class="body-txt">${escapeHtml(interacciones)}</div></div>
                </div>
            </div>

            <!-- Farmacocinética -->
            <div class="dtab-panel" id="dt-pk">
                <div class="card"><div class="card-ttl">Farmacocinética</div><div class="body-txt">${escapeHtml(farmacocinetica)}</div></div>
            </div>

            <!-- Calcular -->
            <div class="dtab-panel" id="dt-calcular">
                ${buildToolsHTML()}
            </div>
        </div>`;
    filterList();
}

function switchDTab(e, id) {
    const detail = e.target.closest('.detail');
    detail.querySelectorAll('.dtab').forEach(t => t.classList.remove('on'));
    detail.querySelectorAll('.dtab-panel').forEach(p => p.classList.remove('on'));
    e.target.classList.add('on');
    document.getElementById(id).classList.add('on');
    document.getElementById('main').scrollTo({ top: 0, behavior: 'smooth' });
}

// ── HERRAMIENTAS DE CÁLCULO (sin cambios) ───────────────────────────────
function buildToolsHTML() { /* ... mantén tu función original ... */ }
function switchTab(e, id) { /* ... original ... */ }
function calcCrCl() { /* ... original ... */ }
function calcObesos() { /* ... original ... */ }
function calcPKPD() { /* ... original ... */ }
function calcPicovalle() { /* ... original ... */ }

// ── ESTABILIDADES TABLE (solo lectura) ─────────────────────────────────
function renderEstabTable() { /* ... mantén tu versión que no tiene onclick ... */ }
function filterEstab() { renderEstabTable(); }
function filterEstabTipo(tipo, btn) { /* ... */ }

// ── CRUD ESTABILIDADES ─────────────────────────────────────────────────
function buildEstabAdminSelect() { /* ... */ }
function openEstabAdmin(id = null) { /* ... */ }
function closeEstabAdmin() { /* ... */ }
function loadEstabAdminData(id) { /* ... */ }
async function saveEstabilidad() { /* ... */ }
async function deleteEstabilidad() { /* ... */ }

// ── ADMIN ANTIBIÓTICOS (actualizado) ───────────────────────────────────
async function saveData() {
    const name = editingName || document.getElementById('af-name').value.trim();
    if (!name) return alert('Debes ingresar un nombre');

    const mecanismoValue = document.getElementById('af-mecanismo').value || '';
    const dosisValue = document.getElementById('af-dose').value || '';
    const ajusteRenalRaw = document.getElementById('af-renal-raw').value || '';

    const data = {
        familia: document.getElementById('af-fam').value || '',
        mecanismo_accion: mecanismoValue,
        mecanismo: mecanismoValue,
        dosificacion: dosisValue,
        dosis: dosisValue,
        administracion: document.getElementById('af-administracion').value || '',
        preparacion: document.getElementById('af-preparacion').value || '',
        ajuste_renal_raw: ajusteRenalRaw,
        ajuste_renal: ajusteRenalRaw,
        ajuste_hepatico: document.getElementById('af-hepatico').value || '',
        ajuste_obesos: document.getElementById('af-obesos').value || '',
        embarazo: document.getElementById('af-embarazo').value || '',
        lactancia: document.getElementById('af-lactancia').value || '',
        observaciones: document.getElementById('af-obs').value || '',
        interacciones: document.getElementById('af-inter').value || '',
        farmacocinetica: document.getElementById('af-pk').value || '',
        contenido_completo: document.getElementById('af-completo').value || ''
    };

    try {
        await db.collection('antibioticos').doc(name).set(data);
        ABX[name] = data;
        buildAdminSelect();
        document.getElementById('admin-select').value = name;
        buildFamFilters();
        filterList();
        editingName = name;
        if (selName === name) renderDetail(name);
        const n = document.getElementById('admin-notice');
        n.style.display = 'block';
        setTimeout(() => n.style.display = 'none', 3000);
        document.getElementById('delBtn').style.display = '';
    } catch (err) {
        alert('Error al guardar: ' + err.message);
    }
}

async function deleteAntibiotic() {
    const name = editingName || document.getElementById('admin-select').value;
    if (!name || !confirm(`¿Eliminar "${name}"?`)) return;
    try {
        await db.collection('antibioticos').doc(name).delete();
        delete ABX[name];
        buildAdminSelect();
        buildFamFilters();
        filterList();
        loadAdminData('');
        document.getElementById('delBtn').style.display = 'none';
        if (selName === name) {
            selName = null;
            document.getElementById('main').innerHTML = '<div class="empty"><div class="empty-ico">💊</div><div class="empty-txt">Seleccioná un antibiótico</div></div>';
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

function openAdmin() {
    buildAdminSelect();
    loadAdminData('');
    document.getElementById('admin-panel').classList.add('open');
}
function closeAdmin() {
    document.getElementById('admin-panel').classList.remove('open');
    editingName = null;
}
function buildAdminSelect() {
    const sel = document.getElementById('admin-select');
    sel.innerHTML = '<option value="">-- Crear Nuevo --</option>';
    Object.keys(ABX).sort((a, b) => a.localeCompare(b)).forEach(n => {
        sel.innerHTML += `<option value="${n.replace(/"/g, '&quot;')}">${n}</option>`;
    });
}
function loadAdminData(name) {
    editingName = name || null;
    const d = name ? ABX[name] : {};

    document.getElementById('af-name').value = name || '';
    document.getElementById('af-name').disabled = !!name;
    document.getElementById('af-fam').value = d.familia || '';
    document.getElementById('af-mecanismo').value = getValue(d, ['mecanismo_accion', 'mecanismo'], '');
    document.getElementById('af-dose').value = getValue(d, ['dosificacion', 'dosis'], '');
    document.getElementById('af-administracion').value = d.administracion || '';
    document.getElementById('af-preparacion').value = d.preparacion || '';
    document.getElementById('af-renal-raw').value = d.ajuste_renal_raw || d.ajuste_renal || '';
    document.getElementById('af-hepatico').value = d.ajuste_hepatico || '';
    document.getElementById('af-obesos').value = d.ajuste_obesos || '';
    document.getElementById('af-embarazo').value = d.embarazo || '';
    document.getElementById('af-lactancia').value = d.lactancia || '';
    document.getElementById('af-obs').value = d.observaciones || '';
    document.getElementById('af-inter').value = d.interacciones || '';
    document.getElementById('af-pk').value = d.farmacocinetica || '';
    document.getElementById('af-completo').value = d.contenido_completo || '';

    document.getElementById('delBtn').style.display = name ? 'block' : 'none';
}

// ── CONTROL DE SESIÓN ──────────────────────────────────────────────────
auth.onAuthStateChanged(async (user) => {
    const loginScreen = document.getElementById('login');
    const appScreen = document.getElementById('app');
    if (user) {
        currentUser = user;
        loginScreen.style.display = 'none';
        try {
            await Promise.all([loadDataFromFirestore(), loadEstabilidades()]);
            appScreen.style.display = 'flex';
            if (user.email === 'farmaceuticasiaf@gmail.com') document.getElementById('adminBtn').style.display = '';
            initApp();
        } catch (error) {
            console.error(error);
            alert("Hubo un error al cargar la base de datos.");
        }
    } else {
        appScreen.style.display = 'none';
        loginScreen.style.display = 'flex';
        const btn = document.querySelector('.lbtn');
        if (btn) { btn.innerText = 'Ingresar'; btn.disabled = false; }
    }
});
