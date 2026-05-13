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

    await new Promise(r => setTimeout(r, 5000));

    // =========================
    // PARTIDOS
    // =========================

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

    // =========================
    // CLASIFICACIONES
    // =========================

    const clasificaciones = await page.evaluate(() => {

      const resultado = {};

      const bloques =
        document.querySelectorAll('h3');

      bloques.forEach(bloque => {

        const categoria =
          bloque.innerText.trim();

        const tabla =
          bloque.parentElement.querySelector('table');

        if (!tabla) return;

        const filas =
          tabla.querySelectorAll('tbody tr');

        const equipos = [];

        filas.forEach(fila => {

          const td = fila.querySelectorAll('td');

          if (td.length >= 7) {

            equipos.push({
              pos: td[0]?.innerText.trim(),
              nombre: td[1]?.innerText.trim(),
              puntos: td[6]?.innerText.trim()
            });

          }

        });

        if (equipos.length > 0) {
          resultado[categoria] = equipos;
        }

      });

      return resultado;

    });

    // =========================
    // PUBLIC
    // =========================

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

    fs.writeFileSync(
      'public/clasificaciones.json',
      JSON.stringify(
        clasificaciones,
        null,
        2
      )
    );

    console.log('✅ partidos.json generado');
    console.log('✅ clasificaciones.json generado');

    await browser.close();

  } catch (err) {

    console.error(err);

    process.exit(1);

  }

})();
