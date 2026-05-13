const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const TEAM_NAME = 'HIGHSTEP ACADEMY';

(async () => {

  console.log('START');

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

      const headers = response.headers();

      const contentType =
        headers['content-type'] || '';

      if (
        contentType.includes('json') ||
        url.includes('api') ||
        url.includes('json')
      ) {

        const text = await response.text();

        if (
          text.toLowerCase().includes('highstep')
        ) {

          console.log('FOUND HIGHSTEP');

          capturedResponses.push({
            url,
            body: text.slice(0, 20000)
          });
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

  await new Promise(r =>
    setTimeout(r, 10000)
  );

  fs.mkdirSync('public', {
    recursive: true
  });

  fs.writeFileSync(
    path.join(
      'public',
      'responses.json'
    ),
    JSON.stringify(
      capturedResponses,
      null,
      2
    )
  );

  console.log(
    'RESPONSES:',
    capturedResponses.length
  );

  await browser.close();

})();
