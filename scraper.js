/**
 * HA Basket — FBM Scraper v3
 */

const puppeteer = require('puppeteer');
const fs        = require('fs');
const path      = require('path');

const TEAM_NAME   = 'HIGHSTEP ACADEMY';
const FBM_URL     = 'https://www.fbm.es/es/horarios-y-resultados';
const OUTPUT_DIR  = path.join(__dirname, 'public');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'partidos.json');

async function main() {
  console.log('🏀 HA Basket Scraper v3 — iniciando...\n');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1440, height: 900 });

  console.log(`📡 Cargando: ${FBM_URL}`);
  await page.goto(FBM_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  // 1. ACEPTAR COOKIES
  try {
    const cookieBtn = await page.$('button#aceptarCookies, button.aceptar, a.aceptar, input[value="Aceptar"], button[contains(text,"Aceptar")]');
    if (cookieBtn) {
      await cookieBtn.click();
      console.log('🍪 Cookies aceptadas');
    } else {
      // Buscar por texto
      const btns = await page.$$('button, a, input[type="button"]');
      for (const btn of btns) {
        const txt = await page.evaluate(el => el.innerText || el.value || '', btn);
        if (txt.trim().toLowerCase() === 'aceptar') {
          await btn.click();
          console.log('🍪 Cookies aceptadas (por texto)');
          break;
        }
      }
    }
  } catch(e) {
    console.log('⚠️  No se encontró banner de cookies o ya estaba aceptado');
  }
  await new Promise(r => setTimeout(r, 1500));

  // 2. IR A LA PESTAÑA CALENDARIO
  console.log('📅 Buscando pestaña CALENDARIO...');
  try {
    const tabs = await page.$$('a, button, li, span');
    for (const tab of tabs) {
      const txt = await page.evaluate(el => (el.innerText || '').trim().toUpperCase(), tab);
      if (txt === 'CALENDARIO') {
        await tab.click();
        console.log('✅ Pestaña CALENDARIO activada');
        await new Promise(r => setTimeout(r, 2000));
        break;
      }
    }
  } catch(e) {
    console.log('⚠️  No se pudo hacer clic en CALENDARIO:', e.message);
  }

  await page.screenshot({ path: path.join(__dirname, 'debug_calendario.png') });
  console.log('📸 debug_calendario.png guardado');

  // 3. OBTENER TODAS LAS OPCIONES DEL DROPDOWN DE CATEGORÍA
  console.log('\n🔎 Buscando categorías disponibles...');
  const categorias = await page.evaluate(() => {
    const selects = document.querySelectorAll('select');
    for (const sel of selects) {
      const options = Array.from(sel.options).map(o => ({ value: o.value, text: o.text.trim() }));
      // El selector de categoría suele tener más de 5 opciones
      if (options.length > 4) return { id: sel.id, name: sel.name, options };
    }
    return null;
  });

  if (categorias) {
    console.log(`  → ${categorias.options.length} categorías encontradas`);
  } else {
    console.log('  → No se encontró dropdown de categorías');
  }

  // 4. ITERAR CATEGORÍAS Y BUSCAR EL EQUIPO
  const partidos = [];
  const categoriasAProbar = categorias ? categorias.options : [{ value: '', text: 'default' }];

  for (const cat of categoriasAProbar) {
    if (!cat.value) continue;

    // Seleccionar categoría
    if (categorias) {
      await page.evaluate((selName, val) => {
        const sel = document.querySelector(`select[id="${selName}"], select[name="${selName}"]`);
        if (sel) { sel.value = val; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      }, categorias.id || categorias.name, cat.value);
      await new Promise(r => setTimeout(r, 1500));
    }

    // Extraer filas de la tabla
    const filas = await page.evaluate((teamName) => {
      const rows = Array.from(document.querySelectorAll('tr'));
      return rows
        .filter(r => (r.innerText || '').toLowerCase().includes(teamName.toLowerCase()))
        .map(r => {
          const cells = Array.from(r.querySelectorAll('td')).map(c => c.innerText.trim());
          return { text: r.innerText.trim(), cells };
        });
    }, TEAM_NAME);

    if (filas.length > 0) {
      console.log(`  ✅ "${cat.text}" → ${filas.length} fila(s) con ${TEAM_NAME}`);
      filas.forEach(fila => {
        const cells = fila.cells;
        const fechaMatch = fila.text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
        const horaMatch  = fila.text.match(/\b(\d{1,2}:\d{2})\b/);
        partidos.push({
          id:          partidos.length + 1,
          fecha:       cells[0] || (fechaMatch ? fechaMatch[0] : 'Por confirmar'),
          hora:        cells[1] || (horaMatch  ? horaMatch[1]  : 'Por confirmar'),
          local:       cells[2] || 'Por confirmar',
          visitante:   cells
