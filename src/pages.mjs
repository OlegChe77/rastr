// Все страницы сайта. Каждая: путь, title, description, ключевые слова, тело и разметка schema.org.
import { landings, tools, converters } from './content/landings.mjs';
import { formatInfo } from './content/formats.mjs';
import { documents, docGroups } from './content/documents.mjs';
import { esc, converter, docConverter, hero, faqHtml, faqSchema, linksGrid, toolsGrid, steps, crumbsSchema, cardTitle, ICONS } from './layout.mjs';

const HOME = { name: 'Главная', path: '/' };
const TOOLS_CRUMB = { name: 'Инструменты', path: '/instrumenty/' };
const DOCS_CRUMB = { name: 'Документы', path: '/dokumenty/' };
const IMAGES_CRUMB = { name: 'Картинки', path: '/konverter-izobrazhenij/' };

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

// Главная: как пользоваться сайтом целиком
const HOW = steps([
  ['Выберите раздел', 'Картинки, документы или инструменты для фото — либо сразу страницу под задачу, например «HEIC в JPG».'],
  ['Добавьте файлы', 'Перетащите их на страницу или выберите кнопкой. Можно сразу много — обработка идёт прямо в браузере.'],
  ['Скачайте результат', 'По одному файлу или всё сразу одним ZIP-архивом. Регистрация не нужна.']
]);

// Страница конвертера изображений: как работать именно с ним
const CONVERTER_STEPS = steps([
  ['Загрузите картинки', 'Бросьте файлы в рамку конвертера, нажмите «Выбрать файлы» или вставьте скриншот сочетанием Ctrl+V.'],
  ['Укажите формат', 'Нажмите нужный формат в блоке «Формат на выходе». Серые кнопки — форматы, которые ваш браузер сохранить не может.'],
  ['Настройте результат', 'Качество, фон вместо прозрачности, размер, поворот. Показываются только настройки, которые имеют смысл для формата.'],
  ['Сохраните файлы', 'Кнопка «Скачать» у каждого файла или «Скачать всё одним .zip». Миниатюра открывает сравнение до и после.']
]);

// Три раздела сайта — карточки на главной
const SECTIONS = [
  { slug: 'konverter-izobrazhenij', icon: 'image', card: ['Картинки', null, '14 форматов: PNG, JPG, WEBP, HEIC с iPhone, AVIF, ICO, TIFF, PDF и другие. Размер, качество, поворот.'] },
  { slug: 'dokumenty', icon: 'doc', card: ['Документы', null, 'PDF в Word и JPG, Word в PDF, Excel в CSV, Markdown в HTML. Объединение и разделение PDF.'] },
  { slug: 'instrumenty', icon: 'wrench', card: ['Инструменты', null, 'Сжать фото, уложиться в лимит сайта вроде 200 КБ, изменить размер в пикселях.'] }
];

const STATS = `<ul class="stats-row">
  <li><b>14</b><span>форматов картинок на выход</span></li>
  <li><b>10</b><span>форматов документов на вход</span></li>
  <li><b>40+</b><span>готовых страниц под задачи</span></li>
  <li><b>0 байт</b><span>ваших файлов на сервере</span></li>
</ul>`;

const FEATURES = `<div class="features">
  <div class="feature"><div class="ic">${ICONS.lock}</div><h3>Файлы остаются у вас</h3><p>Конвертация идёт прямо в браузере. Фото, сканы и макеты не загружаются ни на какой сервер.</p></div>
  <div class="feature"><div class="ic">${ICONS.bolt}</div><h3>Быстро</h3><p>Не нужно ждать загрузки и скачивания: картинка обрабатывается на вашем устройстве за доли секунды.</p></div>
  <div class="feature"><div class="ic">${ICONS.layers}</div><h3>Пачкой</h3><p>Добавьте сотню файлов, настройте формат, качество и размер один раз и скачайте всё одним архивом.</p></div>
  <div class="feature"><div class="ic">${ICONS.gift}</div><h3>Бесплатно</h3><p>Без регистрации, водяных знаков, лимитов на число файлов и платных тарифов.</p></div>
</div>`;

// interactive — таблица на странице конвертера: клик по строке выбирает формат (app.js).
// На главной — справочная, названия форматов ведут в справочник.
function formatsTable(formats, interactive) {
  const comp = f => f.lossy ? 'С потерями' : f.id === 'gif' ? 'Без потерь, 256 цветов' : ['bmp', 'tiff', 'tga', 'ppm', 'pgm'].includes(f.id) ? 'Без сжатия' : 'Без потерь';
  const ref = { jpeg: 'jpeg', png: 'png', webp: 'webp', avif: 'avif', gif: 'gif', bmp: 'bmp', ico: 'ico', tiff: 'tiff', tga: 'tga', pdf: 'pdf', svg: 'svg', ppm: 'ppm', pgm: 'ppm', datauri: 'datauri' };
  return `<div class="card"><div class="table-wrap"><table>
    <thead><tr><th>Формат</th><th>Прозрачность</th><th>Сжатие</th><th>MIME-тип</th><th>Когда выбирать</th></tr></thead>
    <tbody${interactive ? ' id="ref-body"' : ''}>${formats.map(f =>
      (interactive
        ? `<tr data-id="${f.id}" tabindex="0"><td class="fx">${f.label} <span class="mono no">.${f.ext}</span></td>`
        : `<tr><td class="fx"><a href="/formaty/#${ref[f.id]}">${f.label}</a> <span class="mono no">.${f.ext}</span></td>`) +
      `<td class="${f.alpha ? 'yes' : 'no'}">${f.alpha ? (f.id === 'gif' ? 'Да, 1 бит' : 'Да') : 'Нет, заливка фоном'}</td>` +
      `<td>${comp(f)}</td><td class="mono no">${f.mime}</td><td>${esc(f.use)}</td></tr>`).join('')}</tbody>
  </table></div></div>`;
}


const HOME_FAQ = [
  { q: 'Это правда бесплатно?', a: 'Да. Растр бесплатный, без регистрации, водяных знаков и ограничений на количество файлов.' },
  { q: 'Куда загружаются мои файлы?', a: 'Никуда. Картинки и документы обрабатываются в вашем браузере и не покидают устройство. Поэтому Растр подходит даже для сканов паспорта и договоров.' },
  { q: 'С чего начать?', a: 'Для картинок откройте <a href="/konverter-izobrazhenij/">конвертер изображений</a>, для PDF, Word и таблиц — <a href="/dokumenty/">конвертер документов</a>. Если задача частая, например «HEIC в JPG» или «объединить PDF», сразу выберите её страницу ниже — там уже всё настроено.' },
  { q: 'Какие форматы поддерживаются?', a: 'Картинки: PNG, JPG, WEBP, AVIF, GIF, BMP, ICO, SVG, TIFF, HEIC, TGA, PPM/PGM/PBM. Документы: PDF, Word (DOCX), Excel (XLSX, XLS, ODS), CSV, TXT, Markdown, HTML и JSON. Подробнее о картинках — в <a href="/formaty/">справочнике форматов</a>.' },
  { q: 'Работает ли Растр на телефоне?', a: 'Да, в любом современном браузере на Android и iPhone. Установка приложений не нужна.' },
  { q: 'Почему файл после конвертации стал тяжелее?', a: 'Так бывает при переходе в формат без потерь: JPG в PNG, BMP или TIFF. Чтобы уменьшить вес, выбирайте JPG, WEBP или AVIF, а также воспользуйтесь страницей <a href="/szhat-foto/">«Сжать фото»</a>.' }
];

const CONVERTER_FAQ = [
  { q: 'Можно ли вставить скриншот, не сохраняя его в файл?', a: 'Да. Сделайте снимок экрана, откройте эту страницу и нажмите <kbd>Ctrl</kbd>+<kbd>V</kbd> — картинка сразу появится в очереди.' },
  { q: 'Запоминается ли выбранный формат?', a: 'Да, последний формат сохраняется в вашем браузере, и при следующем визите он будет выбран сразу.' },
  { q: 'Что значит ошибка «Браузер не смог открыть этот файл»?', a: 'Файл повреждён или это не картинка. Проверьте, открывается ли он в программе просмотра, и добавьте снова.' },
  { q: 'Как сделать из картинок один PDF?', a: 'Выберите формат PDF и поставьте галочку «Собрать все картинки в один PDF». Для документов Word и таблиц есть отдельный <a href="/dokumenty/">конвертер документов</a>.' }
];

export function getPages(site, formats) {
  const pages = [];

  /* ---------- главная: о сервисе и все разделы ---------- */
  const homeDesc = 'Растр переводит картинки и документы между форматами прямо в браузере: PNG, JPG, HEIC, WEBP, PDF, Word, Excel. Бесплатно, без регистрации и загрузки на сервер.';
  pages.push({
    path: '/', file: 'index.html', ogKey: 'home', priority: '1.0', changefreq: 'weekly',
    title: 'Растр — онлайн-конвертер картинок и документов без сервера',
    ogTitle: 'Растр — конвертер картинок и документов',
    description: homeDesc,
    keywords: 'онлайн конвертер файлов, конвертер картинок и документов, конвертер без загрузки на сервер, конвертер изображений, конвертер документов, конвертер pdf, конвертер фото онлайн',
    schema: [
      { '@context': 'https://schema.org', '@type': 'WebSite', name: site.name, alternateName: 'Растр — конвертер картинок и документов', url: site.url + '/', inLanguage: 'ru', description: homeDesc },
      { '@context': 'https://schema.org', '@type': 'ItemList', name: 'Разделы Растра',
        itemListElement: SECTIONS.map((s, i) => ({ '@type': 'ListItem', position: i + 1, name: s.card[0], url: site.url + '/' + s.slug + '/' })) },
      faqSchema(HOME_FAQ)
    ],
    body: `${hero({
      h1: 'Онлайн-конвертер картинок и документов',
      lead: 'Растр переводит файлы между форматами прямо в браузере: фото с iPhone в JPG, PNG в WEBP, PDF в Word, Word в PDF, Excel в CSV. Сжимает фото до нужного веса и меняет размер. Бесплатно, без регистрации — и файлы не покидают ваше устройство.',
      cta: [['/konverter-izobrazhenij/', 'Конвертировать картинки', 'image'], ['/dokumenty/', 'Конвертировать документы', 'doc'], ['/instrumenty/', 'Инструменты для фото', 'wrench']],
      chips: false, center: true
    })}
${section('sections', 'Что умеет Растр', 'Три раздела — выберите нужный или сразу страницу под задачу ниже.', toolsGrid(SECTIONS))}
<section class="wrap">${STATS}</section>
${section('how', 'Как пользоваться Растром', 'Три шага, без регистрации и установки программ.', HOW)}
${section('why', 'Почему Растр', null, FEATURES)}
${section('popular', 'Конвертеры картинок', 'Страницы с готовыми настройками под частые пары форматов. <a href="/konverter-izobrazhenij/">Открыть конвертер изображений</a>.', linksGrid(converters))}
${section('docs', 'Конвертер документов', 'PDF, Word, Excel, CSV, TXT и Markdown — тоже прямо в браузере. <a href="/dokumenty/">Все конвертеры документов</a>.', linksGrid(documents.slice(0, 8)))}
${section('tools', 'Инструменты для фото', 'Отдельные сервисы под частые задачи: уменьшить вес, уложиться в лимит сайта, поменять размер.', toolsGrid(tools))}
${section('formats', 'Какой формат выбрать', 'Коротко о форматах картинок. Подробнее о каждом — в <a href="/formaty/">справочнике форматов</a>.', formatsTable(formats, false))}
${section('faq', 'Частые вопросы', null, faqHtml(HOME_FAQ))}`
  });

  /* ---------- конвертер изображений: сам конвертер и как с ним работать ---------- */
  {
    const path = '/konverter-izobrazhenij/';
    const crumbs = [HOME, IMAGES_CRUMB];
    const desc = 'Конвертер изображений онлайн: PNG, JPG, WEBP, HEIC, AVIF, ICO, SVG, TIFF, PDF — 14 форматов. Пакетно, с настройкой качества и размера, без загрузки на сервер.';
    pages.push({
      path, file: 'konverter-izobrazhenij/index.html', ogKey: 'konverter-izobrazhenij', priority: '1.0', changefreq: 'weekly', crumbs,
      title: 'Конвертер изображений онлайн: PNG, JPG, WEBP, HEIC | Растр',
      ogTitle: 'Конвертер изображений онлайн',
      description: desc,
      keywords: 'конвертер изображений онлайн, конвертер картинок, конвертировать изображение, изменить формат фото, конвертер фото онлайн, png jpg webp heic',
      app: true,
      schema: [webApp(site, 'Конвертер изображений онлайн', path, desc), crumbsSchema(site, crumbs), faqSchema(CONVERTER_FAQ)],
      body: `${hero({ h1: 'Конвертер изображений онлайн', lead: 'Переводите картинки между 14 форматами прямо в браузере: PNG, JPG, WEBP, HEIC с iPhone, AVIF, PDF, ICO и другие. Меняйте размер, качество и ориентацию — пачкой и без загрузки файлов на сервер.' })}
<div class="wrap">${converter()}</div>
${section('how', 'Как работать с конвертером', 'Четыре шага от файла до результата.', CONVERTER_STEPS)}
<section class="wrap section"><div class="prose">
  <h2>Что означают настройки</h2>
  <div class="card table-wrap"><table>
    <thead><tr><th>Блок</th><th>Для чего</th></tr></thead>
    <tbody>
      <tr><td>Формат на выходе</td><td>Во что сохранить картинки. Значок с клетками — формат поддерживает прозрачность.</td></tr>
      <tr><td>Качество</td><td>Для JPG, WEBP, AVIF и PDF: ниже — легче файл, но заметнее искажения. Для фото хватает 75–85%.</td></tr>
      <tr><td>Сжать до размера файла</td><td>Задайте вес, например 200 КБ, — качество подберётся само.</td></tr>
      <tr><td>Фон вместо прозрачности</td><td>Цвет для прозрачных мест в форматах, которые не хранят прозрачность.</td></tr>
      <tr><td>Размер</td><td>В процентах, по ширине, по высоте, вписать в рамку или растянуть до точного размера.</td></tr>
      <tr><td>Поворот и отражение</td><td>90°, 180°, 270° и зеркальное отражение — применяются ко всем файлам сразу.</td></tr>
    </tbody>
  </table></div>
  <p>Настройки действуют на все файлы в очереди. Поменяли их после конвертации — нажмите кнопку ещё раз, результаты пересчитаются.</p>
  <h2>Полезные приёмы</h2>
  <ul>
    <li>Файлы можно бросать в любое место страницы, не только в рамку конвертера.</li>
    <li>Зелёный процент у готового файла — насколько он стал легче, красный — насколько тяжелее исходника.</li>
    <li>Для частых задач есть страницы с готовыми настройками — они перечислены в конце этой страницы.</li>
    <li>Документы PDF, Word и Excel конвертируются в отдельном разделе <a href="/dokumenty/">«Документы»</a>.</li>
  </ul>
</div></section>
${section('formats', 'Выберите формат под задачу', 'Нажмите на строку — формат выберется в конвертере выше.', formatsTable(formats, true))}
${section('faq', 'Вопросы о конвертере изображений', null, faqHtml(CONVERTER_FAQ))}
${section('popular', 'Конвертеры форматов', 'Готовые настройки под частые пары форматов.', linksGrid(converters))}`
    });
  }

  /* ---------- посадочные страницы ---------- */
  for (const l of landings) {
    const path = `/${l.slug}/`;
    const name = l.card[1] ? `${l.card[0]} в ${l.card[1]}` : l.card[0];
    const isTool = l.kind === 'tool';
    const crumbs = isTool ? [HOME, TOOLS_CRUMB, { name, path }] : [HOME, IMAGES_CRUMB, { name, path }];
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
${isTool
  ? section('more', 'Другие инструменты', null, toolsGrid(tools.filter(x => x !== l))) + '\n' + section('conv', 'Конвертеры форматов', null, linksGrid(converters.slice(0, 8)))
  : section('more', 'Другие конвертеры', null, linksGrid(related.concat(landings.filter(x => x !== l && !related.includes(x)).slice(0, 4))))}`
    });
  }

  /* ---------- конвертеры документов ---------- */
  for (const d of documents) {
    const path = `/${d.slug}/`;
    const name = d.card[1] ? `${d.card[0]} в ${d.card[1]}` : d.card[0];
    const crumbs = [HOME, DOCS_CRUMB, { name, path }];
    const related = d.related.map(s => documents.find(x => x.slug === s)).filter(Boolean);
    const more = related.concat(documents.filter(x => x !== d && !related.includes(x) && x.group === d.group)).slice(0, 4);
    pages.push({
      path, file: `${d.slug}/index.html`, ogKey: d.slug, priority: '0.9', changefreq: 'monthly',
      title: d.title, description: d.description, keywords: d.keywords, ogTitle: d.h1,
      docs: true, preset: d.preset, crumbs,
      schema: [webApp(site, d.h1, path, d.description), crumbsSchema(site, crumbs), faqSchema(d.faq)],
      body: `${hero({ h1: esc(d.h1), lead: esc(d.lead) })}
<div class="wrap">${docConverter()}</div>
<section class="wrap section"><div class="prose">
${d.sections.map(s => `<h2>${esc(s.h)}</h2>${s.html}`).join('\n')}
</div></section>
${section('faq', 'Вопросы и ответы', null, faqHtml(d.faq))}
${section('more', 'Другие конвертеры документов', null, linksGrid(more))}`
    });
  }

  /* ---------- раздел «Документы» ---------- */
  {
    const path = '/dokumenty/';
    const crumbs = [HOME, DOCS_CRUMB];
    const desc = 'Бесплатный конвертер документов онлайн: PDF в Word и JPG, Word в PDF, Excel в CSV, объединение и разделение PDF. Файлы обрабатываются в браузере, без загрузки на сервер.';
    const faq = [
      { q: 'Какие документы можно конвертировать?', a: 'PDF, Word (DOCX), Excel (XLSX, XLS, ODS), CSV, TXT, Markdown, HTML и JSON. Старый формат .doc нужно сначала пересохранить в Word как .docx.' },
      { q: 'Почему документы не загружаются на сервер?', a: 'Все преобразования выполняют библиотеки, которые работают прямо в браузере. Поэтому договоры, сканы паспортов и отчёты не покидают ваше устройство.' },
      { q: 'Нужен ли интернет?', a: 'Да, при первом использовании: модули для чтения PDF, Word и таблиц подгружаются с CDN. Сами документы при этом никуда не отправляются.' },
      { q: 'Есть ли ограничение на размер файла?', a: 'Жёсткого лимита нет, всё зависит от памяти устройства. PDF в сотни страниц обрабатываются, но на телефоне это может занять минуту-другую.' }
    ];
    pages.push({
      path, file: 'dokumenty/index.html', ogKey: 'dokumenty', priority: '0.9', changefreq: 'weekly', crumbs,
      title: 'Конвертер документов онлайн: PDF, Word, Excel, CSV | Растр',
      description: desc,
      keywords: 'конвертер документов онлайн, конвертировать документ, pdf в word, word в pdf, pdf в jpg, excel в csv, объединить pdf',
      docs: true,
      schema: [webApp(site, 'Конвертер документов онлайн', path, desc), crumbsSchema(site, crumbs), faqSchema(faq)],
      body: `${hero({ h1: 'Конвертер документов онлайн', lead: 'PDF, Word, Excel, CSV, TXT и Markdown — в нужный формат прямо в браузере. Объединяйте и разделяйте PDF, достаньте текст или сделайте из документа картинки. Файлы не загружаются на сервер.' })}
<div class="wrap">${docConverter()}</div>
${docGroups.map(g => section('g-' + g.id, g.title, g.sub, linksGrid(documents.filter(d => d.group === g.id)))).join('\n')}
<section class="wrap section"><div class="prose">
  <h2>Что во что можно перевести</h2>
  <div class="card table-wrap"><table>
    <thead><tr><th>Исходный файл</th><th>Результат</th></tr></thead>
    <tbody>
      <tr><td>PDF</td><td>JPG, PNG, TXT, Word; объединение и разделение</td></tr>
      <tr><td>Word (DOCX)</td><td>PDF, TXT, HTML, Markdown</td></tr>
      <tr><td>TXT</td><td>PDF, Word, HTML</td></tr>
      <tr><td>Markdown</td><td>HTML, PDF, Word</td></tr>
      <tr><td>HTML</td><td>PDF, Word, TXT, Markdown</td></tr>
      <tr><td>Excel, XLS, ODS</td><td>CSV, JSON, PDF, Excel</td></tr>
      <tr><td>CSV, JSON</td><td>Excel, CSV, JSON, PDF</td></tr>
    </tbody>
  </table></div>
  <p>Нужно сделать PDF из фотографий или сканов? Для этого есть конвертер картинок: <a href="/jpg-v-pdf/">JPG в PDF</a>.</p>
</div></section>
${section('faq', 'Вопросы о конвертере документов', null, faqHtml(faq))}`
    });
  }

  /* ---------- раздел «Инструменты» ---------- */
  {
    const path = '/instrumenty/';
    const crumbs = [HOME, TOOLS_CRUMB];
    const desc = 'Бесплатные инструменты для фото: сжать фото, сжать до 200 КБ или 1 МБ, изменить размер в пикселях. Работают в браузере, файлы не загружаются на сервер.';
    const faq = [
      { q: 'Чем «Сжать фото» отличается от «Сжать до N КБ»?', a: 'В первом вы сами выбираете качество и максимальный размер в пикселях, а итоговый вес зависит от снимка. Во втором задаёте вес, например 200 КБ, и Растр сам подбирает качество и размер так, чтобы файл точно в него уложился.' },
      { q: 'Можно ли сначала изменить размер, а потом сжать?', a: 'Да, и отдельных шагов не нужно: в каждом инструменте есть блок «Размер». Например, в «Сжать до N КБ» можно сразу вписать фото в 1600 пикселей и задать лимит 300 КБ.' },
      { q: 'Инструменты тоже работают без загрузки на сервер?', a: 'Да. Сжатие и изменение размера выполняются в вашем браузере так же, как конвертация форматов.' }
    ];
    pages.push({
      path, file: 'instrumenty/index.html', ogKey: 'instrumenty', priority: '0.8', changefreq: 'monthly', crumbs,
      title: 'Инструменты для фото онлайн: сжать и изменить размер | Растр',
      description: desc,
      keywords: 'инструменты для фото онлайн, сжать фото, изменить размер фото, сжать фото до кб, уменьшить фото онлайн',
      schema: [crumbsSchema(site, crumbs), faqSchema(faq), {
        '@context': 'https://schema.org', '@type': 'ItemList', name: 'Инструменты для фото',
        itemListElement: tools.map((l, i) => ({ '@type': 'ListItem', position: i + 1, name: l.card[0], url: site.url + '/' + l.slug + '/' }))
      }],
      body: `${hero({ h1: 'Инструменты для фото', lead: 'Три отдельных сервиса для задач, где формат менять не нужно: уменьшить вес снимка, уложиться в ограничение сайта или подогнать размер в пикселях.', chips: false })}
<section class="wrap">${toolsGrid(tools)}</section>
<section class="wrap section"><div class="prose">
  <h2>Какой инструмент выбрать</h2>
  <div class="card table-wrap"><table>
    <thead><tr><th>Задача</th><th>Инструмент</th></tr></thead>
    <tbody>
      <tr><td>Фото не отправляется по почте или долго грузится</td><td><a href="/szhat-foto/">Сжать фото</a></td></tr>
      <tr><td>Сайт пишет «файл не должен превышать 200 КБ»</td><td><a href="/szhat-foto-do-kb/">Сжать до N КБ</a></td></tr>
      <tr><td>Нужна картинка ровно 1080 пикселей по ширине</td><td><a href="/izmenit-razmer-foto/">Изменить размер фото</a></td></tr>
      <tr><td>Нужно поменять формат, например HEIC на JPG</td><td><a href="/konverter-izobrazhenij/">Конвертер изображений</a></td></tr>
    </tbody>
  </table></div>
  <p>Все инструменты принимают те же 12 форматов, что и конвертер, обрабатывают сразу много файлов и отдают результат одним ZIP-архивом. Настройки размера, поворота и фона для прозрачных мест есть в каждом из них.</p>
</div></section>
${section('faq', 'Вопросы об инструментах', null, faqHtml(faq))}
${section('conv', 'Конвертеры форматов', null, linksGrid(converters))}`
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
      { q: 'Почему некоторые форматы в списке серые?', a: 'Эти форматы ваш браузер не умеет сохранять. Чаще всего это AVIF. Выберите WEBP или откройте сайт в свежей версии Chrome.' },
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
    'Растр обрабатывает изображения только на вашем устройстве. Для статистики посещений используется Яндекс Метрика; картинки ей не передаются.', `
    <h1>Конфиденциальность</h1>
    <p class="meta">Действует с 25 сентября 2026</p>
    <h2>Ваши изображения</h2>
    <p>Файлы конвертируются в вашем браузере. Они не отправляются на сервер, не сохраняются после закрытия страницы, и никто, кроме вас, их не видит.</p>
    <h2>Что сайт не собирает</h2>
    <p>Регистрации нет. Сайт не просит имя, почту или телефон, а ваши картинки, их имена и миниатюры никуда не отправляются.</p>
    <h2>Яндекс Метрика и cookies</h2>
    <p>Чтобы понимать, сколько людей пользуются сайтом, откуда они приходят и что им неудобно, на сайте установлена Яндекс Метрика. Она ставит cookies и собирает обезличенные данные о посещении: страницы, переходы, клики, тип устройства и браузера, примерное местоположение по IP-адресу.</p>
    <p>В Метрике включён Вебвизор — запись того, как посетители пользуются страницей. Область с вашими файлами, их именами и миниатюрами, а также окно сравнения «до и после» скрыты от записи: вместо них Вебвизор сохраняет серые блоки. Данные Метрики обрабатывает ООО «Яндекс» по своей <a href="https://yandex.ru/legal/confidential/ru/" rel="noopener" target="_blank">политике конфиденциальности</a>.</p>
    <p>Отказаться от сбора можно, запретив cookies для этого сайта в настройках браузера или установив <a href="https://yandex.ru/support/metrica/ru/general/opt-out.html" rel="noopener" target="_blank">блокировщик Метрики</a>. Конвертер при этом продолжит работать.</p>
    <h2>Что хранится в браузере</h2>
    <p>Последний выбранный формат, чтобы не выбирать его заново (ключ <code>rastr.format</code>), и отметка, что вы закрыли уведомление о cookies (ключ <code>rastr.cookies</code>). Они хранятся только на вашем устройстве. Удалить их можно, очистив данные сайта в браузере.</p>
    <h2>Сторонние сервисы</h2>
    <p>Шрифты загружаются с Google Fonts. Модули для чтения TIFF, HEIC и документов (PDF, Word, Markdown) и шрифт для создаваемых PDF — с jsDelivr, модуль для таблиц Excel — с cdn.sheetjs.com. Модули загружаются только когда нужны. Эти сервисы, как любой сайт, видят IP-адрес и тип браузера. Ваши изображения и документы им не передаются: всё обрабатывается на вашем устройстве.</p>
    <h2>Счётчик посещений</h2>
    <p>Внизу страницы показано число посещений сегодня и всего. Его считает открытый сервис hits.sh: при открытии страницы браузер загружает с него картинку-счётчик. Сервис не ставит cookies и не получает адрес страницы, с которой пришёл запрос, но, как любой сервер, видит IP-адрес и тип браузера.</p>`);

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
        <tr><td><a href="https://github.com/mozilla/pdf.js" rel="noopener" target="_blank">pdf.js</a></td><td>Чтение и отрисовка PDF</td><td>Apache-2.0</td></tr>
        <tr><td><a href="https://github.com/Hopding/pdf-lib" rel="noopener" target="_blank">pdf-lib</a></td><td>Создание, объединение и разделение PDF</td><td>MIT</td></tr>
        <tr><td><a href="https://github.com/Hopding/fontkit" rel="noopener" target="_blank">fontkit</a></td><td>Шрифты в создаваемых PDF</td><td>MIT</td></tr>
        <tr><td><a href="https://github.com/mwilliamson/mammoth.js" rel="noopener" target="_blank">mammoth</a></td><td>Чтение документов Word</td><td>BSD-2-Clause</td></tr>
        <tr><td><a href="https://github.com/dolanmiu/docx" rel="noopener" target="_blank">docx</a></td><td>Создание документов Word</td><td>MIT</td></tr>
        <tr><td><a href="https://github.com/markedjs/marked" rel="noopener" target="_blank">marked</a></td><td>Разбор Markdown</td><td>MIT</td></tr>
        <tr><td><a href="https://sheetjs.com" rel="noopener" target="_blank">SheetJS Community Edition</a></td><td>Таблицы Excel, CSV, JSON</td><td>Apache-2.0</td></tr>
      </tbody>
    </table></div>
    <h2>Шрифты</h2>
    <p>Unbounded, Onest и JetBrains Mono на сайте и PT Sans (ParaType) в создаваемых PDF распространяются по <a href="https://openfontlicense.org" rel="noopener" target="_blank">SIL Open Font License 1.1</a>.</p>`);

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
  <p>Возможно, ссылка устарела или в адресе опечатка. Все конвертеры на месте.</p>
  <div class="hero-cta"><a class="btn primary" href="/">На главную</a><a class="btn" href="/konverter-izobrazhenij/">Конвертер изображений</a><a class="btn" href="/dokumenty/">Конвертер документов</a></div>
</section>
${section('all', 'Популярные конвертеры', null, linksGrid(landings.slice(0, 8)))}`
  });

  return pages;
}
