// Поиск дублей на собранном сайте: одинаковые абзацы, вопросы FAQ, заголовки H2 на разных страницах.
// Запуск: npm run build && node tools/audit-duplicates.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const pages = [];
async function walk(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'assets') await walk(p); }
    else if (e.name === 'index.html') pages.push({ url: '/' + path.relative(DIST, dir).replace(/\\/g, '/') + (dir === DIST ? '' : '/'), html: await fs.readFile(p, 'utf8') });
  }
}
await walk(DIST);
for (const p of pages) p.url = p.url.replace('//', '/');

const clean = s => s.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
// только основное содержимое, без шапки, подвала и блоков-ссылок
const main = html => html.split('<main id="main">')[1].split('</main>')[0].replace(/<ul class="links">[\s\S]*?<\/ul>/g, '').replace(/<section class="app"[\s\S]*?<\/section>/g, '');

function report(title, pick, minLen = 40) {
  const seen = new Map();
  for (const p of pages) for (const t of new Set(pick(main(p.html)).map(clean).filter(t => t.length >= minLen))) {
    if (!seen.has(t)) seen.set(t, []);
    seen.get(t).push(p.url);
  }
  const dups = [...seen].filter(([, urls]) => urls.length > 1);
  console.log(`\n${title}: ${dups.length}`);
  for (const [t, urls] of dups) console.log(`  «${t.slice(0, 90)}${t.length > 90 ? '…' : ''}»\n     ${urls.join(', ')}`);
  return dups.length;
}

let total = 0;
total += report('Одинаковые абзацы и пункты списков', h => [...h.matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/g)].map(m => m[2]));
total += report('Одинаковые вопросы FAQ', h => [...h.matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map(m => m[1]), 5);
total += report('Одинаковые ответы FAQ', h => [...h.matchAll(/<div class="ans">([\s\S]*?)<\/div>/g)].map(m => m[1]));
total += report('Одинаковые подзаголовки H2 (кроме служебных)', h => [...h.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map(m => m[1])
  .filter(t => !/Очередь|Вопросы и ответы|Частые вопросы|Другие конвертеры|Все конвертеры|Популярные конвертеры|Готовые конвертеры/.test(t)), 5);
console.log(`\nВсего групп дублей: ${total}`);
process.exitCode = total ? 1 : 0;
