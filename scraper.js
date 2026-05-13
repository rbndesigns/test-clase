const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const URL =
  'https://www.fbm.es/resultados-club-20677/highstep-academy';

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {

  console.log('🏀 FBM Club Scraper');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();

  await page.goto(URL, {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  await delay(5000);

  // ===================================
  // IR A "PRÓXIMOS PARTIDOS"
  // ===================================

  const tabs = await page.$$('a, button');

  for (const tab of tabs) {

    const text = await page.evaluate(
      el => el.innerText,
      tab
    );

    if (!text) continue;

    if (
      text
        .trim()
        .toLowerCase()
        .includes('próximos partidos')
    ) {

      await tab.click();

      console.log('📅 Tab abierta');

      break;
    }
  }

  await delay(3000);

  // ===================================
  // EXTRAER TABLA
  // ===================================

  const partidos = await page.evaluate(() => {

    const rows = Array.from(
      document.querySelectorAll('table tr')
    );

    return rows
      .map(row => {

        const cols = Array.from(
          row.querySelectorAll('td')
        ).map(td =>
          td.innerText.trim()
        );

        if (cols.length < 4) {
          return null;
        }

        return {
          categoria: cols[0] || '',
          encuentro: cols[1] || '',
          fecha: cols[2] || '',
          campo: cols[3] || ''
        };

      })
      .filter(Boolean);

  });

  console.log(
    'PARTIDOS:',
    partidos.length
  );

  // ===================================
  // GUARDAR JSON
  // ===================================

  fs.mkdirSync('public', {
    recursive: true
  });

  fs.writeFileSync(
    path.join(
      'public',
      'partidos.json'
    ),
    JSON.stringify(
      {
        actualizado:
          new Date().toISOString(),
        total:
          partidos.length,
        partidos
      },
      null,
      2
    )
  );

  console.log(
    '✅ partidos.json generado'
  );

  await browser.close();

})();
