const fs = require('fs');

// ──────────────────────────────────────────────
// 1. LOAD & PARSE SOURCES
// ──────────────────────────────────────────────

function loadExpo() {
  return JSON.parse(fs.readFileSync('expo-data.json', 'utf8')).map(e => ({
    nombre: e.nombre,
    rubro: e.cluster || '',
    email: '',
    web: e.slug ? `https://www.exposanjuan.com.ar/es/company/${e.slug}` : '',
    telefono: '',
    stand: e.stand || '',
    ubicacion: e.ubicacion || '',
    fuente: 'Expo San Juan 2026',
    slug: e.slug || '',
  }));
}

function parseCasemi() {
  const html = fs.readFileSync('casemi-raw.html', 'utf8');
  const match = html.match(/var oum_all_locations = (\[[\s\S]*?\]);\s*\n/);
  if (!match) return [];
  const locations = JSON.parse(match[1]);

  return locations.map(loc => {
    const content = loc.content || '';
    const emailMatch = content.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
    const urlMatch = content.match(/URL:\s*(https?:\/\/[^\s<"]+)/i);
    const beforeCorreo = content.split(/Correo:/i)[0].trim();
    const namePos = beforeCorreo.indexOf(loc.title);
    const rubro = namePos > 0 ? beforeCorreo.substring(0, namePos).trim() : beforeCorreo.substring(0, 30).trim();

    return {
      nombre: (loc.title || '').trim(),
      rubro: rubro,
      email: emailMatch ? emailMatch[0] : '',
      web: urlMatch ? urlMatch[1].replace(/\/$/, '') : '',
      telefono: '',
      stand: '',
      ubicacion: 'San Juan',
      fuente: 'CASEMI',
      slug: '',
    };
  }).filter(e => e.nombre.length > 1);
}

function parsePanorama() {
  const html = fs.readFileSync('panorama-raw.html', 'utf8');
  const results = [];
  const seen = new Set();

  // Split by article card
  const articleRegex = /<article[^>]*group[^>]*>([\s\S]*?)<\/article>/g;
  let m;
  while ((m = articleRegex.exec(html)) !== null) {
    const chunk = m[1];
    const altMatch = chunk.match(/alt="([A-Z][^"]{1,80})"/);
    if (!altMatch) continue;
    const nombre = decodeEntities(altMatch[1]);
    if (seen.has(nombre) || /logo|icon|panorama|dark|light/i.test(nombre)) continue;
    seen.add(nombre);

    // Categories from rounded-full spans
    const catMatches = [...chunk.matchAll(/rounded-full text-xs font-medium[^>]*>([^<]+)</g)];
    const rubros = catMatches.map(c => c[1].trim()).filter(Boolean);

    results.push({
      nombre,
      rubro: rubros[0] || '',
      rubros: rubros,
      email: '',
      web: '',
      telefono: '',
      stand: '',
      ubicacion: '',
      fuente: 'Panorama Minero',
      slug: '',
    });
  }
  return results;
}

// ──────────────────────────────────────────────
// 2. MERGE & DEDUPLICATE
// ──────────────────────────────────────────────

function normalizeKey(nombre) {
  return nombre.toUpperCase()
    .replace(/[^A-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 4) // first 4 words
    .join(' ');
}

function merge(expo, casemi, panorama) {
  const map = new Map(); // key -> company

  function add(company) {
    const key = normalizeKey(company.nombre);
    if (map.has(key)) {
      // Merge: enrich existing entry
      const existing = map.get(key);
      if (!existing.email && company.email) existing.email = company.email;
      if (!existing.web && company.web) existing.web = company.web;
      if (!existing.telefono && company.telefono) existing.telefono = company.telefono;
      if (!existing.rubro && company.rubro) existing.rubro = company.rubro;
      if (!existing.stand && company.stand) existing.stand = company.stand;
      if (company.rubros) existing.rubros = [...new Set([...(existing.rubros||[]), ...company.rubros])];
      if (!existing.fuentes.includes(company.fuente)) existing.fuentes.push(company.fuente);
    } else {
      map.set(key, {
        ...company,
        rubros: company.rubros || (company.rubro ? [company.rubro] : []),
        fuentes: [company.fuente],
      });
    }
  }

  expo.forEach(add);
  casemi.forEach(add);
  panorama.forEach(add);

  return [...map.values()].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
  );
}

// ──────────────────────────────────────────────
// 3. SCORING
// ──────────────────────────────────────────────

const SCORES = {
  transporte: {
    // rubro/cluster keywords → points
    keywords: [
      ['transporte', 40], ['logística', 40], ['logistica', 40], ['flete', 40],
      ['minería', 20], ['mineria', 20], ['mining', 20],
      ['drilling', 25], ['perforación', 25], ['perforacion', 25],
      ['extracción', 20], ['extraccion', 20],
      ['combustible', 30], ['ypf', 30], ['combustibles', 30],
      ['maquinaria', 15], ['equipos', 15], ['movimiento de suelos', 30],
      ['construcción', 15], ['construccion', 15],
      ['áridos', 35], ['aridos', 35], ['árido', 35],
      ['explosivos', 20], ['voladura', 20],
      ['insumos', 20], ['distribución', 25], ['distribucion', 25],
      ['logistic', 40], ['carga', 35], ['cargas', 35],
      ['camión', 30], ['camion', 30], ['camiones', 30],
      ['mineral', 20], ['acarreo', 40],
    ],
    stand_bonus: { 'Exterior': 10 }, // expo exterior = field operations
    fuente_bonus: { 'Expo San Juan 2026': 5 },
  },
  contenedores: {
    keywords: [
      ['minería', 30], ['mineria', 30], ['mining', 30],
      ['drilling', 35], ['perforación', 35], ['perforacion', 35],
      ['campamento', 40], ['campo', 25],
      ['servicios mineros', 35], ['servicios en mina', 35],
      ['extracción', 25], ['extraccion', 25],
      ['construcción', 20], ['construccion', 20], ['obra', 25],
      ['topografía', 20], ['geología', 20], ['geofísica', 20],
      ['seguridad industrial', 20], ['emergencias', 20],
      ['catering', 30], ['alimentación en campo', 30],
      ['infraestructura', 25], ['alojamiento', 40],
      ['operaciones', 20], ['operación minera', 35],
      ['servicio de perforación', 40],
    ],
    stand_bonus: { 'Exterior': 15, 'Pabellón 2': 5 },
    fuente_bonus: {},
  },
  deposito: {
    keywords: [
      ['distribución', 40], ['distribucion', 40], ['distribuidora', 40],
      ['repuestos', 40], ['insumos', 35], ['suministros', 35],
      ['herramientas', 35], ['ferretería', 40], ['ferreteria', 40],
      ['almacén', 35], ['almacen', 35], ['depósito', 35], ['deposito', 35],
      ['mayorista', 40], ['comercio', 30],
      ['electrodomésticos', 35], ['electrónica', 30],
      ['materiales', 30], ['materiales de construcción', 40],
      ['lubricantes', 35], ['lubricante', 35],
      ['rodamientos', 35], ['repuesto', 40],
      ['stock', 30], ['inventario', 35],
      ['proveedora', 30], ['proveedor', 25],
      ['logística', 20], ['logistica', 20],
      ['autopartes', 40], ['maquinaria agrícola', 35],
    ],
    stand_bonus: {},
    fuente_bonus: {},
  },
};

function scoreCompany(company) {
  const text = [
    company.nombre,
    company.rubro,
    ...(company.rubros || []),
    company.cluster || '',
    company.stand || '',
  ].join(' ').toLowerCase();

  const scores = {};
  for (const [service, config] of Object.entries(SCORES)) {
    let score = 0;
    for (const [kw, pts] of config.keywords) {
      if (text.includes(kw.toLowerCase())) score += pts;
    }
    // Stand bonus
    if (config.stand_bonus[company.ubicacion]) score += config.stand_bonus[company.ubicacion];
    // Source bonus
    for (const fuente of (company.fuentes || [company.fuente || ''])) {
      if (config.fuente_bonus[fuente]) score += config.fuente_bonus[fuente];
    }
    scores[service] = Math.min(100, score);
  }
  return scores;
}

// ──────────────────────────────────────────────
// 4. ASSEMBLE FINAL DATASET
// ──────────────────────────────────────────────

function decodeEntities(s) {
  return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
          .replace(/&quot;/g,'"').replace(/&#39;/g,"'")
          .replace(/&aacute;/g,'á').replace(/&eacute;/g,'é')
          .replace(/&iacute;/g,'í').replace(/&oacute;/g,'ó')
          .replace(/&uacute;/g,'ú').replace(/&ntilde;/g,'ñ');
}

console.log('Loading sources...');
const expo = loadExpo();
console.log('  Expo:', expo.length);
const casemi = parseCasemi();
console.log('  CASEMI:', casemi.length);
const panorama = parsePanorama();
console.log('  Panorama:', panorama.length);

console.log('\nMerging...');
const merged = merge(expo, casemi, panorama);
console.log('  Total unique:', merged.length);

// Add scores
merged.forEach(c => { c.scores = scoreCompany(c); });

// Stats
const withEmail = merged.filter(c => c.email).length;
const withWeb = merged.filter(c => c.web).length;
const highTransporte = merged.filter(c => c.scores.transporte >= 30).length;
const highContenedores = merged.filter(c => c.scores.contenedores >= 30).length;
const highDeposito = merged.filter(c => c.scores.deposito >= 30).length;

console.log(`  With email: ${withEmail}`);
console.log(`  With web: ${withWeb}`);
console.log(`  Score >= 30 Transporte: ${highTransporte}`);
console.log(`  Score >= 30 Contenedores: ${highContenedores}`);
console.log(`  Score >= 30 Depósito: ${highDeposito}`);

// Top 5 per service
for (const svc of ['transporte','contenedores','deposito']) {
  const top5 = [...merged].sort((a,b) => b.scores[svc] - a.scores[svc]).slice(0,5);
  console.log(`\nTop 5 ${svc}:`);
  top5.forEach(c => console.log(`  [${c.scores[svc]}] ${c.nombre} (${c.fuentes.join('+')})`));
}

// Save
fs.writeFileSync('prospectos-data.json', JSON.stringify(merged), 'utf8');
console.log('\nSaved prospectos-data.json');

// ──────────────────────────────────────────────
// 5. BUILD HTML APP
// ──────────────────────────────────────────────

const dataJson = JSON.stringify(merged);

const SUPA_URL = 'https://eqenqgrqvjithlayrezv.supabase.co';
const SUPA_KEY = 'sb_publishable_Qom4VOOQvZiFqvSXmT8pmw_Y2gqm_7l';

const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Prospectos Mineros — CRM Lite</title>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"><\/script>
  <style>
    :root {
      --bg: #f0efe9;
      --surface: #ffffff;
      --surface2: #f7f6f2;
      --border: #e0ddd6;
      --accent: #1a4a2e;
      --accent2: #b8860b;
      --accent3: #2d6fa4;
      --text: #1a1a18;
      --muted: #666;
      --danger: #c0392b;
      --green: #1a7a3a;
      --radius: 8px;

      /* service colors */
      --col-transporte: #1a4a2e;
      --col-contenedores: #2d6fa4;
      --col-deposito: #7a3a8a;

      /* status colors */
      --st-nuevo: #666;
      --st-contactado: #2d6fa4;
      --st-interesado: #1a7a3a;
      --st-descartado: #c0392b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', system-ui, sans-serif; min-height: 100vh; }

    /* ── HEADER ── */
    header {
      background: var(--accent);
      color: #fff;
      padding: 16px 24px;
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }
    header h1 { font-size: 1.25rem; font-weight: 700; flex: 1; min-width: 200px; }
    header .hdr-stats { font-size: 0.78rem; opacity: 0.75; display: flex; gap: 16px; }
    header .hdr-stat b { display: block; font-size: 1.1rem; opacity: 1; }

    /* ── CONTROLS ── */
    .controls {
      background: #fff;
      border-bottom: 2px solid var(--border);
      padding: 10px 24px;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
    }
    .controls input[type="search"] {
      flex: 1; min-width: 200px;
      padding: 7px 11px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font-size: 0.88rem;
    }
    .controls input:focus { outline: 2px solid var(--accent); }
    .controls select {
      padding: 7px 10px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font-size: 0.85rem;
      background: #fff;
    }
    .btn {
      padding: 7px 13px;
      border: none;
      border-radius: var(--radius);
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .btn:hover { opacity: 0.82; }
    .btn-csv { background: var(--accent2); color: #fff; }
    .btn-reset { background: var(--surface2); color: var(--text); border: 1px solid var(--border); }

    /* ── SERVICE TABS ── */
    .tabs {
      display: flex;
      gap: 0;
      background: var(--surface);
      border-bottom: 2px solid var(--border);
      padding: 0 24px;
      overflow-x: auto;
    }
    .tab {
      padding: 10px 18px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      border-bottom: 3px solid transparent;
      color: var(--muted);
      white-space: nowrap;
      transition: all 0.15s;
      background: none;
      border-top: none; border-left: none; border-right: none;
    }
    .tab:hover { color: var(--text); background: var(--surface2); }
    .tab.active-todos    { color: var(--text); border-bottom-color: var(--text); }
    .tab.active-transporte   { color: var(--col-transporte); border-bottom-color: var(--col-transporte); }
    .tab.active-contenedores { color: var(--col-contenedores); border-bottom-color: var(--col-contenedores); }
    .tab.active-deposito     { color: var(--col-deposito); border-bottom-color: var(--col-deposito); }

    /* ── STATS BAR ── */
    .stats-bar {
      padding: 8px 24px;
      font-size: 0.8rem;
      color: var(--muted);
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
      background: var(--surface2);
      border-bottom: 1px solid var(--border);
    }
    .stats-bar b { color: var(--text); }

    /* ── GRID ── */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
      gap: 12px;
      padding: 16px 24px 40px;
    }

    /* ── CARD ── */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transition: box-shadow 0.15s;
    }
    .card:hover { box-shadow: 0 3px 10px rgba(0,0,0,0.1); }

    .card-top {
      padding: 12px 14px 8px;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .card-name {
      font-size: 0.88rem;
      font-weight: 700;
      line-height: 1.3;
    }
    .card-name a { color: inherit; text-decoration: none; }
    .card-name a:hover { text-decoration: underline; color: var(--accent); }

    .card-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .tag {
      font-size: 0.68rem;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 3px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .tag-fuente-expo { background: #e8f5ee; color: var(--accent); }
    .tag-fuente-casemi { background: #fff3cd; color: #7a5800; }
    .tag-fuente-panorama { background: #ffe8d6; color: #8a3a00; }
    .tag-ubicacion { background: #f0f0f0; color: #555; }

    .card-rubro {
      font-size: 0.75rem;
      color: var(--muted);
      margin-top: 2px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* ── SCORE BARS ── */
    .scores {
      padding: 8px 14px;
      display: flex;
      flex-direction: column;
      gap: 5px;
      border-top: 1px solid var(--border);
      background: var(--surface2);
    }
    .score-row {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.72rem;
    }
    .score-label { width: 100px; color: var(--muted); flex-shrink: 0; font-weight: 500; }
    .score-bar-wrap { flex: 1; background: #e8e6e0; border-radius: 3px; height: 6px; overflow: hidden; }
    .score-bar { height: 100%; border-radius: 3px; transition: width 0.2s; }
    .score-bar.transporte   { background: var(--col-transporte); }
    .score-bar.contenedores { background: var(--col-contenedores); }
    .score-bar.deposito     { background: var(--col-deposito); }
    .score-num { width: 28px; text-align: right; font-weight: 600; color: var(--text); }

    /* ── CONTACT ── */
    .card-contact {
      padding: 8px 14px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      border-top: 1px solid var(--border);
    }
    .contact-row {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.75rem;
      color: var(--muted);
      overflow: hidden;
    }
    .contact-row a { color: var(--accent3); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .contact-row a:hover { text-decoration: underline; }

    /* ── STATUS & NOTES ── */
    .card-bottom {
      padding: 8px 14px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      border-top: 1px solid var(--border);
    }
    .status-row { display: flex; gap: 6px; align-items: center; }
    .status-select {
      font-size: 0.75rem;
      padding: 3px 6px;
      border-radius: 4px;
      border: 1px solid var(--border);
      background: #fff;
      cursor: pointer;
      font-weight: 600;
      flex: 1;
    }
    .status-select.nuevo      { border-color: var(--st-nuevo);      color: var(--st-nuevo); }
    .status-select.contactado  { border-color: var(--st-contactado);  color: var(--st-contactado); }
    .status-select.interesado  { border-color: var(--st-interesado);  color: var(--st-interesado); }
    .status-select.descartado  { border-color: var(--st-descartado);  color: var(--st-descartado); }

    .notes-input {
      font-size: 0.75rem;
      padding: 4px 7px;
      border: 1px solid var(--border);
      border-radius: 4px;
      resize: none;
      font-family: inherit;
      color: var(--text);
      width: 100%;
      min-height: 38px;
    }
    .notes-input:focus { outline: 1px solid var(--accent); }

    .no-results {
      text-align: center;
      padding: 60px 20px;
      color: var(--muted);
      grid-column: 1/-1;
    }
  </style>
</head>
<body>

<header>
  <h1>Prospectos Mineros</h1>
  <div class="hdr-stats">
    <div class="hdr-stat"><b id="hdr-total">0</b> Empresas</div>
    <div class="hdr-stat"><b id="hdr-email">0</b> Con email</div>
    <div class="hdr-stat"><b id="hdr-contactado">0</b> Contactados</div>
    <div class="hdr-stat"><b id="hdr-interesado">0</b> Interesados</div>
  </div>
  <div style="display:flex;align-items:center;gap:10px;margin-left:auto;flex-shrink:0">
    <span style="font-size:0.8rem;opacity:0.75">Soy:</span>
    <select id="who-select" onchange="setWho(this.value)"
      style="padding:5px 10px;border-radius:6px;border:none;font-weight:600;font-size:0.85rem;cursor:pointer">
      <option value="">— elegir —</option>
      <option value="Nacho">Nacho</option>
      <option value="Vincenzo">Vincenzo</option>
    </select>
    <span id="sync-indicator" style="font-size:0.75rem;opacity:0.7">⟳ Sin conectar</span>
  </div>
</header>

<div class="controls">
  <input type="search" id="search" placeholder="Buscar empresa, rubro, email..." autocomplete="off">
  <select id="filter-fuente">
    <option value="">Todas las fuentes</option>
    <option value="Expo San Juan 2026">Expo San Juan 2026</option>
    <option value="CASEMI">CASEMI</option>
    <option value="Panorama Minero">Panorama Minero</option>
  </select>
  <select id="filter-status">
    <option value="">Todos los estados</option>
    <option value="nuevo">Sin contactar</option>
    <option value="contactado">Contactado</option>
    <option value="interesado">Interesado</option>
    <option value="descartado">Descartado</option>
  </select>
  <select id="filter-score">
    <option value="0">Cualquier score</option>
    <option value="30">Score ≥ 30</option>
    <option value="50">Score ≥ 50</option>
    <option value="70">Score ≥ 70</option>
  </select>
  <button class="btn btn-csv" onclick="exportCSV()">⬇ CSV</button>
  <button class="btn btn-reset" onclick="resetFilters()">↺ Resetear</button>
</div>

<div class="tabs">
  <button class="tab active-todos" onclick="setTab('todos')">Todos</button>
  <button class="tab" onclick="setTab('transporte')">🚛 Transporte</button>
  <button class="tab" onclick="setTab('contenedores')">🏠 Contenedores</button>
  <button class="tab" onclick="setTab('deposito')">📦 IA Depósito</button>
</div>

<div class="stats-bar">
  Mostrando <b id="count-visible">0</b> de <b id="count-total">0</b> empresas
  &nbsp;·&nbsp; Score mínimo activo: <b id="score-min-label">—</b>
</div>

<div class="grid" id="grid"></div>

<script id="data" type="application/json">
${dataJson}
</script>
<script>
// ── SUPABASE ──
const SUPA_URL = '${SUPA_URL}';
const SUPA_KEY = '${SUPA_KEY}';
const _supa = supabase.createClient(SUPA_URL, SUPA_KEY);

// ── GLOBALS ──
const CRM_KEY = 'prospectos_crm_v1';
const WHO_KEY = 'prospectos_who_v1';
const ALL = JSON.parse(document.getElementById('data').textContent);

let crm = {};        // { empresa: { status, notes, updated_by, updated_at } }
let activeTab = 'todos';
let filtered = [];
let currentWho = localStorage.getItem(WHO_KEY) || '';
let saveTimers = {};  // debounce per empresa

// ── WHO AM I ──
function setWho(val) {
  currentWho = val;
  localStorage.setItem(WHO_KEY, val);
}

// Restaurar selección guardada
window.addEventListener('DOMContentLoaded', () => {
  const sel = document.getElementById('who-select');
  if (sel && currentWho) sel.value = currentWho;
});

// ── SYNC INDICATOR ──
function setSyncStatus(msg, color) {
  const el = document.getElementById('sync-indicator');
  if (!el) return;
  el.textContent = msg;
  el.style.color = color || 'rgba(255,255,255,0.7)';
}

// ── LOCAL FALLBACK ──
function loadLocal() {
  try { crm = JSON.parse(localStorage.getItem(CRM_KEY) || '{}'); } catch { crm = {}; }
}
function saveLocal() {
  localStorage.setItem(CRM_KEY, JSON.stringify(crm));
}

// ── SUPABASE LOAD (all rows at once) ──
async function loadFromSupabase() {
  setSyncStatus('⟳ Cargando...', '#ffd');
  try {
    const { data, error } = await _supa
      .from('prospectos_crm')
      .select('empresa, status, notes, updated_by, updated_at');
    if (error) throw error;
    if (data && data.length > 0) {
      data.forEach(row => {
        crm[row.empresa] = { status: row.status, notes: row.notes,
                             updated_by: row.updated_by, updated_at: row.updated_at };
      });
      saveLocal();
      setSyncStatus('✓ Sincronizado', '#9f9');
    } else {
      setSyncStatus('✓ Conectado (sin datos aún)', '#9f9');
    }
    renderAll(false);
    updateHeader();
  } catch (err) {
    setSyncStatus('⚠ Sin conexión — modo local', '#fa0');
    console.warn('Supabase load failed:', err.message);
  }
}

// ── SUPABASE SAVE (one row, debounced) ──
function saveToSupabase(empresa) {
  clearTimeout(saveTimers[empresa]);
  saveTimers[empresa] = setTimeout(async () => {
    const entry = crm[empresa];
    if (!entry) return;
    setSyncStatus('⟳ Guardando...', '#ffd');
    try {
      const { error } = await _supa.rpc('upsert_prospecto', {
        p_empresa:    empresa,
        p_status:     entry.status,
        p_notes:      entry.notes || '',
        p_updated_by: currentWho || 'equipo',
      });
      if (error) throw error;
      setSyncStatus('✓ Guardado', '#9f9');
    } catch (err) {
      setSyncStatus('⚠ Error al guardar — guardado local', '#fa0');
      console.warn('Supabase save failed:', err.message);
    }
  }, 800); // espera 800ms de inactividad antes de guardar
}

// ── CRM API ──
function getEntry(id) {
  return crm[id] || { status: 'nuevo', notes: '', updated_by: '', updated_at: null };
}
function setStatus(id, val) {
  if (!crm[id]) crm[id] = { status: 'nuevo', notes: '', updated_by: '', updated_at: null };
  crm[id].status = val;
  crm[id].updated_by = currentWho;
  saveLocal();
  saveToSupabase(id);
  updateHeader();
  const sel = document.querySelector(\`[data-id="\${esc(id)}"] .status-select\`);
  if (sel) sel.className = 'status-select ' + val;
}
function setNotes(id, val) {
  if (!crm[id]) crm[id] = { status: 'nuevo', notes: '', updated_by: '', updated_at: null };
  crm[id].notes = val;
  crm[id].updated_by = currentWho;
  saveLocal();
  saveToSupabase(id);
}

// ── AUTO-REFRESH cada 30s para ver cambios del otro ──
setInterval(async () => {
  try {
    const { data, error } = await _supa
      .from('prospectos_crm')
      .select('empresa, status, notes, updated_by, updated_at')
      .gt('updated_at', new Date(Date.now() - 35000).toISOString()); // solo cambios recientes
    if (!error && data && data.length > 0) {
      let changed = false;
      data.forEach(row => {
        const local = crm[row.empresa];
        // Solo actualizar si fue otro quien cambió
        if (!local || (row.updated_by !== currentWho && row.updated_at > (local.updated_at || ''))) {
          crm[row.empresa] = { status: row.status, notes: row.notes,
                               updated_by: row.updated_by, updated_at: row.updated_at };
          changed = true;
        }
      });
      if (changed) { saveLocal(); renderAll(false); updateHeader(); }
    }
  } catch(e) { /* silencioso */ }
}, 30000);

// ── TABS ──
function setTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab').forEach(t => {
    t.className = 'tab';
    if (t.textContent.toLowerCase().includes(tab) || (tab === 'todos' && t.textContent.includes('Todos'))) {
      t.className = 'tab active-' + tab;
    }
  });
  renderAll();
}

// ── FILTERS ──
function getMinScore(company) {
  if (activeTab === 'todos') return Math.max(...Object.values(company.scores));
  return company.scores[activeTab] || 0;
}

const PAGE_SIZE = 60;
let currentPage = 1;

function renderAll(resetPage = true) {
  if (resetPage) currentPage = 1;
  const q = document.getElementById('search').value.trim().toLowerCase();
  const fuente = document.getElementById('filter-fuente').value;
  const statusF = document.getElementById('filter-status').value;
  const minScore = parseInt(document.getElementById('filter-score').value) || 0;

  document.getElementById('score-min-label').textContent = minScore ? minScore + '+' : '—';

  filtered = ALL.filter(c => {
    const entry = getEntry(c.nombre);
    const matchQ = !q ||
      c.nombre.toLowerCase().includes(q) ||
      (c.rubro || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.rubros || []).some(r => r.toLowerCase().includes(q));
    const matchFuente = !fuente || (c.fuentes || []).includes(fuente);
    const matchStatus = !statusF || entry.status === statusF;
    const matchScore = getMinScore(c) >= minScore;
    return matchQ && matchFuente && matchStatus && matchScore;
  });

  filtered.sort((a, b) => getMinScore(b) - getMinScore(a));

  const showing = Math.min(currentPage * PAGE_SIZE, filtered.length);
  document.getElementById('count-visible').textContent = showing + ' de ' + filtered.length;
  document.getElementById('count-total').textContent = ALL.length;

  const grid = document.getElementById('grid');
  if (filtered.length === 0) {
    grid.innerHTML = '<div class="no-results"><p>No hay empresas con esos filtros.</p></div>';
    return;
  }

  const page = filtered.slice(0, showing);
  const hasMore = filtered.length > showing;
  const moreBtn = hasMore
    ? \`<div style="grid-column:1/-1;text-align:center;padding:16px 0">
        <button class="btn" style="background:var(--accent);color:#fff;padding:10px 28px;font-size:0.9rem"
          onclick="loadMore()">Ver más (quedan \${filtered.length - showing})</button>
      </div>\`
    : '';

  grid.innerHTML = page.map(c => cardHTML(c)).join('') + moreBtn;

  // Restore CRM state
  page.forEach(c => {
    const entry = getEntry(c.nombre);
    const id = esc(c.nombre);
    const sel = document.querySelector(\`[data-id="\${id}"] .status-select\`);
    const notes = document.querySelector(\`[data-id="\${id}"] .notes-input\`);
    if (sel) { sel.value = entry.status; sel.className = 'status-select ' + entry.status; }
    if (notes) notes.value = entry.notes;
  });
}

function loadMore() {
  currentPage++;
  renderAll(false);
  // Scroll to newly added cards
  const cards = document.querySelectorAll('.card');
  if (cards.length > 0) cards[cards.length - 1].scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function cardHTML(c) {
  const entry = getEntry(c.nombre);
  const fuentes = (c.fuentes || [c.fuente || '']).join('+');
  const isExpo = (c.fuentes || []).includes('Expo San Juan 2026');
  const isCasemi = (c.fuentes || []).includes('CASEMI');
  const isPanorama = (c.fuentes || []).includes('Panorama Minero');

  const fuenteTags = [
    isExpo ? '<span class="tag tag-fuente-expo">Expo SJ</span>' : '',
    isCasemi ? '<span class="tag tag-fuente-casemi">CASEMI</span>' : '',
    isPanorama ? '<span class="tag tag-fuente-panorama">Panorama</span>' : '',
    c.ubicacion ? \`<span class="tag tag-ubicacion">\${esc(c.ubicacion)}</span>\` : '',
  ].filter(Boolean).join('');

  const nameHtml = c.web
    ? \`<a href="\${esc(c.web)}" target="_blank" rel="noopener">\${esc(c.nombre)}</a>\`
    : esc(c.nombre);

  const rubro = (c.rubros || []).slice(0, 2).join(' · ') || c.rubro || '';

  const scoreRows = [
    ['🚛 Transporte', 'transporte'],
    ['🏠 Contenedores', 'contenedores'],
    ['📦 IA Depósito', 'deposito'],
  ].map(([label, key]) => {
    const val = (c.scores || {})[key] || 0;
    const pct = val;
    return \`<div class="score-row">
      <span class="score-label">\${label}</span>
      <div class="score-bar-wrap"><div class="score-bar \${key}" style="width:\${pct}%"></div></div>
      <span class="score-num">\${val}</span>
    </div>\`;
  }).join('');

  const emailRow = c.email
    ? \`<div class="contact-row">✉ <a href="mailto:\${esc(c.email)}">\${esc(c.email)}</a></div>\`
    : '';
  const webRow = c.web && !isExpo
    ? \`<div class="contact-row">🌐 <a href="\${esc(c.web)}" target="_blank">\${esc(c.web.replace(/https?:\\/\\//,''))}</a></div>\`
    : '';
  const standRow = c.stand
    ? \`<div class="contact-row">📍 Stand: \${esc(c.stand)}</div>\`
    : '';
  const hasContact = emailRow || webRow || standRow;

  const id = esc(c.nombre);
  return \`<div class="card" data-id="\${id}">
    <div class="card-top">
      <div class="card-name">\${nameHtml}</div>
      <div class="card-meta">\${fuenteTags}</div>
      \${rubro ? \`<div class="card-rubro">\${esc(rubro)}</div>\` : ''}
    </div>
    <div class="scores">\${scoreRows}</div>
    \${hasContact ? \`<div class="card-contact">\${emailRow}\${webRow}\${standRow}</div>\` : ''}
    <div class="card-bottom">
      <div class="status-row">
        <select class="status-select \${entry.status}" onchange="setStatus('\${id}', this.value); this.className='status-select '+this.value">
          <option value="nuevo">Sin contactar</option>
          <option value="contactado">Contactado</option>
          <option value="interesado">Interesado ⭐</option>
          <option value="descartado">Descartado ✗</option>
        </select>
        \${entry.updated_by ? \`<span style="font-size:0.68rem;color:var(--muted);flex-shrink:0">✎ \${esc(entry.updated_by)}</span>\` : ''}
      </div>
      <textarea class="notes-input" placeholder="Notas..." oninput="setNotes('\${id}', this.value)" rows="2"></textarea>
    </div>
  </div>\`;
}

function esc(s) {
  return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function updateHeader() {
  document.getElementById('hdr-total').textContent = ALL.length;
  document.getElementById('hdr-email').textContent = ALL.filter(c => c.email).length;
  document.getElementById('hdr-contactado').textContent = Object.values(crm).filter(e => e.status === 'contactado').length;
  document.getElementById('hdr-interesado').textContent = Object.values(crm).filter(e => e.status === 'interesado').length;
}

function resetFilters() {
  document.getElementById('search').value = '';
  document.getElementById('filter-fuente').value = '';
  document.getElementById('filter-status').value = '';
  document.getElementById('filter-score').value = '0';
  activeTab = 'todos';
  document.querySelectorAll('.tab').forEach(t => {
    t.className = 'tab';
    if (t.textContent.includes('Todos')) t.className = 'tab active-todos';
  });
  renderAll();
}

function exportCSV() {
  const svc = activeTab === 'todos' ? 'transporte' : activeTab;
  const rows = [['Empresa','Fuentes','Rubro','Stand','Email','Web','Score Transporte','Score Contenedores','Score Depósito','Estado','Notas']];
  filtered.forEach(c => {
    const entry = getEntry(c.nombre);
    rows.push([
      c.nombre,
      (c.fuentes || []).join('+'),
      c.rubro || '',
      c.stand || '',
      c.email || '',
      c.web || '',
      c.scores.transporte,
      c.scores.contenedores,
      c.scores.deposito,
      entry.status,
      entry.notes || '',
    ]);
  });
  const csv = rows.map(r => r.map(v => \`"\${(v+'').replace(/"/g,'""')}"\`).join(',')).join('\\n');
  const blob = new Blob(['\\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = \`prospectos-mineros-\${new Date().toISOString().slice(0,10)}.csv\`;
  a.click();
}

// ── INIT ──
loadLocal();       // carga datos locales inmediatamente (sin parpadeo)
updateHeader();
renderAll();
loadFromSupabase(); // luego sincroniza con Supabase en background

document.getElementById('search').addEventListener('input', renderAll);
document.getElementById('filter-fuente').addEventListener('change', renderAll);
document.getElementById('filter-status').addEventListener('change', renderAll);
document.getElementById('filter-score').addEventListener('change', renderAll);
</script>
</body>
</html>`;

fs.writeFileSync('prospectos.html', html, 'utf8');
console.log('\nBuilt prospectos.html, size:', fs.statSync('prospectos.html').size, 'bytes');
