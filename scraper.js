const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();

  await page.goto(
    'https://www.fbm.es/resultados-club-20677/highstep-academy',
    {
      waitUntil: 'networkidle2',
      timeout: 0
    }
  );

  // ========================================
  // EXTRAER PRÓXIMOS PARTIDOS
  // ========================================

  const partidos = await page.evaluate(() => {

    const filas =
      document.querySelectorAll('table tbody tr');

    const data = [];

    filas.forEach(fila => {

      const td = fila.querySelectorAll('td');

      if (td.length >= 4) {

        data.push({
          categoria: td[0]?.innerText.trim(),
          encuentro: td[1]?.innerText.trim(),
          fecha: td[2]?.innerText.trim(),
          campo: td[3]?.innerText.trim()
        });

      }

    });

    return data;

  });

  fs.writeFileSync(
    './partidos.json',
    JSON.stringify(partidos, null, 2)
  );

  // ========================================
  // IR A RESULTADOS Y CLASIFICACIONES
  // ========================================

  await page.click('a[href="#tab2"]');

  await new Promise(resolve => setTimeout(resolve, 4000));

  // ========================================
  // EXTRAER CLASIFICACIONES
  // ========================================

  const clasificaciones = await page.evaluate(() => {

    const resultado = {};

    const bloques =
      document.querySelectorAll('.contenedor_clasificacion');

    bloques.forEach(bloque => {

      const titulo =
        bloque.querySelector('h4');

      if (!titulo) return;

      const categoria =
        titulo.innerText
          .split('-')[0]
          .trim();

      const filas =
        bloque.querySelectorAll('table tbody tr');

      const equipos = [];

      filas.forEach(fila => {

        const td = fila.querySelectorAll('td');

        if (td.length >= 6) {

          equipos.push({
            pos: td[0]?.innerText.trim(),
            nombre: td[1]?.innerText.trim(),
            puntos: td[5]?.innerText.trim()
          });

        }

      });

      if (equipos.length > 0) {

        resultado[categoria] = equipos;

      }

    });

    return resultado;

  });

  fs.writeFileSync(
    './clasificaciones.json',
    JSON.stringify(clasificaciones, null, 2)
  );

  console.log('✅ partidos.json generado');
  console.log('✅ clasificaciones.json generado');

  await browser.close();

})();
