/*!
 * RastrConvert — плагин конвертации изображений прямо в браузере.
 * Без сервера и без зависимостей (TIFF и HEIC подгружают декодер с CDN по требованию).
 *
 *   const res = await RastrConvert.convert(file, 'webp', { quality: 0.8 });
 *   // res.blob, res.name, res.width, res.height
 *
 *   RastrConvert.register({ id, label, ext, mime, encode(canvas, opts) })  — свой формат на выход
 *   RastrConvert.registerDecoder({ id, test(head, name, type), decode(file) }) — свой формат на вход
 */
(function (global) {
  'use strict';

  const formats = new Map();
  const decoders = [];

  // Декодеры с CDN, версии закреплены. integrity (SRI) — браузер откажется запускать файл,
  // если его содержимое на CDN изменится.
  const CDN = {
    pako: { src: 'https://cdn.jsdelivr.net/npm/pako@1.0.11/dist/pako_inflate.min.js',
      integrity: 'sha384-eVEAceNXm4nXk77ToJFE5Yyd50iOqdwXwefI35sH/rqeSTw99+DhTt4CzWZU+xBz' },
    utif: { src: 'https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.js',
      integrity: 'sha384-RyBmXHdfZ/Uon+ud+/AqSyWpUWnKYt2tkRG/P4gWoRUGDU+qIAV3tGBPNlYTBZEF' },
    heic: { src: 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js',
      integrity: 'sha384-OTofQ0MEeiSgh62havBcemCIK0gqj809wX6UA0uPISNMRnR6NZyCdGzX3SbLrgwL' }
  };

  const DEFAULTS = {
    quality: 0.85,
    background: '#ffffff',
    gifColors: 256,
    gifDither: true,
    icoSizes: [16, 32, 48, 256],
    resize: { mode: 'none' },
    rotate: 0,
    flipH: false,
    flipV: false
  };

  /* ---------------- helpers ---------------- */

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }
  function ctx2d(c) { return c.getContext('2d', { willReadFrequently: true }); }
  function rgba(canvas) { return ctx2d(canvas).getImageData(0, 0, canvas.width, canvas.height).data; }

  function canvasToBlob(canvas, mime, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(b => (b && b.type === mime)
        ? resolve(b)
        : reject(new Error('Этот браузер не умеет кодировать ' + mime)), mime, quality);
    });
  }

  const mimeSupport = {};
  function supportsMime(mime) {
    if (!(mime in mimeSupport)) {
      try { mimeSupport[mime] = makeCanvas(1, 1).toDataURL(mime).indexOf('data:' + mime) === 0; }
      catch (e) { mimeSupport[mime] = false; }
    }
    return mimeSupport[mime];
  }

  function flatten(canvas, bg) {
    const c = makeCanvas(canvas.width, canvas.height);
    const x = ctx2d(c);
    x.fillStyle = bg || '#ffffff';
    x.fillRect(0, 0, c.width, c.height);
    x.drawImage(canvas, 0, 0);
    return c;
  }

  async function blobBytes(b) { return new Uint8Array(await b.arrayBuffer()); }
  function latin(s) { const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 255; return a; }

  const scripts = {};
  function loadScript({ src, integrity }) {
    if (!scripts[src]) {
      scripts[src] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src; s.async = true;
        s.integrity = integrity; s.crossOrigin = 'anonymous'; s.referrerPolicy = 'no-referrer';
        s.onload = resolve;
        s.onerror = () => { s.remove(); delete scripts[src]; reject(new Error('Не удалось загрузить декодер (нужен интернет)')); };
        document.head.appendChild(s);
      });
    }
    return scripts[src];
  }

  class Bytes {
    constructor(size) { this.buf = new Uint8Array(size || 4096); this.len = 0; }
    ensure(n) {
      if (this.len + n <= this.buf.length) return;
      let s = this.buf.length * 2; while (s < this.len + n) s *= 2;
      const nb = new Uint8Array(s); nb.set(this.buf.subarray(0, this.len)); this.buf = nb;
    }
    u8(v) { this.ensure(1); this.buf[this.len++] = v & 255; return this; }
    u16(v) { this.ensure(2); this.buf[this.len++] = v & 255; this.buf[this.len++] = (v >> 8) & 255; return this; }
    bytes(a) { this.ensure(a.length); this.buf.set(a, this.len); this.len += a.length; return this; }
    ascii(s) { return this.bytes(latin(s)); }
    done() { return this.buf.slice(0, this.len); }
  }

  /* ---------------- geometry ---------------- */

  const MAX_SIDE = 16384;

  function computeSize(w, h, r) {
    r = r || {};
    let W = w, H = h;
    switch (r.mode) {
      case 'percent': W = w * r.percent / 100; H = h * r.percent / 100; break;
      case 'width': W = r.width; H = h * r.width / w; break;
      case 'height': H = r.height; W = w * r.height / h; break;
      case 'fit': { const s = Math.min(r.width / w, r.height / h); W = w * s; H = h * s; break; }
      case 'exact': W = r.width; H = r.height; break;
    }
    W = Math.min(MAX_SIDE, Math.max(1, Math.round(W || w)));
    H = Math.min(MAX_SIDE, Math.max(1, Math.round(H || h)));
    return { width: W, height: H };
  }

  // decoded: { source: CanvasImageSource, width, height }
  function prepare(decoded, opts) {
    const o = Object.assign({}, DEFAULTS, opts);
    const { width: w, height: h } = computeSize(decoded.width, decoded.height, o.resize);
    const rot = (((o.rotate || 0) % 360) + 360) % 360;
    const swap = rot === 90 || rot === 270;
    const c = makeCanvas(swap ? h : w, swap ? w : h);
    const x = ctx2d(c);
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.translate(c.width / 2, c.height / 2);
    x.rotate(rot * Math.PI / 180);
    x.scale(o.flipH ? -1 : 1, o.flipV ? -1 : 1);
    x.drawImage(decoded.source, -w / 2, -h / 2, w, h);
    return c;
  }

  /* ---------------- encoders ---------------- */

  function encodeBMP(canvas, o) {
    const w = canvas.width, h = canvas.height;
    const px = rgba(flatten(canvas, o.background));
    const row = Math.ceil(w * 3 / 4) * 4, size = 54 + row * h;
    const out = new Uint8Array(size), dv = new DataView(out.buffer);
    out[0] = 66; out[1] = 77;
    dv.setUint32(2, size, true); dv.setUint32(10, 54, true); dv.setUint32(14, 40, true);
    dv.setInt32(18, w, true); dv.setInt32(22, h, true);
    dv.setUint16(26, 1, true); dv.setUint16(28, 24, true);
    dv.setUint32(34, row * h, true); dv.setUint32(38, 2835, true); dv.setUint32(42, 2835, true);
    let p = 54;
    for (let y = h - 1; y >= 0; y--) {
      let i = y * w * 4;
      for (let x = 0; x < w; x++, i += 4) { out[p++] = px[i + 2]; out[p++] = px[i + 1]; out[p++] = px[i]; }
      p += row - w * 3;
    }
    return new Blob([out], { type: 'image/bmp' });
  }

  function encodeTIFF(canvas) {
    const w = canvas.width, h = canvas.height, px = rgba(canvas);
    const n = 14, ifd = 8, ifdSize = 2 + n * 12 + 4;
    const bpsAt = ifd + ifdSize, xresAt = bpsAt + 8, yresAt = xresAt + 8, dataAt = yresAt + 8;
    const out = new Uint8Array(dataAt + px.length), dv = new DataView(out.buffer);
    out[0] = 73; out[1] = 73; dv.setUint16(2, 42, true); dv.setUint32(4, ifd, true);
    // [tag, type, count, value]  type 3 = SHORT, 4 = LONG, 5 = RATIONAL
    const tags = [
      [256, 4, 1, w], [257, 4, 1, h], [258, 3, 4, bpsAt], [259, 3, 1, 1], [262, 3, 1, 2],
      [273, 4, 1, dataAt], [277, 3, 1, 4], [278, 4, 1, h], [279, 4, 1, px.length],
      [282, 5, 1, xresAt], [283, 5, 1, yresAt], [284, 3, 1, 1], [296, 3, 1, 2], [338, 3, 1, 2]
    ];
    dv.setUint16(ifd, n, true);
    tags.forEach((t, i) => {
      const at = ifd + 2 + i * 12;
      dv.setUint16(at, t[0], true); dv.setUint16(at + 2, t[1], true); dv.setUint32(at + 4, t[2], true);
      if (t[1] === 3 && t[2] === 1) dv.setUint16(at + 8, t[3], true); else dv.setUint32(at + 8, t[3], true);
    });
    dv.setUint32(ifd + 2 + n * 12, 0, true);
    for (let i = 0; i < 4; i++) dv.setUint16(bpsAt + i * 2, 8, true);
    dv.setUint32(xresAt, 72, true); dv.setUint32(xresAt + 4, 1, true);
    dv.setUint32(yresAt, 72, true); dv.setUint32(yresAt + 4, 1, true);
    out.set(px, dataAt);
    return new Blob([out], { type: 'image/tiff' });
  }

  function encodeTGA(canvas) {
    const w = canvas.width, h = canvas.height, px = rgba(canvas);
    if (w > 65535 || h > 65535) throw new Error('TGA не поддерживает стороны больше 65535 px');
    const out = new Uint8Array(18 + w * h * 4), dv = new DataView(out.buffer);
    out[2] = 2; dv.setUint16(12, w, true); dv.setUint16(14, h, true); out[16] = 32; out[17] = 0x28;
    for (let i = 0, p = 18; i < px.length; i += 4) {
      out[p++] = px[i + 2]; out[p++] = px[i + 1]; out[p++] = px[i]; out[p++] = px[i + 3];
    }
    return new Blob([out], { type: 'image/x-tga' });
  }

  function encodePNM(canvas, o, gray) {
    const w = canvas.width, h = canvas.height, px = rgba(flatten(canvas, o.background));
    const head = latin((gray ? 'P5' : 'P6') + '\n# Rastr\n' + w + ' ' + h + '\n255\n');
    const body = new Uint8Array(w * h * (gray ? 1 : 3));
    for (let i = 0, p = 0; i < px.length; i += 4) {
      if (gray) body[p++] = Math.round(px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114);
      else { body[p++] = px[i]; body[p++] = px[i + 1]; body[p++] = px[i + 2]; }
    }
    return new Blob([head, body], { type: gray ? 'image/x-portable-graymap' : 'image/x-portable-pixmap' });
  }

  function containInto(canvas, s) {
    const c = makeCanvas(s, s), x = ctx2d(c);
    const k = Math.min(s / canvas.width, s / canvas.height);
    const w = canvas.width * k, h = canvas.height * k;
    x.imageSmoothingQuality = 'high';
    x.drawImage(canvas, (s - w) / 2, (s - h) / 2, w, h);
    return c;
  }

  async function encodeICO(canvas, o) {
    const sizes = (o.icoSizes && o.icoSizes.length ? o.icoSizes : DEFAULTS.icoSizes).slice().sort((a, b) => a - b);
    const images = [];
    for (const s of sizes) images.push(await blobBytes(await canvasToBlob(containInto(canvas, s), 'image/png')));
    const head = new Uint8Array(6 + 16 * sizes.length), dv = new DataView(head.buffer);
    dv.setUint16(2, 1, true); dv.setUint16(4, sizes.length, true);
    let offset = head.length;
    sizes.forEach((s, i) => {
      const at = 6 + i * 16;
      head[at] = s >= 256 ? 0 : s; head[at + 1] = s >= 256 ? 0 : s;
      dv.setUint16(at + 4, 1, true); dv.setUint16(at + 6, 32, true);
      dv.setUint32(at + 8, images[i].length, true); dv.setUint32(at + 12, offset, true);
      offset += images[i].length;
    });
    return new Blob([head].concat(images), { type: 'image/x-icon' });
  }

  async function encodeSVG(canvas) {
    const data = canvas.toDataURL('image/png');
    const w = canvas.width, h = canvas.height;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + w + '" height="' + h +
      '" viewBox="0 0 ' + w + ' ' + h + '">\n  <image width="' + w + '" height="' + h + '" href="' + data + '" xlink:href="' + data + '"/>\n</svg>\n';
    return new Blob([svg], { type: 'image/svg+xml' });
  }

  async function encodeDataURI(canvas) {
    return new Blob([canvas.toDataURL('image/png')], { type: 'text/plain' });
  }

  /* ---- GIF: median cut + Floyd–Steinberg + LZW ---- */

  function quantize(px, w, h, maxColors, dither) {
    let transparent = false;
    for (let i = 3; i < px.length; i += 4) if (px[i] < 128) { transparent = true; break; }
    const limit = Math.max(2, transparent ? maxColors - 1 : maxColors);

    const hist = new Uint32Array(32768);
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue;
      hist[((px[i] >> 3) << 10) | ((px[i + 1] >> 3) << 5) | (px[i + 2] >> 3)]++;
    }
    const all = [];
    for (let k = 0; k < 32768; k++) if (hist[k]) all.push(k);
    if (!all.length) all.push(0);

    const ch = [k => k >> 10, k => (k >> 5) & 31, k => k & 31];
    function box(keys) {
      const mn = [31, 31, 31], mx = [0, 0, 0]; let pop = 0;
      for (const k of keys) {
        pop += hist[k];
        for (let c = 0; c < 3; c++) { const v = ch[c](k); if (v < mn[c]) mn[c] = v; if (v > mx[c]) mx[c] = v; }
      }
      const r = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
      const axis = r[0] >= r[1] && r[0] >= r[2] ? 0 : (r[1] >= r[2] ? 1 : 2);
      return { keys, pop, axis, span: r[axis] };
    }
    const boxes = [box(all)];
    while (boxes.length < limit) {
      let bi = -1, score = 0;
      boxes.forEach((b, i) => {
        if (b.keys.length < 2 || b.span === 0) return;
        const s = b.span * Math.sqrt(b.pop);
        if (s > score) { score = s; bi = i; }
      });
      if (bi < 0) break;
      const b = boxes[bi], f = ch[b.axis];
      b.keys.sort((a, c) => f(a) - f(c));
      let acc = 0, cut = 1;
      for (let i = 0; i < b.keys.length; i++) { acc += hist[b.keys[i]]; if (acc >= b.pop / 2) { cut = i + 1; break; } }
      cut = Math.min(Math.max(cut, 1), b.keys.length - 1);
      boxes.splice(bi, 1, box(b.keys.slice(0, cut)), box(b.keys.slice(cut)));
    }

    const exp = v => (v << 3) | (v >> 2);
    const pal = boxes.map(b => {
      let r = 0, g = 0, bl = 0, n = 0;
      for (const k of b.keys) { const c = hist[k] || 1; r += exp(ch[0](k)) * c; g += exp(ch[1](k)) * c; bl += exp(ch[2](k)) * c; n += c; }
      return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)];
    });

    const lut = new Int16Array(32768).fill(-1);
    function nearest(r, g, b) {
      const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      let v = lut[k];
      if (v < 0) {
        const cr = exp(r >> 3), cg = exp(g >> 3), cb = exp(b >> 3);
        let best = 1e9;
        for (let i = 0; i < pal.length; i++) {
          const dr = pal[i][0] - cr, dg = pal[i][1] - cg, db = pal[i][2] - cb;
          const d = dr * dr * 2 + dg * dg * 4 + db * db * 3;
          if (d < best) { best = d; v = i; }
        }
        lut[k] = v;
      }
      return v;
    }

    const off = transparent ? 1 : 0;
    const idx = new Uint8Array(w * h);
    const buf = dither ? new Float32Array(w * h * 3) : null;
    if (buf) for (let i = 0, j = 0; i < px.length; i += 4) { buf[j++] = px[i]; buf[j++] = px[i + 1]; buf[j++] = px[i + 2]; }
    const clamp = v => v < 0 ? 0 : v > 255 ? 255 : v | 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (px[i * 4 + 3] < 128) { idx[i] = 0; continue; }
        let r, g, b;
        if (buf) { r = clamp(buf[i * 3]); g = clamp(buf[i * 3 + 1]); b = clamp(buf[i * 3 + 2]); }
        else { r = px[i * 4]; g = px[i * 4 + 1]; b = px[i * 4 + 2]; }
        const p = nearest(r, g, b);
        idx[i] = p + off;
        if (buf) {
          const er = r - pal[p][0], eg = g - pal[p][1], eb = b - pal[p][2];
          const spread = (xx, yy, f) => {
            if (xx < 0 || xx >= w || yy >= h) return;
            const j = (yy * w + xx) * 3;
            buf[j] += er * f; buf[j + 1] += eg * f; buf[j + 2] += eb * f;
          };
          spread(x + 1, y, 7 / 16); spread(x - 1, y + 1, 3 / 16); spread(x, y + 1, 5 / 16); spread(x + 1, y + 1, 1 / 16);
        }
      }
    }
    const colors = (transparent ? [[0, 0, 0]] : []).concat(pal);
    return { idx, colors, transparent };
  }

  function lzw(indices, minCodeSize) {
    const out = new Bytes(indices.length >> 1);
    const clear = 1 << minCodeSize, eoi = clear + 1;
    let codeSize = minCodeSize + 1, next = eoi + 1, cur = 0, bits = 0;
    let dict = new Map();
    const emit = code => {
      cur |= code << bits; bits += codeSize;
      while (bits >= 8) { out.u8(cur & 255); cur >>>= 8; bits -= 8; }
    };
    emit(clear);
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i], key = prefix * 256 + k, found = dict.get(key);
      if (found !== undefined) { prefix = found; continue; }
      emit(prefix);
      if (next === 4096) {
        emit(clear); next = eoi + 1; codeSize = minCodeSize + 1; dict = new Map();
      } else {
        if (next >= (1 << codeSize)) codeSize++;
        dict.set(key, next++);
      }
      prefix = k;
    }
    emit(prefix); emit(eoi);
    if (bits > 0) out.u8(cur & 255);
    return out.done();
  }

  function encodeGIF(canvas, o) {
    const w = canvas.width, h = canvas.height;
    if (w > 65535 || h > 65535) throw new Error('GIF не поддерживает стороны больше 65535 px');
    const q = quantize(rgba(canvas), w, h, Math.min(256, Math.max(2, o.gifColors | 0)), !!o.gifDither);
    let tableBits = 1;
    while ((1 << tableBits) < q.colors.length) tableBits++;
    const minCode = Math.max(2, tableBits);
    const b = new Bytes(w * h / 2 + 1024);
    b.ascii('GIF89a').u16(w).u16(h).u8(0x80 | ((tableBits - 1) << 4) | (tableBits - 1)).u8(0).u8(0);
    for (let i = 0; i < (1 << tableBits); i++) { const c = q.colors[i] || [0, 0, 0]; b.u8(c[0]).u8(c[1]).u8(c[2]); }
    if (q.transparent) b.u8(0x21).u8(0xF9).u8(4).u8(1).u16(0).u8(0).u8(0);
    b.u8(0x2C).u16(0).u16(0).u16(w).u16(h).u8(0);
    b.u8(minCode);
    const data = lzw(q.idx, minCode);
    for (let i = 0; i < data.length; i += 255) { const part = data.subarray(i, i + 255); b.u8(part.length).bytes(part); }
    b.u8(0).u8(0x3B);
    return new Blob([b.done()], { type: 'image/gif' });
  }

  /* ---- PDF: каждая картинка — страница с JPEG внутри ---- */

  async function pdfFromCanvases(canvases, opts) {
    const o = Object.assign({}, DEFAULTS, opts);
    const parts = [], offsets = [];
    let offset = 0;
    const push = x => { const b = typeof x === 'string' ? latin(x) : x; parts.push(b); offset += b.length; };
    const obj = (num, body) => { offsets[num] = offset; push(num + ' 0 obj\n' + body + '\nendobj\n'); };
    push('%PDF-1.4\n'); push(new Uint8Array([37, 226, 227, 207, 211, 10]));
    const n = canvases.length;
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [' + canvases.map((_, i) => (3 + 3 * i) + ' 0 R').join(' ') + '] /Count ' + n + ' >>');
    for (let i = 0; i < n; i++) {
      const c = canvases[i];
      const jpg = await blobBytes(await canvasToBlob(flatten(c, o.background), 'image/jpeg', o.quality));
      const W = +(c.width * 0.75).toFixed(2), H = +(c.height * 0.75).toFixed(2);
      const pg = 3 + 3 * i, im = pg + 1, ct = pg + 2;
      obj(pg, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /XObject << /Im' + i + ' ' + im +
        ' 0 R >> >> /Contents ' + ct + ' 0 R >>');
      offsets[im] = offset;
      push(im + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + c.width + ' /Height ' + c.height +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpg.length + ' >>\nstream\n');
      push(jpg);
      push('\nendstream\nendobj\n');
      const content = 'q ' + W + ' 0 0 ' + H + ' 0 0 cm /Im' + i + ' Do Q';
      obj(ct, '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
    }
    const size = 3 + 3 * n, xref = offset;
    let table = 'xref\n0 ' + size + '\n0000000000 65535 f \n';
    for (let k = 1; k < size; k++) table += String(offsets[k]).padStart(10, '0') + ' 00000 n \n';
    push(table + 'trailer\n<< /Size ' + size + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    return new Blob(parts, { type: 'application/pdf' });
  }

  /* ---------------- ZIP (без сжатия) ---------------- */

  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(d) { let c = 0xFFFFFFFF; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

  function uniqueName(name, used) {
    let n = name, i = 2;
    const dot = name.lastIndexOf('.'), base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
    while (used.has(n.toLowerCase())) n = base + ' (' + (i++) + ')' + ext;
    used.add(n.toLowerCase());
    return n;
  }

  async function zip(entries) {
    const enc = new TextEncoder(), used = new Set(), parts = [], central = [];
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    let offset = 0;
    for (const e of entries) {
      const name = enc.encode(uniqueName(e.name, used));
      const data = await blobBytes(e.blob), crc = crc32(data);
      const loc = new Uint8Array(30 + name.length), lv = new DataView(loc.buffer);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true);
      lv.setUint16(10, time, true); lv.setUint16(12, date, true); lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, name.length, true);
      loc.set(name, 30);
      const cen = new Uint8Array(46 + name.length), cv = new DataView(cen.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
      cv.setUint16(12, time, true); cv.setUint16(14, date, true); cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true); cen.set(name, 46);
      parts.push(loc, data); central.push(cen);
      offset += loc.length + data.length;
    }
    const cdSize = central.reduce((s, c) => s + c.length, 0);
    const end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
    ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [end]), { type: 'application/zip' });
  }

  /* ---------------- decoders ---------------- */

  function sniff(head, name, type) {
    const s = (a, b) => String.fromCharCode.apply(null, head.subarray(a, b));
    const ext = (name.match(/\.([a-z0-9]+)$/) || [])[1] || '';
    if (head[0] === 0x89 && s(1, 4) === 'PNG') return 'PNG';
    if (head[0] === 0xFF && head[1] === 0xD8 && head[2] === 0xFF) return 'JPEG';
    if (s(0, 4) === 'GIF8') return 'GIF';
    if (s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP') return 'WEBP';
    if (s(0, 4) === 'II*\0' || s(0, 4) === 'MM\0*') return 'TIFF';
    if (s(4, 8) === 'ftyp') {
      const brand = s(8, 12);
      if (brand === 'avif' || brand === 'avis' || ext === 'avif') return 'AVIF';
      return 'HEIC';
    }
    if (head[0] === 0 && head[1] === 0 && head[2] === 1 && head[3] === 0) return 'ICO';
    if (s(0, 2) === 'BM') return 'BMP';
    if (head[0] === 80 && head[1] >= 49 && head[1] <= 54 && head[2] <= 32) return 'PNM';
    if (ext === 'tga' || ext === 'icb' || ext === 'vda' || ext === 'vst') return 'TGA';
    if (ext === 'svg' || type === 'image/svg+xml' || /<svg|<\?xml/i.test(s(0, head.length))) return 'SVG';
    return (ext || 'файл').toUpperCase();
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Браузер не смог открыть этот файл'));
      img.src = url;
    });
  }

  function fromPixels(data, w, h) {
    const c = makeCanvas(w, h);
    ctx2d(c).putImageData(new ImageData(data, w, h), 0, 0);
    return { source: c, width: w, height: h };
  }

  async function decodeRaster(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const img = await loadImage(url);
      const w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) throw new Error('У изображения нулевой размер');
      const c = makeCanvas(w, h);
      ctx2d(c).drawImage(img, 0, 0);
      return { source: c, width: w, height: h };
    } finally { URL.revokeObjectURL(url); }
  }

  async function decodeSVG(file) {
    let text = await file.text();
    const tag = (text.match(/<svg\b[^>]*>/i) || [])[0];
    if (!tag) throw new Error('В файле нет элемента <svg>');
    const attr = n => { const m = tag.match(new RegExp('\\s' + n + '\\s*=\\s*["\']([^"\']+)["\']', 'i')); return m ? m[1] : null; };
    const num = v => v && /^[\d.]+(px)?$/.test(v.trim()) ? parseFloat(v) : null;
    let w = num(attr('width')), h = num(attr('height'));
    const vb = (attr('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    if ((!w || !h) && vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
      const r = vb[2] / vb[3];
      if (w) h = w / r; else if (h) w = h * r; else { w = vb[2]; h = vb[3]; }
    }
    w = w || 1024; h = h || 1024;
    const fixed = tag.replace(/\s(width|height)\s*=\s*["'][^"']*["']/gi, '')
      .replace(/^<svg/i, '<svg width="' + w + '" height="' + h + '"' + (/xmlns=/.test(tag) ? '' : ' xmlns="http://www.w3.org/2000/svg"'));
    text = text.replace(tag, fixed);
    // URL не освобождаем: SVG перерисовывается в нужном размере без потери чёткости
    const img = await loadImage(URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' })));
    return { source: img, width: Math.round(w), height: Math.round(h), vector: true };
  }

  function decodeTGA(buf) {
    const d = new Uint8Array(buf), dv = new DataView(buf);
    const idLen = d[0], cmapType = d[1], type = d[2];
    const cmapFirst = dv.getUint16(3, true), cmapLen = dv.getUint16(5, true), cmapBits = d[7];
    const w = dv.getUint16(12, true), h = dv.getUint16(14, true), bpp = d[16], desc = d[17];
    const base = type & 7, rle = type >= 9;
    if (!w || !h || [1, 2, 3].indexOf(base) < 0) throw new Error('Неподдерживаемый вариант TGA');
    let p = 18 + idLen, pal = null;
    const cb = Math.ceil(cmapBits / 8);
    if (cmapType === 1) { pal = d.subarray(p, p + cmapLen * cb); p += cmapLen * cb; }
    const bytes = Math.ceil(bpp / 8);
    const useAlpha = (desc & 15) > 0;
    const out = new Uint8ClampedArray(w * h * 4);
    const top = desc & 0x20, rtl = desc & 0x10;
    const color = (src, i, nb, o) => {
      if (nb === 2) {
        const v = src[i] | (src[i + 1] << 8);
        out[o] = ((v >> 10) & 31) * 255 / 31; out[o + 1] = ((v >> 5) & 31) * 255 / 31; out[o + 2] = (v & 31) * 255 / 31; out[o + 3] = 255;
      } else {
        out[o] = src[i + 2]; out[o + 1] = src[i + 1]; out[o + 2] = src[i];
        out[o + 3] = nb === 4 && useAlpha ? src[i + 3] : 255;
      }
    };
    const px = (i, o) => {
      if (base === 2) color(d, i, bytes, o);
      else if (base === 3) { out[o] = out[o + 1] = out[o + 2] = d[i]; out[o + 3] = bytes === 2 ? d[i + 1] : 255; }
      else { const k = (bytes === 2 ? d[i] | (d[i + 1] << 8) : d[i]) - cmapFirst; color(pal, k * cb, cb, o); }
    };
    const dest = n => {
      let x = n % w, y = (n / w) | 0;
      if (!top) y = h - 1 - y;
      if (rtl) x = w - 1 - x;
      return (y * w + x) * 4;
    };
    const total = w * h;
    if (!rle) for (let n = 0; n < total; n++) px(p + n * bytes, dest(n));
    else {
      let n = 0;
      while (n < total && p < d.length) {
        const c = d[p++], count = (c & 127) + 1;
        if (c & 128) { for (let k = 0; k < count && n < total; k++) px(p, dest(n++)); p += bytes; }
        else { for (let k = 0; k < count && n < total; k++) { px(p, dest(n++)); p += bytes; } }
      }
    }
    return fromPixels(out, w, h);
  }

  function decodePNM(buf) {
    const d = new Uint8Array(buf);
    let p = 0;
    const skip = () => {
      while (p < d.length) {
        if (d[p] === 35) { while (p < d.length && d[p] !== 10 && d[p] !== 13) p++; }
        else if (d[p] <= 32) p++;
        else break;
      }
    };
    const token = () => { skip(); let s = ''; while (p < d.length && d[p] > 32 && d[p] !== 35) s += String.fromCharCode(d[p++]); return s; };
    const t = +token()[1];
    const w = +token(), h = +token();
    const max = (t === 1 || t === 4) ? 1 : +token();
    if (!w || !h || !max) throw new Error('Повреждённый заголовок Netpbm');
    const out = new Uint8ClampedArray(w * h * 4), k = 255 / max;
    const set = (i, r, g, b) => { out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = 255; };
    if (t <= 3) {
      for (let i = 0; i < w * h; i++) {
        if (t === 1) { skip(); const v = d[p++] === 49 ? 0 : 255; set(i, v, v, v); }
        else if (t === 2) { const v = +token() * k; set(i, v, v, v); }
        else set(i, +token() * k, +token() * k, +token() * k);
      }
    } else {
      p++;
      const wide = max > 255;
      const sample = () => { const v = wide ? (d[p] << 8) | d[p + 1] : d[p]; p += wide ? 2 : 1; return v * k; };
      if (t === 4) {
        const row = Math.ceil(w / 8);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const v = (d[p + y * row + (x >> 3)] >> (7 - (x & 7))) & 1 ? 0 : 255;
          set(y * w + x, v, v, v);
        }
      } else if (t === 5) for (let i = 0; i < w * h; i++) { const v = sample(); set(i, v, v, v); }
      else for (let i = 0; i < w * h; i++) set(i, sample(), sample(), sample());
    }
    return fromPixels(out, w, h);
  }

  async function decodeTIFF(file) {
    await loadScript(CDN.pako).catch(() => {});
    await loadScript(CDN.utif);
    const buf = await file.arrayBuffer();
    const ifds = global.UTIF.decode(buf);
    const ifd = ifds.find(i => i.t256 || i.width) || ifds[0];
    global.UTIF.decodeImage(buf, ifd, ifds);
    const data = new Uint8ClampedArray(global.UTIF.toRGBA8(ifd));
    return fromPixels(data, ifd.width, ifd.height);
  }

  async function decodeHEIC(file) {
    await loadScript(CDN.heic);
    let png = await global.heic2any({ blob: file, toType: 'image/png' });
    if (Array.isArray(png)) png = png[0];
    return decodeRaster(png);
  }

  /* ---------------- registry ---------------- */

  function register(f) {
    formats.set(f.id, Object.assign({ options: [], supported: () => true, alpha: false, lossy: false }, f));
  }
  function registerDecoder(d) { decoders.unshift(d); }

  register({ id: 'png', label: 'PNG', ext: 'png', mime: 'image/png', alpha: true,
    note: 'Без потерь', use: 'Скриншоты, логотипы, графика с прозрачностью',
    encode: c => canvasToBlob(c, 'image/png') });
  register({ id: 'jpeg', label: 'JPG', ext: 'jpg', mime: 'image/jpeg', lossy: true, options: ['quality', 'background'],
    note: 'Фото, малый вес', use: 'Фотографии, где важен вес файла',
    encode: (c, o) => canvasToBlob(flatten(c, o.background), 'image/jpeg', o.quality) });
  register({ id: 'webp', label: 'WEBP', ext: 'webp', mime: 'image/webp', alpha: true, lossy: true, options: ['quality'],
    note: 'Для сайтов', use: 'Картинки для сайтов: легче JPG, держит прозрачность',
    supported: () => supportsMime('image/webp'),
    encode: (c, o) => canvasToBlob(c, 'image/webp', o.quality) });
  register({ id: 'avif', label: 'AVIF', ext: 'avif', mime: 'image/avif', alpha: true, lossy: true, options: ['quality'],
    note: 'Самый лёгкий', use: 'Максимальное сжатие для веба (кодирует не каждый браузер)',
    supported: () => supportsMime('image/avif'),
    encode: (c, o) => canvasToBlob(c, 'image/avif', o.quality) });
  register({ id: 'gif', label: 'GIF', ext: 'gif', mime: 'image/gif', alpha: true, options: ['gif'],
    note: 'До 256 цветов', use: 'Простая графика, старые мессенджеры и форумы',
    encode: encodeGIF });
  register({ id: 'bmp', label: 'BMP', ext: 'bmp', mime: 'image/bmp', options: ['background'],
    note: 'Без сжатия', use: 'Старые программы Windows и микроконтроллеры',
    encode: encodeBMP });
  register({ id: 'ico', label: 'ICO', ext: 'ico', mime: 'image/x-icon', alpha: true, options: ['ico'],
    note: 'Иконки, favicon', use: 'Favicon сайта и иконки Windows, несколько размеров в одном файле',
    encode: encodeICO });
  register({ id: 'tiff', label: 'TIFF', ext: 'tiff', mime: 'image/tiff', alpha: true,
    note: 'Печать, архив', use: 'Типография и архив: без потерь, без сжатия',
    encode: encodeTIFF });
  register({ id: 'tga', label: 'TGA', ext: 'tga', mime: 'image/x-tga', alpha: true,
    note: 'Текстуры', use: 'Текстуры для игр и 3D-редакторов',
    encode: encodeTGA });
  register({ id: 'pdf', label: 'PDF', ext: 'pdf', mime: 'application/pdf', lossy: true, options: ['quality', 'background', 'pdf'],
    note: 'Документ', use: 'Отправить как документ или собрать сканы в один файл',
    encode: (c, o) => pdfFromCanvases([c], o) });
  register({ id: 'svg', label: 'SVG', ext: 'svg', mime: 'image/svg+xml', alpha: true,
    note: 'Растр в обёртке', use: 'Когда площадка принимает только SVG (это не векторизация)',
    encode: encodeSVG });
  register({ id: 'ppm', label: 'PPM', ext: 'ppm', mime: 'image/x-portable-pixmap', options: ['background'],
    note: 'Netpbm, RGB', use: 'Научные и консольные утилиты, обработка в скриптах',
    encode: (c, o) => encodePNM(c, o, false) });
  register({ id: 'pgm', label: 'PGM', ext: 'pgm', mime: 'image/x-portable-graymap', options: ['background'],
    note: 'Оттенки серого', use: 'Чёрно-белые данные для компьютерного зрения',
    encode: (c, o) => encodePNM(c, o, true) });
  register({ id: 'datauri', label: 'BASE64', ext: 'txt', mime: 'text/plain', alpha: true,
    note: 'Data URI', use: 'Вставить картинку прямо в HTML, CSS или JSON',
    encode: encodeDataURI });

  // Порядок: последний зарегистрированный проверяется первым, поэтому общий декодер — первым.
  registerDecoder({ id: 'native', test: () => true, decode: decodeRaster });
  registerDecoder({ id: 'svg', test: (h, n, t) => sniff(h, n, t) === 'SVG', decode: decodeSVG });
  registerDecoder({ id: 'pnm', test: (h, n, t) => sniff(h, n, t) === 'PNM', decode: async f => decodePNM(await f.arrayBuffer()) });
  registerDecoder({ id: 'tga', test: (h, n, t) => sniff(h, n, t) === 'TGA', decode: async f => decodeTGA(await f.arrayBuffer()) });
  registerDecoder({ id: 'tiff', test: (h, n, t) => sniff(h, n, t) === 'TIFF', decode: decodeTIFF });
  registerDecoder({ id: 'heic', test: (h, n, t) => sniff(h, n, t) === 'HEIC', decode: decodeHEIC });

  async function decode(file) {
    const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
    const name = (file.name || '').toLowerCase();
    const label = sniff(head, name, file.type);
    for (const d of decoders) {
      if (d.test(head, name, file.type)) {
        const res = await d.decode(file);
        return Object.assign({ format: label }, res);
      }
    }
    throw new Error('Формат не распознан');
  }

  async function encode(canvas, formatId, opts) {
    const f = formats.get(formatId);
    if (!f) throw new Error('Неизвестный формат: ' + formatId);
    if (!f.supported()) throw new Error(f.label + ' не поддерживается этим браузером');
    return f.encode(canvas, Object.assign({}, DEFAULTS, opts));
  }

  function outputName(name, formatId) {
    const f = formats.get(formatId);
    return (name || 'image').replace(/\.[^.\/\\]+$/, '') + '.' + f.ext;
  }

  async function convert(input, formatId, opts) {
    const decoded = input && input.source ? input : await decode(input);
    const canvas = prepare(decoded, opts);
    const blob = await encode(canvas, formatId, opts);
    return { blob, name: outputName(input.name, formatId), width: canvas.width, height: canvas.height };
  }

  const api = {
    version: '1.0.0',
    formats: () => Array.from(formats.values()),
    format: id => formats.get(id),
    inputs: ['PNG', 'JPEG', 'WEBP', 'AVIF', 'GIF', 'BMP', 'ICO', 'SVG', 'TIFF', 'HEIC', 'TGA', 'PPM/PGM/PBM'],
    register, registerDecoder,
    decode, prepare, encode, convert, computeSize, outputName,
    pdfFromCanvases, zip, supportsMime
  };
  global.RastrConvert = api;
})(window);
