/* Модульные тесты плагина rastr-convert.js. Запускаются в браузере: tests/unit.html */
(function () {
  'use strict';
  const R = window.RastrConvert;
  const tests = [];
  const test = (name, fn, opts) => tests.push(Object.assign({ name, fn }, opts));
  class Skip extends Error {}

  /* ---------- assert ---------- */
  function ok(v, msg) { if (!v) throw new Error(msg || 'ожидалось истинное значение'); }
  function eq(a, b, msg) {
    const sa = JSON.stringify(a), sb = JSON.stringify(b);
    if (sa !== sb) throw new Error((msg ? msg + ': ' : '') + 'получили ' + sa + ', ожидали ' + sb);
  }
  function near(a, b, tol, msg) {
    for (let i = 0; i < b.length; i++) {
      if (Math.abs(a[i] - b[i]) > tol) throw new Error((msg ? msg + ': ' : '') + 'пиксель ' + JSON.stringify(Array.from(a)) + ' далёк от ' + JSON.stringify(b) + ' (допуск ' + tol + ')');
    }
  }
  async function rejects(p, re) {
    try { await p; } catch (e) { if (re && !re.test(e.message)) throw new Error('не та ошибка: ' + e.message); return; }
    throw new Error('ожидалась ошибка');
  }

  /* ---------- helpers ---------- */
  // 40×30: левая половина красная, правая синяя, нижняя треть прозрачная
  function fixture(w, h) {
    w = w || 40; h = h || 30;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.fillStyle = '#ff0000'; x.fillRect(0, 0, Math.ceil(w / 2), Math.ceil(h * 2 / 3));
    x.fillStyle = '#0000ff'; x.fillRect(Math.ceil(w / 2), 0, w, Math.ceil(h * 2 / 3));
    return { source: c, width: w, height: h };
  }
  function pixelAt(decoded, x, y) {
    const c = document.createElement('canvas'); c.width = decoded.width; c.height = decoded.height;
    const cx = c.getContext('2d'); cx.drawImage(decoded.source, 0, 0);
    return Array.from(cx.getImageData(x, y, 1, 1).data);
  }
  const bytes = async b => new Uint8Array(await b.arrayBuffer());
  const text = b => b.text();
  const file = (data, name, type) => new File([data], name, { type: type || '' });
  const ascii = s => Uint8Array.from(s, ch => ch.charCodeAt(0));
  const cat = (...parts) => { const n = parts.reduce((s, p) => s + p.length, 0), o = new Uint8Array(n); let i = 0; for (const p of parts) { o.set(p, i); i += p.length; } return o; };
  async function encodeFixture(id, opts, fx) {
    const f = fx || fixture();
    return R.encode(R.prepare(f, opts || {}), id, opts || {});
  }
  const supported = id => R.format(id).supported();

  /* ================= реестр ================= */

  test('реестр: 14 форматов с уникальными id и расширениями', () => {
    const f = R.formats();
    eq(f.length, 14, 'число форматов');
    eq(new Set(f.map(x => x.id)).size, 14, 'уникальные id');
    for (const x of f) {
      ok(x.label && x.ext && x.mime && x.note && x.use, 'у ' + x.id + ' не хватает описания');
      ok(typeof x.encode === 'function', x.id + ' без encode');
      ok(Array.isArray(x.options), x.id + ' без options');
    }
  });

  test('реестр: список входных форматов', () => {
    eq(R.inputs.length, 12);
    ['PNG', 'JPEG', 'HEIC', 'TIFF', 'TGA'].forEach(n => ok(R.inputs.includes(n), 'нет ' + n));
  });

  test('реестр: PNG, JPEG, GIF, BMP, TIFF и собственные кодеры доступны всегда', () => {
    ['png', 'jpeg', 'gif', 'bmp', 'ico', 'tiff', 'tga', 'pdf', 'svg', 'ppm', 'pgm', 'datauri'].forEach(id => ok(supported(id), id));
  });

  test('реестр: supportsMime отвечает честно', () => {
    eq(R.supportsMime('image/png'), true);
    eq(R.supportsMime('image/x-not-real'), false);
  });

  test('реестр: свой формат через register()', async () => {
    R.register({ id: 'test-jfif', label: 'JFIF', ext: 'jfif', mime: 'image/jpeg', encode: (c, o) => R.encode(c, 'jpeg', o) });
    const b = await encodeFixture('test-jfif');
    eq(b.type, 'image/jpeg');
    eq(R.outputName('a.png', 'test-jfif'), 'a.jfif');
  });

  test('реестр: неизвестный формат — понятная ошибка', () => rejects(encodeFixture('nope'), /Неизвестный формат/));

  /* ================= геометрия ================= */

  test('computeSize: все режимы', () => {
    eq(R.computeSize(400, 200, { mode: 'none' }), { width: 400, height: 200 });
    eq(R.computeSize(400, 200, undefined), { width: 400, height: 200 });
    eq(R.computeSize(400, 200, { mode: 'percent', percent: 50 }), { width: 200, height: 100 });
    eq(R.computeSize(400, 200, { mode: 'width', width: 100 }), { width: 100, height: 50 });
    eq(R.computeSize(400, 200, { mode: 'height', height: 100 }), { width: 200, height: 100 });
    eq(R.computeSize(400, 200, { mode: 'fit', width: 100, height: 100 }), { width: 100, height: 50 });
    eq(R.computeSize(200, 400, { mode: 'fit', width: 100, height: 100 }), { width: 50, height: 100 });
    eq(R.computeSize(400, 200, { mode: 'exact', width: 33, height: 77 }), { width: 33, height: 77 });
  });

  test('computeSize: не меньше 1 px и не больше 16384 px', () => {
    eq(R.computeSize(400, 200, { mode: 'percent', percent: 0.01 }), { width: 1, height: 1 });
    eq(R.computeSize(400, 200, { mode: 'percent', percent: 10000 }), { width: 16384, height: 16384 });
  });

  test('prepare: поворот 90° и 270° меняет стороны местами', () => {
    const f = fixture();
    const a = R.prepare(f, { rotate: 90 }), b = R.prepare(f, { rotate: 270 }), c = R.prepare(f, { rotate: 180 });
    eq([a.width, a.height], [30, 40]);
    eq([b.width, b.height], [30, 40]);
    eq([c.width, c.height], [40, 30]);
  });

  test('prepare: поворот 90° по часовой — красная левая половина уходит наверх', () => {
    const c = R.prepare(fixture(), { rotate: 90 });
    const d = { source: c, width: c.width, height: c.height };
    // было: слева красное (верх), справа синее. После 90° по часовой: верх — красный, низ — синий, слева прозрачное
    near(pixelAt(d, 25, 5), [255, 0, 0, 255], 2, 'верх');
    near(pixelAt(d, 25, 35), [0, 0, 255, 255], 2, 'низ');
    eq(pixelAt(d, 2, 20)[3], 0, 'прозрачная полоса слева');
  });

  test('prepare: отражение по горизонтали и вертикали', () => {
    const h = R.prepare(fixture(), { flipH: true });
    near(pixelAt({ source: h, width: 40, height: 30 }, 5, 5), [0, 0, 255, 255], 2, 'flipH');
    const v = R.prepare(fixture(), { flipV: true });
    eq(pixelAt({ source: v, width: 40, height: 30 }, 5, 5)[3], 0, 'flipV: прозрачное сверху');
    near(pixelAt({ source: v, width: 40, height: 30 }, 5, 25), [255, 0, 0, 255], 2, 'flipV: красное снизу');
  });

  test('prepare: отрицательный угол нормализуется', () => {
    const c = R.prepare(fixture(), { rotate: -90 });
    eq([c.width, c.height], [30, 40]);
  });

  test('outputName: меняет только последнее расширение', () => {
    eq(R.outputName('photo.final.PNG', 'webp'), 'photo.final.webp');
    eq(R.outputName('без-расширения', 'jpeg'), 'без-расширения.jpg');
    eq(R.outputName('', 'gif'), 'image.gif');
    eq(R.outputName('a.png', 'datauri'), 'a.txt');
  });

  /* ================= кодирование и обратное чтение ================= */

  // [id, MIME, магические байты, допуск цвета, сохраняет прозрачность]
  const ROUNDTRIP = [
    ['png', 'image/png', [0x89, 0x50, 0x4E, 0x47], 0, true],
    ['jpeg', 'image/jpeg', [0xFF, 0xD8, 0xFF], 40, false],
    ['webp', 'image/webp', ascii('RIFF'), 40, true],
    ['avif', 'image/avif', null, 40, true],
    ['gif', 'image/gif', ascii('GIF89a'), 8, true],
    ['bmp', 'image/bmp', ascii('BM'), 0, false],
    ['tiff', 'image/tiff', [0x49, 0x49, 42, 0], 0, true],
    ['tga', 'image/x-tga', null, 0, true],
    ['svg', 'image/svg+xml', ascii('<svg'), 0, true],
    ['ppm', 'image/x-portable-pixmap', ascii('P6'), 0, false],
    ['pgm', 'image/x-portable-graymap', ascii('P5'), 0, false]
  ];

  ROUNDTRIP.forEach(([id, mime, magic, tol, alpha]) => {
    test('кодирование ' + id.toUpperCase() + ': MIME, сигнатура, размеры, цвет и прозрачность', async () => {
      if (!supported(id)) throw new Skip(id.toUpperCase() + ' не поддерживается этим браузером');
      const blob = await encodeFixture(id, { background: '#00ff00' });
      eq(blob.type, mime, 'MIME');
      const b = await bytes(blob);
      if (magic) eq(Array.from(b.subarray(0, magic.length)), Array.from(magic), 'сигнатура');
      const d = await R.decode(file(blob, 'out.' + R.format(id).ext, mime));
      eq([d.width, d.height], [40, 30], 'размеры');
      if (id === 'pgm') {
        const red = pixelAt(d, 5, 5);
        near(red, [76, 76, 76, 255], 2, 'красный в оттенках серого');
      } else {
        near(pixelAt(d, 5, 5), [255, 0, 0, 255], tol, 'красная зона');
        near(pixelAt(d, 35, 5), [0, 0, 255, 255], tol, 'синяя зона');
      }
      const bottom = pixelAt(d, 20, 27);
      if (alpha) eq(bottom[3], 0, 'прозрачность сохранена');
      else if (id !== 'pgm') near(bottom, [0, 255, 0, 255], tol, 'прозрачное залито фоном');
    }, { network: id === 'tiff' });
  });

  test('кодирование: все форматы переживают картинку 1×1', async () => {
    const one = fixture(1, 1);
    for (const f of R.formats()) {
      if (!f.supported() || f.id.startsWith('test-')) continue;
      const b = await R.encode(R.prepare(one, {}), f.id, {});
      ok(b.size > 0, f.id + ' выдал пустой файл');
    }
  });

  test('кодирование: нечётная ширина (выравнивание строк BMP по 4 байта)', async () => {
    const fx = fixture(3, 2);
    const b = await bytes(await encodeFixture('bmp', {}, fx));
    const dv = new DataView(b.buffer);
    eq(b.length, 54 + 12 * 2, 'строка 3 px = 9 байт + 3 байта выравнивания');
    eq(dv.getUint32(2, true), b.length, 'размер в заголовке');
    eq(dv.getInt32(18, true), 3); eq(dv.getInt32(22, true), 2);
    eq(dv.getUint16(28, true), 24, '24 бита');
    const d = await R.decode(file(b, 'odd.bmp', 'image/bmp'));
    near(pixelAt(d, 0, 0), [255, 0, 0, 255], 0);
  });

  test('JPEG: меньшее качество даёт меньший файл', async () => {
    const big = fixture(300, 200);
    const x = big.source.getContext('2d');
    for (let i = 0; i < 300; i += 3) { x.fillStyle = 'hsl(' + i + ',80%,50%)'; x.fillRect(i, 0, 3, 200); }
    const lo = await encodeFixture('jpeg', { quality: 0.2 }, big);
    const hi = await encodeFixture('jpeg', { quality: 0.95 }, big);
    ok(lo.size < hi.size, 'q=0.2: ' + lo.size + ' байт, q=0.95: ' + hi.size + ' байт');
  });

  test('JPEG: прозрачность заливается выбранным фоном', async () => {
    const d = await R.decode(file(await encodeFixture('jpeg', { background: '#ffffff', quality: 1 }), 'a.jpg'));
    near(pixelAt(d, 20, 27), [255, 255, 255, 255], 6);
    const d2 = await R.decode(file(await encodeFixture('jpeg', { background: '#000000', quality: 1 }), 'a.jpg'));
    near(pixelAt(d2, 20, 27), [0, 0, 0, 255], 6);
  });

  test('ресайз и поворот доходят до файла', async () => {
    const blob = await encodeFixture('png', { resize: { mode: 'width', width: 20 }, rotate: 90 });
    const d = await R.decode(file(blob, 'a.png'));
    eq([d.width, d.height], [15, 20]);
  });

  test('convert(): полный путь от File до результата', async () => {
    const src = file(await encodeFixture('png'), 'фото.png', 'image/png');
    const r = await R.convert(src, 'bmp', { resize: { mode: 'percent', percent: 50 } });
    eq(r.name, 'фото.bmp');
    eq([r.width, r.height], [20, 15]);
    eq(r.blob.type, 'image/bmp');
  });

  /* ================= GIF ================= */

  test('GIF: палитра ограничивается выбранным числом цветов', async () => {
    const fx = fixture(64, 64), x = fx.source.getContext('2d');
    for (let i = 0; i < 64; i++) for (let j = 0; j < 64; j++) { x.fillStyle = 'rgb(' + i * 4 + ',' + j * 4 + ',128)'; x.fillRect(i, j, 1, 1); }
    const b = await bytes(await encodeFixture('gif', { gifColors: 4, gifDither: false }, fx));
    const tableBits = (b[10] & 7) + 1;
    ok((1 << tableBits) <= 4, 'таблица на ' + (1 << tableBits) + ' цветов');
    const d = await R.decode(file(b, 'a.gif'));
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const cx = c.getContext('2d'); cx.drawImage(d.source, 0, 0);
    const px = cx.getImageData(0, 0, 64, 64).data, seen = new Set();
    for (let i = 0; i < px.length; i += 4) seen.add(px[i] + ',' + px[i + 1] + ',' + px[i + 2]);
    ok(seen.size <= 4, 'в картинке ' + seen.size + ' цветов');
  });

  test('GIF: дизеринг включается и выключается, оба варианта читаются', async () => {
    const fx = fixture(120, 40), x = fx.source.getContext('2d');
    const g = x.createLinearGradient(0, 0, 120, 0); g.addColorStop(0, '#000'); g.addColorStop(1, '#fff');
    x.fillStyle = g; x.fillRect(0, 0, 120, 40);
    const a = await encodeFixture('gif', { gifColors: 8, gifDither: true }, fx);
    const b = await encodeFixture('gif', { gifColors: 8, gifDither: false }, fx);
    const da = await R.decode(file(a, 'a.gif')), db = await R.decode(file(b, 'b.gif'));
    eq([da.width, db.width], [120, 120]);
    ok((await bytes(a)).join() !== (await bytes(b)).join(), 'дизеринг должен менять результат');
  });

  test('GIF: большая картинка с тысячами цветов (переполнение словаря LZW)', async () => {
    const fx = fixture(256, 256), x = fx.source.getContext('2d');
    const img = x.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const p = i / 4; img.data[i] = p & 255; img.data[i + 1] = (p >> 8) & 255; img.data[i + 2] = (p * 7) & 255; img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const d = await R.decode(file(await encodeFixture('gif', {}, fx), 'noise.gif'));
    eq([d.width, d.height], [256, 256]);
    eq(pixelAt(d, 255, 255)[3], 255, 'картинка дочитана до последнего пикселя');
  });

  /* ================= ICO ================= */

  test('ICO: заголовок перечисляет выбранные размеры, 256 записан как 0', async () => {
    const b = await bytes(await encodeFixture('ico', { icoSizes: [256, 16, 32] }));
    const dv = new DataView(b.buffer);
    eq([dv.getUint16(0, true), dv.getUint16(2, true), dv.getUint16(4, true)], [0, 1, 3]);
    eq([b[6], b[22], b[38]], [16, 32, 0], 'размеры по возрастанию');
    for (let i = 0; i < 3; i++) {
      const size = dv.getUint32(6 + i * 16 + 8, true), off = dv.getUint32(6 + i * 16 + 12, true);
      eq(Array.from(b.subarray(off, off + 4)), [0x89, 0x50, 0x4E, 0x47], 'запись ' + i + ' — PNG');
      ok(off + size <= b.length, 'запись ' + i + ' не вылезает за файл');
    }
  });

  test('ICO: пустой список размеров берёт размеры по умолчанию', async () => {
    const b = await bytes(await encodeFixture('ico', { icoSizes: [] }));
    eq(new DataView(b.buffer).getUint16(4, true), 4);
  });

  /* ================= PDF ================= */

  async function checkPdf(blob, pages) {
    const b = await bytes(blob);
    const s = new TextDecoder('latin1').decode(b);
    ok(s.startsWith('%PDF-1.4'), 'заголовок');
    ok(s.trimEnd().endsWith('%%EOF'), 'конец файла');
    eq((s.match(/\/Type \/Page\b/g) || []).length, pages, 'число страниц');
    ok(s.includes('/Count ' + pages), '/Count');
    const startxref = +s.match(/startxref\n(\d+)/)[1];
    ok(s.slice(startxref, startxref + 4) === 'xref', 'startxref указывает на таблицу');
    const rows = s.slice(startxref).split('\n').slice(3).filter(r => / 00000 n $/.test(r));
    eq(rows.length, 2 + pages * 3, 'записей в xref');
    rows.forEach((r, i) => {
      const off = +r.slice(0, 10);
      ok(s.slice(off, off + 10).startsWith((i + 1) + ' 0 obj'), 'смещение объекта ' + (i + 1));
    });
    return s;
  }

  test('PDF: одна страница, корректная таблица xref', async () => {
    const s = await checkPdf(await encodeFixture('pdf'), 1);
    ok(s.includes('/Filter /DCTDecode'), 'картинка внутри — JPEG');
    ok(s.includes('/MediaBox [0 0 30 22.5]'), 'размер страницы 40×30 px = 30×22.5 pt');
  });

  test('PDF: многостраничный из нескольких картинок', async () => {
    const pages = [fixture(), fixture(10, 50), fixture(80, 20)].map(f => R.prepare(f, {}));
    await checkPdf(await R.pdfFromCanvases(pages, {}), 3);
  });

  /* ================= SVG / Base64 ================= */

  test('SVG-обёртка: размеры и вложенный PNG', async () => {
    const s = await text(await encodeFixture('svg'));
    ok(/width="40" height="30"/.test(s)); ok(s.includes('viewBox="0 0 40 30"'));
    ok(s.includes('href="data:image/png;base64,'));
  });

  test('Base64: получается готовый data URI', async () => {
    const s = await text(await encodeFixture('datauri'));
    ok(s.startsWith('data:image/png;base64,'));
    const img = new Image(); img.src = s; await img.decode();
    eq([img.naturalWidth, img.naturalHeight], [40, 30]);
  });

  /* ================= ZIP ================= */

  test('ZIP: структура, CRC32 и повторяющиеся имена', async () => {
    const hello = new Blob(['hello']);
    const z = await bytes(await R.zip([{ name: 'a.png', blob: hello }, { name: 'a.png', blob: hello }, { name: 'кот.webp', blob: new Blob(['']) }]));
    const dv = new DataView(z.buffer);
    const end = z.length - 22;
    eq(dv.getUint32(end, true), 0x06054b50, 'конец центрального каталога');
    eq(dv.getUint16(end + 10, true), 3, 'три файла');
    eq(dv.getUint32(0, true), 0x04034b50, 'первый локальный заголовок');
    eq(dv.getUint32(14, true), 0x3610a686, 'CRC32("hello")');
    let p = dv.getUint32(end + 16, true);
    const names = [];
    for (let i = 0; i < 3; i++) {
      eq(dv.getUint32(p, true), 0x02014b50, 'запись каталога ' + i);
      const n = dv.getUint16(p + 28, true), off = dv.getUint32(p + 42, true);
      names.push(new TextDecoder().decode(z.subarray(p + 46, p + 46 + n)));
      eq(dv.getUint32(off, true), 0x04034b50, 'смещение локального заголовка ' + i);
      p += 46 + n;
    }
    eq(names, ['a.png', 'a (2).png', 'кот.webp']);
  });

  /* ================= декодеры ================= */

  test('распознавание: формат определяется по содержимому, а не по имени', async () => {
    const png = await encodeFixture('png');
    eq((await R.decode(file(png, 'обманка.jpg'))).format, 'PNG');
    eq((await R.decode(file(await encodeFixture('gif'), 'x.bin'))).format, 'GIF');
    eq((await R.decode(file(await encodeFixture('bmp'), 'x'))).format, 'BMP');
  });

  test('распознавание: мусор даёт понятную ошибку', () =>
    rejects(R.decode(file(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), 'broken.png')), /не смог/));

  test('SVG без width/height берёт размер из viewBox', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><rect width="60" height="60" fill="#f00"/></svg>';
    const d = await R.decode(file(svg, 'logo.svg', 'image/svg+xml'));
    eq([d.format, d.width, d.height], ['SVG', 120, 60]);
    ok(d.vector, 'SVG помечен как вектор');
    near(pixelAt(d, 10, 10), [255, 0, 0, 255], 2);
  });

  test('SVG с одной шириной достраивает высоту по пропорциям', async () => {
    const svg = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="300" viewBox="0 0 100 50"></svg>';
    const d = await R.decode(file(svg, 'x.svg'));
    eq([d.width, d.height], [300, 150]);
  });

  test('SVG увеличивается без потери чёткости (рисуется из вектора)', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect x="5" width="5" height="10" fill="#000"/></svg>';
    const d = await R.decode(file(svg, 'x.svg'));
    const c = R.prepare(d, { resize: { mode: 'percent', percent: 1000 } });
    const big = { source: c, width: 100, height: 100 };
    eq(pixelAt(big, 49, 50)[3], 0, 'левее границы — пусто');
    eq(pixelAt(big, 50, 50)[3], 255, 'правее границы — сплошной цвет');
  });

  test('TGA без сжатия, начало снизу (как пишет большинство программ)', async () => {
    const head = new Uint8Array(18); head[2] = 2; head[12] = 2; head[14] = 2; head[16] = 24;
    // строки снизу вверх: нижняя строка — зелёный, белый; верхняя — красный, синий (BGR)
    const px = Uint8Array.from([0, 255, 0, 255, 255, 255, 0, 0, 255, 255, 0, 0]);
    const d = await R.decode(file(cat(head, px), 'a.tga'));
    eq(d.format, 'TGA');
    eq(pixelAt(d, 0, 0), [255, 0, 0, 255]); eq(pixelAt(d, 1, 0), [0, 0, 255, 255]);
    eq(pixelAt(d, 0, 1), [0, 255, 0, 255]); eq(pixelAt(d, 1, 1), [255, 255, 255, 255]);
  });

  test('TGA со сжатием RLE, 32 бита с альфой, начало сверху', async () => {
    const head = new Uint8Array(18); head[2] = 10; head[12] = 3; head[14] = 1; head[16] = 32; head[17] = 0x28;
    // пакет повтора ×2 (красный), затем сырой пакет ×1 (полупрозрачный синий)
    const data = Uint8Array.from([0x81, 0, 0, 255, 255, 0x00, 255, 0, 0, 128]);
    const d = await R.decode(file(cat(head, data), 'rle.tga'));
    eq([d.width, d.height], [3, 1]);
    eq(pixelAt(d, 1, 0), [255, 0, 0, 255]);
    eq(pixelAt(d, 2, 0)[3], 128);
  });

  test('TGA в оттенках серого', async () => {
    const head = new Uint8Array(18); head[2] = 3; head[12] = 2; head[14] = 1; head[16] = 8; head[17] = 0x20;
    const d = await R.decode(file(cat(head, Uint8Array.from([0, 200])), 'g.tga'));
    eq(pixelAt(d, 1, 0), [200, 200, 200, 255]);
  });

  const pnm = [
    ['P1 (текстовый, биты без пробелов)', 'P1\n# комментарий\n2 2\n10\n01\n', [[0, 0, 0], [255, 255, 255]]],
    ['P2 (текстовый серый)', 'P2\n2 1\n10\n0 10\n', [[0, 0, 0], [255, 255, 255]]],
    ['P3 (текстовый цветной)', 'P3 2 1 255\n255 0 0   0 0 255\n', [[255, 0, 0], [0, 0, 255]]]
  ];
  pnm.forEach(([name, src, expect]) => test('Netpbm ' + name, async () => {
    const d = await R.decode(file(src, 'x.pnm'));
    eq(d.format, 'PNM');
    near(pixelAt(d, 0, 0), expect[0].concat(255), 1, 'пиксель 0');
    near(pixelAt(d, 1, 0), expect[1].concat(255), 1, 'пиксель 1');
  }));

  test('Netpbm P4 (двоичные биты)', async () => {
    const d = await R.decode(file(cat(ascii('P4\n9 1\n'), Uint8Array.from([0b10000000, 0b10000000])), 'x.pbm'));
    eq(pixelAt(d, 0, 0), [0, 0, 0, 255]); eq(pixelAt(d, 1, 0), [255, 255, 255, 255]); eq(pixelAt(d, 8, 0), [0, 0, 0, 255]);
  });

  test('Netpbm P5 с 16 битами на отсчёт', async () => {
    const d = await R.decode(file(cat(ascii('P5\n2 1\n65535\n'), Uint8Array.from([0xFF, 0xFF, 0x80, 0x00])), 'x.pgm'));
    eq(pixelAt(d, 0, 0), [255, 255, 255, 255]);
    near(pixelAt(d, 1, 0), [128, 128, 128, 255], 1);
  });

  test('Netpbm: повреждённый заголовок', () => rejects(R.decode(file('P6\nabc\n', 'x.ppm')), /Netpbm/));

  test('TIFF со сжатием: декодер загружается с CDN', async () => {
    // TIFF с PackBits (сжатие 32773): 2×1, RGB. Проверяет, что внешний декодер подключается и работает
    const w = 2, h = 1, data = Uint8Array.from([0x05, 255, 0, 0, 0, 255, 0]);
    const n = 9, ifdSize = 2 + n * 12 + 4, bps = 8 + ifdSize, strip = bps + 6;
    const b = new Uint8Array(strip + data.length), dv = new DataView(b.buffer);
    b.set([73, 73, 42, 0]); dv.setUint32(4, 8, true); dv.setUint16(8, n, true);
    [[256, 3, 1, w], [257, 3, 1, h], [258, 3, 3, bps], [259, 3, 1, 32773], [262, 3, 1, 2],
     [273, 4, 1, strip], [277, 3, 1, 3], [278, 3, 1, h], [279, 4, 1, data.length]].forEach((t, i) => {
      const at = 10 + i * 12;
      dv.setUint16(at, t[0], true); dv.setUint16(at + 2, t[1], true); dv.setUint32(at + 4, t[2], true);
      if (t[1] === 3 && t[2] === 1) dv.setUint16(at + 8, t[3], true); else dv.setUint32(at + 8, t[3], true);
    });
    [8, 8, 8].forEach((v, i) => dv.setUint16(bps + i * 2, v, true));
    b.set(data, strip);
    let d;
    try { d = await R.decode(file(b, 'packbits.tif')); }
    catch (e) { if (/нужен интернет/.test(e.message)) throw new Skip('нет доступа к CDN'); throw e; }
    eq(d.format, 'TIFF');
    eq(pixelAt(d, 0, 0), [255, 0, 0, 255]); eq(pixelAt(d, 1, 0), [0, 255, 0, 255]);
  }, { network: true });

  /* ================= runner ================= */

  async function run(filter) {
    const results = [];
    const list = tests.filter(t => !filter || t.name.includes(filter));
    for (const t of list) {
      const t0 = performance.now();
      let status = 'pass', error = '';
      try {
        await Promise.race([t.fn(), new Promise((_, rej) => setTimeout(() => rej(new Error('тайм-аут 15 с')), 15000))]);
      } catch (e) {
        if (e instanceof Skip) { status = 'skip'; error = e.message; }
        else { status = 'fail'; error = e && e.message || String(e); }
      }
      const r = { name: t.name, status, error, ms: Math.round(performance.now() - t0) };
      results.push(r);
      window.dispatchEvent(new CustomEvent('rastr-test', { detail: r }));
    }
    return results;
  }

  window.RastrTests = { run, count: () => tests.length };
})();
