const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const TEAM_NAME = 'HIGHSTEP ACADEMY';

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {

  console.log('🏀 Iniciando scraper FBM...');

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  });

  const page = await browser.newPage();

  await page.setViewport({
    width: 1440,
    height: 1000
  });

  await page.goto(
    'https://www.fbm.es/es/horarios-y-resultados',
    {
      waitUntil: 'networkidle2',
      timeout: 60000
    }
  );

  console.log('✅ Página cargada');

  await delay(4000);

  // =========================
  // COOKIES
  // =========================

  try {

    const botones = await page.$$('button, a');

    for (const boton of botones) {

      const texto = await page.evaluate(
        el => el.innerText,
        boton
      );

      if (!texto) continue;

      const limpio = texto.trim().toLowerCase();

      if (
        limpio.includes('aceptar') ||
        limpio.includes('accept')
      ) {

        await boton.click();

        console.log('🍪 Cookies aceptadas');

        break;
      }
    }

  } catch (e) {

    console.log('⚠️ Cookies no encontradas');

  }

  await delay(3000);

  // =========================
  // CALENDARIO
  // =========================

  try {

    const elementos = await page.$$('a, button, span, div');

    for (const el of elementos) {

      const texto = await page.evaluate(
        e => e.innerText,
        el
      );

      if (!texto) continue;

      if (
        texto.trim().toUpperCase() === 'CALENDARIO'
      ) {

        await el.click();

        console.log('📅 CALENDARIO abierto');

        break;
      }
    }

  } catch (e) {

    console.log('⚠️ No se pudo abrir CALENDARIO');

  }

  await delay(5000);

  // =========================
  // SCREENSHOT DEBUG
  // =========================

  await page.screenshot({
    path: 'debug.png',
    fullPage: true
  });

  console.log('📸 Screenshot guardado');

  // =========================
  // EXTRAER TABLA
  // =========================

  const filas = await page.evaluate(() => {

    const rows = Array.from(
      document.querySelectorAll('tr')
    );

    return rows.map(row => {

      const cells = Array.from(
        row.querySelectorAll('td')
      ).map(td => td.innerText.trim());

      return {
        text: row.innerText.trim(),
        cells
      };

    });

  });

  console.log(`📋 Filas encontradas: ${filas.length}`);

  // =========================
  // FILTRAR EQUIPO
  // =========================

  const partidos = filas
    .filter(f =>
      f.text.toLowerCase().includes('highstep academy')
    )
    .map((f, index) => ({

      id: index + 1,

      fecha:
        f.cells[0] || 'Por confirmar',

      hora:
        f.cells[1] || 'Por confirmar',

      local:
        f.cells[2] || 'Por confirmar',

      visitante:
        f.cells[3] || 'Por confirmar',

      pabellon:
        f.cells[4] || 'Por confirmar',

      raw:
        f.text

    }));

  console.log(`🏀 Partidos encontrados: ${partidos.length}`);

  // =========================
  // GUARDAR JSON
  // =========================

  const output = {
    equipo: TEAM_NAME,
    actualizado: new Date().toISOString(),
    total: partidos.length,
    partidos
  };

  const outputDir = path.join(__dirname, 'public');

  fs.mkdirSync(outputDir, {
    recursive: true
  });

  fs.writeFileSync(
    path.join(outputDir, 'partidos.json'),
    JSON.stringify(output, null, 2)
  );

  console.log('✅ partidos.json guardado');

  await browser.close();

})();
