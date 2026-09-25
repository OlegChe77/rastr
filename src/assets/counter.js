/* Счётчик посещений в подвале (hits.sh). Картинка загружается только на настоящем сайте,
   чтобы локальные запуски и автотесты не накручивали цифры. */
(function () {
  'use strict';
  var box = document.getElementById('counter');
  if (!box || location.host !== box.dataset.host) return;
  var img = new Image();
  img.src = box.dataset.src;
  img.alt = 'Посещений сегодня / всего';
  img.width = 150; img.height = 20;
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  img.onload = function () { box.hidden = false; };
  box.appendChild(img);
})();
