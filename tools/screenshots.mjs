// Скриншоты для README: npm run screenshots (после npm run build). Сохраняются в docs/screenshots/.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, launch } from '../tests/helpers.mjs';
import * as F from '../tests/doc-fixtures.mjs';

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
  await shot('converter', '/konverter-izobrazhenij/', { element: '#app', prepare: converted });
  await shot('landing-heic', '/heic-v-jpg/');
  await shot('dark', '/konverter-izobrazhenij/', { dark: true });
  await shot('home-sections', '/', { element: '#sections' });
  await shot('popular', '/', { element: '#popular' });
  await shot('mobile', '/', { width: 390, height: 844 });
  // конвертер документов: договор в PDF, отчёт Word и таблица CSV переведены в PDF
  await shot('docs', '/dokumenty/', { element: '#app', prepare: async page => {
    await page.setInputFiles('#file', [
      { name: 'отчёт-за-сентябрь.docx', mimeType: 'application/octet-stream', buffer: F.docx() },
      { name: 'клиенты.csv', mimeType: 'text/csv', buffer: Buffer.from(F.text.csv) },
      { name: 'заметки.md', mimeType: 'text/markdown', buffer: Buffer.from(F.text.md) }
    ]);
    await page.waitForFunction(() => [...document.querySelectorAll('.row')].every(r => r.dataset.status === 'ready'));
    await page.click('#run');
    await page.waitForFunction(() => document.querySelectorAll('.row[data-status="done"]').length === 3, null, { timeout: 60000 });
    await page.waitForTimeout(3500);
  } });
  await shot('docs-hub', '/dokumenty/');
  // «Сжать до N КБ»: тяжёлое фото уложено в 200 КБ
  await shot('target-kb', '/szhat-foto-do-kb/', { element: '#app', prepare: async page => {
    await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 3000; c.height = 2000;
      const x = c.getContext('2d'), img = x.createImageData(3000, 2000);
      let s = 5;
      for (let i = 0; i < img.data.length; i += 4) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        const px = (i / 4) % 3000, py = Math.floor(i / 4 / 3000), n = (s >> 16) & 63;
        img.data[i] = (px / 12 + n) & 255; img.data[i + 1] = (py / 9 + n) & 255; img.data[i + 2] = (180 + n) & 255; img.data[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.95));
      const dt = new DataTransfer();
      dt.items.add(new File([blob], 'фото-для-госуслуг.jpg', { type: 'image/jpeg' }));
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }));
    });
    await page.waitForFunction(() => document.querySelector('.row[data-status="ready"]'));
    await page.click('#run');
    await page.waitForFunction(() => document.querySelector('.row[data-status="done"]'), null, { timeout: 60000 });
    await page.waitForTimeout(3200);
  } });
  // «Объединить PDF»: три файла и стрелки порядка
  await shot('merge', '/obedinit-pdf/', { element: '#app', prepare: async page => {
    await page.setInputFiles('#file', [
      { name: 'договор.pdf', mimeType: 'application/pdf', buffer: F.pdf([['Contract'], ['Page 2'], ['Page 3']]) },
      { name: 'приложение-1.pdf', mimeType: 'application/pdf', buffer: F.pdf([['Appendix 1']]) },
      { name: 'скан-паспорта.pdf', mimeType: 'application/pdf', buffer: F.pdf([['Scan']]) }
    ]);
    await page.waitForFunction(() => [...document.querySelectorAll('.row')].every(r => r.dataset.status === 'ready'));
  } });
} finally {
  await browser.close();
  await server.close();
}
