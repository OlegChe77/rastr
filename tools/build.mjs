// Сборка сайта: src/ → dist/. Запуск: npm run build
// dist/ — готовый сайт, его целиком загружают на хостинг.
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import config from '../site.config.mjs';
import { getPages } from '../src/pages.mjs';
import { render } from '../src/layout.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const exists = p => fs.access(p).then(() => true, () => false);

const site = { ...config, url: config.url.replace(/\/+$/, ''), date: new Date().toISOString().slice(0, 10) };

// Метаданные форматов берём из самого плагина, чтобы таблицы на сайте не расходились с кодом
async function loadFormats() {
  const code = await fs.readFile(path.join(SRC, 'assets', 'rastr-convert.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(code, sandbox);
  return sandbox.window.RastrConvert.formats().map(f => ({
    id: f.id, label: f.label, ext: f.ext, mime: f.mime, alpha: f.alpha, lossy: f.lossy, note: f.note, use: f.use, options: f.options
  }));
}

async function hashed(name) {
  const buf = await fs.readFile(path.join(SRC, 'assets', name));
  return `/assets/${name}?v=${crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8)}`;
}

async function build() {
  const formats = await loadFormats();
  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DIST, { recursive: true });
  await fs.cp(path.join(SRC, 'assets'), path.join(DIST, 'assets'), { recursive: true });
  // Файлы, которые должны лежать в корне сайта как есть: подтверждения Яндекс Вебмастера, Google и т. п.
  if (await exists(path.join(SRC, 'static'))) await fs.cp(path.join(SRC, 'static'), DIST, { recursive: true });

  const assets = {};
  for (const n of ['site.css', 'app.js', 'rastr-convert.js', 'counter.js']) assets[n] = await hashed(n);

  // Браузеры и поисковики ищут эти иконки в корне сайта
  for (const [from, to] of [['img/favicon.ico', 'favicon.ico'], ['img/apple-touch-icon.png', 'apple-touch-icon.png']]) {
    const src = path.join(SRC, 'assets', from);
    if (await exists(src)) await fs.copyFile(src, path.join(DIST, to));
    else console.warn('! нет ' + from + ' — запустите npm run icons');
  }

  const pages = getPages(site, formats);
  for (const p of pages) {
    const og = path.join(SRC, 'assets', 'og', p.ogKey + '.png');
    p.ogImage = (await exists(og)) ? `/assets/og/${p.ogKey}.png` : '/assets/og/home.png';
    const out = path.join(DIST, p.file);
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, render(p, site, assets));
  }

  const indexable = pages.filter(p => !p.noindex);
  await fs.writeFile(path.join(DIST, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexable.map(p => `  <url><loc>${site.url}${p.path}</loc><lastmod>${site.date}</lastmod><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`).join('\n')}
</urlset>
`);

  await fs.writeFile(path.join(DIST, 'robots.txt'),
    `User-agent: *
Allow: /
Disallow: /404.html

Sitemap: ${site.url}/sitemap.xml
`);

  await fs.writeFile(path.join(DIST, 'site.webmanifest'), JSON.stringify({
    name: 'Растр — конвертер изображений',
    short_name: 'Растр',
    description: 'Конвертер изображений, который работает прямо в браузере',
    lang: 'ru',
    start_url: '/',
    display: 'standalone',
    background_color: '#F6F7FA',
    theme_color: '#0F1320',
    icons: [
      { src: '/assets/img/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/assets/img/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/assets/img/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/assets/favicon.svg', sizes: 'any', type: 'image/svg+xml' }
    ]
  }, null, 2));

  console.log(`Готово: ${pages.length} страниц в dist/ (в sitemap: ${indexable.length})`);
  if (/example\.com/.test(site.url)) console.warn('! Адрес сайта не задан: укажите его в site.config.mjs (url) и соберите заново.');
  return { pages, site };
}

export default build;
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await build();
