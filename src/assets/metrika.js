/* Яндекс Метрика и уведомление о cookies.
   Код счётчика — из интерфейса Метрики; вынесен в файл, потому что политика безопасности сайта (CSP)
   запрещает встроенные скрипты. Работает только на боевом домене: локальные запуски и тесты
   не попадают в статистику. Очередь файлов и окно сравнения помечены классом ym-hide-content —
   Вебвизор не записывает имена и миниатюры картинок посетителей. */
(function () {
  'use strict';
  var me = document.currentScript;
  if (!me || location.host !== me.dataset.host) return;
  var id = +me.dataset.id;

  (function (m, e, t, r, i, k, a) {
    m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
    m[i].l = 1 * new Date();
    for (var j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) { return; } }
    k = e.createElement(t), a = e.getElementsByTagName(t)[0], k.async = 1, k.src = r, a.parentNode.insertBefore(k, a);
  })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=' + id, 'ym');

  window.ym(id, 'init', {
    ssr: true, webvisor: true, clickmap: true, ecommerce: 'dataLayer',
    referrer: document.referrer, url: location.href, accurateTrackBounce: true, trackLinks: true
  });

  /* ---------- уведомление о cookies ---------- */
  var KEY = 'rastr.cookies';
  try { if (localStorage.getItem(KEY)) return; } catch (e) { /* без хранилища просто покажем уведомление */ }

  function show() {
    var bar = document.createElement('div');
    bar.className = 'cookie-bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Уведомление о cookies');
    bar.innerHTML = '<p>Мы используем cookies и Яндекс Метрику, чтобы понимать, как пользуются сайтом. ' +
      'Ваши картинки при этом никуда не передаются. <a href="/konfidencialnost/">Подробнее</a></p>' +
      '<button type="button" class="btn primary">Понятно</button>';
    bar.querySelector('button').addEventListener('click', function () {
      try { localStorage.setItem(KEY, '1'); } catch (e) {}
      bar.remove();
    });
    document.body.appendChild(bar);
  }
  if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
})();
