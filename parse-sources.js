const fs = require('fs');

// ==================== PARSE CASEMI ====================
function parseCasemi() {
  const html = fs.readFileSync('casemi-raw.html', 'utf8');

  // Extract oum_all_locations JSON array
  const match = html.match(/var oum_all_locations = (\[[\s\S]*?\]);\s*\n/);
  if (!match) {
    console.error('CASEMI: could not find oum_all_locations');
    return [];
  }

  let locations;
  try {
    locations = JSON.parse(match[1]);
  } catch(e) {
    console.error('CASEMI JSON parse error:', e.message);
    return [];
  }

  return locations.map(loc => {
    const content = loc.content || '';

    // content format: "RUBRO NOMBRE Correo: email URL: url slug"
    // Extract email
    const emailMatch = content.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
    const email = emailMatch ? emailMatch[0] : '';

    // Extract URL
    const urlMatch = content.match(/URL:\s*(https?:\/\/[^\s]+)/i);
    const web = urlMatch ? urlMatch[1].replace(/\/$/, '') : '';

    // Extract rubro (first word(s) before the company name)
    // Content starts with rubro then company name, then Correo:
    const beforeCorreo = content.split(/Correo:/i)[0].trim();
    // The title (company name) appears in content too; rubro is what's before it
    const namePos = beforeCorreo.indexOf(loc.title);
    const rubro = namePos > 0 ? beforeCorreo.substring(0, namePos).trim() : '';

    return {
      nombre: (loc.title || '').trim(),
      rubro: rubro,
      email: email,
      web: web,
      fuente: 'CASEMI',
      lat: loc.lat || '',
      lng: loc.lng || '',
    };
  }).filter(e => e.nombre.length > 1);
}

// ==================== PARSE PANORAMA MINERO ====================
function parsePanorama() {
  const html = fs.readFileSync('panorama-raw.html', 'utf8');

  // The page has company cards. Look for the JSON data or HTML structure.
  // From earlier analysis, companies have: name, rubro, phone, web

  // Try to find JSON data (Next.js or similar)
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextDataMatch) {
    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      // Navigate the data structure to find companies
      const companies = findCompanies(nextData);
      if (companies.length > 0) return companies;
    } catch(e) {
      console.log('Panorama: __NEXT_DATA__ parse failed:', e.message);
    }
  }

  // Try to extract from HTML cards
  const companies = [];
  const seen = new Set();

  // Look for company card patterns
  // Based on the sample: "AERCOM S.A." with phone and website
  const cardRegex = /<div[^>]*class="[^"]*(?:company|supplier|card)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
  let m;
  while ((m = cardRegex.exec(html)) !== null) {
    const chunk = m[1];
    const nameMatch = chunk.match(/<h[23][^>]*>([^<]+)<\/h[23]>/);
    if (!nameMatch) continue;
    const nombre = decodeEntities(nameMatch[1].trim());
    if (seen.has(nombre) || nombre.length < 3) continue;
    seen.add(nombre);

    const phoneMatch = chunk.match(/(\+?[\d\s\(\)\-]{7,})/);
    const webMatch = chunk.match(/https?:\/\/([^\s<"]+)/);
    const emailMatch = chunk.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
    const rubroMatch = chunk.match(/class="[^"]*rubro[^"]*"[^>]*>([^<]+)</);

    companies.push({
      nombre,
      rubro: rubroMatch ? decodeEntities(rubroMatch[1].trim()) : '',
      telefono: phoneMatch ? phoneMatch[1].trim() : '',
      web: webMatch ? 'https://' + webMatch[1].split(/['"<\s]/)[0] : '',
      email: emailMatch ? emailMatch[0] : '',
      fuente: 'Panorama Minero',
    });
  }

  // Fallback: extract from RSC/script data
  if (companies.length < 10) {
    // Look for company arrays in scripts
    const scriptData = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
      .map(s => s[1])
      .join('\n');

    const companyPattern = /"(?:name|nombre|company)"\s*:\s*"([^"]{3,80})"/g;
    let cm;
    while ((cm = companyPattern.exec(scriptData)) !== null) {
      const nombre = decodeEntities(cm[1]);
      if (!seen.has(nombre) && /^[A-Z]/.test(nombre)) {
        seen.add(nombre);
        companies.push({ nombre, rubro: '', email: '', web: '', fuente: 'Panorama Minero' });
      }
    }
  }

  return companies;
}

function findCompanies(obj, depth = 0) {
  if (depth > 10 || !obj) return [];
  if (Array.isArray(obj)) {
    if (obj.length > 5 && obj[0] && (obj[0].name || obj[0].nombre || obj[0].company)) {
      return obj.map(c => ({
        nombre: c.name || c.nombre || c.company || '',
        rubro: c.category || c.sector || c.rubro || '',
        web: c.website || c.web || c.url || '',
        email: c.email || c.mail || '',
        fuente: 'Panorama Minero',
      })).filter(c => c.nombre.length > 2);
    }
    return obj.flatMap(item => findCompanies(item, depth + 1));
  }
  if (typeof obj === 'object') {
    return Object.values(obj).flatMap(val => findCompanies(val, depth + 1));
  }
  return [];
}

// ==================== PARSE EXPO (enrich with profile pages) ====================
function loadExpo() {
  const data = JSON.parse(fs.readFileSync('expo-data.json', 'utf8'));
  return data.map(e => ({
    ...e,
    fuente: 'Expo San Juan 2026',
  }));
}

// ==================== UTILS ====================
function decodeEntities(s) {
  return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
          .replace(/&quot;/g,'"').replace(/&#39;/g,"'")
          .replace(/&aacute;/g,'á').replace(/&eacute;/g,'é')
          .replace(/&iacute;/g,'í').replace(/&oacute;/g,'ó')
          .replace(/&uacute;/g,'ú').replace(/&ntilde;/g,'ñ')
          .replace(/&Aacute;/g,'Á').replace(/&Eacute;/g,'É')
          .replace(/&Ntilde;/g,'Ñ');
}

// ==================== RUN ====================
console.log('Parsing sources...\n');

const casemi = parseCasemi();
console.log(`CASEMI: ${casemi.length} empresas`);
if (casemi.length > 0) {
  console.log('  Sample:', JSON.stringify(casemi[0]));
  console.log('  With email:', casemi.filter(e => e.email).length);
  console.log('  With web:', casemi.filter(e => e.web).length);
  console.log('  With rubro:', casemi.filter(e => e.rubro).length);
}

const panorama = parsePanorama();
console.log(`\nPanorama Minero: ${panorama.length} empresas`);
if (panorama.length > 0) {
  console.log('  Sample:', JSON.stringify(panorama[0]));
}

const expo = loadExpo();
console.log(`\nExpo San Juan 2026: ${expo.length} empresas`);

// Save individual sources
fs.writeFileSync('casemi-data.json', JSON.stringify(casemi, null, 2), 'utf8');
fs.writeFileSync('panorama-data.json', JSON.stringify(panorama, null, 2), 'utf8');

console.log('\nDone. Review casemi-data.json and panorama-data.json');
