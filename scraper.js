const puppeteer = require('puppeteer');
const fs = require('fs');

/* ─────────────────────────────────────────
   Helpers
───────────────────────────────────────── */

function slug(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function waitAndGet(page, url) {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
}

/* ─────────────────────────────────────────
   1. Scrape upcoming matches + comp links
───────────────────────────────────────── */

async function scrapePartidos(page) {
  await waitAndGet(page, 'https://www.fbm.es/resultados-club-20677/highstep-academy');

  return page.evaluate(() => {
    const filas = document.querySelectorAll('table tr');
    const datos = [];

    filas.forEach(fila => {
      const celdas = fila.querySelectorAll('td');
      if (celdas.length < 4) return;

      const categoria  = celdas[0]?.innerText.trim();
      const encuentro  = celdas[1]?.innerText.trim();
      const fecha      = celdas[2]?.innerText.trim();
      const campo      = celdas[3]?.innerText.trim();

      // Try to grab competition link from first cell
      const compLink =
        celdas[0]?.querySelector('a')?.href ||
        celdas[1]?.querySelector('a')?.href ||
        null;

      if (categoria && encuentro && fecha.includes('/') && campo) {
        datos.push({ categoria, encuentro, fecha, campo, compLink });
      }
    });

    return datos;
  });
}

/* ─────────────────────────────────────────
   2. From a match's compLink, find the
      clasificación URL and scrape standings
───────────────────────────────────────── */

async function scrapeClasificacion(page, compLink) {
  if (!compLink) return null;

  // FBM URL patterns:
  //   https://www.fbm.es/competicion/XXXX/nombre/resultados
  //   https://www.fbm.es/competicion/XXXX/nombre/clasificacion   ← we want this
  //   https://www.fbm.es/jornada/XXXX  ← sometimes just a jornada link

  let clasificacionUrl = null;

  // If URL already contains "clasificacion" → use it
  if (compLink.includes('clasificacion')) {
    clasificacionUrl = compLink;

  // If URL contains "/competicion/" → swap last segment for "clasificacion"
  } else if (compLink.includes('/competicion/')) {
    const parts = compLink.split('/');
    // Remove trailing empty segment if present
    if (parts[parts.length - 1] === '') parts.pop();
    // Replace last path segment with "clasificacion"
    parts[parts.length - 1] = 'clasificacion';
    clasificacionUrl = parts.join('/');

  // If URL contains "/jornada/" → try to find a clasificacion link on that page
  } else {
    try {
      await waitAndGet(page, compLink);
      clasificacionUrl = await page.evaluate(() => {
        const links = [...document.querySelectorAll('a')];
        const found = links.find(a =>
          a.href.includes('clasificacion') ||
          a.innerText.toLowerCase().trim() === 'clasificación' ||
          a.innerText.toLowerCase().trim() === 'clasificacion'
        );
        return found ? found.href : null;
      });
    } catch (e) {
      console.warn('⚠️  Could not follow compLink:', compLink, e.message);
      return null;
    }
  }

  if (!clasificacionUrl) return null;

  // Navigate to the classification page
  try {
    await waitAndGet(page, clasificacionUrl);
  } catch (e) {
    console.warn('⚠️  Could not load clasificación URL:', clasificacionUrl);
    return null;
  }

  // Scrape the standings table
  const equipos = await page.evaluate(() => {
    // Look for any table that has position/equipo columns
    const tables = document.querySelectorAll('table');
    let best = null;
    let bestScore = 0;

    tables.forEach(table => {
      const headers = [...table.querySelectorAll('th')].map(th => th.innerText.trim().toLowerCase());
      const score =
        (headers.some(h => h.includes('equipo') || h === 'club') ? 2 : 0) +
        (headers.some(h => h === 'pj' || h === 'j' || h.includes('jugado')) ? 2 : 0) +
        (headers.some(h => h === 'pg' || h === 'g' || h.includes('ganado')) ? 1 : 0) +
        (headers.some(h => h === 'pts' || h === 'puntos' || h === 'p') ? 1 : 0);

      if (score > bestScore) { bestScore = score; best = table; }
    });

    if (!best) {
      // Fallback: first table with more than 2 rows and at least 5 columns
      for (const t of tables) {
        const rows = t.querySelectorAll('tr');
        if (rows.length > 2) {
          const firstRow = rows[0].querySelectorAll('td,th');
          if (firstRow.length >= 5) { best = t; break; }
        }
      }
    }

    if (!best) return [];

    // Parse header row
    const headerRow = best.querySelector('tr');
    const headers = headerRow
      ? [...headerRow.querySelectorAll('th,td')].map(c => c.innerText.trim().toUpperCase())
      : [];

    const dataRows = [...best.querySelectorAll('tr')].filter(r => r.querySelectorAll('td').length > 0);

    return dataRows.map(row => {
      const cells = [...row.querySelectorAll('td')].map(c => c.innerText.trim());
      if (!cells.length) return null;

      // Try to map cells to known columns
      if (headers.length >= cells.length) {
        const obj = {};
        headers.forEach((h, i) => { if (cells[i] !== undefined) obj[h] = cells[i]; });
        return obj;
      }

      // Generic fallback: pos, equipo, pj, pg, pp, pf, pc, avg, pts
      return {
        POS:    cells[0]  || '',
        EQUIPO: cells[1]  || '',
        PJ:     cells[2]  || '',
        PG:     cells[3]  || '',
        PP:     cells[4]  || '',
        PF:     cells[5]  || '',
        PC:     cells[6]  || '',
        AVG:    cells[7]  || '',
        PTS:    cells[8]  || '',
      };
    }).filter(Boolean);
  });

  return { url: clasificacionUrl, equipos };
}

/* ─────────────────────────────────────────
   Main
───────────────────────────────────────── */

(async () => {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(30000);

    // ── Partidos ──────────────────────────
    console.log('🏀 Scraping partidos...');
    const partidos = await scrapePartidos(page);
    console.log(`   → ${partidos.length} partidos encontrados`);

    // ── Clasificaciones ───────────────────
    // Deduplicate competitions by category text
    const seen = new Map(); // slug → { categoria, competicion, compLink }

    partidos.forEach(p => {
      const catLines = p.categoria.split('\n').map(s => s.trim()).filter(Boolean);
      const catKey   = slug(catLines[0] || p.categoria);
      if (!seen.has(catKey) && p.compLink) {
        seen.set(catKey, {
          id:          catKey,
          nombre:      catLines[0] || p.categoria,
          competicion: catLines[1] || '',
          compLink:    p.compLink,
        });
      }
    });

    const clasificaciones = [];

    for (const [id, comp] of seen.entries()) {
      console.log(`📊 Scraping clasificación: ${comp.nombre} (${comp.compLink})`);
      try {
        const result = await scrapeClasificacion(page, comp.compLink);
        if (result && result.equipos.length > 0) {
          clasificaciones.push({
            id:          comp.id,
            nombre:      comp.nombre,
            competicion: comp.competicion,
            url:         result.url,
            equipos:     result.equipos,
          });
          console.log(`   → ${result.equipos.length} equipos en tabla`);
        } else {
          console.warn(`   ⚠️  Sin datos de clasificación para ${comp.nombre}`);
          // Store entry with empty equipos so the front end can show a message
          clasificaciones.push({
            id:          comp.id,
            nombre:      comp.nombre,
            competicion: comp.competicion,
            url:         comp.compLink,
            equipos:     [],
          });
        }
      } catch (e) {
        console.error(`   ✗ Error scraping ${comp.nombre}:`, e.message);
      }
    }

    // ── Write files ───────────────────────
    if (!fs.existsSync('public')) fs.mkdirSync('public');

    // Strip compLink before saving partidos (internal only)
    const partidosClean = partidos.map(({ compLink, ...rest }) => rest);

    // Attach compId to each partido so the front end can link to the right clasificacion
    const partidosWithId = partidosClean.map((p, i) => {
      const original = partidos[i];
      const catLines = original.categoria.split('\n').map(s => s.trim()).filter(Boolean);
      const catKey   = slug(catLines[0] || original.categoria);
      return { ...p, compId: seen.has(catKey) ? catKey : null };
    });

    fs.writeFileSync(
      'public/partidos.json',
      JSON.stringify({ actualizado: new Date().toISOString(), total: partidosWithId.length, partidos: partidosWithId }, null, 2)
    );

    fs.writeFileSync(
      'public/clasificaciones.json',
      JSON.stringify({ actualizado: new Date().toISOString(), clasificaciones }, null, 2)
    );

    console.log('✅ partidos.json y clasificaciones.json guardados');
    await browser.close();

  } catch (err) {
    console.error('✗ Error fatal:', err);
    process.exit(1);
  }
})();
