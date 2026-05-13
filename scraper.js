const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {

  const browser = await puppeteer.launch({
    headless: true,
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

  // Esperar a que cargue la tabla
  await page.waitForSelector('.tabla_resultados');

  const partidos = await page.evaluate(() => {

    const filas = document.querySelectorAll(
      '.tabla_resultados tbody tr'
    );

    const datos = [];

    filas.forEach(fila => {

      const celdas = fila.querySelectorAll('td');

      // Solo filas válidas
      if (celdas.length >= 4) {

        const categoria = celdas[0]?.innerText.trim();
        const encuentro = celdas[1]?.innerText.trim();
        const fecha = celdas[2]?.innerText.trim();
        const campo = celdas[3]?.innerText.trim();

        // Filtrar basura
        if (
          categoria &&
          encuentro &&
          fecha.includes('/') &&
          campo
        ) {

          datos.push({
            categoria,
            encuentro,
            fecha,
            campo
          });

        }

      }

    });

    return datos;

  });

  // Crear carpeta public si no existe
  if (!fs.existsSync('public')) {
    fs.mkdirSync('public');
  }

  // Guardar JSON
  fs.writeFileSync(
    'public/partidos.json',
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

  console.log(`✅ ${partidos.length} partidos guardados`);

  await browser.close();

})();
