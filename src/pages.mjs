// Все страницы сайта. Каждая: путь, title, description, ключевые слова, тело и разметка schema.org.
import { landings } from './content/landings.mjs';
import { formatInfo } from './content/formats.mjs';
import { esc, converter, hero, faqHtml, faqSchema, linksGrid, steps, crumbsSchema, cardTitle, ICONS } from './layout.mjs';

const HOME = { name: 'Главная', path: '/' };

function webApp(site, name, path, description) {
  return {
    '@context': 'https://schema.org', '@type': 'WebApplication',
    name, url: site.url + path, description,
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Windows, macOS, Linux, Android, iOS',
    browserRequirements: 'Современный браузер с включённым JavaScript',
    inLanguage: 'ru', isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'RUB' },
    featureList: ['Конвертация между 14 форматами', 'Пакетная обработка', 'Изменение размера и поворот', 'Работа без загрузки файлов на сервер']
  };
}

const section = (id, title, sub, inner) => `<section class="wrap section"${id ? ` id="${id}"` : ''} aria-labelledby="${id || 's'}-h">
  <div class="section-head"><h2 id="${id || 's'}-h">${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>
  ${inner}
</section>`;

const HOW = steps([
  ['Добавьте картинки', 'Перетащите файлы в рамку, выберите их кнопкой или вставьте из буфера обмена.'],
  ['Выберите формат', 'JPG, PNG, WEBP, AVIF, PDF, ICO и ещё 8 форматов. Качество и размер можно настроить.'],
  ['Скачайте результат', 'По одному файлу или всё сразу одним ZIP-архивом. Регистрация не нужна.']
]);

const FEATURES = `<div class="features">
  <div class="feature"><div class="ic">${ICONS.lock}</div><h3>Файлы остаются у вас</h3><p>Конвертация идёт прямо в браузере. Фото, сканы и макеты не загружаются ни на какой сервер.</p></div>
  <div class="feature"><div class="ic">${ICONS.bolt}</div><h3>Быстро</h3><p>Не нужно ждать загрузки и скачивания: картинка обрабатывается на вашем устройстве за доли секунды.</p></div>
  <div class="feature"><div class="ic">${ICONS.layers}</div><h3>Пачкой</h3><p>Добавьте сотню файлов, настройте формат, качество и размер один раз и скачайте всё одним архивом.</p></div>
  <div class="feature"><div class="ic">${ICONS.gift}</div><h3>Бесплатно</h3><p>Без регистрации, водяных знаков, лимитов на число файлов и платных тарифов.</p></div>
</div>`;

function formatsTable(formats) {
  const comp = f => f.lossy ? 'С потерями' : f.id === 'gif' ? 'Без потерь, 256 цветов' : ['bmp', 'tiff', 'tga', 'ppm', 'pgm'].includes(f.id) ? 'Без сжатия' : 'Без потерь';
  return `<div class="card"><div class="table-wrap"><table>
    <thead><tr><th>Формат</th><th>Прозрачность</th><th>Сжатие</th><th>MIME-тип</th><th>Когда выбирать</th></tr></thead>
    <tbody id="ref-body">${formats.map(f =>
      `<tr data-id="${f.id}" tabindex="0"><td class="fx">${f.label} <span class="mono no">.${f.ext}</span></td>` +
      `<td class="${f.alpha ? 'yes' : 'no'}">${f.alpha ? (f.id === 'gif' ? 'Да, 1 бит' : 'Да') : 'Нет, заливка фоном'}</td>` +
      `<td>${comp(f)}</td><td class="mono no">${f.mime}</td><td>${esc(f.use)}</td></tr>`).join('')}</tbody>
  </table></div></div>`;
}

const PLUGIN = `<div class="plugin">
  <div>
    <p>Вся конвертация находится в одном файле <code>rastr-convert.js</code> без зависимостей. Подключите его на свою страницу и вызывайте из кода.</p>
    <ul>
      <li><code>convert(file, 'webp', opts)</code> — конвертация одной строкой</li>
      <li><code>formats()</code> — список форматов с описанием</li>
      <li><code>zip([{name, blob}])</code> — упаковать результаты в архив</li>
      <li><code>pdfFromCanvases([...])</code> — многостраничный PDF</li>
      <li><code>register({...})</code> — добавить свой формат</li>
    </ul>
  </div>
<pre><code><span class="c">&lt;!-- 1. подключить --&gt;</span>
&lt;script src=<span class="s">"rastr-convert.js"</span>&gt;&lt;/script&gt;

<span class="c">// 2. конвертировать файл из &lt;input type="file"&gt;</span>
<span class="k">const</span> res = <span class="k">await</span> RastrConvert.convert(file, <span class="s">'webp'</span>, {
  quality: 0.8,
  resize: { mode: <span class="s">'width'</span>, width: 1200 }
});
<span class="c">// res.blob, res.name → "photo.webp"</span></code></pre>
</div>`;

const HOME_FAQ = [
  { q: 'Это правда бесплатно?', a: 'Да. Растр бесплатный, без регистрации, водяных знаков и ограничений на количество файлов.' },
  { q: 'Куда загружаются мои картинки?', a: 'Никуда. Конвертация идёт в вашем браузере, файлы не покидают устройство. Поэтому Растр подходит даже для сканов документов.' },
  { q: 'Какие форматы поддерживаются?', a: 'На вход: PNG, JPG, WEBP, AVIF, GIF, BMP, ICO, SVG, TIFF, HEIC, TGA, PPM/PGM/PBM. На выход: PNG, JPG, WEBP, AVIF, GIF, BMP, ICO, TIFF, TGA, PDF, SVG, PPM, PGM и Base64. Подробнее — на странице <a href="/formaty/">«Форматы изображений»</a>.' },
  { q: 'Как конвертировать сразу много файлов?', a: 'Выделите все картинки в папке (<kbd>Ctrl</kbd>+<kbd>A</kbd>) и перетащите их на страницу, выберите формат и нажмите «Конвертировать». Готовые файлы можно скачать одним ZIP-архивом.' },
  { q: 'Работает ли конвертер на телефоне?', a: 'Да, в любом современном браузере на Android и iPhone. Установка приложений не нужна.' },
  { q: 'Почему файл после конвертации стал тяжелее?', a: 'Так бывает при переходе в формат без потерь: JPG в PNG, BMP или TIFF. Чтобы уменьшить вес, выбирайте JPG, WEBP или AVIF, а также воспользуйтесь страницей <a href="/szhat-foto/">«Сжать фото»</a>.' }
];

export function getPages(site, formats) {
  const pages = [];

  /* ---------- главная ---------- */
  const homeDesc = 'Бесплатный конвертер изображений онлайн: PNG, JPG, WEBP, HEIC, AVIF, PDF, ICO, SVG и другие — 14 форматов. Пакетно и без загрузки файлов на сервер.';
  pages.push({
    path: '/', file: 'index.html', ogKey: 'home', priority: '1.0', changefreq: 'weekly',
    title: 'Конвертер изображений онлайн: PNG, JPG, WEBP, HEIC | Растр',
    ogTitle: 'Растр — конвертер изображений онлайн',
    description: homeDesc,
    keywords: 'конвертер изображений, конвертер картинок онлайн, конвертировать изображение, изменить формат фото, png в jpg, jpg в png, heic в jpg, webp в jpg, конвертер фото',
    app: true,
    schema: [
      { '@context': 'https://schema.org', '@type': 'WebSite', name: site.name, alternateName: 'Растр — конвертер изображений', url: site.url + '/', inLanguage: 'ru' },
      webApp(site, 'Растр — конвертер изображений онлайн', '/', homeDesc),
      faqSchema(HOME_FAQ)
    ],
    body: `${hero({ h1: 'Конвертер изображений онлайн', lead: 'Переводите картинки между 14 форматами прямо в браузере: PNG, JPG, WEBP, HEIC с iPhone, AVIF, PDF, ICO и другие. Меняйте размер, качество и ориентацию — пачкой и без загрузки файлов на сервер.' })}
<div class="wrap">${converter()}</div>
${section('how', 'Как конвертировать изображение', 'Три шага, без регистрации и установки программ.', HOW)}
${section('popular', 'Популярные конвертеры', 'Страницы с готовыми настройками под частые задачи.', linksGrid(landings))}
${section('why', 'Почему Растр', null, FEATURES)}
${section('formats', 'Какой формат выбрать', 'Нажмите на строку, чтобы выбрать формат в конвертере. Подробнее о каждом — в <a href="/formaty/">справочнике форматов</a>.', formatsTable(formats))}
${section('faq', 'Частые вопросы', null, faqHtml(HOME_FAQ))}
${section('plugin', 'Плагин для разработчиков', 'Встройте конвертацию в свой сайт.', PLUGIN)}`
  });

  /* ---------- посадочные страницы ---------- */
  for (const l of landings) {
    const path = `/${l.slug}/`;
    const name = l.card[1] ? `${l.card[0]} в ${l.card[1]}` : l.card[0];
    const crumbs = [HOME, { name, path }];
    const related = l.related.map(s => landings.find(x => x.slug === s)).filter(Boolean);
    pages.push({
      path, file: `${l.slug}/index.html`, ogKey: l.slug, priority: '0.9', changefreq: 'monthly',
      title: l.title, description: l.description, keywords: l.keywords, ogTitle: l.h1,
      app: true, preset: l.preset, crumbs,
      schema: [webApp(site, l.h1, path, l.description), crumbsSchema(site, crumbs), faqSchema(l.faq)],
      body: `${hero({ h1: esc(l.h1), lead: esc(l.lead) })}
<div class="wrap">${converter()}</div>
<section class="wrap section"><div class="prose">
${l.sections.map(s => `<h2>${esc(s.h)}</h2>${s.html}`).join('\n')}
</div></section>
${section('faq', 'Вопросы и ответы', null, faqHtml(l.faq))}
${section('more', 'Другие конвертеры', null, linksGrid(related.concat(landings.filter(x => x !== l && !related.includes(x)).slice(0, 4))))}`
    });
  }

  /* ---------- справочник форматов ---------- */
  {
    const path = '/formaty/';
    const crumbs = [HOME, { name: 'Форматы изображений', path }];
    const meta = id => formats.find(f => f.id === id);
    const row = fi => {
      const m = meta(fi.id);
      const alpha = fi.id === 'heic' ? 'Да' : m ? (m.alpha ? (fi.id === 'gif' ? 'Да, 1 бит' : 'Да') : 'Нет') : '—';
      const comp = fi.id === 'heic' ? 'С потерями' : m ? (m.lossy ? 'С потерями' : ['bmp', 'tiff', 'tga', 'ppm', 'pgm'].includes(fi.id) ? 'Без сжатия' : 'Без потерь') : '—';
      return `<tr><td><a href="#${fi.id}">${esc(fi.name)}</a></td><td>${alpha}</td><td>${comp}</td><td>${fi.year || '—'}</td></tr>`;
    };
    const desc = 'Справочник форматов изображений: PNG, JPG, WEBP, AVIF, HEIC, GIF, TIFF, ICO, SVG, PDF и другие. Чем отличаются, где поддерживаются и какой выбрать.';
    pages.push({
      path, file: 'formaty/index.html', ogKey: 'formaty', priority: '0.7', changefreq: 'monthly', crumbs,
      title: 'Форматы изображений: чем отличаются и какой выбрать | Растр',
      description: desc,
      keywords: 'форматы изображений, форматы картинок, чем отличается png от jpg, что такое webp, что такое heic, какой формат выбрать для фото',
      schema: [crumbsSchema(site, crumbs), { '@context': 'https://schema.org', '@type': 'Article', headline: 'Форматы изображений: чем отличаются и какой выбрать', description: desc, inLanguage: 'ru', url: site.url + path, dateModified: site.date }],
      body: `${hero({ h1: 'Форматы изображений', lead: 'Чем PNG отличается от JPG, зачем нужны WEBP и AVIF, почему iPhone снимает в HEIC. Коротко о каждом формате, который понимает Растр.', chips: false })}
<section class="wrap"><div class="prose">
  <h2>Коротко</h2>
  <div class="card table-wrap"><table>
    <thead><tr><th>Формат</th><th>Прозрачность</th><th>Сжатие</th><th>Год</th></tr></thead>
    <tbody>${formatInfo.map(row).join('')}</tbody>
  </table></div>
  <p>Нужен совет попроще? Для фото — JPG, для сайта — WEBP, для логотипов и скриншотов — PNG, для иконки сайта — ICO, для документов — PDF.</p>
  ${formatInfo.map(fi => {
    const links = fi.links.map(s => landings.find(x => x.slug === s)).filter(Boolean);
    return `<h2 id="${fi.id}">${esc(fi.name)}</h2>
  <p class="meta">${esc(fi.full)}${fi.year ? ` · ${fi.year}` : ''}${fi.inputOnly ? ' · только чтение' : ''}</p>
  <p>${esc(fi.text)}</p>
  ${links.length ? `<p>Конвертеры: ${links.map(x => `<a href="/${x.slug}/">${esc(x.card[1] ? x.card[0] + ' в ' + x.card[1] : x.card[0])}</a>`).join(', ')}.</p>` : ''}`;
  }).join('\n')}
</div></section>
${section('all', 'Все конвертеры', null, linksGrid(landings))}`
    });
  }

  /* ---------- инструкция ---------- */
  {
    const path = '/instrukciya/';
    const crumbs = [HOME, { name: 'Инструкция', path }];
    const faq = [
      { q: 'Мои картинки куда-то загружаются?', a: 'Нет. Всё конвертируется в вашем браузере, файлы никуда не отправляются.' },
      { q: 'Почему кнопка AVIF серая?', a: 'Ваш браузер не умеет сохранять AVIF. Выберите WEBP или откройте сайт в другом браузере.' },
      { q: 'Не открывается TIFF или HEIC', a: 'Для этих форматов нужен интернет: модуль для их чтения загружается при первом таком файле.' },
      { q: 'Куда делась прозрачность?', a: 'JPG, BMP, PDF, PPM и PGM не хранят прозрачность, и прозрачные места заливаются выбранным фоном. Чтобы сохранить прозрачность, выбирайте PNG или WEBP.' }
    ];
    pages.push({
      path, file: 'instrukciya/index.html', ogKey: 'instrukciya', priority: '0.6', changefreq: 'monthly', crumbs,
      title: 'Как конвертировать изображения онлайн — инструкция | Растр',
      description: 'Пошаговая инструкция: как конвертировать картинки в Растре, выбрать формат и качество, изменить размер, собрать PDF и скачать всё одним архивом.',
      keywords: 'как конвертировать изображение, как изменить формат фото, как перевести картинку в другой формат, инструкция конвертер',
      schema: [crumbsSchema(site, crumbs), faqSchema(faq)],
      body: `${hero({ h1: 'Как пользоваться конвертером', lead: 'Всё, что нужно знать о Растре, на одной странице: от добавления файлов до скачивания архива.', chips: false })}
${section('steps', 'Четыре шага', null, steps([
  ['Добавьте картинки', 'Перетащите файлы на страницу, нажмите «Выбрать файлы» или вставьте картинку через <kbd>Ctrl</kbd>+<kbd>V</kbd>.'],
  ['Выберите формат', 'Справа, в блоке «Формат на выходе». Серая кнопка — формат, который ваш браузер не умеет сохранять.'],
  ['Настройте', 'Качество, фон для прозрачных мест, размер, поворот. Показываются только настройки, подходящие к формату.'],
  ['Скачайте', 'Кнопка «Скачать» у каждого файла или «Скачать всё одним .zip».']
]))}
<section class="wrap section"><div class="prose">
  <h2>Настройки</h2>
  <div class="card table-wrap"><table>
    <thead><tr><th>Настройка</th><th>Что делает</th></tr></thead>
    <tbody>
      <tr><td>Качество</td><td>Меньше — легче файл и заметнее искажения. Для фото обычно хватает 75–85%. Есть у JPG, WEBP, AVIF и PDF.</td></tr>
      <tr><td>Фон</td><td>Цвет, которым заливаются прозрачные места в форматах без прозрачности.</td></tr>
      <tr><td>Размер</td><td>В процентах, по ширине, по высоте, вписать в рамку или растянуть до точного размера.</td></tr>
      <tr><td>Поворот</td><td>90°, 180°, 270° по часовой стрелке и зеркальное отражение.</td></tr>
      <tr><td>Один PDF</td><td>Собирает все картинки в один документ, по странице на картинку.</td></tr>
      <tr><td>Размеры ICO</td><td>Какие размеры иконки положить в один файл.</td></tr>
    </tbody>
  </table></div>
  <p>Нажмите на миниатюру файла, чтобы сравнить оригинал и результат рядом. Зелёный процент — файл стал легче, красный — тяжелее.</p>
  <h2>Ограничения</h2>
  <ul>
    <li>Максимальная сторона картинки — 16 384 пикселя.</li>
    <li>Из анимированных GIF и WEBP и многостраничных TIFF берётся первый кадр.</li>
    <li>Для чтения TIFF и HEIC нужен интернет: модуль загружается при первом таком файле.</li>
  </ul>
</div></section>
${section('faq', 'Частые вопросы', null, faqHtml(faq))}
${section('all', 'Готовые конвертеры', null, linksGrid(landings))}`
    });
  }

  /* ---------- документы ---------- */
  const doc = (slug, name, title, description, content) => {
    const path = `/${slug}/`;
    const crumbs = [HOME, { name, path }];
    pages.push({
      path, file: `${slug}/index.html`, ogKey: 'home', priority: '0.2', changefreq: 'yearly', crumbs,
      title, description, schema: [crumbsSchema(site, crumbs)],
      body: `<div class="wrap doc-page"><article class="prose">${content}</article></div>`
    });
  };

  doc('konfidencialnost', 'Конфиденциальность', 'Конфиденциальность — Растр',
    'Растр обрабатывает изображения только на вашем устройстве. Регистрации, cookies и аналитики нет.', `
    <h1>Конфиденциальность</h1>
    <p class="meta">Действует с 25 сентября 2026</p>
    <h2>Ваши изображения</h2>
    <p>Файлы конвертируются в вашем браузере. Они не отправляются на сервер, не сохраняются после закрытия страницы, и никто, кроме вас, их не видит.</p>
    <h2>Что сайт не собирает</h2>
    <p>Регистрации нет. Сайт не использует cookies, счётчики и аналитику и не просит имя, почту или телефон.</p>
    <h2>Что хранится в браузере</h2>
    <p>Последний выбранный формат, чтобы не выбирать его заново. Он хранится только на вашем устройстве под ключом <code>rastr.format</code>. Удалить его можно, очистив данные сайта в браузере.</p>
    <h2>Сторонние сервисы</h2>
    <p>Шрифты загружаются с Google Fonts, а модули чтения TIFF и HEIC — с jsDelivr, только когда вы открываете такой файл. Эти сервисы, как любой сайт, видят IP-адрес и тип браузера. Изображения им не передаются.</p>`);

  doc('usloviya', 'Условия использования', 'Условия использования — Растр',
    'Условия использования Растра — бесплатного онлайн-конвертера изображений: права на файлы, гарантии и ответственность.', `
    <h1>Условия использования</h1>
    <p class="meta">Действуют с 25 сентября 2026</p>
    <ol>
      <li>Растр бесплатный и работает без регистрации. Пользуясь сайтом, вы принимаете эти условия.</li>
      <li>Сервис предоставляется «как есть», без гарантий, что он всегда будет доступен и правильно обработает любой файл.</li>
      <li>Права на изображения остаются за вами. Вы сами отвечаете за то, что вправе их обрабатывать.</li>
      <li>Конвертация может снизить качество, убрать прозрачность и метаданные. Сохраняйте оригиналы.</li>
      <li>В пределах, допустимых законом, сайт не отвечает за потерю данных и другие последствия использования.</li>
      <li>Условия могут меняться. Актуальная редакция всегда на этой странице.</li>
    </ol>`);

  doc('licenzii', 'Лицензии', 'Лицензии — Растр',
    'Открытые библиотеки и шрифты, которые использует Растр, и их лицензии.', `
    <h1>Лицензии</h1>
    <p class="meta">Обновлено 25 сентября 2026</p>
    <h2>Библиотеки</h2>
    <div class="card table-wrap"><table>
      <tbody>
        <tr><td><a href="https://github.com/photopea/UTIF.js" rel="noopener" target="_blank">UTIF.js</a></td><td>Чтение TIFF</td><td>MIT</td></tr>
        <tr><td><a href="https://github.com/nodeca/pako" rel="noopener" target="_blank">pako</a></td><td>Распаковка TIFF</td><td>MIT и Zlib</td></tr>
        <tr><td><a href="https://github.com/alexcorvi/heic2any" rel="noopener" target="_blank">heic2any</a></td><td>Чтение HEIC</td><td>MIT</td></tr>
        <tr><td><a href="https://github.com/strukturag/libheif" rel="noopener" target="_blank">libheif</a>, <a href="https://github.com/strukturag/libde265" rel="noopener" target="_blank">libde265</a></td><td>Внутри heic2any</td><td>LGPL-3.0</td></tr>
      </tbody>
    </table></div>
    <h2>Шрифты</h2>
    <p>Unbounded, Onest и JetBrains Mono распространяются по <a href="https://openfontlicense.org" rel="noopener" target="_blank">SIL Open Font License 1.1</a>.</p>`);

  /* ---------- 404 ---------- */
  pages.push({
    path: '/404.html', file: '404.html', noindex: true, ogKey: 'home',
    title: 'Страница не найдена — Растр',
    description: 'Такой страницы нет. Откройте конвертер изображений Растр или выберите нужный конвертер из списка.',
    body: `<section class="wrap missing">
  <svg viewBox="0 0 120 120" aria-hidden="true" fill="none" stroke-width="2">
    <g stroke="var(--cyan)"><circle cx="54" cy="56" r="26"/><path d="M54 18v76M16 56h76"/></g>
    <g stroke="var(--magenta)"><circle cx="66" cy="64" r="26"/><path d="M66 26v76M28 64h76"/></g>
  </svg>
  <span class="label">Ошибка 404</span>
  <h1>Такой страницы нет</h1>
  <p>Возможно, ссылка устарела или в адресе опечатка. Конвертер на месте.</p>
  <a class="btn primary" href="/">Открыть конвертер</a>
</section>
${section('all', 'Популярные конвертеры', null, linksGrid(landings.slice(0, 8)))}`
  });

  return pages;
}
