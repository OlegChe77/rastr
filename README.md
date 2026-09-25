# Растр — конвертер изображений

Сайт-конвертер изображений, который работает в браузере, и плагин `rastr-convert.js`.

## Что куда

| Папка / файл | Что это |
|---|---|
| `dist/` | **Готовый сайт.** Именно эту папку загружают на хостинг |
| `site.config.mjs` | Адрес сайта и коды Яндекс Вебмастера / Google Search Console |
| `src/content/landings.mjs` | Тексты и настройки 14 SEO-страниц (PNG в JPG, HEIC в JPG…) |
| `src/content/formats.mjs` | Тексты справочника форматов |
| `src/pages.mjs` | Главная, инструкция, документы, 404 |
| `src/layout.mjs` | Шапка, подвал, метатеги, разметка schema.org |
| `src/assets/` | Стили, скрипты, логотип, иконки, превью для соцсетей |
| `tools/` | Сборка сайта и генерация иконок |
| `tests/` | Автотесты |

## Команды

```bash
npm install        # один раз
npm run build      # собрать сайт в dist/
npm start          # собрать и открыть на http://localhost:5173
npm test           # собрать и прогнать все тесты
npm run icons      # перерисовать иконки и превью после смены логотипа
```

## Публикация на Render через GitHub

Сайт статический, поэтому на Render он размещается бесплатно как **Static Site**. Все настройки уже лежат в `render.yaml`.

1. Создайте пустой репозиторий на github.com и отправьте туда проект (`git push`). Папки `dist/` и `node_modules/` в репозиторий не попадают — Render собирает сайт сам.
2. На dashboard.render.com: **New → Blueprint**, подключите GitHub и выберите репозиторий. Render прочитает `render.yaml`.
3. Render попросит значение `SITE_URL`. Впишите будущий адрес, например `https://rastr.onrender.com` (имя сервиса — `rastr`; если оно занято, Render покажет другой адрес — тогда исправьте `SITE_URL` в Environment и нажмите Manual Deploy).
4. После деплоя проверьте живой сайт: `npm run check:live -- https://rastr.onrender.com`.
5. Дальше каждый `git push` в ветку `main` публикуется автоматически.

Свой домен: Settings → Custom Domains, затем поменяйте `SITE_URL` на новый адрес и передеплойте.

## Запуск на другом хостинге

1. В `site.config.mjs` впишите адрес сайта: `url: 'https://ваш-домен.ru'`.
2. `npm run build`.
3. Загрузите содержимое `dist/` на хостинг (подойдёт любой статический: Netlify, GitHub Pages, Cloudflare Pages, обычный хостинг с nginx/Apache). Страница `404.html` должна отдаваться для несуществующих адресов — Netlify и GitHub Pages делают это сами.
4. Подключите HTTPS (на всех перечисленных хостингах — бесплатно).

## Индексация

1. **Яндекс Вебмастер** (webmaster.yandex.ru): добавьте сайт, выберите подтверждение метатегом, вставьте код в `yandexVerification` в `site.config.mjs`, соберите и загрузите сайт. Затем «Индексирование → Файлы Sitemap» → добавьте `https://ваш-домен.ru/sitemap.xml`. В «Переобход страниц» можно отправить все 20 адресов.
2. **Google Search Console** (search.google.com/search-console): так же, код — в `googleVerification`. «Файлы Sitemap» → `sitemap.xml`. «Проверка URL» → «Запросить индексирование» для главной и ключевых страниц.
3. Через 1–2 недели проверьте в обоих сервисах отчёты об ошибках индексации.

## Что уже настроено для SEO

- Статический HTML: поисковикам не нужно выполнять JavaScript, чтобы увидеть текст.
- Понятные адреса: `/png-v-jpg/`, `/heic-v-jpg/`, `/szhat-foto/`.
- Уникальные `title`, `description`, `keywords`, один `H1` с главным запросом на каждой странице.
- `canonical`, `robots`, Open Graph и превью-картинки 1200×630 для каждой страницы.
- Разметка schema.org: `WebApplication`, `FAQPage`, `BreadcrumbList`, `WebSite`, `Article`.
- Видимые хлебные крошки, перелинковка между всеми страницами, нет страниц-сирот.
- `sitemap.xml`, `robots.txt`, `404.html` со статусом 404 и `noindex`.
- favicon.ico, SVG-иконка, apple-touch-icon, манифест.
- Лёгкие страницы, версии у CSS/JS для кеша, адаптивная вёрстка без горизонтальной прокрутки.

Всё это проверяется в `tests/seo.test.mjs` при каждом `npm test`.

## Карта ключевых запросов

| Страница | Главный запрос | Дополнительные |
|---|---|---|
| `/` | конвертер изображений | конвертер картинок онлайн, изменить формат фото |
| `/png-v-jpg/` | png в jpg | png в jpeg, перевести png в jpg онлайн |
| `/jpg-v-png/` | jpg в png | jpeg в png, фото в png |
| `/heic-v-jpg/` | heic в jpg | чем открыть heic, фото с айфона в jpg |
| `/webp-v-jpg/` | webp в jpg | как открыть webp, webp в jpeg |
| `/webp-v-png/` | webp в png | webp в png с прозрачностью |
| `/jpg-v-webp/` | jpg в webp | webp для сайта, оптимизация изображений |
| `/png-v-webp/` | png в webp | оптимизировать png для сайта |
| `/avif-v-jpg/` | avif в jpg | как открыть avif, avif в png |
| `/jpg-v-pdf/` | jpg в pdf | картинки в pdf, объединить фото в pdf |
| `/png-v-ico/` | png в ico | создать favicon, favicon онлайн |
| `/svg-v-png/` | svg в png | svg в jpg, растрировать svg |
| `/tiff-v-jpg/` | tiff в jpg | tif в jpg, чем открыть tiff |
| `/szhat-foto/` | сжать фото | уменьшить вес фото, сжать jpg |
| `/izmenit-razmer-foto/` | изменить размер фото | ресайз фото, уменьшить картинку в пикселях |
| `/formaty/` | форматы изображений | чем отличается png от jpg, что такое heic |

Новую страницу добавляют одним объектом в `src/content/landings.mjs` — шаблон, sitemap, меню в подвале и превью соберутся сами (для превью запустите `npm run icons`).
