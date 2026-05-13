/**
 * HA Basket — FBM Scraper
 * ──────────────────────────────────────────────────────────────
 * Extrae los próximos partidos de HA Basket desde fbm.es y
 * genera public/partidos.json listo para ser consumido por la web.
 *
 * Uso local:  node scraper.js
 * En CI:      ver .github/workflows/scrape.yml
 * ──────────────────────────────────────────────────────────────
 */

const puppeteer = require('puppeteer');
const fs        = require('fs');
const path      = require('path');

// ── CONFIG ────────────────────────────────────────────────────
const TEAM_NAME   = 'HA Basket';          // nombre a buscar (parcial, case-insensitive)
const FBM_URL     = 'https://www.fbm.es/es/horarios-y-resultados';
const OUTPUT_DIR  = path.join(__dirname, 'public');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'partidos.json');
const TIMEOUT_MS  = 30_000;

// ── HELPERS ───────────────────────────────────────────────────

/** Espera a que un selector aparezca o lanza error con contexto */
async function waitFor(page, selector, label) {
  try {
    await page.waitForSelector(selector, { timeout: TIMEOUT_MS });
  } catch {
    throw new Error(`Timeout esperando "${label}" (${selector})`);
  }
}

/** Intenta varios selectores y devuelve el primero que exista */
async function trySelectors(page, selectors) {
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) return sel;
  }
  return null;
}

/** Guarda una captura de pantalla para depurar si algo falla */
async function saveScreenshot(page, name) {
  const file = path.join(__dirname, `debug_${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  📸 Captura guardada: ${file}`);
}

// ── MAIN ──────────────────────────────────────────────────────
async function main() {
  console.log('🏀 HA Basket Scraper — iniciando...\n');

  // Aseguramos que existe la carpeta de salida
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',   // necesario en GitHub Actions / Docker
      '--disable-gpu',
    ],
  });

  const page = await browser.newPage();

  // User-agent real para evitar bloqueos básicos
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/124.0.0.0 Safari/537.36'
  );

  await page.setViewport({ width: 1440, height: 900 });

  // ── 1. CARGAR PÁGINA ───────────────────────────────────────
  console.log(`📡 Cargando: ${FBM_URL}`);
  try {
    await page.goto(FBM_URL, {
      waitUntil: 'networkidle2',
      timeout: TIMEOUT_MS,
    });
  } catch (err) {
    console.error('❌ No se pudo cargar la página:', err.message);
    await saveScreenshot(page, 'load_error');
    await browser.close();
    process.exit(1);
  }

  // Esperar a que el JS de NBN23 renderice algo visible
  // La página de FBM carga el contenido via React/NBN23 dinámicamente
  const CONTENT_SELECTORS = [
    // Posibles contenedores del widget NBN23 / tabla de horarios
    '.competition-schedule',
    '.matches-list',
    '.game-row',
    '.schedule-row',
    '[class*="schedule"]',
    '[class*="partido"]',
    '[class*="match"]',
    '[class*="game"]',
    'table',
    // Fallback: cualquier contenido visible
    'main',
    '#app',
    '#root',
  ];

  console.log('⏳ Esperando contenido dinámico...');
  await new Promise(r => setTimeout(r, 3000)); // margen para JS inicial

  const foundSelector = await trySelectors(page, CONTENT_SELECTORS);
  if (!foundSelector) {
    console.error('❌ No se encontró ningún contenedor de partidos.');
    await saveScreenshot(page, 'no_content');
    await browser.close();
    process.exit(1);
  }
  console.log(`  ✅ Contenido encontrado con: ${foundSelector}\n`);

  // ── 2. BUSCAR / FILTRAR POR EQUIPO ─────────────────────────
  // Intentamos encontrar un campo de búsqueda o selector de equipo
  const SEARCH_SELECTORS = [
    'input[placeholder*="equipo" i]',
    'input[placeholder*="buscar" i]',
    'input[placeholder*="club" i]',
    'input[type="search"]',
    'input[type="text"]',
    '[class*="search"] input',
    '[class*="filter"] input',
  ];

  console.log(`🔍 Buscando campo de búsqueda para filtrar por "${TEAM_NAME}"...`);
  const searchSel = await trySelectors(page, SEARCH_SELECTORS);

  if (searchSel) {
    console.log(`  ✅ Campo de búsqueda encontrado: ${searchSel}`);
    await page.click(searchSel);
    await page.type(searchSel, TEAM_NAME, { delay: 80 });
    await new Promise(r => setTimeout(r, 2000)); // esperar filtrado
    console.log(`  ✅ Filtrado por "${TEAM_NAME}"\n`);
  } else {
    console.log('  ⚠️  No se encontró campo de búsqueda — extrayendo todos los partidos y filtrando en memoria.\n');
  }

  // ── 3. EXTRAER DATOS ───────────────────────────────────────
  console.log('📋 Extrayendo datos de partidos...');

  const partidosRaw = await page.evaluate((teamName) => {
    const resultados = [];

    /**
     * FBM / NBN23 puede renderizar los partidos de varias formas:
     * - Filas de tabla  <tr>
     * - Tarjetas  <div class="...game...">
     * - Lista de items
     *
     * Intentamos todas las estructuras posibles.
     */

    // ── Intento A: filas de tabla ────────────────────────────
    const rows = document.querySelectorAll('tr');
    rows.forEach(row => {
      const text = row.innerText || '';
      if (!text.toLowerCase().includes(teamName.toLowerCase())) return;

      const cells = Array.from(row.querySelectorAll('td, th'))
        .map(c => c.innerText.trim())
        .filter(Boolean);

      if (cells.length >= 2) {
        resultados.push({ _source: 'table-row', _cells: cells, _text: text.trim() });
      }
    });

    // ── Intento B: divs / cards con clase que contenga "game", "match", "partido", "schedule" ──
    const cardSelectors = [
      '[class*="game"]',
      '[class*="match"]',
      '[class*="partido"]',
      '[class*="schedule-item"]',
      '[class*="event"]',
    ];

    cardSelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        const text = el.innerText || '';
        if (!text.toLowerCase().includes(teamName.toLowerCase())) return;
        if (resultados.some(r => r._text === text.trim())) return; // deduplicar

        resultados.push({ _source: sel, _text: text.trim() });
      });
    });

    // ── Intento C: cualquier elemento que contenga el nombre del equipo ──
    if (resultados.length === 0) {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_ELEMENT
      );
      while (walker.nextNode()) {
        const el = walker.currentNode;
        const text = el.innerText || '';
        if (
          text.toLowerCase().includes(teamName.toLowerCase()) &&
          el.children.length > 0 &&
          el.children.length < 15 // evitar contenedores enormes
        ) {
          resultados.push({ _source: 'tree-walk', _text: text.trim() });
        }
      }
    }

    return resultados;
  }, TEAM_NAME);

  console.log(`  → ${partidosRaw.length} elementos encontrados con "${TEAM_NAME}"\n`);

  // ── 4. PARSEAR Y NORMALIZAR ────────────────────────────────
  // Intentamos estructurar los datos brutos en un formato limpio.
  // La FBM suele mostrar: Fecha | Hora | Local | Visitante | Pabellón | Competición

  const partidos = partidosRaw
    .map((raw, i) => {
      const text = raw._text || '';
      const cells = raw._cells || [];

      // Extraer fecha (formatos: DD/MM/YYYY, DD-MM-YYYY, D de Mes)
      const fechaMatch = text.match(
        /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})|(\d{1,2}\s+de\s+\w+(\s+de\s+\d{4})?)/i
      );

      // Extraer hora (HH:MM)
      const horaMatch = text.match(/\b(\d{1,2}:\d{2})\b/);

      // Extraer equipos (buscamos patrón "Equipo A - Equipo B" o "Equipo A vs Equipo B")
      const vsMatch = text.match(/(.+?)\s+(?:[-–]|vs\.?)\s+(.+?)(?:\n|$)/i);

      // Si tenemos celdas de tabla, úsalas directamente
      let fecha   = fechaMatch ? fechaMatch[0] : (cells[0] || null);
      let hora    = horaMatch  ? horaMatch[1]  : (cells[1] || null);
      let local   = vsMatch    ? vsMatch[1].trim() : (cells[2] || null);
      let visita  = vsMatch    ? vsMatch[2].trim() : (cells[3] || null);
      let pabellon = cells[4] || null;
      let competicion = cells[5] || null;

      // Si la tabla tiene más estructura, reajustamos
      if (cells.length >= 6) {
        [fecha, hora, local, visita, pabellon, competicion] = cells;
      }

      return {
        id: i + 1,
        fecha:      fecha      || 'Por confirmar',
        hora:       hora       || 'Por confirmar',
        local:      local      || TEAM_NAME,
        visitante:  visita     || 'Por confirmar',
        pabellon:   pabellon   || 'Por confirmar',
        competicion: competicion || 'FBM',
        raw_text:   text.slice(0, 200), // guardamos el texto original para debug
      };
    })
    // Filtramos resultados claramente vacíos o duplicados
    .filter(p => p.raw_text.length > 10)
    .filter((p, i, arr) =>
      arr.findIndex(q => q.raw_text === p.raw_text) === i
    );

  // ── 5. GUARDAR JSON ────────────────────────────────────────
  const output = {
    equipo:       TEAM_NAME,
    fuente:       FBM_URL,
    actualizado:  new Date().toISOString(),
    total:        partidos.length,
    partidos,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');

  console.log('──────────────────────────────────────────');
  if (partidos.length > 0) {
    console.log(`✅ ${partidos.length} partido(s) guardados en: ${OUTPUT_FILE}`);
    partidos.slice(0, 3).forEach(p => {
      console.log(`   ${p.fecha} ${p.hora}  ${p.local} vs ${p.visitante}  [${p.pabellon}]`);
    });
    if (partidos.length > 3) console.log(`   ... y ${partidos.length - 3} más`);
  } else {
    console.log('⚠️  No se encontraron partidos. Revisa debug_*.png si existen.');
    console.log('   Posibles causas:');
    console.log('   - El nombre del equipo no coincide exactamente con el de la FBM');
    console.log('   - La FBM ha cambiado su estructura HTML');
    console.log('   - El equipo aún no tiene partidos publicados para esta jornada');
  }
  console.log('──────────────────────────────────────────');

  await browser.close();
}

main().catch(err => {
  console.error('💥 Error fatal:', err.message);
  process.exit(1);
});
