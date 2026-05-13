/**
 * HA Basket — FBM Scraper
 */

const puppeteer = require('puppeteer');
const fs        = require('fs');
const path      = require('path');

const TEAM_NAME   = 'HIGHSTEP ACADEMY';
const FBM_URL     = 'https://www.fbm.es/es/horarios-y-resultados';
const OUTPUT_DIR  = path.join(__dirname, 'public');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'partidos.json');

async function main() {
  console.log('🏀 HA Basket Scraper — iniciando...\n');
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

  console.log('⏳ Esperando contenido dinámico...');
  await new Promise(r => setTimeout(r, 4000));

  await page.screenshot({ path: path.join(__dirname, 'debug_loaded.png'), fullPage: false });
  console.log('📸 Captura guardada: debug_loaded.png');

  // Rellenar el campo de búsqueda sin click (evita el error "not clickable")
  const searchResult = await page.evaluate((teamName) => {
    const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="search"], input:not([type])'));
    for (const input of inputs) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeInputValueSetter.call(input, teamName);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return `Rellenado input: ${input.className || input.id || '(sin clase)'}`;
    }
    return 'No se encontró campo de búsqueda';
  }, TEAM_NAME);

  console.log(`🔍 ${searchResult}`);
  await new Promise(r => setTimeout(r, 3000));

  await page.screenshot({ path: path.join(__dirname, 'debug_filtered.png'), fullPage: false });
  console.log('📸 Captura guardada: debug_filtered.png');

  console.log('📋 Extrayendo datos...');

  const todosLosTextos = await page.evaluate(() => {
    const resultados = [];

    document.querySelectorAll('[class*="partido"]').forEach(el => {
      if (el.children.length > 0 && el.children.length < 20)
        resultados.push({ selector: 'partido', text: (el.innerText || '').trim() });
    });

    document.querySelectorAll('tr').forEach(row => {
      const cells = Array.from(row.querySelectorAll('td')).map(c => (c.innerText || '').trim());
      if (cells.length >= 3)
        resultados.push({ selector: 'tr', text: row.innerText.trim(), cells });
    });

    ['match', 'game', 'event', 'schedule', 'encuentro', 'jornada'].forEach(word => {
      document.querySelectorAll(`[class*="${word}"]`).forEach(el => {
        const text = (el.innerText || '').trim();
        if (text.length > 10 && el.children.length > 0 && el.children.length < 20)
          resultados.push({ selector: word, text });
      });
    });

    return resultados;
  });

  console.log(`  → ${todosLosTextos.length} elementos extraídos en total`);

  const coincidencias = todosLosTextos.filter(item =>
    item.text.toLowerCase().includes(TEAM_NAME.toLowerCase())
  );

  console.log(`  → ${coincidencias.length} elementos contienen "${TEAM_NAME}"`);

  const partidos = coincidencias
    .map((item, i) => {
      const text  = item.text;
      const cells = item.cells || [];
      const fechaMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
      const horaMatch  = text.match(/\b(\d{1,2}:\d{2})\b/);
      const vsMatch    = text.match(/(.+?)\s+(?:[-–]|vs\.?)\s+(.+?)(?:\n|$)/im);
      return {
        id:          i + 1,
        fecha:       fechaMatch ? fechaMatch[0] : (cells[0] || 'Por confirmar'),
        hora:        horaMatch  ? horaMatch[1]  : (cells[1] || 'Por confirmar'),
        local:       vsMatch    ? vsMatch[1].trim() : (cells[2] || TEAM_NAME),
        visitante:   vsMatch    ? vsMatch[2].trim() : (cells[3] || 'Por confirmar'),
        pabellon:    cells[4] || 'Por confirmar',
        competicion: cells[5] || 'FBM',
        raw_text:    text.slice(0, 300),
      };
    })
    .filter((p, i, arr) => arr.findIndex(q => q.raw_text === p.raw_text) === i);

  const output = {
    equipo:      TEAM_NAME,
    fuente:      FBM_URL,
    actualizado: new Date().toISOString(),
    total:       partidos.length,
    partidos,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');

  console.log('\n──────────────────────────────────────────');
  if (partidos.length > 0) {
    console.log(`✅ ${partidos.length} partido(s) guardados en partidos.json`);
    partidos.slice(0, 3).forEach(p =>
      console.log(`   ${p.fecha} ${p.hora}  ${p.local} vs ${p.visitante}`)
    );
  } else {
    console.log('⚠️  0 partidos encontrados.');
    console.log('   Revisa debug_loaded.png y debug_filtered.png en los Artifacts.');
  }
  console.log('──────────────────────────────────────────');

  await browser.close();
}

main().catch(err => {
  console.error('💥 Error fatal:', err.message);
  process.exit(1);
});
