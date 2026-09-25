// SEO-проверки собранного сайта: метатеги, разметка, ссылки, sitemap, robots, иконки,
// а также что каждая посадочная страница открывает конвертер с нужными настройками.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import config from '../site.config.mjs';
import { startServer, launch, ROOT } from './helpers.mjs';
import { landings } from '../src/content/landings.mjs';

const SITE = config.url.replace(/\/+$/, '');
let server, browser, pages;

const read = async p => fs.readFile(path.join(ROOT, p.endsWith('/') ? p + 'index.html' : p), 'utf8');
const attr = (html, re) => (html.match(re) || [])[1];
const meta = (html, name) => attr(html, new RegExp(`<meta (?:name|property)="${name}" content="([^"]*)"`));
const text = html => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();

before(async () => {
  const sitemap = await fs.readFile(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].slice(SITE.length));
  pages = await Promise.all(paths.map(async p => ({ path: p, html: await read(p) })));
  server = await startServer();
  browser = await launch();
});
after(async () => { await browser?.close(); await server?.close(); });

test('sitemap.xml перечисляет все страницы сайта, кроме 404', async () => {
  const files = [];
  const walk = async dir => {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { if (e.name !== 'assets') await walk(path.join(dir, e.name)); }
      else if (e.name.endsWith('.html')) files.push(path.relative(ROOT, path.join(dir, e.name)).replace(/\\/g, '/'));
    }
  };
  await walk(ROOT);
  const expected = files.filter(f => f !== '404.html').map(f => '/' + f.replace(/index\.html$/, '')).sort();
  assert.deepEqual(pages.map(p => p.path).sort(), expected);
  assert.ok(pages.length >= 20, 'страниц в sitemap: ' + pages.length);
});

test('title и description уникальны, нужной длины и содержат ключевые слова', () => {
  const titles = new Set(), descs = new Set(), problems = [];
  for (const { path: p, html } of pages) {
    const title = attr(html, /<title>([^<]*)<\/title>/);
    const desc = meta(html, 'description');
    if (!title || title.length < 15 || title.length > 70) problems.push(`${p}: длина title ${title?.length}`);
    if (!desc || desc.length < 70 || desc.length > 170) problems.push(`${p}: длина description ${desc?.length}`);
    if (titles.has(title)) problems.push(`${p}: title повторяется`);
    if (descs.has(desc)) problems.push(`${p}: description повторяется`);
    titles.add(title); descs.add(desc);
  }
  for (const l of landings) {
    const html = pages.find(p => p.path === `/${l.slug}/`).html;
    const main = l.keywords.split(',')[0].trim().toLowerCase();
    const h1 = attr(html, /<h1[^>]*>([\s\S]*?)<\/h1>/).toLowerCase();
    const title = attr(html, /<title>([^<]*)<\/title>/).toLowerCase();
    // главный запрос страницы должен быть в title, а его слова — в H1
    if (!title.includes(main)) problems.push(`/${l.slug}/: главного запроса «${main}» нет в title`);
    for (const w of main.split(' ').filter(w => w.length > 2)) if (!h1.includes(w)) problems.push(`/${l.slug}/: слова «${w}» нет в H1`);
  }
  assert.deepEqual(problems, []);
});

test('на каждой странице один H1, canonical, lang, Open Graph и разметка schema.org', async () => {
  const problems = [];
  for (const { path: p, html } of pages) {
    const at = s => problems.push(`${p}: ${s}`);
    if ((html.match(/<h1[\s>]/g) || []).length !== 1) at('H1 должен быть ровно один');
    if (!/<html lang="ru">/.test(html)) at('нет lang="ru"');
    if (attr(html, /<link rel="canonical" href="([^"]+)"/) !== SITE + p) at('canonical не совпадает с адресом');
    if (!/<meta name="robots" content="index, follow/.test(html)) at('страница закрыта от индексации');
    for (const og of ['og:title', 'og:description', 'og:url', 'og:image', 'og:type', 'og:locale']) if (!meta(html, og)) at('нет ' + og);
    const ogImg = meta(html, 'og:image') || '';
    try { await fs.access(path.join(ROOT, ogImg.slice(SITE.length))); } catch { at('нет файла превью ' + ogImg); }
    const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
    if (!ld.length) at('нет JSON-LD');
    const types = ld.map(x => x['@type']);
    if (p !== '/' && !types.includes('BreadcrumbList')) at('нет BreadcrumbList');
    if (p !== '/' && !/<nav class="wrap crumbs"/.test(html)) at('нет видимых хлебных крошек');
    for (const x of ld) if (x['@type'] === 'BreadcrumbList') {
      if (x.itemListElement.at(-1).item !== SITE + p) at('последняя крошка не ведёт на саму страницу');
    }
    for (const [img] of html.matchAll(/<img\b[^>]*>/g)) if (!/\salt="/.test(img)) at('картинка без alt');
  }
  assert.deepEqual(problems, []);
});

test('посадочные страницы: WebApplication, FAQPage, достаточно уникального текста', () => {
  const problems = [], leads = new Set();
  for (const l of landings) {
    const html = pages.find(p => p.path === `/${l.slug}/`).html;
    const types = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1])['@type']);
    for (const t of ['WebApplication', 'FAQPage', 'BreadcrumbList']) if (!types.includes(t)) problems.push(`/${l.slug}/: нет ${t}`);
    // текст самой страницы без шапки, подвала и общих блоков
    const own = text(l.lead + l.sections.map(s => s.h + ' ' + s.html).join(' ') + l.faq.map(f => f.q + ' ' + f.a).join(' '));
    const words = own.split(' ').length;
    if (words < 300) problems.push(`/${l.slug}/: мало уникального текста (${words} слов)`);
    if (leads.has(l.lead)) problems.push(`/${l.slug}/: вступление повторяется`);
    leads.add(l.lead);
    if ((html.match(/<h2[\s>]/g) || []).length < 4) problems.push(`/${l.slug}/: мало подзаголовков H2`);
  }
  assert.deepEqual(problems, []);
});

test('все внутренние ссылки и якоря ведут на существующие страницы', async () => {
  const broken = [];
  const all = pages.concat({ path: '/404.html', html: await read('/404.html') });
  const ids = {};
  for (const { path: p, html } of all) {
    for (const [, href] of html.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)) {
      if (/^(https?:|mailto:|tel:)/.test(href)) continue;
      const [target, hash] = href.split('#');
      const to = target || p;
      if (!to.startsWith('/')) { broken.push(`${p} → ${href} (относительная ссылка)`); continue; }
      let html2;
      try { html2 = await read(to); } catch { broken.push(`${p} → ${href}`); continue; }
      if (hash) {
        ids[to] ||= new Set([...html2.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
        if (!ids[to].has(hash)) broken.push(`${p} → ${href} (нет якоря)`);
      }
    }
  }
  assert.deepEqual(broken, []);
});

test('на каждую страницу ведут ссылки с других страниц (нет «сирот»)', () => {
  const linked = new Set();
  for (const { path: p, html } of pages) for (const [, href] of html.matchAll(/<a\b[^>]*\shref="(\/[^"#]*)/g)) if (href !== p) linked.add(href);
  assert.deepEqual(pages.map(p => p.path).filter(p => !linked.has(p)), []);
});

test('внешние ссылки открываются в новой вкладке с rel="noopener"', () => {
  const bad = [];
  for (const { path: p, html } of pages) for (const [tag] of html.matchAll(/<a\b[^>]*href="https?:[^"]*"[^>]*>/g)) {
    if (!/target="_blank"/.test(tag) || !/rel="noopener"/.test(tag)) bad.push(p + ': ' + tag);
  }
  assert.deepEqual(bad, []);
});

test('robots.txt открывает сайт и указывает на sitemap', async () => {
  const robots = await fs.readFile(path.join(ROOT, 'robots.txt'), 'utf8');
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.doesNotMatch(robots, /^Disallow: \/(assets\/?)?$/m, 'нельзя закрывать сайт или стили со скриптами');
  assert.ok(robots.includes(`Sitemap: ${SITE}/sitemap.xml`));
});

test('страница 404 отдаёт статус 404 и закрыта от индексации', async () => {
  const res = await fetch(server.url + '/нет-такой-страницы/');
  assert.equal(res.status, 404);
  const html = await res.text();
  assert.match(html, /<meta name="robots" content="noindex/);
  assert.doesNotMatch(html, /rel="canonical"/);
});

test('иконки: favicon.ico, apple-touch-icon, манифест', async () => {
  const ico = await fs.readFile(path.join(ROOT, 'favicon.ico'));
  assert.deepEqual([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)], [0, 1, 3], 'ICO с тремя размерами');
  const touch = await fs.readFile(path.join(ROOT, 'apple-touch-icon.png'));
  assert.deepEqual([touch.readUInt32BE(16), touch.readUInt32BE(20)], [180, 180], 'apple-touch-icon 180×180');
  const manifest = JSON.parse(await fs.readFile(path.join(ROOT, 'site.webmanifest'), 'utf8'));
  assert.equal(manifest.lang, 'ru');
  for (const i of manifest.icons) await fs.access(path.join(ROOT, i.src));
  const home = pages.find(p => p.path === '/').html;
  for (const href of ['/favicon.ico', '/assets/favicon.svg', '/apple-touch-icon.png', '/site.webmanifest']) assert.ok(home.includes(`href="${href}"`), 'нет ссылки на ' + href);
});

test('страницы лёгкие: HTML до 100 КБ, CSS и JS подключены с версией для кеша', async () => {
  for (const { path: p, html } of pages) {
    assert.ok(Buffer.byteLength(html) < 100 * 1024, p + ': HTML ' + Buffer.byteLength(html) + ' байт');
    assert.match(html, /href="\/assets\/site\.css\?v=[0-9a-f]{8}"/, p);
  }
});

test('на сайте нет данных владельца', () => {
  const found = [];
  for (const { path: p, html } of pages) for (const re of [/class="fill"/, /[\w.-]+@[\w-]+\.\w{2,}/, /ИНН|ОГРН/, /Контакты/]) if (re.test(html)) found.push(p + ': ' + re);
  assert.deepEqual(found, []);
});

// Сколько форматов ожидаем увидеть выбранными и какой пример в очереди
const LABEL = { jpeg: 'JPG', png: 'PNG', webp: 'WEBP', pdf: 'PDF', ico: 'ICO' };
for (const l of landings) {
  test(`/${l.slug}/ открывает конвертер с настройками страницы`, async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    try {
      await page.goto(server.url + `/${l.slug}/`);
      await page.locator('.row[data-status="ready"]').first().waitFor();
      const f = l.preset.format;
      assert.equal(await page.locator(`#fmts .fmt[data-id="${f}"]`).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#run').innerText(), 'Конвертировать в ' + LABEL[f]);
      assert.match(await page.locator('.row-name').first().innerText(), new RegExp(l.preset.sample.name.replace('.', '\\.')));
      if (l.preset.quality) assert.equal(await page.locator('#quality').inputValue(), String(Math.round(l.preset.quality * 100)));
      if (l.preset.resize) assert.equal(await page.locator('#resize-mode').inputValue(), l.preset.resize.mode);
      if (l.preset.pdfSingle) assert.ok(await page.locator('#pdf-single').isChecked());
      // выбор на тематической странице не должен менять формат на главной
      assert.equal(await page.evaluate(() => localStorage.getItem('rastr.format')), null);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

test('конвертация на странице /heic-v-jpg/ даёт JPG', async () => {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  try {
    await page.goto(server.url + '/heic-v-jpg/');
    await page.locator('.row[data-status="ready"]').first().waitFor();
    await page.click('#run');
    await page.locator('.row[data-status="done"]').first().waitFor();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.row').first().getByRole('button', { name: 'Скачать' }).click()]);
    assert.equal(dl.suggestedFilename(), 'пример-фото.jpg');
  } finally { await context.close(); }
});

for (const width of [360, 1280]) {
  test(`ширина ${width}px: ни одна страница не прокручивается вбок`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 800 } });
    const page = await context.newPage();
    const wide = [];
    try {
      for (const { path: p } of pages.concat({ path: '/404.html' })) {
        await page.goto(server.url + p);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (overflow > 0) wide.push(`${p}: +${overflow}px`);
      }
    } finally { await context.close(); }
    assert.deepEqual(wide, []);
  });
}
