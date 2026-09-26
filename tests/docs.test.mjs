// Сквозные тесты конвертера документов: загружаем файлы через интерфейс, скачиваем и проверяем содержимое.
// Нужен интернет: библиотеки (pdf.js, pdf-lib, mammoth, docx, SheetJS, marked) грузятся с CDN.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { startServer, launch, zipEntries } from './helpers.mjs';
import * as F from './doc-fixtures.mjs';
import { documents } from '../src/content/documents.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const PDF2 = () => F.pdf([['Hello Rastr page one', 'Second line of text'], ['Page two here']]);
const PDF_B = () => F.pdf([['Document B only page']]);
const file = (name, buffer, mimeType = 'application/octet-stream') => ({ name, mimeType, buffer: Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer) });

async function open(url) {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push(e.message));
  page.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  await page.goto(server.url + url);
  await page.locator('#targets .fmt').first().waitFor();
  const check = async () => {
    assert.deepEqual(await page.evaluate(() => window.__csp), [], 'нарушения CSP');
    assert.deepEqual(problems, [], 'ошибки на странице');
  };
  return { page, check, close: () => context.close() };
}

const settle = page => page.waitForFunction(() => {
  const rows = [...document.querySelectorAll('.row')];
  return rows.length && rows.every(r => ['ready', 'done', 'error'].includes(r.dataset.status)) && !document.getElementById('run').textContent.includes('…');
}, null, { timeout: 90000 });

async function download(page, click) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), click()]);
  return { name: dl.suggestedFilename(), data: await fs.readFile(await dl.path()) };
}
const rowDownload = (page, i = 0) => download(page, () => page.locator('.row').nth(i).getByRole('button', { name: 'Скачать' }).click());

// Перевести файл в текст через интерфейс страницы «PDF в TXT» — чтобы проверить, что внутри PDF
async function pdfText(buffer) {
  const { page, close } = await open('/pdf-v-txt/');
  try {
    await page.setInputFiles('#file', [file('проверка.pdf', buffer, 'application/pdf')]);
    await settle(page);
    await page.click('#run');
    await settle(page);
    return (await rowDownload(page)).data.toString('utf8');
  } finally { await close(); }
}

test('раздел «Документы»: конвертер, все варианты и группы страниц', async () => {
  const { page, check, close } = await open('/dokumenty/');
  try {
    assert.equal(await page.title(), 'Конвертер документов онлайн: PDF, Word, Excel, CSV | Растр');
    assert.equal(await page.locator('#targets .fmt').count(), 12);
    assert.equal(await page.locator('#queue').isVisible(), false);
    assert.ok(await page.locator('#run').isDisabled());
    for (const g of ['PDF', 'Word', 'Текст и Markdown', 'Таблицы']) assert.ok(await page.getByRole('heading', { name: g, exact: true }).isVisible(), 'нет группы ' + g);
    assert.equal(await page.locator('.menu a[aria-current="page"]').innerText(), 'Документы');
    await check();
  } finally { await close(); }
});

for (const d of documents) {
  test(`/${d.slug}/ открывается с нужными вариантами`, async () => {
    const { page, check, close } = await open(`/${d.slug}/`);
    try {
      assert.deepEqual(await page.$$eval('#targets .fmt', b => b.map(x => x.dataset.id)), d.preset.targets);
      assert.equal(await page.locator(`#targets .fmt[data-id="${d.preset.target}"]`).getAttribute('aria-pressed'), 'true');
      if (d.preset.runLabel) assert.equal(await page.locator('#run').innerText(), d.preset.runLabel);
      await check();
    } finally { await close(); }
  });
}

test('PDF в JPG: каждая страница — картинка, архив с правильными именами', async () => {
  const { page, check, close } = await open('/pdf-v-jpg/');
  try {
    await page.click('#dpi button[data-v="72"]');
    await page.setInputFiles('#file', [file('отчёт.pdf', PDF2(), 'application/pdf')]);
    await settle(page);
    await page.click('#run');
    await settle(page);
    assert.match(await page.locator('.row').first().innerText(), /→\s*JPG\s*2 файла/);
    const z = await rowDownload(page);
    assert.equal(z.name, 'отчёт.zip');
    assert.deepEqual(zipEntries(z.data).sort(), ['отчёт-стр-1.jpg', 'отчёт-стр-2.jpg']);
    const jpg = F.unzip(z.data)['отчёт-стр-1.jpg'];
    assert.deepEqual([...jpg.subarray(0, 3)], [0xFF, 0xD8, 0xFF]);

    // только вторая страница
    await page.fill('#pages', '2');
    await page.click('#run');
    await settle(page);
    const one = await rowDownload(page);
    assert.equal(one.name, 'отчёт-стр-2.jpg');
    await check();
  } finally { await close(); }
});

test('PDF в Word и в TXT: текст и абзацы переносятся', async () => {
  const { page, check, close } = await open('/pdf-v-word/');
  try {
    await page.setInputFiles('#file', [file('договор.pdf', PDF2(), 'application/pdf')]);
    await settle(page);
    await page.click('#run');
    await settle(page);
    const docx = await rowDownload(page);
    assert.equal(docx.name, 'договор.docx');
    const xml = F.unzip(docx.data)['word/document.xml'].toString('utf8');
    assert.match(xml, /Hello Rastr page one Second line of text/);
    assert.match(xml, /Page two here/);
    assert.match(xml, /pageBreakBefore/, 'вторая страница PDF начинается с новой страницы Word');

    await page.click('#targets .fmt[data-id="txt"]');
    await page.click('#run');
    await settle(page);
    const txt = (await rowDownload(page)).data.toString('utf8');
    assert.match(txt, /Hello Rastr page one Second line of text\n\n\f\n\nPage two here/);
    await check();
  } finally { await close(); }
});

test('Объединить PDF: порядок меняется стрелками', async () => {
  const { page, check, close } = await open('/obedinit-pdf/');
  try {
    await page.setInputFiles('#file', [file('a.pdf', PDF2(), 'application/pdf'), file('b.pdf', PDF_B(), 'application/pdf')]);
    await settle(page);
    // b.pdf поднимаем наверх — его страница должна оказаться первой
    await page.locator('.row', { hasText: 'b.pdf' }).getByRole('button', { name: 'Выше в очереди' }).click();
    assert.equal(await page.locator('.row-name').first().innerText(), 'b.pdf');
    const merged = await download(page, () => page.click('#run'));
    assert.equal(merged.name, 'объединённый.pdf');
    await check();
    await close();
    const text = await pdfText(merged.data);
    assert.ok(text.indexOf('Document B only page') < text.indexOf('Hello Rastr page one'), 'порядок страниц как в очереди');
    assert.equal(text.split('\f').length, 3, 'три страницы');
  } finally { await close().catch(() => {}); }
});

test('Разделить PDF: каждую страницу и выбранный диапазон', async () => {
  const { page, check, close } = await open('/razdelit-pdf/');
  try {
    assert.equal(await page.locator('#sec-pages').isVisible(), false, 'поле страниц скрыто в режиме «каждую страницу»');
    await page.setInputFiles('#file', [file('книга.pdf', PDF2(), 'application/pdf')]);
    await settle(page);
    await page.click('#run');
    await settle(page);
    const z = await rowDownload(page);
    assert.deepEqual(zipEntries(z.data).sort(), ['книга-стр-1.pdf', 'книга-стр-2.pdf']);

    await page.click('#split-mode button[data-v="range"]');
    assert.ok(await page.locator('#sec-pages').isVisible());
    await page.fill('#pages', '2');
    await page.click('#run');
    await settle(page);
    const part = await rowDownload(page);
    assert.equal(part.name, 'книга-стр-2.pdf');
    await check();
    await close();
    assert.match(await pdfText(part.data), /Page two here/);
  } finally { await close().catch(() => {}); }
});

test('Word в PDF: кириллица, заголовок и таблица доходят до PDF', async () => {
  const { page, check, close } = await open('/word-v-pdf/');
  let pdf;
  try {
    await page.setInputFiles('#file', [file('отчёт.docx', F.docx())]);
    await settle(page);
    await page.click('#run');
    await settle(page);
    pdf = await rowDownload(page);
    assert.equal(pdf.name, 'отчёт.pdf');
    assert.equal(pdf.data.subarray(0, 5).toString(), '%PDF-');
    await check();
  } finally { await close(); }
  const text = await pdfText(pdf.data);
  for (const s of ['Отчёт за сентябрь', 'Привет,', 'Растр! Это тестовый документ.', 'Анна', 'Возраст', 'Последний абзац.']) assert.ok(text.includes(s), 'в PDF нет текста «' + s + '»: ' + text);
});

test('Word в TXT и HTML', async () => {
  const { page, check, close } = await open('/word-v-txt/');
  try {
    await page.setInputFiles('#file', [file('отчёт.docx', F.docx())]);
    await settle(page);
    await page.click('#run');
    await settle(page);
    const txt = (await rowDownload(page)).data.toString('utf8');
    assert.match(txt, /Отчёт за сентябрь/);
    assert.match(txt, /Анна\t30/, 'ячейки таблицы разделены табуляцией');

    await page.click('#targets .fmt[data-id="html"]');
    await page.click('#run');
    await settle(page);
    const html = (await rowDownload(page)).data.toString('utf8');
    assert.match(html, /<h1>Отчёт за сентябрь<\/h1>/);
    assert.match(html, /<table>/);
    assert.match(html, /<meta charset="utf-8">/);
    await check();
  } finally { await close(); }
});

test('TXT в PDF и в Word', async () => {
  const { page, check, close } = await open('/txt-v-pdf/');
  let pdf;
  try {
    await page.click('#font-size button[data-v="14"]');
    await page.setInputFiles('#file', [file('заметка.txt', F.text.txt, 'text/plain')]);
    await settle(page);
    await page.click('#run');
    await settle(page);
    pdf = await rowDownload(page);
    await page.click('#targets .fmt[data-id="docx"]');
    await page.click('#run');
    await settle(page);
    const docx = await rowDownload(page);
    assert.match(F.unzip(docx.data)['word/document.xml'].toString('utf8'), /Второй абзац, тоже на русском\./);
    await check();
  } finally { await close(); }
  const text = await pdfText(pdf.data);
  assert.match(text, /Первый абзац простого текста\./);
});

test('Markdown в HTML и PDF', async () => {
  const { page, check, close } = await open('/markdown-v-html/');
  try {
    await page.setInputFiles('#file', [file('readme.md', F.text.md, 'text/markdown')]);
    await settle(page);
    await page.click('#run');
    await settle(page);
    const html = (await rowDownload(page)).data.toString('utf8');
    assert.match(html, /<h1>Заголовок<\/h1>/);
    assert.match(html, /<strong>жирным<\/strong>/);
    assert.match(html, /<table>/);
    await page.click('#targets .fmt[data-id="pdf"]');
    await page.click('#run');
    await settle(page);
    const pdf = await rowDownload(page);
    assert.equal(pdf.name, 'readme.pdf');
    await check();
  } finally { await close(); }
});

test('CSV в Excel и обратно: кириллица и столбцы не теряются', async () => {
  let xlsx;
  {
    const { page, check, close } = await open('/csv-v-excel/');
    try {
      await page.setInputFiles('#file', [file('клиенты.csv', F.text.csv, 'text/csv')]);
      await settle(page);
      await page.click('#run');
      await settle(page);
      xlsx = await rowDownload(page);
      assert.equal(xlsx.name, 'клиенты.xlsx');
      assert.ok(Object.keys(F.unzip(xlsx.data)).includes('xl/workbook.xml'), 'настоящий XLSX');
      await check();
    } finally { await close(); }
  }
  const { page, check, close } = await open('/excel-v-csv/');
  try {
    await page.setInputFiles('#file', [file('клиенты.xlsx', xlsx.data)]);
    await settle(page);
    await page.click('#run');
    await settle(page);
    const csv = (await rowDownload(page)).data.toString('utf8');
    assert.equal(csv.charCodeAt(0), 0xFEFF, 'BOM для Excel');
    assert.match(csv, /Имя;Возраст;Город\nАнна;30;Москва\nБорис;41;Казань/);
    await page.click('#csv-sep button[data-v=","]');
    await page.click('#run');
    await settle(page);
    assert.match((await rowDownload(page)).data.toString('utf8'), /Анна,30,Москва/);
    await check();
  } finally { await close(); }
});

test('неподходящие и старые файлы — понятные сообщения', async () => {
  const { page, check, close } = await open('/pdf-v-jpg/');
  try {
    await page.setInputFiles('#file', [
      file('отчёт.docx', F.docx()),
      file('старый.doc', Buffer.concat([Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]), Buffer.alloc(504)])),
      file('картинка.gif', Buffer.from('GIF89a'))
    ]);
    await settle(page);
    const texts = await page.locator('.row').allInnerTexts();
    assert.match(texts[0], /Этот файл нельзя перевести в JPG/);
    assert.match(texts[1], /сохраните файл в Word как \.docx/);
    assert.match(texts[2], /Формат не распознан/);
    assert.ok(await page.locator('#run').isDisabled(), 'подходящих файлов нет — кнопка неактивна');
    await check();
  } finally { await close(); }
});

test('на главной есть блок документов, в меню — раздел «Документы»', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(server.url + '/');
    assert.equal(await page.locator('#docs .links li').count(), 8);
    assert.ok(await page.locator('#docs a[href="/dokumenty/"]').isVisible());
    assert.deepEqual(await page.$$eval('.menu a', a => a.map(x => x.textContent)), ['Картинки', 'Документы', 'Инструменты', 'Форматы', 'Инструкция']);
    assert.equal(await page.locator('.foot-col h2', { hasText: 'Документы' }).count(), 1);
  } finally { await context.close(); }
});
