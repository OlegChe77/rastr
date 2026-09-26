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
ok([301, 308].includes(noSlash.status) && /\/png-v-jpg\/$/.test(noSlash.headers.get('location') || ''), 'адрес без слеша /png-v-jpg перенаправляет на /png-v-jpg/ (нет дубля)',
  'статус ' + noSlash.status + (noSlash.headers.get('location') ? ' → ' + noSlash.headers.get('location') : ''));

const missing = await get('/net-takoj-stranicy/');
const missingHtml = await missing.text();
ok(missing.status === 404, 'несуществующий адрес отдаёт статус 404', 'статус ' + missing.status);
ok(missingHtml.includes('Такой страницы нет'), 'показывается своя страница 404');

for (const [p, type] of [['/sitemap.xml', 'xml'], ['/robots.txt', 'text/plain'], ['/favicon.ico', 'icon'], ['/site.webmanifest', 'manifest+json'], ['/assets/og/home.png', 'image/png']]) {
  const r = await get(p);
  ok(r.status === 200 && (r.headers.get('content-type') || '').includes(type), p + ' доступен', `${r.status} ${r.headers.get('content-type')}`);
}
const robots = await (await get('/robots.txt')).text();
ok(robots.includes(`Sitemap: ${base}/sitemap.xml`), 'robots.txt указывает на sitemap этого сайта');

const js = await get('/assets/app.js');
ok(js.status === 200 && /javascript/.test(js.headers.get('content-type') || ''), 'скрипт конвертера отдаётся как JavaScript', js.headers.get('content-type'));
for (const h of ['x-content-type-options', 'referrer-policy', 'strict-transport-security', 'permissions-policy', 'cross-origin-opener-policy']) {
  ok(!!home.headers.get(h), 'заголовок ' + h, home.headers.get(h) || 'нет');
}
ok(/^frame-ancestors 'self' https:\/\/\*\.yandex\.ru/.test(home.headers.get('content-security-policy') || ''), 'во фреймы пускаются только сайт и Яндекс Метрика', home.headers.get('content-security-policy'));
ok(!home.headers.get('x-frame-options'), 'X-Frame-Options не отдаётся (иначе не откроется Вебвизор)', home.headers.get('x-frame-options') || 'нет');
ok(/metrika\.js\?v=[0-9a-f]+" data-id="\d+"/.test(html), 'Яндекс Метрика подключена в <head>');
ok(/<meta http-equiv="Content-Security-Policy" content="default-src 'self'/.test(html), 'политика безопасности (CSP) встроена в страницу');
ok(/id="counter"[^>]*data-host="/.test(html), 'счётчик посещений есть в подвале');
// главная hits.sh, а не сама картинка: запрос картинки прибавил бы посещение
const hits = await fetch('https://hits.sh/', { method: 'HEAD' }).catch(() => ({ status: 0 }));
ok(hits.status === 200, 'сервис счётчика hits.sh отвечает', 'статус ' + hits.status);
ok(!/закат-пример|class="tag sample"|id="plugin"/.test(html), 'на главной нет примеров');

console.log(failed ? `\nПроблем: ${failed}` : '\nВсё в порядке');
process.exit(failed ? 1 : 0);
