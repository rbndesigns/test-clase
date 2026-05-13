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

  await new Promise(r => setTimeout(r, 5000));

  // =====================================
  // CLICK EN PROXIMOS PARTIDOS
  // =====================================

  const enlaces = await page.$$('a');

  for (const enlace of enlaces) {

    const texto = await page.evaluate(
      el => el.innerText,
      enlace
    );

    if (
      texto &&
      texto.toLowerCase().includes('próximos partidos')
    ) {

      await enlace.click();

      break;
    }
  }

  await new Promise(r => setTimeout(r, 3000));

  // =====================================
  // EXTRAER PARTIDOS
  // =====================================

  const partidos = await page.evaluate(() => {

    const filas = Array.from(
      document.querySelectorAll('table tr')
    );

    const datos = [];

    filas.forEach(fila => {

      const celdas = fila.querySelectorAll('td');

      if (celdas.length >= 4) {
})();
