// Проверки безопасности собранного сайта: политика CSP, отсутствие встроенных скриптов и обработчиков,
// целостность (SRI) декодеров с CDN, работа декодеров под CSP, счётчик, заголовки Render.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startServer, launch, ROOT, PROJECT } from './helpers.mjs';
import { CSP } from '../src/layout.mjs';

let server, browser, pages;

before(async () => {
  const files = [];
  const walk = async dir => {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'assets') await walk(p); }
      else if (e.name.endsWith('.html')) files.push(p);
    }
  };
  await walk(ROOT);
  pages = await Promise.all(files.map(async f => ({ file: path.relative(ROOT, f), html: await fs.readFile(f, 'utf8') })));
  server = await startServer();
  browser = await launch();
});
after(async () => { await browser?.close(); await server?.close(); });

// Открыть страницу и собрать все нарушения CSP и ошибки
async function open(url, setup) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push('ошибка: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') problems.push('консоль: ' + m.text()); });
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));
  });
  if (setup) await setup(page);
  await page.goto(server.url + url);
  await page.locator('#fmts .fmt').first().waitFor().catch(() => {});
  return { page, problems, close: () => context.close(), csp: () => page.evaluate(() => window.__csp) };
}

test('каждая страница задаёт политику безопасности (CSP) первым делом', () => {
  for (const { file, html } of pages) {
    const head = html.split('</head>')[0];
    const meta = head.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
    assert.ok(meta, file + ': нет CSP');
    assert.equal(meta[1], CSP, file);
    // CSP должна идти до любых скриптов, стилей и ссылок на внешние ресурсы
    assert.ok(head.indexOf(meta[0]) < head.search(/<(script|link|style)\b/), file + ': CSP стоит слишком поздно');
  }
  for (const d of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"]) assert.ok(CSP.includes(d), 'нет ' + d);
  assert.doesNotMatch(CSP, /script-src[^;]*'unsafe-inline'/, 'встроенные скрипты должны быть запрещены');
  assert.doesNotMatch(CSP, /script-src[^;]*https:\/\/cdn\.jsdelivr\.net[ ;]/, 'CDN разрешён целиком, а не конкретными версиями');
});

test('в HTML нет встроенных скриптов и обработчиков событий', () => {
  for (const { file, html } of pages) {
    for (const [tag] of html.matchAll(/<script\b[^>]*>/g)) {
      assert.ok(/\ssrc="\/assets\//.test(tag) || /type="application\/(ld\+)?json"/.test(tag), `${file}: встроенный скрипт ${tag}`);
    }
    assert.doesNotMatch(html, /\son[a-z]+="/i, file + ': обработчик вида onclick="…"');
    assert.doesNotMatch(html, /javascript:/i, file + ': ссылка javascript:');
    assert.doesNotMatch(html, /(src|href)="http:\/\//, file + ': ресурс по незащищённому http://');
  }
});

test('данные в <script type="application/json"> не могут закрыть тег', () => {
  for (const { file, html } of pages) {
    for (const [, body] of html.matchAll(/<script type="application\/(?:ld\+)?json"[^>]*>([\s\S]*?)<\/script>/g)) {
      assert.doesNotMatch(body, /</, file + ': символ < внутри JSON');
      JSON.parse(body);
    }
  }
});

test('декодеры с CDN подключаются с закреплённой версией и проверкой целостности (SRI)', async () => {
  const src = await fs.readFile(path.join(PROJECT, 'src', 'assets', 'rastr-convert.js'), 'utf8');
  const entries = [...src.matchAll(/src: '(https:[^']+)',\s*integrity: '(sha384-[^']+)'/g)];
  assert.equal(entries.length, 3, 'pako, UTIF и heic2any');
  for (const [, url, integrity] of entries) {
    assert.match(url, /@\d+\.\d+\.\d+\//, url + ': версия не закреплена');
    assert.ok(CSP.includes(url.slice(0, url.indexOf('/', url.indexOf('@')) + 1)), url + ': нет в CSP');
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    const hash = 'sha384-' + (await import('node:crypto')).createHash('sha384').update(buf).digest('base64');
    assert.equal(hash, integrity, url + ': хэш не совпадает с файлом на CDN');
  }
  assert.match(src, /s\.integrity = integrity; s\.crossOrigin = 'anonymous'/);
});

// TIFF со сжатием PackBits, 2×1: красный и зелёный пиксели
function tiff() {
  const data = Uint8Array.from([0x05, 255, 0, 0, 0, 255, 0]);
  const n = 9, bps = 8 + 2 + n * 12 + 4, strip = bps + 6;
  const b = Buffer.alloc(strip + data.length);
  b.write('II', 0, 'latin1'); b.writeUInt16LE(42, 2); b.writeUInt32LE(8, 4); b.writeUInt16LE(n, 8);
  [[256, 3, 1, 2], [257, 3, 1, 1], [258, 3, 3, bps], [259, 3, 1, 32773], [262, 3, 1, 2],
   [273, 4, 1, strip], [277, 3, 1, 3], [278, 3, 1, 1], [279, 4, 1, data.length]].forEach((t, i) => {
    const at = 10 + i * 12;
    b.writeUInt16LE(t[0], at); b.writeUInt16LE(t[1], at + 2); b.writeUInt32LE(t[2], at + 4);
    if (t[1] === 3 && t[2] === 1) b.writeUInt16LE(t[3], at + 8); else b.writeUInt32LE(t[3], at + 8);
  });
  for (let i = 0; i < 3; i++) b.writeUInt16LE(8, bps + i * 2);
  b.set(data, strip);
  return b;
}

test('TIFF открывается на сайте при включённой CSP и SRI', async () => {
  const { page, problems, close, csp } = await open('/tiff-v-jpg/');
  try {
    await page.setInputFiles('#file', [{ name: 'скан.tiff', mimeType: 'image/tiff', buffer: tiff() }]);
    const row = page.locator('.row').first();
    await page.waitForFunction(() => ['ready', 'error'].includes(document.querySelector('.row')?.dataset.status));
    assert.equal(await row.getAttribute('data-status'), 'ready', await row.innerText());
    assert.match(await row.innerText(), /TIFF[\s\S]*2×1/);
    assert.deepEqual(await csp(), []);
    assert.deepEqual(problems, []);
  } finally { await close(); }
});

test('подменённый на CDN файл декодера не запускается (SRI)', async () => {
  const { page, close, csp } = await open('/tiff-v-jpg/', p =>
    p.route('**/utif@3.1.0/UTIF.js', r => r.fulfill({ contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: 'window.UTIF = { hacked: true };' })));
  try {
    await page.setInputFiles('#file', [{ name: 'скан.tiff', mimeType: 'image/tiff', buffer: tiff() }]);
    await page.waitForFunction(() => ['ready', 'error'].includes(document.querySelector('.row')?.dataset.status));
    assert.equal(await page.locator('.row').first().getAttribute('data-status'), 'error');
    assert.equal(await page.evaluate(() => window.UTIF && window.UTIF.hacked), undefined, 'подменённый код выполнился');
    assert.deepEqual(await csp(), []);
  } finally { await close(); }
});

test('декодер HEIC загружается под CSP, его Worker запускается и может работать', async () => {
  const { page, close, csp } = await open('/heic-v-jpg/');
  try {
    // файл с заголовком HEIC, но без картинки: декодер загрузится и сообщит об ошибке формата
    const head = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic\0\0\0\0mif1heic', 'latin1'), Buffer.alloc(64)]);
    await page.setInputFiles('#file', [{ name: 'фото.heic', mimeType: 'image/heic', buffer: head }]);
    await page.waitForFunction(() => document.querySelector('.row')?.dataset.status === 'error', null, { timeout: 60000 });
    const state = await page.evaluate(async () => {
      // так же, как heic2any: Worker из blob-адреса, внутри — new Function (Emscripten)
      const code = 'try { postMessage(new Function("return 2 + 2")()); } catch (e) { postMessage("blocked: " + e.message); }';
      const w = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
      const res = await new Promise(r => { w.onmessage = e => r(e.data); w.onerror = e => r('worker error: ' + e.message); });
      return { loaded: typeof window.heic2any, worker: !!window.__heic2any__worker, res };
    });
    assert.deepEqual(state, { loaded: 'function', worker: true, res: 4 });
    assert.deepEqual(await csp(), []);
  } finally { await close(); }
});

test('встроенный скрипт, вставленный в страницу, блокируется', async () => {
  const { page, close, csp } = await open('/');
  try {
    const ran = await page.evaluate(async () => {
      window.__injected = false;
      const s = document.createElement('script');
      s.textContent = 'window.__injected = true';
      document.body.appendChild(s);
      await new Promise(r => setTimeout(r, 50));
      return window.__injected;
    });
    assert.equal(ran, false, 'встроенный скрипт выполнился');
    assert.ok((await csp()).some(v => v.startsWith('script-src')), 'нарушение CSP не зафиксировано');
  } finally { await close(); }
});

test('имя файла с HTML-кодом выводится как текст, а не как разметка', async () => {
  const { page, problems, close } = await open('/');
  try {
    const evil = '<img src=x onerror="window.__xss=1">.png';
    await page.setInputFiles('#file', [{ name: evil, mimeType: 'image/png', buffer: Buffer.from('не картинка') }]);
    await page.waitForFunction(() => document.querySelector('.row')?.dataset.status === 'error');
    assert.equal(await page.locator('.row-name').first().innerText(), evil);
    assert.equal(await page.locator('.row img[src="x"]').count(), 0);
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    assert.deepEqual(problems, []);
  } finally { await close(); }
});

test('счётчик посещений не загружается вне настоящего сайта и не передаёт адрес страницы', async () => {
  const requests = [];
  const { page, close } = await open('/', p => p.on('request', r => { if (r.url().includes('hits.sh')) requests.push(r.url()); }));
  try {
    const box = page.locator('#counter');
    assert.equal(await box.count(), 1, 'счётчик есть в подвале');
    assert.equal(await box.getAttribute('data-src').then(s => s.startsWith('https://hits.sh/')), true);
    await page.waitForTimeout(500);
    assert.deepEqual(requests, [], 'локально счётчик не должен накручиваться');
  } finally { await close(); }
  const js = await fs.readFile(path.join(PROJECT, 'src', 'assets', 'counter.js'), 'utf8');
  assert.match(js, /referrerPolicy = 'no-referrer'/);
  assert.match(js, /location\.host !== box\.dataset\.host/);
});

test('render.yaml задаёт заголовки безопасности', async () => {
  const yaml = await fs.readFile(path.join(PROJECT, 'render.yaml'), 'utf8');
  for (const h of ['X-Content-Type-Options', 'Referrer-Policy', 'X-Frame-Options', 'Strict-Transport-Security', 'Permissions-Policy', 'Cross-Origin-Opener-Policy']) {
    assert.match(yaml, new RegExp(`name: ${h}\\n`), 'нет ' + h);
  }
  assert.match(yaml, /value: frame-ancestors 'self'/);
});
