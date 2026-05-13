const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {

  try {

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

    // Espera simple en vez de waitForSelector
    await new Promise(r => setTimeout(r, 5000));

    const partidos = await page.evaluate(() => {

      const filas = document.querySelectorAll('table tr');

      const datos = [];

      filas.forEach(fila => {

        const celdas = fila.querySelectorAll('td');

        if (celdas.length >= 4) {

          const categoria =
            celdas[0]?.innerText.trim();

          const encuentro =
            celdas[1]?.innerText.trim();

          const fecha =
            celdas[2]?.innerText.trim();

          const campo =
            celdas[3]?.innerText.trim();

          // Solo filas reales
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

    if (!fs.existsSync('public')) {
      fs.mkdirSync('public');
    }

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

    console.log(
      `✅ ${partidos.length} partidos guardados`
    );

    await browser.close();

  } catch (err) {

    console.error(err);

    process.exit(1);

  }

})();
