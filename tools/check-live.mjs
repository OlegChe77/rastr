// Проверка сайта после деплоя: npm run check:live -- https://rastr.onrender.com
// Смотрит то, что зависит от хостинга, а не от кода: адреса страниц, 404, файлы для поисковиков, заголовки.
const base = (process.argv[2] || '').replace(/\/+$/, '');
if (!/^https?:\/\//.test(base)) {
  console.error('Укажите адрес сайта: npm run check:live -- https://ваш-сайт.onrender.com');
  process.exit(1);
}

let failed = 0;
const ok = (cond, msg, extra = '') => { console.log(`${cond ? '✔' : '✖'} ${msg}${extra ? '  — ' + extra : ''}`); if (!cond) failed++; };
const get = (p, opts) => fetch(base + p, { redirect: 'manual', ...opts });

const home = await get('/');
const html = await home.text();
ok(home.status === 200, 'главная открывается', 'статус ' + home.status);
const canonical = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
ok(canonical === base + '/', 'canonical совпадает с адресом сайта', canonical);
ok(!html.includes('example.com'), 'в страницах нет заглушки example.com (переменная SITE_URL задана)');

const landing = await get('/png-v-jpg/');
ok(landing.status === 200, 'посадочная страница /png-v-jpg/ открывается', 'статус ' + landing.status);
const noSlash = await get('/png-v-jpg');
ok([200, 301, 308].includes(noSlash.status), 'адрес без слеша /png-v-jpg работает',
  'статус ' + noSlash.status + (noSlash.headers.get('location') ? ' → ' + noSlash.headers.get('location') : ''));

const missing = await get('/net-takoj-stranicy/');
const missingHtml = await missing.text();
ok(missing.status === 404, 'несуществующий адрес отдаёт статус 404', 'статус ' + missing.status);
ok(missingHtml.includes('Такой страницы нет'), 'показывается своя страница 404');

for (const [p, type] of [['/sitemap.xml', 'xml'], ['/robots.txt', 'text/plain'], ['/favicon.ico', 'icon'], ['/site.webmanifest', ''], ['/assets/og/home.png', 'image/png']]) {
  const r = await get(p);
  ok(r.status === 200 && (r.headers.get('content-type') || '').includes(type), p + ' доступен', `${r.status} ${r.headers.get('content-type')}`);
}
const robots = await (await get('/robots.txt')).text();
ok(robots.includes(`Sitemap: ${base}/sitemap.xml`), 'robots.txt указывает на sitemap этого сайта');

const js = await get('/assets/app.js');
ok(js.status === 200 && /javascript/.test(js.headers.get('content-type') || ''), 'скрипт конвертера отдаётся как JavaScript', js.headers.get('content-type'));
ok(!!home.headers.get('x-content-type-options'), 'заголовки безопасности из render.yaml применились');

console.log(failed ? `\nПроблем: ${failed}` : '\nВсё в порядке');
process.exit(failed ? 1 : 0);
