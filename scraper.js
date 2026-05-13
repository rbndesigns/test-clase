const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  await page.goto(
    'https://www.fbm.es/resultados-club-20677/highstep-academy',
    {
      waitUntil: 'networkidle2',
      timeout: 0
    }
  );

  // =========================
  // PARTIDOS
  // =========================

  await page.waitForSelector('.list-group-item');

  const partidos = await page.evaluate(() => {
    const items = document.querySelectorAll('.list-group-item');

    return Array.from(items).map(item => {
      const textos = item.innerText
        .split('\n')
        .map(t => t.trim())
        .filter(Boolean);

      return {
        categoria: textos[0] || '',
        encuentro: textos[1] || '',
        fecha: textos[2] || '',
        campo: textos.slice(3).join(' ')
      };
    });
  });

  fs.writeFileSync(
    'partidos.json',
    JSON.stringify(
      {
        actualizado: new Date().toISOString(),
        total: partidos.length,
        partidos
      },
      null,
      2
    )
  );

  console.log('✅ partidos.json generado');

  // =========================
  // CLASIFICACIONES
  // =========================

  const resultado = {};

  const bloques = await page.$$('.panel.panel-default');

  for (const bloque of bloques) {
    try {
      const tituloHandle = await bloque.$('h4');

      if (!tituloHandle) continue;

      const titulo = await page.evaluate(
        el => el.innerText,
        tituloHandle
      );

      if (!titulo) continue;

      const categoria = titulo
        .replace(/\n/g, ' ')
        .trim();

      const tablas = await bloque.$$('table');

      if (tablas.length < 2) continue;

      const clasificacion = tablas[1];

      const equipos = await clasificacion.$$eval(
        'tbody tr',
        rows =>
          rows.map(row => {
            const cols = row.querySelectorAll('td');

            return {
              pos: cols[0]?.innerText.trim() || '',
              nombre: cols[1]?.innerText.trim() || '',
              puntos: cols[6]?.innerText.trim() || ''
            };
          })
      );

      resultado[categoria] = equipos;

      console.log('✅ Clasificación:', categoria);

    } catch (e) {
      console.log('❌ Error en bloque');
    }
  }

  fs.writeFileSync(
    'clasificaciones.json',
    JSON.stringify(resultado, null, 2)
  );

  console.log('✅ clasificaciones.json generado');

  await browser.close();
})();
