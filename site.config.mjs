// Настройки сайта. После изменения запустите: npm run build
export default {
  // Адрес сайта без слеша в конце. Нужен для canonical, sitemap.xml и превью в соцсетях.
  // Можно задать и при сборке: SITE_URL=https://ваш-домен.ru npm run build
  // На Render задаётся переменной SITE_URL; если её нет, берётся адрес вида https://имя.onrender.com
  url: process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || 'https://example.com',

  name: 'Растр',

  // Коды подтверждения из Яндекс Вебмастера и Google Search Console (только значение content="…").
  // Пустая строка — метатег не выводится.
  yandexVerification: '',
  googleVerification: '',

  // Счётчик посещений в подвале (hits.sh — без cookies и регистрации). false — выключить.
  counter: true,
  // Под каким именем hits.sh хранит счёт. По умолчанию — домен сайта. Если переедете на свой
  // домен и хотите сохранить накопленные цифры, впишите сюда старое имя: 'rastr.onrender.com'.
  counterKey: ''
};
