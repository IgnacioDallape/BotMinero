const fs = require('fs');

const data = fs.readFileSync('expo-data.json', 'utf8').trim();

const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Expo San Juan Minera 2026 — Expositores</title>
  <style>
    :root {
      --bg: #f2f0ec;
      --surface: #fff;
      --border: #ddd;
      --accent: #b8860b;
      --accent2: #1a4a2e;
      --text: #1a1a1a;
      --muted: #666;
      --tag-p1: #1a4a6e;
      --tag-p2: #1a4a2e;
      --tag-ext: #6e3a1a;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', system-ui, sans-serif; min-height: 100vh; }

    header {
      background: var(--accent2);
      color: #fff;
      padding: 20px 24px 16px;
    }
    header h1 { font-size: 1.5rem; font-weight: 700; letter-spacing: 0.02em; }
    header .subtitle { font-size: 0.85rem; opacity: 0.75; margin-top: 2px; }

    .controls {
      background: #fff;
      border-bottom: 1px solid var(--border);
      padding: 12px 24px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
    }
    .controls input[type="search"] {
      flex: 1; min-width: 200px;
      padding: 8px 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      font-size: 0.9rem;
    }
    .controls input[type="search"]:focus { outline: 2px solid var(--accent2); border-color: transparent; }
    .controls select {
      padding: 8px 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      font-size: 0.9rem;
      background: #fff;
    }
    .btn {
      padding: 8px 14px;
      border: none;
      border-radius: 6px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .btn:hover { opacity: 0.85; }
    .btn-csv { background: var(--accent); color: #fff; }
    .btn-json { background: var(--accent2); color: #fff; }

    .stats-bar {
      padding: 10px 24px;
      font-size: 0.82rem;
      color: var(--muted);
      display: flex;
      gap: 16px;
      align-items: center;
      flex-wrap: wrap;
    }
    .stats-bar .count { font-weight: 700; color: var(--text); }
    .stats-bar .data-info {
      font-size: 0.78rem;
      background: #e8f5ee;
      border: 1px solid #1a4a2e;
      border-radius: 4px;
      padding: 3px 8px;
      color: #0d3a1f;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 12px;
      padding: 16px 24px 32px;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      transition: box-shadow 0.15s;
    }
    .card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
    .card-name {
      font-size: 0.9rem;
      font-weight: 700;
      line-height: 1.3;
      color: var(--text);
    }
    .card-name a {
      color: inherit;
      text-decoration: none;
    }
    .card-name a:hover { color: var(--accent2); text-decoration: underline; }
    .card-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 2px;
    }
    .tag {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 3px;
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    .tag-p1 { background: #e8f0f8; color: var(--tag-p1); }
    .tag-p2 { background: #e8f5ee; color: var(--tag-p2); }
    .tag-ext { background: #f8f0e8; color: var(--tag-ext); }
    .tag-cluster { background: #f5e8f8; color: #5a1a6e; }
    .card-stand {
      font-size: 0.78rem;
      color: var(--muted);
      font-family: monospace;
      word-break: break-word;
    }

    .no-results {
      text-align: center;
      padding: 60px 20px;
      color: var(--muted);
      grid-column: 1/-1;
    }
    .no-results p { font-size: 1rem; }
  </style>
</head>
<body>

<header>
  <h1>Expo San Juan Minera 2026</h1>
  <div class="subtitle">Lista completa de expositores — datos snapshot offline</div>
</header>

<div class="controls">
  <input type="search" id="search" placeholder="Buscar empresa, stand, cluster..." autocomplete="off">
  <select id="filter-loc">
    <option value="">Todas las ubicaciones</option>
    <option value="Pabellón 1">Pabellón 1</option>
    <option value="Pabellón 2">Pabellón 2</option>
    <option value="Exterior">Exterior</option>
  </select>
  <button class="btn btn-csv" onclick="exportCSV()">⬇ Exportar CSV</button>
  <button class="btn btn-json" onclick="exportJSON()">⬇ Exportar JSON</button>
</div>

<div class="stats-bar">
  <span>Mostrando <span class="count" id="count-visible">0</span> de <span class="count" id="count-total">0</span> expositores</span>
  <span class="data-info">✓ Datos completos embebidos — funciona offline aunque la página oficial se dé de baja</span>
</div>

<div class="grid" id="grid"></div>

<script id="data" type="application/json">
${data}
</script>
<script>
const EXHIBITORS = JSON.parse(document.getElementById('data').textContent);
let filtered = [];

function getTagClass(ub) {
  if (!ub) return '';
  if (ub.includes('Pabellón 1')) return 'tag-p1';
  if (ub.includes('Pabellón 2')) return 'tag-p2';
  return 'tag-ext';
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function renderAll() {
  const q = document.getElementById('search').value.trim().toLowerCase();
  const loc = document.getElementById('filter-loc').value;

  filtered = EXHIBITORS.filter(e => {
    const matchQ = !q ||
      e.nombre.toLowerCase().includes(q) ||
      (e.stand || '').toLowerCase().includes(q) ||
      (e.cluster || '').toLowerCase().includes(q);
    const matchLoc = !loc || (e.ubicacion || '') === loc;
    return matchQ && matchLoc;
  });

  document.getElementById('count-visible').textContent = filtered.length;

  const grid = document.getElementById('grid');
  if (filtered.length === 0) {
    grid.innerHTML = '<div class="no-results"><p>No se encontraron expositores con ese filtro.</p></div>';
    return;
  }

  grid.innerHTML = filtered.map(e => {
    const tagClass = getTagClass(e.ubicacion);
    const url = e.slug ? \`https://www.exposanjuan.com.ar/es/company/\${e.slug}\` : null;
    const nameHtml = url
      ? \`<a href="\${url}" target="_blank" rel="noopener">\${escapeHtml(e.nombre)}</a>\`
      : escapeHtml(e.nombre);
    const clusterTag = e.cluster
      ? \`<span class="tag tag-cluster">\${escapeHtml(e.cluster)}</span>\`
      : '';
    const locTag = e.ubicacion
      ? \`<span class="tag \${tagClass}">\${escapeHtml(e.ubicacion)}</span>\`
      : '';
    const standHtml = e.stand
      ? \`<div class="card-stand">Stand: \${escapeHtml(e.stand)}</div>\`
      : '';
    return \`
      <div class="card">
        <div class="card-name">\${nameHtml}</div>
        <div class="card-meta">\${locTag}\${clusterTag}</div>
        \${standHtml}
      </div>\`;
  }).join('');
}

function exportCSV() {
  const rows = [['Empresa','Stand','Ubicación','Cluster','URL']];
  filtered.forEach(e => {
    const url = e.slug ? \`https://www.exposanjuan.com.ar/es/company/\${e.slug}\` : '';
    rows.push([e.nombre, e.stand || '', e.ubicacion || '', e.cluster || '', url]);
  });
  const csv = rows.map(r => r.map(v => \`"\${(v+'').replace(/"/g,'""')}"\`).join(',')).join('\\n');
  const blob = new Blob(['\\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = \`expo-minera-sj-2026-\${new Date().toISOString().slice(0,10)}.csv\`;
  a.click();
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = \`expo-minera-sj-2026-\${new Date().toISOString().slice(0,10)}.json\`;
  a.click();
}

document.getElementById('count-total').textContent = EXHIBITORS.length;
document.getElementById('search').addEventListener('input', renderAll);
document.getElementById('filter-loc').addEventListener('change', renderAll);
renderAll();
</script>
</body>
</html>
`;

fs.writeFileSync('expo-minera.html', html, 'utf8');
console.log('Built expo-minera.html, size:', fs.statSync('expo-minera.html').size, 'bytes');
