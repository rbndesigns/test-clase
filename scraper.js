const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const TEAM = 'HIGHSTEP ACADEMY';

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();

  await page.goto(
    'https://www.fbm.es/es/horarios-y-resultados',
    {
      waitUntil: 'networkidle2',
      timeout: 60000
    }
  );

  await delay(5000);

  // ====================================
  // LEER TODOS LOS SELECTS
  // ====================================

  const selectsInfo = await page.evaluate(() => {

    return Array.from(
      document.querySelectorAll('select')
    ).map((s, i) => ({
      index: i,
      options: Array.from(s.options).map(o => ({
        value: o.value,
        text: o.textContent.trim()
      }))
    }));

  });

  console.log(
    'SELECTS:',
    selectsInfo.length
  );

  let partidos = [];

  // ====================================
  // ITERAR SELECTS
  // ====================================

  for (let s = 0; s < selectsInfo.length; s++) {

    const select = selectsInfo[s];

    for (const option of select.options) {

      if (!option.value) continue;

      console.log(
        `Select ${s} -> ${option.text}`
      );

      try {

        await page.select(
          `select:nth-of-type(${s + 1})`,
          option.value
        );

        await delay(3000);

        const tablas = await page.evaluate(() => {

          return Array.from(
            document.querySelectorAll('table')
          ).map(t =>
            t.innerText
          );

        });

        for (const tabla of tablas) {

          if (
            tabla
              .toLowerCase()
              .includes('highstep academy')
          ) {

            console.log(
              'FOUND HIGHSTEP'
            );

            partidos.push(tabla);
          }
        }

      } catch (e) {

        console.log(
          'ERROR SELECT',
          e.message
        );

      }

    }

  }

  fs.mkdirSync('public', {
    recursive: true
  });

  fs.writeFileSync(
    path.join(
      'public',
      'responses.json'
    ),
    JSON.stringify(
      partidos,
      null,
      2
    )
  );

  console.log(
    'PARTIDOS:',
    partidos.length
  );

  await browser.close();

})();
