// Скриншоты для README: npm run screenshots (после npm run build). Сохраняются в docs/screenshots/.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, launch } from '../tests/helpers.mjs';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'screenshots');
await fs.mkdir(OUT, { recursive: true });
const server = await startServer();
const browser = await launch();

async function shot(name, url, { width = 1440, height = 900, dark = false, prepare, element } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light' });
  const page = await context.newPage();
  await page.goto(server.url + url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.row[data-status="ready"]').first().waitFor().catch(() => {});
  if (prepare) await prepare(page);
  const file = path.join(OUT, name + '.png');
  // липкая шапка перекрыла бы верх элемента при прокрутке к нему
  if (element) { await page.addStyleTag({ content: '.site-head{position:static}' }); await page.locator(element).screenshot({ path: file }); }
  else await page.screenshot({ path: file });
  await context.close();
  console.log('✔ ' + name);
}

// Конвертер после работы: несколько файлов, готовые результаты
const converted = async page => {
  await page.evaluate(async () => {
    const make = (w, h, hue) => new Promise(r => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, `hsl(${hue},70%,55%)`); g.addColorStop(1, `hsl(${hue + 60},80%,35%)`);
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      c.toBlob(b => r(b), 'image/png');
    });
    const dt = new DataTransfer();
    dt.items.add(new File([await make(1600, 1067, 190)], 'отпуск-море.png', { type: 'image/png' }));
    dt.items.add(new File([await make(1080, 1350, 320)], 'портрет.png', { type: 'image/png' }));
    dt.items.add(new File([await make(1920, 1280, 30)], 'закат-на-даче.png', { type: 'image/png' }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }));
  });
  await page.waitForFunction(() => document.querySelectorAll('.row[data-status="ready"]').length === 3);
  await page.click('#fmts .fmt[data-id="webp"]');
  await page.click('#run');
  await page.waitForFunction(() => document.querySelectorAll('.row[data-status="done"]').length === 3);
  await page.waitForTimeout(3200); // дождаться, пока исчезнет всплывающее уведомление
};

try {
  await shot('home', '/');
  await shot('converter', '/', { element: '#app', prepare: converted });
  await shot('landing-heic', '/heic-v-jpg/');
  await shot('dark', '/', { dark: true });
  await shot('popular', '/', { element: '#popular' });
  await shot('mobile', '/', { width: 390, height: 844 });
} finally {
  await browser.close();
  await server.close();
}
