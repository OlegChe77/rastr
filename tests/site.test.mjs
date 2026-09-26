// Сквозные тесты сайта: действуем как пользователь — добавляем файлы, жмём кнопки, скачиваем.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { startServer, launch, bmp, noisyBmp, zipEntries } from './helpers.mjs';

let server, browser, context, errors;
// конвертер изображений живёт на своей странице, главная — обзор сервиса
const CONVERTER = '/konverter-izobrazhenij/';

before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); await server?.close(); });
afterEach(async () => {
  await context?.close();
  assert.deepEqual(errors, [], 'на странице не должно быть ошибок JavaScript');
});

async function openSite(viewport) {
  context = await browser.newContext({ acceptDownloads: true, viewport: viewport || { width: 1280, height: 900 } });
  const page = await context.newPage();
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(server.url + CONVERTER);
  await page.locator('#fmts .fmt').first().waitFor();
  return page;
}

const idle = page => page.waitForFunction(() =>
  ![...document.querySelectorAll('.row')].some(r => r.dataset.status === 'loading' || r.dataset.status === 'working') &&
  !document.getElementById('run').textContent.includes('…'));

async function download(page, click) {
  const [dl] = await Promise.all([page.waitForEvent('download'), click()]);
  return { name: dl.suggestedFilename(), data: await fs.readFile(await dl.path()) };
}

// Обычная «фотография» для тестов, где нужен один файл
const photo = () => ({ name: 'фото.bmp', mimeType: 'image/bmp', buffer: bmp(600, 400, [40, 120, 200]) });
async function addPhoto(page) { await page.setInputFiles('#file', [photo()]); await idle(page); }

const fixtures = () => [
  { name: 'красный.bmp', mimeType: 'image/bmp', buffer: bmp(64, 48, [220, 30, 30]) },
  { name: 'серый.pgm', mimeType: 'image/x-portable-graymap', buffer: Buffer.concat([Buffer.from('P5\n8 8\n255\n'), Buffer.alloc(64, 128)]) },
  { name: 'логотип.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><circle cx="25" cy="25" r="20" fill="#c4165a"/></svg>') }
];

test('страница открывается чистой: пустая очередь скрыта, примеров нет', async () => {
  const page = await openSite();
  assert.equal(await page.title(), 'Конвертер изображений онлайн: PNG, JPG, WEBP, HEIC | Растр');
  assert.equal(await page.locator('#fmts .fmt').count(), 14);
  assert.equal(await page.locator('.row').count(), 0);
  assert.equal(await page.locator('#queue').isVisible(), false, 'пустая очередь не показывается');
  assert.ok(await page.locator('#run').isDisabled(), 'без файлов конвертировать нечего');
  assert.equal(await page.locator('#plugin').count(), 0, 'блока с кодом для разработчиков нет');
  // зона загрузки компактная, а место под очередь занимает подсказка
  const dropH = await page.locator('#drop').evaluate(e => e.getBoundingClientRect().height);
  assert.ok(dropH < 200, 'зона загрузки слишком большая: ' + Math.round(dropH) + ' px');
  assert.ok(await page.locator('.queue-empty').isVisible(), 'подсказка «здесь появятся ваши файлы»');
  assert.ok(await page.locator('#drop .when-empty').isVisible());
  assert.equal(await page.locator('#run').innerText(), 'Конвертировать в WEBP');
  assert.equal(await page.locator('#ref-body tr').count(), 14);
});

test('файл конвертируется в PNG и скачивается', async () => {
  const page = await openSite();
  await addPhoto(page);
  assert.ok(await page.locator('#queue').isVisible(), 'с файлом очередь появляется');
  // с файлами зона загрузки — узкая строка «Добавить ещё файлы», подсказка исчезает
  const barH = await page.locator('#drop').evaluate(e => e.getBoundingClientRect().height);
  assert.ok(barH < 80, 'строка добавления слишком высокая: ' + Math.round(barH) + ' px');
  assert.ok(await page.locator('#drop .when-files').isVisible(), 'надпись «Добавить ещё файлы»');
  assert.equal(await page.locator('.queue-empty').isVisible(), false);
  assert.equal(await page.locator('.drop-formats').isVisible(), false);
  await page.click('#fmts .fmt[data-id="png"]');
  await page.click('#run');
  await idle(page);
  const row = page.locator('.row').first();
  assert.equal(await row.getAttribute('data-status'), 'done');
  assert.match(await row.innerText(), /PNG\s+600×400/);
  const f = await download(page, () => row.getByRole('button', { name: 'Скачать' }).click());
  assert.equal(f.name, 'фото.png');
  assert.deepEqual([...f.data.subarray(0, 4)], [0x89, 0x50, 0x4E, 0x47]);
});

test('каждый доступный формат конвертируется и скачивается с правильным расширением', async () => {
  const page = await openSite();
  await addPhoto(page);
  const ids = await page.$$eval('#fmts .fmt:not(:disabled)', b => b.map(x => x.dataset.id));
  assert.ok(ids.length >= 13, 'доступно форматов: ' + ids.length);
  const EXT = { jpeg: 'jpg', datauri: 'txt' };
  for (const id of ids) {
    await page.click('#fmts .fmt[data-id="' + id + '"]');
    await page.click('#run');
    await idle(page);
    const row = page.locator('.row').first();
    assert.equal(await row.getAttribute('data-status'), 'done', id + ': ' + await row.innerText());
    const f = await download(page, () => row.getByRole('button', { name: 'Скачать' }).click());
    assert.equal(f.name, 'фото.' + (EXT[id] || id), id);
    assert.ok(f.data.length > 100, id + ': файл подозрительно маленький');
  }
});

test('загрузка нескольких файлов, конвертация в JPG и скачивание ZIP', async () => {
  const page = await openSite();
  await page.setInputFiles('#file', fixtures());
  await idle(page);
  assert.equal(await page.locator('.row[data-status="ready"]').count(), 3);
  assert.match(await page.locator('.row', { hasText: 'серый.pgm' }).innerText(), /PNM[\s\S]*8×8/);
  assert.match(await page.locator('.row', { hasText: 'логотип.svg' }).innerText(), /SVG[\s\S]*100×50/);
  assert.ok(await page.locator('#zip').isDisabled(), 'ZIP недоступен до конвертации');

  await page.click('#fmts .fmt[data-id="jpeg"]');
  await page.click('#run');
  await idle(page);
  assert.equal(await page.locator('.row[data-status="done"]').count(), 3);

  const z = await download(page, () => page.click('#zip'));
  assert.equal(z.name, 'растр-3-файлов.zip');
  assert.deepEqual(zipEntries(z.data).sort(), ['красный.jpg', 'логотип.jpg', 'серый.jpg'].sort());
});

test('битый файл показывает ошибку и не мешает остальным', async () => {
  const page = await openSite();
  await page.setInputFiles('#file', [{ name: 'битый.png', mimeType: 'image/png', buffer: Buffer.from('это не картинка') }, fixtures()[0]]);
  await idle(page);
  const bad = page.locator('.row', { hasText: 'битый.png' });
  assert.equal(await bad.getAttribute('data-status'), 'error');
  assert.match(await bad.innerText(), /не смог открыть/);
  assert.ok(await bad.getByRole('button', { name: 'Скачать' }).isDisabled());
  await page.click('#run');
  await idle(page);
  assert.equal(await page.locator('.row[data-status="done"]').count(), 1);
});

test('перетаскивание файла в окно добавляет его в очередь', async () => {
  const page = await openSite();
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['P3 1 1 255\n0 255 0\n'], 'зелёный.ppm', { type: '' }));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }));
  });
  await idle(page);
  const row = page.locator('.row', { hasText: 'зелёный.ppm' });
  assert.equal(await row.getAttribute('data-status'), 'ready');
  assert.equal(await page.locator('#drop.over').count(), 0, 'подсветка зоны снята');
});

test('изменение размера и поворот попадают в результат', async () => {
  const page = await openSite();
  await addPhoto(page);
  await page.selectOption('#resize-mode', 'width');
  await page.fill('#resize-w', '300');
  assert.match(await page.locator('#resize-hint').innerText(), /600×400 → 300×200/);
  await page.click('#rotate button[data-rot="90"]');
  await page.click('#fmts .fmt[data-id="png"]');
  await page.click('#run');
  await idle(page);
  assert.match(await page.locator('.row').first().innerText(), /PNG\s+200×300/);
});

test('качество видно только у форматов с потерями, фон — у форматов без прозрачности', async () => {
  const page = await openSite();
  // у «качества» два блока (ползунок и сжатие до размера) — достаточно проверить первый
  const visible = sel => page.locator(sel).first().isVisible();
  await page.click('#fmts .fmt[data-id="png"]');
  assert.equal(await visible('[data-opt="quality"]'), false);
  assert.equal(await visible('[data-opt="background"]'), false);
  await page.click('#fmts .fmt[data-id="jpeg"]');
  assert.equal(await visible('[data-opt="quality"]'), true);
  assert.equal(await visible('[data-opt="background"]'), true);
  await page.click('#fmts .fmt[data-id="gif"]');
  assert.equal(await visible('[data-opt="gif"]'), true);
  await page.click('#fmts .fmt[data-id="ico"]');
  assert.equal(await visible('[data-opt="ico"]'), true);
  assert.equal(await visible('[data-opt="quality"]'), false);
  await page.click('#fmts .fmt[data-id="jpeg"]');
  await page.fill('#quality', '40');
  assert.equal(await page.locator('#quality-v').innerText(), '40%');
});

test('сжатие до 200 КБ: тяжёлое фото укладывается в лимит и скачивается', async () => {
  context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(server.url + '/szhat-foto-do-kb/');
  await page.setInputFiles('#file', [{ name: 'большое.bmp', mimeType: 'image/bmp', buffer: noisyBmp(1600, 1200) }]);
  await idle(page);
  await page.click('#run');
  await page.locator('.row[data-status="done"]').waitFor({ timeout: 60000 });
  const row = page.locator('.row').first();
  assert.match(await row.innerText(), /≤ 200 КБ · качество \d+%/);
  const f = await download(page, () => row.getByRole('button', { name: 'Скачать' }).click());
  assert.equal(f.name, 'большое.jpg');
  assert.ok(f.data.length <= 200000, 'вес ' + f.data.length + ' байт');
  assert.ok(f.data.length > 120000, 'не пережато: ' + f.data.length + ' байт');

  // кнопка «1 МБ» меняет лимит; в этом инструменте лимит включён всегда, ползунка качества нет
  await page.click('#target-chips button[data-kb="1000"]');
  assert.equal(await page.locator('#target-kb').inputValue(), '1000');
  assert.equal(await page.locator('#target-on').isVisible(), false, 'галочка скрыта: лимит включён всегда');
  assert.equal(await page.locator('#sec-quality').isVisible(), false, 'ползунок качества скрыт');
  assert.equal(await page.locator('#run').innerText(), 'Сжать до размера');
  assert.deepEqual(await page.$$eval('#fmts .fmt', b => b.map(x => x.dataset.id)), ['jpeg', 'webp', 'avif']);

  // на главной сжатие до размера — обычная галочка, её можно выключить
  await page.goto(server.url + CONVERTER);
  await page.click('#fmts .fmt[data-id="jpeg"]');
  await page.check('#target-on');
  assert.equal(await page.locator('#quality-v').innerText(), 'авто');
  await page.uncheck('#target-on');
  assert.equal(await page.locator('#quality').isDisabled(), false);
  assert.match(await page.locator('#quality-v').innerText(), /^\d+%$/);
});

test('инструмент «Размер фото»: формат «Как было» сохраняет формат исходника', async () => {
  context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(server.url + '/izmenit-razmer-foto/');
  assert.equal(await page.locator('#run').innerText(), 'Изменить размер');
  assert.equal(await page.locator('#fmts .fmt[data-id="keep"]').getAttribute('aria-pressed'), 'true');
  // в этом инструменте блок размера стоит первым в панели настроек
  const [sizeTop, formatTop] = await page.evaluate(() => ['sec-size', 'sec-format'].map(id => document.getElementById(id).getBoundingClientRect().top));
  assert.ok(sizeTop < formatTop, 'размер выше формата');

  await page.setInputFiles('#file', [fixtures()[0], fixtures()[2]]);
  await idle(page);
  await page.click('#run');
  await idle(page);
  const texts = await page.locator('.row').allInnerTexts();
  assert.match(texts.find(t => t.includes('красный')), /→\s*BMP\s+800×600/);
  assert.match(texts.find(t => t.includes('логотип')), /→\s*PNG\s+800×400/);
  const z = await download(page, () => page.click('#zip'));
  assert.deepEqual(zipEntries(z.data).sort(), ['красный.bmp', 'логотип.png']);
});

test('все картинки собираются в один PDF', async () => {
  const page = await openSite();
  await page.setInputFiles('#file', fixtures());
  await idle(page);
  await page.click('#fmts .fmt[data-id="pdf"]');
  await page.check('#pdf-single');
  const f = await download(page, () => page.click('#run'));
  assert.equal(f.name, 'растр-3-стр.pdf');
  const s = f.data.toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4'));
  assert.equal((s.match(/\/Type \/Page\b/g) || []).length, 3);
  await page.locator('#toast.show').waitFor();
  assert.match(await page.locator('#toast').innerText(), /3 страницы/);
});

test('предпросмотр показывает оригинал и результат', async () => {
  const page = await openSite();
  await addPhoto(page);
  await page.click('#fmts .fmt[data-id="webp"]');
  await page.click('#run');
  await idle(page);
  await page.locator('.row .thumb').first().click();
  const dlg = page.locator('#dlg');
  await dlg.waitFor();
  assert.match(await page.locator('#dlg-before-cap').innerText(), /BMP[\s\S]*600×400/);
  assert.match(await page.locator('#dlg-after-cap').innerText(), /WEBP/);
  assert.ok(await page.locator('#dlg-after img').evaluate(img => img.decode().then(() => img.naturalWidth)) === 600);
  const f = await download(page, () => page.click('#dlg-dl'));
  assert.equal(f.name, 'фото.webp');
  await page.click('#dlg-close');
  assert.equal(await dlg.isVisible(), false);
});

test('удаление строки и очистка очереди', async () => {
  const page = await openSite();
  await page.setInputFiles('#file', fixtures().slice(0, 2));
  await idle(page);
  assert.equal(await page.locator('.row').count(), 2);
  await page.locator('.row', { hasText: 'красный.bmp' }).getByRole('button', { name: 'Убрать из очереди' }).click();
  assert.equal(await page.locator('.row').count(), 1);
  assert.match(await page.locator('#q-summary').innerText(), /^1 файл /);
  await page.click('#clear');
  assert.equal(await page.locator('.row').count(), 0);
  assert.equal(await page.locator('#queue').isVisible(), false, 'после очистки очередь снова скрыта');
  assert.ok(await page.locator('#run').isDisabled());
});

test('клик по строке таблицы выбирает формат, выбор запоминается', async () => {
  const page = await openSite();
  await page.click('#ref-body tr[data-id="tiff"]');
  assert.equal(await page.locator('#run').innerText(), 'Конвертировать в TIFF');
  assert.equal(await page.locator('#fmts .fmt[data-id="tiff"]').getAttribute('aria-pressed'), 'true');
  await page.reload();
  await page.locator('#fmts .fmt').first().waitFor();
  assert.equal(await page.locator('#run').innerText(), 'Конвертировать в TIFF');
});

test('на телефоне нет горизонтальной прокрутки', async () => {
  const page = await openSite({ width: 375, height: 812 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, 'страница шире экрана на ' + overflow + ' px');
  assert.ok(await page.locator('#run').isVisible());
});

test('главная — обзор сервиса: разделы, цифры, популярные страницы, без конвертера', async () => {
  context = await browser.newContext();
  const page = await context.newPage();
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(server.url + '/');
  assert.equal(await page.title(), 'Растр — онлайн-конвертер картинок и документов без сервера');
  assert.equal(await page.locator('#app').count(), 0, 'конвертера на главной нет');
  assert.equal(await page.locator('h1').innerText(), 'Онлайн-конвертер картинок и документов');
  assert.deepEqual(await page.$$eval('.hero-cta a.btn.primary', a => a.map(x => x.getAttribute('href'))), ['/konverter-izobrazhenij/', '/dokumenty/', '/instrumenty/']);
  assert.equal(await page.locator('.hero .chips').count(), 0, 'на главной нет плашек-преимуществ');
  assert.deepEqual(await page.$$eval('#sections .tools a', a => a.map(x => x.getAttribute('href'))), ['/konverter-izobrazhenij/', '/dokumenty/', '/instrumenty/']);
  assert.equal(await page.locator('.stats-row li').count(), 4);
  for (const id of ['how', 'why', 'popular', 'docs', 'tools', 'formats', 'faq']) assert.equal(await page.locator('#' + id).count(), 1, 'нет блока ' + id);
  // таблица форматов на главной справочная: названия ведут в справочник
  assert.equal(await page.locator('#ref-body').count(), 0);
  assert.equal(await page.locator('#formats a[href="/formaty/#png"]').count(), 1);
  // «Картинки» в меню ведут на конвертер
  await page.click('.menu a:has-text("Картинки")');
  await page.locator('#fmts .fmt').first().waitFor();
  assert.equal(new URL(page.url()).pathname, CONVERTER);
  assert.equal(await page.locator('.menu a[aria-current="page"]').innerText(), 'Картинки');
});