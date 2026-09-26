// Шаблоны страниц: <head> с SEO-разметкой, шапка, хлебные крошки, конвертер, подвал.
import { landings, tools, converters } from './content/landings.mjs';
import { documents } from './content/documents.mjs';

export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const stripTags = s => String(s).replace(/<[^>]+>/g, '');

const LOGO_MARK = `<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#0F1320"/><circle cx="25" cy="26" r="13" fill="#1FB8E0"/><circle cx="39" cy="26" r="13" fill="#FF3D8B" style="mix-blend-mode:screen"/><circle cx="32" cy="38" r="13" fill="#FFC23D" style="mix-blend-mode:screen"/></svg>`;

const ICONS = {
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>',
  // иконки разделов главной: картинка, документ, инструменты
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>',
  wrench: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/></svg>',
  // иконки инструментов: сжатие (стрелки внутрь), вес с отметкой лимита, размер (рамка со стрелками наружу)
  compress: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 20h12l-1.5-9h-9z"/><path d="M9 11a3 3 0 0 1 6 0"/><path d="M4 5h16"/><path d="M12 5v3"/></svg>',
  resize: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="10" height="10" rx="1.5"/><path d="M17 7h4v4M21 7l-6 6M7 17v4h4M7 21l6-6"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>'
};
export { ICONS };

export const NAV = [
  { href: '/konverter-izobrazhenij/', label: 'Картинки' },
  { href: '/dokumenty/', label: 'Документы' },
  { href: '/instrumenty/', label: 'Инструменты' },
  { href: '/formaty/', label: 'Форматы', cls: 'hide-xs' },
  { href: '/instrukciya/', label: 'Инструкция', cls: 'hide-sm' }
];

/* ---------------- <head> ---------------- */

// Политика безопасности контента. Встроена в каждую страницу метатегом, поэтому действует везде,
// где открыт сайт, и проверяется тестами.
// 'unsafe-eval' нужен только декодеру HEIC (heic2any собран Emscripten и создаёт функции через new Function
// в своём Worker). Встроенные скрипты и чужие адреса по-прежнему запрещены.
// Адреса Яндекс Метрики — по документации «Установка счётчика при использовании CSP»:
// региональные mc.yandex.*, Вебвизор и yastatic.net.
export const METRIKA_HOSTS = ['ru', 'az', 'by', 'co.il', 'com', 'com.am', 'com.ge', 'com.tr', 'ee', 'fr', 'kg', 'kz', 'lt', 'lv', 'md', 'tj', 'tm', 'uz']
  .map(z => 'mc.yandex.' + z).concat('mc.webvisor.com', 'mc.webvisor.org', 'yastatic.net');
const METRIKA_HTTPS = METRIKA_HOSTS.map(h => 'https://' + h).join(' ');
const METRIKA_WSS = METRIKA_HOSTS.map(h => 'wss://' + h).join(' ');

// Библиотеки конвертера документов (rastr-docs.js) — конкретные версии, не весь CDN
const DOC_LIBS = ['pdfjs-dist@3.11.174/', 'pdf-lib@1.17.1/', '@pdf-lib/fontkit@1.1.1/', 'mammoth@1.8.0/', 'docx@8.5.0/', 'marked@12.0.2/']
  .map(p => 'https://cdn.jsdelivr.net/npm/' + p).concat('https://cdn.sheetjs.com/xlsx-0.20.3/').join(' ');
// Что конвертер документов скачивает через fetch: Worker и данные pdf.js, шрифт PT Sans для создаваемых PDF
const DOC_DATA = ['pdfjs-dist@3.11.174/', '@expo-google-fonts/pt-sans@0.2.3/'].map(p => 'https://cdn.jsdelivr.net/npm/' + p).join(' ');

export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' https://cdn.jsdelivr.net/npm/pako@1.0.11/ https://cdn.jsdelivr.net/npm/utif@3.1.0/ https://cdn.jsdelivr.net/npm/heic2any@0.0.4/ " + DOC_LIBS + ' ' + METRIKA_HTTPS,
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // data: — шрифты, встроенные в открываемые PDF; standard_fonts — стандартные шрифты pdf.js для PDF без встроенных
  "font-src https://fonts.gstatic.com data: https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/",
  "img-src 'self' data: blob: https://hits.sh " + METRIKA_HTTPS,
  "connect-src 'self' blob: data: " + DOC_DATA + ' ' + METRIKA_HTTPS + ' ' + METRIKA_WSS,
  "frame-src 'self' " + METRIKA_HTTPS,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');

function head(p, site, assets) {
  const url = site.url + p.path;
  const og = site.url + (p.ogImage || '/assets/og/home.png');
  const tags = [
    `<meta charset="utf-8">`,
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
    `<meta name="referrer" content="strict-origin-when-cross-origin">`,
    site.metrika ? `<script src="${assets['metrika.js']}" data-id="${site.metrika}" data-host="${esc(new URL(site.url).host)}" async></script>` : '',
    `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`,
    `<title>${esc(p.title)}</title>`,
    `<meta name="description" content="${esc(p.description)}">`,
    p.keywords ? `<meta name="keywords" content="${esc(p.keywords)}">` : '',
    p.noindex ? `<meta name="robots" content="noindex, follow">`
      : `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">`,
    p.noindex ? '' : `<link rel="canonical" href="${esc(url)}">`,
    site.yandexVerification ? `<meta name="yandex-verification" content="${esc(site.yandexVerification)}">` : '',
    site.googleVerification ? `<meta name="google-site-verification" content="${esc(site.googleVerification)}">` : '',
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(site.name)}">`,
    `<meta property="og:locale" content="ru_RU">`,
    `<meta property="og:title" content="${esc(p.ogTitle || p.title)}">`,
    `<meta property="og:description" content="${esc(p.description)}">`,
    p.noindex ? '' : `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(og)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${esc(p.ogTitle || p.title)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<link rel="icon" href="/favicon.ico" sizes="any">`,
    `<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">`,
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
    `<link rel="manifest" href="/site.webmanifest">`,
    `<meta name="theme-color" content="#F6F7FA" media="(prefers-color-scheme: light)">`,
    `<meta name="theme-color" content="#0B0D12" media="(prefers-color-scheme: dark)">`,
    `<link rel="preconnect" href="https://fonts.googleapis.com">`,
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
    `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Unbounded:wght@700;800&family=Onest:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">`,
    `<link rel="stylesheet" href="${assets['site.css']}">`,
    ...(p.schema || []).map(s => `<script type="application/ld+json">${JSON.stringify(s).replace(/</g, '\\u003c')}</script>`)
  ];
  return tags.filter(Boolean).join('\n');
}

/* ---------------- шапка, крошки, подвал ---------------- */

function header(p) {
  const links = NAV.map(n =>
    `<a href="${n.href}"${n.cls ? ` class="${n.cls}"` : ''}${p.path === n.href ? ' aria-current="page"' : ''}>${n.label}</a>`).join('');
  return `<a class="skip" href="#main">Перейти к содержимому</a>
<header class="site-head">
  <div class="wrap head-in">
    <a class="logo" href="/" aria-label="Растр — конвертер картинок и документов, на главную">${LOGO_MARK}<b>Растр</b></a>
    <nav class="menu" aria-label="Основное меню">${links}</nav>
  </div>
</header>`;
}

export function crumbsSchema(site, crumbs) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: site.url + c.path }))
  };
}

function crumbsHtml(crumbs) {
  if (!crumbs || crumbs.length < 2) return '';
  return `<nav class="wrap crumbs" aria-label="Хлебные крошки"><ol>${crumbs.map((c, i) =>
    i === crumbs.length - 1 ? `<li><span aria-current="page">${esc(c.name)}</span></li>` : `<li><a href="${c.path}">${esc(c.name)}</a></li>`).join('')}</ol></nav>`;
}

export function cardTitle(l) {
  return l.card[1] ? `${esc(l.card[0])} <span>→</span> ${esc(l.card[1])}` : esc(l.card[0]);
}
const plainCard = l => l.card[1] ? `${l.card[0]} в ${l.card[1]}` : l.card[0];

function footer(site) {
  const host = new URL(site.url).host;
  const key = site.counterKey || host;
  const counter = site.counter
    ? `<span class="counter" id="counter" hidden data-host="${esc(host)}" data-src="https://hits.sh/${esc(encodeURIComponent(key))}.svg?view=today-total&amp;label=%D0%9F%D0%BE%D1%81%D0%B5%D1%89%D0%B5%D0%BD%D0%B8%D0%B9&amp;style=flat-square&amp;color=0f1320&amp;labelColor=5e6679"></span>`
    : '';
  const col = (title, items) => `<div class="foot-col"><h2>${title}</h2><ul>${items.map(([href, label]) => `<li><a href="${href}">${esc(label)}</a></li>`).join('')}</ul></div>`;
  const conv = [['/konverter-izobrazhenij/', 'Конвертер изображений']].concat(converters.map(l => [`/${l.slug}/`, plainCard(l)]));
  const dl = documents.map(d => [`/${d.slug}/`, plainCard(d)]).concat([['/dokumenty/', 'Все документы']]);
  const tl = tools.map(l => [`/${l.slug}/`, l.card[0]]).concat([['/instrumenty/', 'Все инструменты']]);
  return `<footer class="site-foot">
  <div class="wrap">
    <div class="foot-grid">
      <div>
        <a class="logo" href="/" aria-label="Растр, на главную">${LOGO_MARK}<b>Растр</b></a>
        <p>Бесплатный конвертер изображений, который работает прямо в браузере. Файлы не покидают ваше устройство.</p>
      </div>
      ${col('Картинки', conv)}
      ${col('Документы', dl)}
      ${col('Инструменты', tl)}
      ${col('Сервис', [['/formaty/', 'Форматы изображений'], ['/instrukciya/', 'Инструкция'], ['/konfidencialnost/', 'Конфиденциальность'], ['/usloviya/', 'Условия использования'], ['/licenzii/', 'Лицензии']])}
    </div>
    <div class="foot-bottom"><span>© 2026 Растр</span>${counter}<span>Файлы обрабатываются локально, без загрузки на сервер</span></div>
  </div>
</footer>`;
}

/* ---------------- конвертер ---------------- */

export function converter() {
  return `<section class="app" id="app" aria-label="Конвертер изображений">
  <div class="work">
    <label class="drop" id="drop" for="file">
      <input type="file" id="file" multiple accept="image/*,.tga,.ppm,.pgm,.pbm,.pnm,.tif,.tiff,.heic,.heif,.avif,.ico,.svg">
      <div class="drop-in">
        <div class="drop-icon">${ICONS.upload}</div>
        <div class="drop-text">
          <div class="drop-title"><span class="when-empty">Перетащите изображения сюда</span><span class="when-files">Добавить ещё файлы</span></div>
          <p class="drop-sub">Можно сразу несколько, в любое место страницы. Или вставьте из буфера: Ctrl+V</p>
        </div>
        <span class="drop-btn">Выбрать файлы</span>
      </div>
      <noscript><p class="err">Для работы конвертера включите JavaScript.</p></noscript>
      <div class="drop-formats mono" id="in-list">Принимаем: PNG · JPEG · WEBP · AVIF · GIF · BMP · ICO · SVG · TIFF · HEIC · TGA · PPM/PGM/PBM</div>
    </label>
    <div class="queue-empty" aria-hidden="true">
      <div class="sk"><i></i><b></b></div>
      <div class="sk"><i></i><b></b></div>
      <div class="sk"><i></i><b></b></div>
      <p>Здесь появятся ваши файлы: каждый можно скачать отдельно или все сразу одним ZIP</p>
    </div>
    <div class="queue ym-hide-content" id="queue" hidden>
      <div class="queue-head">
        <div class="q-title"><h2 id="q-title">Очередь</h2><span class="mono" id="q-summary"></span></div>
        <button class="btn ghost" id="clear" type="button">Очистить</button>
      </div>
      <ul class="list" id="list" aria-labelledby="q-title"></ul>
    </div>
  </div>
  <aside class="settings" aria-label="Настройки конвертации">
    <div class="sec" id="sec-format">
      <div class="sec-head"><span class="label">Формат на выходе</span><span class="label" title="Формат поддерживает прозрачность">▦ прозрачность</span></div>
      <div class="fmts" id="fmts" role="group" aria-label="Формат"></div>
      <p class="hint" id="fmt-use"></p>
    </div>
    <div class="sec" id="sec-quality" data-opt="quality">
      <div class="sec-head"><label class="label" for="quality">Качество</label><span class="qv" id="quality-v">85%</span></div>
      <input type="range" id="quality" min="10" max="100" value="85">
    </div>
    <div class="sec" id="sec-target" data-opt="quality">
      <label class="check target-toggle"><input type="checkbox" id="target-on"> Сжать до размера файла</label>
      <div class="target" id="target-fields" hidden>
        <div class="inline" style="flex-wrap:nowrap">
          <input type="number" id="target-kb" min="5" max="51200" step="1" value="200" aria-label="Максимальный размер файла, КБ">
          <span class="mono target-unit">КБ</span>
        </div>
        <div class="target-chips" id="target-chips" role="group" aria-label="Популярные размеры">
          <button type="button" data-kb="100">100 КБ</button><button type="button" data-kb="200">200 КБ</button><button type="button" data-kb="300">300 КБ</button><button type="button" data-kb="500">500 КБ</button><button type="button" data-kb="1000">1 МБ</button><button type="button" data-kb="2000">2 МБ</button>
        </div>
        <p class="hint">Качество подберётся само. Если не хватит — картинка немного уменьшится в пикселях.</p>
      </div>
    </div>
    <div class="sec" data-opt="background">
      <div class="sec-head"><span class="label">Фон вместо прозрачности</span></div>
      <div class="inline" style="flex-wrap:nowrap">
        <input type="color" id="bg" value="#ffffff" aria-label="Цвет фона">
        <div class="swatches" id="swatches" style="flex:1 1 auto"></div>
      </div>
    </div>
    <div class="sec" data-opt="gif">
      <div class="sec-head"><label class="label" for="gif-colors">Цветов в палитре</label><span class="qv" id="gif-colors-v">256</span></div>
      <input type="range" id="gif-colors" min="2" max="256" value="256">
      <label class="check"><input type="checkbox" id="gif-dither" checked> Сглаживать переходы (дизеринг)</label>
    </div>
    <div class="sec" data-opt="ico">
      <span class="label">Размеры внутри .ico</span>
      <div class="ico-sizes" id="ico-sizes"></div>
    </div>
    <div class="sec" data-opt="pdf">
      <label class="check"><input type="checkbox" id="pdf-single"> Собрать все картинки в один PDF</label>
    </div>
    <div class="sec" id="sec-size">
      <label class="label" for="resize-mode">Размер</label>
      <select id="resize-mode">
        <option value="none">Как в оригинале</option>
        <option value="percent">В процентах</option>
        <option value="width">По ширине</option>
        <option value="height">По высоте</option>
        <option value="fit">Вписать в рамку</option>
        <option value="exact">Точный размер (растянуть)</option>
      </select>
      <div class="inline" id="resize-fields">
        <div class="field" id="f-percent"><input type="number" id="resize-percent" min="1" max="1000" value="50" aria-label="Процент"></div>
        <div class="field" id="f-w"><input type="number" id="resize-w" min="1" max="16384" value="1280" aria-label="Ширина, px"></div>
        <div class="field" id="f-h"><input type="number" id="resize-h" min="1" max="16384" value="1280" aria-label="Высота, px"></div>
      </div>
      <p class="hint mono" id="resize-hint"></p>
    </div>
    <div class="sec" id="sec-rotate">
      <span class="label">Поворот и отражение</span>
      <div class="seg" id="rotate" role="group" aria-label="Поворот">
        <button type="button" data-rot="0" aria-pressed="true">0°</button>
        <button type="button" data-rot="90" aria-pressed="false">90°</button>
        <button type="button" data-rot="180" aria-pressed="false">180°</button>
        <button type="button" data-rot="270" aria-pressed="false">270°</button>
      </div>
      <div class="seg" role="group" aria-label="Отражение">
        <button type="button" id="flip-h" aria-pressed="false">⇋ по горизонтали</button>
        <button type="button" id="flip-v" aria-pressed="false">⇵ по вертикали</button>
      </div>
    </div>
    <div class="actions">
      <button class="btn primary" id="run" type="button">Конвертировать</button>
      <button class="btn" id="zip" type="button" disabled>Скачать всё одним .zip</button>
    </div>
  </aside>
</section>`;
}

/* ---------------- конвертер документов ---------------- */

export function docConverter() {
  const segBtns = (id, label, items) => `<div class="seg" id="${id}" role="group" aria-label="${label}">${items.map(([v, t]) => `<button type="button" data-v="${v}" aria-pressed="false">${t}</button>`).join('')}</div>`;
  return `<section class="app app-docs" id="app" aria-label="Конвертер документов">
  <div class="work">
    <label class="drop" id="drop" for="file">
      <input type="file" id="file" multiple accept=".pdf,.docx,.txt,.text,.md,.markdown,.html,.htm,.xlsx,.xlsm,.xls,.ods,.csv,.tsv,.json">
      <div class="drop-in">
        <div class="drop-icon">${ICONS.upload}</div>
        <div class="drop-text">
          <div class="drop-title"><span class="when-empty">Перетащите документы сюда</span><span class="when-files">Добавить ещё документы</span></div>
          <p class="drop-sub">Можно сразу несколько, в любое место страницы. Файлы не загружаются на сервер</p>
        </div>
        <span class="drop-btn">Выбрать файлы</span>
      </div>
      <noscript><p class="err">Для работы конвертера включите JavaScript.</p></noscript>
      <div class="drop-formats mono">Принимаем: PDF · DOCX · XLSX · XLS · ODS · CSV · TXT · Markdown · HTML · JSON</div>
    </label>
    <div class="queue-empty" aria-hidden="true">
      <div class="sk"><i></i><b></b></div>
      <div class="sk"><i></i><b></b></div>
      <div class="sk"><i></i><b></b></div>
      <p>Здесь появятся ваши документы: каждый можно скачать отдельно или все сразу одним ZIP</p>
    </div>
    <div class="queue ym-hide-content" id="queue" hidden>
      <div class="queue-head">
        <div class="q-title"><h2 id="q-title">Очередь</h2><span class="mono" id="q-summary"></span></div>
        <button class="btn ghost" id="clear" type="button">Очистить</button>
      </div>
      <ul class="list" id="list" aria-labelledby="q-title"></ul>
    </div>
  </div>
  <aside class="settings" aria-label="Настройки конвертации">
    <div class="sec" id="sec-format">
      <span class="label">Во что конвертировать</span>
      <div class="fmts" id="targets" role="group" aria-label="Формат результата"></div>
    </div>
    <div class="sec" data-show="split">
      <span class="label">Как разделить</span>
      ${segBtns('split-mode', 'Режим разделения', [['each', 'Каждую страницу'], ['range', 'Выбранные страницы']])}
    </div>
    <div class="sec" data-show="images">
      <span class="label">Качество картинок</span>
      ${segBtns('dpi', 'Разрешение', [[72, '72 dpi'], [150, '150 dpi'], [300, '300 dpi']])}
      <p class="hint">150 dpi — для экрана и почты, 300 dpi — для печати.</p>
    </div>
    <div class="sec" data-show="pages" id="sec-pages">
      <label class="label" for="pages">Страницы</label>
      <input type="text" id="pages" placeholder="Все или, например, 1-3, 5" autocomplete="off">
    </div>
    <div class="sec" data-show="pdfout">
      <span class="label">Лист и шрифт</span>
      ${segBtns('page-size', 'Размер листа', [['a4', 'A4'], ['letter', 'Letter']])}
      ${segBtns('font-size', 'Размер шрифта', [[10, '10 пт'], [11, '11 пт'], [12, '12 пт'], [14, '14 пт']])}
    </div>
    <div class="sec" data-show="csv">
      <span class="label">Разделитель CSV</span>
      ${segBtns('csv-sep', 'Разделитель', [[';', '; (Excel в России)'], [',', ', (запятая)']])}
    </div>
    <div class="sec" data-show="merge">
      <span class="label">Порядок</span>
      <p class="hint" id="merge-hint"></p>
    </div>
    <div class="actions">
      <button class="btn primary" id="run" type="button">Конвертировать</button>
      <button class="btn" id="zip" type="button" disabled>Скачать всё одним .zip</button>
    </div>
  </aside>
</section>`;
}
const APP_TAIL = `<dialog id="dlg" class="ym-hide-content" aria-labelledby="dlg-title">
  <div class="dlg-head">
    <h3 id="dlg-title"></h3>
    <div class="row-actions">
      <button class="btn" id="dlg-dl" type="button">Скачать</button>
      <button class="btn icon" id="dlg-close" type="button" aria-label="Закрыть">✕</button>
    </div>
  </div>
  <div class="compare">
    <figure><div class="stage" id="dlg-before"></div><figcaption class="mono" id="dlg-before-cap"></figcaption></figure>
    <figure><div class="stage" id="dlg-after"></div><figcaption class="mono" id="dlg-after-cap"></figcaption></figure>
  </div>
</dialog>
<div class="toast" id="toast" role="status" aria-live="polite"></div>`;

/* ---------------- общие блоки контента ---------------- */

// cta — кнопки перехода в первом экране: [[href, текст, главная?], …]
// cta — кнопки-ссылки [адрес, надпись, иконка]; center — компактный заголовок по центру (главная)
export function hero({ h1, lead, eyebrow = 'Бесплатно · без регистрации · без загрузки на сервер', chips = true, cta = null, center = false }) {
  const chipList = ['Файлы не покидают устройство', 'Пакетная обработка', 'Скачать всё одним ZIP'];
  return `<section class="wrap hero${center ? ' hero-center' : ''}">
  <span class="eyebrow"><i></i>${esc(eyebrow)}</span>
  <h1>${h1}</h1>
  <p class="lead">${lead}</p>
  ${cta ? `<div class="hero-cta">${cta.map(([href, label, icon]) => `<a class="btn primary" href="${href}">${icon ? ICONS[icon] : ''}${esc(label)}</a>`).join('')}</div>` : ''}
  ${chips ? `<ul class="chips">${chipList.map(c => `<li>${ICONS.check}${c}</li>`).join('')}</ul>` : ''}
</section>`;
}

export function faqHtml(items) {
  return `<div class="faq">${items.map(f => `<details><summary>${esc(f.q)}</summary><div class="ans"><p>${f.a}</p></div></details>`).join('')}</div>`;
}

export function faqSchema(items) {
  return {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: items.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: stripTags(f.a) } }))
  };
}

// Карточки инструментов: крупнее, с иконкой и описанием
export function toolsGrid(list, currentSlug) {
  return `<ul class="tools">${list.map(l => `<li><a href="/${l.slug}/"${l.slug === currentSlug ? ' aria-current="page"' : ''}>`+
    `<span class="tool-ic">${ICONS[l.icon]}</span><b>${esc(l.card[0])}</b><small>${esc(l.card[2])}</small><span class="tool-go">Открыть →</span></a></li>`).join('')}</ul>`;
}

export function linksGrid(list, currentSlug) {
  return `<ul class="links">${list.map(l => `<li><a href="/${l.slug}/"${l.slug === currentSlug ? ' aria-current="page"' : ''}><b>${cardTitle(l)}</b><small>${esc(l.card[2])}</small></a></li>`).join('')}</ul>`;
}

export function steps(items) {
  return `<ol class="steps">${items.map(([b, s]) => `<li><b>${b}</b><span>${s}</span></li>`).join('')}</ol>`;
}

/* ---------------- страница целиком ---------------- */

export function render(p, site, assets) {
  const crumbs = p.crumbs ? crumbsHtml(p.crumbs) : '';
  const scripts = p.docs
    ? `<div class="toast" id="toast" role="status" aria-live="polite"></div>
${p.preset ? `<script type="application/json" id="preset">${JSON.stringify(p.preset).replace(/</g, '\\u003c')}</script>` : ''}
<script src="${assets['rastr-convert.js']}"></script>
<script src="${assets['rastr-docs.js']}"></script>
<script src="${assets['docs.js']}"></script>`
    : p.app
    ? `${APP_TAIL}
${p.preset ? `<script type="application/json" id="preset">${JSON.stringify(p.preset).replace(/</g, '\\u003c')}</script>` : ''}
<script src="${assets['rastr-convert.js']}"></script>
<script src="${assets['app.js']}"></script>`
    : '';
  return `<!doctype html>
<html lang="ru">
<head>
${head(p, site, assets)}
</head>
<body>
${site.metrika ? `<noscript><div><img src="https://mc.yandex.ru/watch/${site.metrika}" style="position:absolute; left:-9999px;" alt=""></div></noscript>` : ''}
${header(p)}
${crumbs}
<main id="main">
${p.body}
</main>
${footer(site)}
${scripts}
${site.counter ? `<script src="${assets['counter.js']}" defer></script>` : ''}
</body>
</html>
`;
}
