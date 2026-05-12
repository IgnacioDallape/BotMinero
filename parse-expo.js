const fs = require('fs');

const html = fs.readFileSync('expo-raw.html', 'utf8');

// Strip React HTML comment markers like <!-- --> to simplify text matching
const cleaned = html.replace(/<!--\s*-->/g, '');

// Each exhibitor is rendered as a card with class "exhibitors-list-module__kgtcEa__card-hover".
// The card layout:
//   <h3 ... company-name>NAME or <a ...>NAME</a></h3>
//   <div class="mb-4 ..."><span ...>Cluster: X</span></div>  (optional)
//   ... Stand: ... chips ...
//   <span ...>Pabellón: N</span>  OR  <span ...>Exterior</span>

// Split by card boundary (each card div with the unique class)
const cardSplitter = /<div class="bg-card[^"]*card-hover[^"]*card-max-width[^"]*group">/g;
const parts = cleaned.split(cardSplitter);
// parts[0] is everything before the first card; cards = parts[1..]

const exhibitors = [];
const seen = new Set();

for (let i = 1; i < parts.length; i++) {
  // Limit to ~6000 chars per card to avoid bleeding into next card
  const chunk = parts[i].substring(0, 6000);

  // Name: try with link first, then without
  let name = '', slug = '';
  const linkedName = chunk.match(/<h3[^>]*company-name[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>\s*<\/h3>/);
  if (linkedName) {
    const href = linkedName[1];
    const slugMatch = href.match(/\/es\/company\/([^"?#]+)/);
    slug = slugMatch ? slugMatch[1] : '';
    name = decodeEntities(linkedName[2].trim());
  } else {
    const plainName = chunk.match(/<h3[^>]*company-name[^>]*>([^<]+)<\/h3>/);
    if (plainName) {
      name = decodeEntities(plainName[1].trim());
    }
  }
  if (!name) continue;

  // Cluster / Delegación
  let cluster = '';
  const clusterMatch = chunk.match(/(?:Cluster|Delegaci[oó]n)\s*:\s*([^<]+)<\/span>/i);
  if (clusterMatch) cluster = decodeEntities(clusterMatch[1].trim());

  // Stand: collect all chip spans inside the Stand block.
  // Pattern: <span ...>Stand:</span><div...>...<span ...>CHIP</span><span ...>CHIP</span>...</div>
  let stand = '';
  const standBlock = chunk.match(/>Stand\s*:\s*<\/span>\s*<div[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  if (standBlock) {
    const chips = [...standBlock[1].matchAll(/<span[^>]*stand-chip[^>]*>([^<]+)<\/span>/g)];
    stand = chips.map(c => c[1].trim()).join(', ');
    if (!stand) {
      // fallback: any span content inside
      const anySpans = [...standBlock[1].matchAll(/<span[^>]*>([^<]+)<\/span>/g)];
      stand = anySpans.map(c => c[1].trim()).filter(Boolean).join(', ');
    }
  }

  // Ubicación: Pabellón 1, Pabellón 2, or Exterior
  let ubicacion = '';
  const pab = chunk.match(/Pabell[oó]n\s*:\s*(\d)/i);
  if (pab) ubicacion = `Pabellón ${pab[1]}`;
  else if (/>Exterior</.test(chunk)) ubicacion = 'Exterior';

  const key = name + '|' + slug;
  if (seen.has(key)) continue;
  seen.add(key);

  exhibitors.push({ nombre: name, slug, stand, ubicacion, cluster });
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é')
    .replace(/&iacute;/g, 'í').replace(/&oacute;/g, 'ó')
    .replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ')
    .replace(/&Aacute;/g, 'Á').replace(/&Eacute;/g, 'É')
    .replace(/&Iacute;/g, 'Í').replace(/&Oacute;/g, 'Ó')
    .replace(/&Uacute;/g, 'Ú').replace(/&Ntilde;/g, 'Ñ');
}

// Sort alphabetically by name
exhibitors.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));

console.log('Total exhibitors parsed:', exhibitors.length);
console.log('With slug:', exhibitors.filter(e => e.slug).length);
console.log('Without slug:', exhibitors.filter(e => !e.slug).length);
console.log('With stand:', exhibitors.filter(e => e.stand).length);
console.log('With ubicacion:', exhibitors.filter(e => e.ubicacion).length);
console.log('  Pabellón 1:', exhibitors.filter(e => e.ubicacion === 'Pabellón 1').length);
console.log('  Pabellón 2:', exhibitors.filter(e => e.ubicacion === 'Pabellón 2').length);
console.log('  Exterior:', exhibitors.filter(e => e.ubicacion === 'Exterior').length);
console.log('With cluster:', exhibitors.filter(e => e.cluster).length);

console.log('\nSamples:');
console.log(JSON.stringify(exhibitors.slice(0, 2), null, 2));
console.log(JSON.stringify(exhibitors.filter(e => !e.slug).slice(0, 3), null, 2));
console.log(JSON.stringify(exhibitors.slice(-2), null, 2));

fs.writeFileSync('expo-data.json', JSON.stringify(exhibitors), 'utf8');
console.log('\nSaved to expo-data.json');
