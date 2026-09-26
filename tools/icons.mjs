// Генерирует иконки и картинки-превью для соцсетей из favicon.svg.
// Запуск: npm run icons (нужен Chrome или Edge). Результат лежит в src/assets/img и src/assets/og.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../tests/helpers.mjs';
import { landings } from '../src/content/landings.mjs';
import { documents } from '../src/content/documents.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'src', 'assets');
const IMG = path.join(ASSETS, 'img');
const OG = path.join(ASSETS, 'og');
await fs.mkdir(IMG, { recursive: true });
await fs.mkdir(OG, { recursive: true });

const svg = await fs.readFile(path.join(ASSETS, 'favicon.svg'), 'utf8');
const browser = await launch();
const page = await browser.newPage();
await page.setContent('<!doctype html><body></body>');
await page.addScriptTag({ path: path.join(ASSETS, 'rastr-convert.js') });

// Растровые иконки и ICO рисуем в браузере, ICO собирает наш же плагин
const out = await page.evaluate(async svgText => {
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
  await img.decode();
  const draw = (size, { bg, scale = 1 } = {}) => {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
    if (bg) { x.fillStyle = bg; x.fillRect(0, 0, size, size); }
    const s = size * scale, o = (size - s) / 2;
    x.drawImage(img, o, o, s, s);
    return c;
  };
  const b64 = async blob => {
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const png = c => new Promise(r => c.toBlob(r, 'image/png')).then(b64);
  const R = window.RastrConvert;
  return {
    'favicon.ico': await b64(await R.encode(draw(256), 'ico', { icoSizes: [16, 32, 48] })),
    'apple-touch-icon.png': await png(draw(180, { bg: '#0F1320' })),
    'icon-192.png': await png(draw(192)),
    'icon-512.png': await png(draw(512)),
    // для «маскируемой» иконки Android важна безопасная зона: знак в центре, фон до краёв
    'icon-maskable-512.png': await png(draw(512, { bg: '#0F1320', scale: 0.72 }))
  };
}, svg);
for (const [name, data] of Object.entries(out)) await fs.writeFile(path.join(IMG, name), Buffer.from(data, 'base64'));
console.log('Иконки: ' + Object.keys(out).join(', '));

// Превью для соцсетей и мессенджеров, 1200×630
const cards = [
  { key: 'home', title: 'Конвертер картинок и документов', sub: 'Прямо в браузере · бесплатно · без загрузки на сервер' },
  { key: 'konverter-izobrazhenij', title: 'Конвертер изображений онлайн', sub: '14 форматов · прямо в браузере · бесплатно' },
  { key: 'formaty', title: 'Форматы изображений', sub: 'PNG, JPG, WEBP, AVIF, HEIC и другие' },
  { key: 'dokumenty', title: 'Конвертер документов', sub: 'PDF · Word · Excel · CSV · Markdown' },
  { key: 'instrumenty', title: 'Инструменты для фото', sub: 'Сжать · Сжать до N КБ · Изменить размер' },
  { key: 'instrukciya', title: 'Как конвертировать изображения', sub: 'Инструкция к Растру' },
  ...landings.concat(documents).map(l => ({ key: l.slug, title: l.card[1] ? `${l.card[0]} <b>→</b> ${l.card[1]}` : l.card[0], sub: l.card[2] + ' · онлайн, бесплатно', big: !!l.card[1] }))
];
await page.setViewportSize({ width: 1200, height: 630 });
for (const c of cards) {
  await page.setContent(`<!doctype html><html><head>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Unbounded:wght@700;800&family=Onest:wght@500&display=swap">
<style>
  body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #0F1320; color: #F2F4F8; font-family: Onest, sans-serif; position: relative; }
  .glow { position: absolute; inset: 0; background:
    radial-gradient(30% 45% at 12% 20%, rgba(31,184,224,.45), transparent 70%),
    radial-gradient(30% 45% at 88% 15%, rgba(255,61,139,.40), transparent 70%),
    radial-gradient(34% 50% at 75% 105%, rgba(255,194,61,.35), transparent 70%); filter: blur(10px); }
  .in { position: absolute; inset: 64px 72px; display: flex; flex-direction: column; justify-content: space-between; }
  .logo { display: flex; align-items: center; gap: 18px; font: 800 38px Unbounded, sans-serif; letter-spacing: -1px; }
  .logo svg { width: 64px; height: 64px; }
  h1 { font: 800 ${c.big ? 124 : 76}px/1.05 Unbounded, sans-serif; letter-spacing: -3px; margin: 0; max-width: 1000px; }
  h1 b { color: #FF3D8B; }
  p { font-size: 34px; margin: 18px 0 0; color: #B9C0D0; }
</style></head><body><div class="glow"></div><div class="in">
  <div class="logo">${svg.replace('<svg ', '<svg aria-hidden="true" ')}Растр</div>
  <div><h1>${c.title}</h1><p>${c.sub}</p></div>
</div></body></html>`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(OG, c.key + '.png') });
}
console.log('Превью для соцсетей: ' + cards.length);
await browser.close();
