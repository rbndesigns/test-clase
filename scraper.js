const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const TEAM_NAME = 'HIGHSTEP ACADEMY';

(async () => {

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

  const page = await browser.newPage();

  let capturedResponses = [];

  page.on('response', async (response) => {

    try {

      const url = response.url();

      if (
        url.includes('api') ||
        url.includes('json') ||
        url.includes('calendario') ||
        url.includes('resultado')
      ) {

        const text = await response.text();

        if (
          text.toLowerCase().includes('highstep') ||
          text.toLowerCase().includes('academy')
        ) {

          capturedResponses.push({
            url,
            text: text.slice(0, 50000)
          });

          console.log('✅ Encontrada respuesta con HIGHSTEP');
        }
      }

    } catch (e) {}

  });

  await page.goto(
    'https://www.fbm.es/es/horarios-y-resultados',
    {
      waitUntil: 'networkidle2',
      timeout: 60000
    }
  );

  await new Promise(r => setTimeout(r, 10000));

  fs.mkdirSync('public', { recursive: true });

  fs.writeFileSync(
    path.join('public', 'responses.json'),
    JSON.stringify(capturedResponses, null, 2)
  );

  console.log(`Respuestas capturadas: ${capturedResponses.length}`);

  await browser.close();

})();
