/*!
 * RastrDocs — конвертация документов прямо в браузере, без загрузки на сервер.
 * Библиотеки подгружаются с CDN по требованию, с закреплёнными версиями и проверкой целостности (SRI):
 *   pdf.js — чтение PDF, pdf-lib + fontkit — создание PDF, mammoth — чтение DOCX,
 *   docx — создание DOCX, SheetJS — таблицы, marked — Markdown.
 *
 *   const outs = await RastrDocs.convert(file, 'pdf', opts);  // [{ name, blob }]
 *   const merged = await RastrDocs.mergePdf([file1, file2]);   // { name, blob }
 */
(function (global) {
  'use strict';

  const J = 'https://cdn.jsdelivr.net/npm/';
  const LIBS = {
    pdfjs: { src: J + 'pdfjs-dist@3.11.174/build/pdf.min.js', integrity: 'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e', global: 'pdfjsLib' },
    pdflib: { src: J + 'pdf-lib@1.17.1/dist/pdf-lib.min.js', integrity: 'sha384-weMABwrltA6jWR8DDe9Jp5blk+tZQh7ugpCsF3JwSA53WZM9/14PjS5LAJNHNjAI', global: 'PDFLib' },
    fontkit: { src: J + '@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js', integrity: 'sha384-2p6U+1mmqF10USehFeRiyG2ESG9FwIqN+jxULn5w9jjQIihSn9Pt13dVCn/Hawjn', global: 'fontkit' },
    mammoth: { src: J + 'mammoth@1.8.0/mammoth.browser.min.js', integrity: 'sha384-/cXAMbzovUIKbBERjPmR3SnPTh8siWr5lsvFYj1Uq4XP0yaJUZJmsh0YXyGv5P0y', global: 'mammoth' },
    docx: { src: J + 'docx@8.5.0/build/index.umd.js', integrity: 'sha384-4xaIisuLEy2lo2HkB2C4rEf7v8jbTb2kuogX6TkuEt9feTWKBSFSOzsqNNbV+sKh', global: 'docx' },
    marked: { src: J + 'marked@12.0.2/marked.min.js', integrity: 'sha384-/TQbtLCAerC3jgaim+N78RZSDYV7ryeoBCVqTuzRrFec2akfBkHS7ACQ3PQhvMVi', global: 'marked' },
    xlsx: { src: 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js', integrity: 'sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT', global: 'XLSX' }
  };
  const PDF_WORKER = { src: J + 'pdfjs-dist@3.11.174/build/pdf.worker.min.js', integrity: 'sha384-SnzOobpRMLXZ52iJvZm/C0fYw0OQemTXzTjIsdsfMcrCtCEe9qgzxTd3RSklO5x2' };
  const PDFJS_DATA = J + 'pdfjs-dist@3.11.174/';
  // PT Sans (ParaType, OFL) — шрифт с кириллицей для создаваемых PDF
  const FONTS = {
    regular: { src: J + '@expo-google-fonts/pt-sans@0.2.3/PTSans_400Regular.ttf', integrity: 'sha384-toJh3I/hQvD81875HcEOOf2wCFE49i4YHwfmIya+dL48jB3r3BqC2BlJ4sofslU5' },
    bold: { src: J + '@expo-google-fonts/pt-sans@0.2.3/PTSans_700Bold.ttf', integrity: 'sha384-1tg5p9b+sK6C2ls5imerx/37cMipW8bvFHNZ62lh506+gGjiWz7WmuKSbJV1eFDS' }
  };

  /* ---------------- загрузка библиотек ---------------- */

  const loading = {};
  function load(name) {
    const lib = LIBS[name];
    if (global[lib.global]) return Promise.resolve(global[lib.global]);
    if (!loading[name]) {
      loading[name] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = lib.src; s.async = true;
        s.integrity = lib.integrity; s.crossOrigin = 'anonymous'; s.referrerPolicy = 'no-referrer';
        s.onload = () => resolve(global[lib.global]);
        s.onerror = () => { s.remove(); delete loading[name]; reject(new Error('Не удалось загрузить модуль для документов (нужен интернет)')); };
        document.head.appendChild(s);
      });
    }
    return loading[name];
  }

  async function fetchChecked({ src, integrity }) {
    const r = await fetch(src, { integrity, mode: 'cors', referrerPolicy: 'no-referrer' }).catch(() => null);
    if (!r || !r.ok) throw new Error('Не удалось загрузить модуль для документов (нужен интернет)');
    return r;
  }

  let pdfjsReady = null;
  function pdfjs() {
    if (!pdfjsReady) {
      pdfjsReady = (async () => {
        const lib = await load('pdfjs');
        // Worker собираем из проверенного по SRI файла: браузер не запускает чужие Worker напрямую с CDN
        const code = await (await fetchChecked(PDF_WORKER)).text();
        lib.GlobalWorkerOptions.workerPort = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
        return lib;
      })().catch(e => { pdfjsReady = null; throw e; });
    }
    return pdfjsReady;
  }

  let fontsReady = null;
  function fonts() {
    if (!fontsReady) {
      fontsReady = Promise.all([fetchChecked(FONTS.regular), fetchChecked(FONTS.bold)])
        .then(rs => Promise.all(rs.map(r => r.arrayBuffer())))
        .then(([regular, bold]) => ({ regular, bold }))
        .catch(e => { fontsReady = null; throw e; });
    }
    return fontsReady;
  }

  /* ---------------- распознавание ---------------- */

  const KINDS = {
    pdf: { label: 'PDF', to: ['jpg', 'png', 'txt', 'docx', 'split'] },
    docx: { label: 'DOCX', to: ['pdf', 'txt', 'html', 'md'] },
    txt: { label: 'TXT', to: ['pdf', 'docx', 'html'] },
    md: { label: 'MD', to: ['html', 'pdf', 'docx'] },
    html: { label: 'HTML', to: ['pdf', 'docx', 'txt', 'md'] },
    xlsx: { label: 'XLSX', to: ['csv', 'json', 'pdf', 'html'] },
    xls: { label: 'XLS', to: ['xlsx', 'csv', 'json', 'pdf'] },
    ods: { label: 'ODS', to: ['xlsx', 'csv', 'json', 'pdf'] },
    csv: { label: 'CSV', to: ['xlsx', 'json', 'pdf', 'html'] },
    json: { label: 'JSON', to: ['xlsx', 'csv'] }
  };
  const TARGETS = {
    pdf: { label: 'PDF', ext: 'pdf', mime: 'application/pdf' },
    docx: { label: 'Word', ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    txt: { label: 'TXT', ext: 'txt', mime: 'text/plain;charset=utf-8' },
    html: { label: 'HTML', ext: 'html', mime: 'text/html;charset=utf-8' },
    md: { label: 'Markdown', ext: 'md', mime: 'text/markdown;charset=utf-8' },
    jpg: { label: 'JPG', ext: 'jpg', mime: 'image/jpeg' },
    png: { label: 'PNG', ext: 'png', mime: 'image/png' },
    xlsx: { label: 'Excel', ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    csv: { label: 'CSV', ext: 'csv', mime: 'text/csv;charset=utf-8' },
    json: { label: 'JSON', ext: 'json', mime: 'application/json' },
    split: { label: 'Разделить', ext: 'pdf', mime: 'application/pdf' }
  };

  async function detect(file) {
    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const ext = ((file.name || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
    const s = String.fromCharCode.apply(null, head);
    if (s.startsWith('%PDF')) return 'pdf';
    if (s.startsWith('PK')) {
      if (ext === 'xlsx' || ext === 'xlsm') return 'xlsx';
      if (ext === 'ods') return 'ods';
      if (ext === 'docx') return 'docx';
      // по содержимому архива: у Word есть word/document.xml, у Excel — xl/workbook.xml
      const text = await file.slice(0, Math.min(file.size, 65536)).text();
      if (text.includes('word/')) return 'docx';
      if (text.includes('xl/')) return 'xlsx';
      return null;
    }
    if (head[0] === 0xD0 && head[1] === 0xCF && head[2] === 0x11 && head[3] === 0xE0) return ext === 'doc' ? 'doc' : 'xls';
    if (['txt', 'text', 'log'].includes(ext)) return 'txt';
    if (['md', 'markdown'].includes(ext)) return 'md';
    if (['html', 'htm'].includes(ext)) return 'html';
    if (['csv', 'tsv'].includes(ext)) return 'csv';
    if (ext === 'json') return 'json';
    if (ext === 'xlsx') return 'xlsx';
    if (ext === 'xls') return 'xls';
    return null;
  }

  const base = name => (name || 'документ').replace(/\.[^.\/\\]+$/, '');
  const out = (name, target, blob, suffix) => ({ name: base(name) + (suffix || '') + '.' + TARGETS[target].ext, blob });
  const textBlob = (s, target) => new Blob([s], { type: TARGETS[target].mime });
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function htmlPage(title, body) {
    return '<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' + esc(title) + '</title>\n' +
      '<style>body{font:16px/1.6 system-ui,sans-serif;max-width:800px;margin:40px auto;padding:0 16px;color:#111}' +
      'img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}pre{background:#f4f4f4;padding:12px;overflow:auto}</style>\n' +
      '</head>\n<body>\n' + body + '\n</body>\n</html>\n';
  }

  /* ---------------- страницы PDF ---------------- */

  // «1-3, 5, 8-» → [1,2,3,5,8,9,…] в пределах 1..total
  function parseRanges(spec, total) {
    const s = String(spec || '').trim();
    if (!s) return Array.from({ length: total }, (_, i) => i + 1);
    const set = new Set();
    for (const part of s.split(/[,;\s]+/).filter(Boolean)) {
      const m = part.match(/^(\d*)\s*[-–]\s*(\d*)$/);
      if (m) {
        const a = m[1] ? +m[1] : 1, b = m[2] ? +m[2] : total;
        for (let i = Math.max(1, a); i <= Math.min(total, b); i++) set.add(i);
      } else if (/^\d+$/.test(part)) { const n = +part; if (n >= 1 && n <= total) set.add(n); }
      else throw new Error('Не понял диапазон страниц «' + part + '». Пример: 1-3, 5');
    }
    if (!set.size) throw new Error('В документе нет таких страниц (всего ' + total + ')');
    return [...set].sort((a, b) => a - b);
  }

  async function openPdf(file) {
    const lib = await pdfjs();
    const data = new Uint8Array(await file.arrayBuffer());
    try {
      return await lib.getDocument({ data, isEvalSupported: false, cMapUrl: PDFJS_DATA + 'cmaps/', cMapPacked: true, standardFontDataUrl: PDFJS_DATA + 'standard_fonts/' }).promise;
    } catch (e) {
      if (e && e.name === 'PasswordException') throw new Error('PDF защищён паролем — снимите защиту и попробуйте снова');
      throw new Error('Не получилось открыть PDF: файл повреждён или это не PDF');
    }
  }

  async function pdfToImages(file, target, o) {
    const doc = await openPdf(file);
    const pages = parseRanges(o.pages, doc.numPages);
    const scale = (o.dpi || 150) / 72;
    const outs = [];
    for (const n of pages) {
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale });
      const c = document.createElement('canvas');
      c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const blob = await new Promise(r => c.toBlob(r, target === 'png' ? 'image/png' : 'image/jpeg', o.quality || 0.9));
      outs.push(out(file.name, target, blob, pages.length > 1 || doc.numPages > 1 ? '-стр-' + n : ''));
      page.cleanup();
    }
    await doc.destroy();
    return outs;
  }

  // Текст PDF по строкам и абзацам: строки собираем по координате Y, абзац — по большому отступу
  async function pdfParagraphs(file) {
    const doc = await openPdf(file);
    const result = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const tc = await page.getTextContent();
      const lines = [];
      let line = null;
      for (const it of tc.items) {
        if (!('str' in it)) continue;
        const y = it.transform[5], h = Math.abs(it.transform[3]) || it.height || 10;
        if (!line || Math.abs(line.y - y) > h * 0.5) { line = { y, h, text: '' }; lines.push(line); }
        line.text += it.str;
        if (it.hasEOL) line = null;
      }
      const paras = [];
      let cur = null, prev = null;
      for (const l of lines) {
        const t = l.text.replace(/\s+/g, ' ').trim();
        if (!t) { cur = null; prev = l; continue; }
        const gap = prev ? prev.y - l.y : 0;
        if (!cur || gap > l.h * 1.7 || gap < 0) { cur = { text: t }; paras.push(cur); }
        // перенос по слогам в конце строки («сло-» + «во») склеиваем в одно слово
        else if (/[а-яёa-z]-$/i.test(cur.text) && /^[а-яёa-z]/.test(t)) cur.text = cur.text.slice(0, -1) + t;
        else cur.text += ' ' + t;
        prev = l;
      }
      result.push(paras.map(p => p.text));
      page.cleanup();
    }
    await doc.destroy();
    return result; // по страницам: [[абзац, …], …]
  }

  async function pdfToText(file) {
    const pages = await pdfParagraphs(file);
    const text = pages.map(p => p.join('\n\n')).join('\n\n\f\n\n');
    if (!text.replace(/\f/g, '').trim()) throw new Error('В PDF нет текстового слоя — похоже, это скан. Распознать текст на картинке без сервера нельзя');
    return [out(file.name, 'txt', textBlob(text, 'txt'))];
  }

  async function pdfToDocx(file) {
    const pages = await pdfParagraphs(file);
    if (!pages.some(p => p.length)) throw new Error('В PDF нет текстового слоя — похоже, это скан. Распознать текст на картинке без сервера нельзя');
    const blocks = [];
    pages.forEach((p, i) => {
      if (i) blocks.push({ type: 'pagebreak' });
      for (const t of p) blocks.push({ type: 'p', runs: [{ text: t }] });
    });
    return [out(file.name, 'docx', await blocksToDocx(blocks))];
  }

  async function mergePdf(files, o) {
    const { PDFDocument } = await load('pdflib');
    const outDoc = await PDFDocument.create();
    for (const f of files) {
      let src;
      try { src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: false }); }
      catch (e) { throw new Error('«' + f.name + '»: ' + (/encrypt/i.test(e.message) ? 'PDF защищён паролем' : 'не получилось открыть PDF')); }
      const copied = await outDoc.copyPages(src, src.getPageIndices());
      copied.forEach(p => outDoc.addPage(p));
    }
    const bytes = await outDoc.save();
    return { name: ((o && o.name) || 'объединённый') + '.pdf', blob: new Blob([bytes], { type: 'application/pdf' }) };
  }

  async function splitPdf(file, o) {
    const { PDFDocument } = await load('pdflib');
    let src;
    try { src = await PDFDocument.load(await file.arrayBuffer()); }
    catch (e) { throw new Error(/encrypt/i.test(e.message) ? 'PDF защищён паролем' : 'Не получилось открыть PDF'); }
    const total = src.getPageCount();
    const make = async idx => {
      const d = await PDFDocument.create();
      (await d.copyPages(src, idx)).forEach(p => d.addPage(p));
      return new Blob([await d.save()], { type: 'application/pdf' });
    };
    if (o.splitMode === 'range') {
      const pages = parseRanges(o.pages, total);
      const label = pages.length === 1 ? pages[0] : pages[0] + '-' + pages[pages.length - 1];
      return [out(file.name, 'split', await make(pages.map(p => p - 1)), '-стр-' + label)];
    }
    const outs = [];
    for (let i = 0; i < total; i++) outs.push(out(file.name, 'split', await make([i]), '-стр-' + (i + 1)));
    return outs;
  }

  /* ---------------- блоки: общий формат текста ---------------- */
  // { type: 'h', level, runs } | { type: 'p', runs } | { type: 'li', ordered, index, depth, runs }
  // { type: 'table', rows: [[string]] } | { type: 'img', src } | { type: 'code', text } | { type: 'pagebreak' } | { type: 'hr' }
  // runs: [{ text, bold, italic }]

  function runsFrom(node, style, runs) {
    runs = runs || [];
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { if (n.nodeValue) runs.push({ text: n.nodeValue.replace(/\s+/g, ' '), bold: style.bold, italic: style.italic }); }
      else if (n.nodeType === 1) {
        const tag = n.tagName.toLowerCase();
        if (tag === 'br') runs.push({ text: '\n' });
        else if (tag === 'img') continue;
        else runsFrom(n, { bold: style.bold || tag === 'b' || tag === 'strong' || /^h\d$/.test(tag) || tag === 'th', italic: style.italic || tag === 'i' || tag === 'em' }, runs);
      }
    }
    return runs;
  }
  const trimRuns = runs => {
    const r = runs.filter(x => x.text);
    if (r.length) { r[0] = Object.assign({}, r[0], { text: r[0].text.replace(/^\s+/, '') }); const k = r.length - 1; r[k] = Object.assign({}, r[k], { text: r[k].text.replace(/\s+$/, '') }); }
    return r.filter(x => x.text);
  };
  const runsText = runs => runs.map(r => r.text).join('');

  function htmlToBlocks(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style, noscript, template').forEach(n => n.remove());
    const blocks = [];
    const walk = (el, depth) => {
      for (const n of el.children) {
        const tag = n.tagName.toLowerCase();
        if (/^h[1-6]$/.test(tag)) { const runs = trimRuns(runsFrom(n, { bold: true })); if (runs.length) blocks.push({ type: 'h', level: +tag[1], runs }); }
        else if (tag === 'p' || tag === 'blockquote' || tag === 'dd' || tag === 'dt' || tag === 'figcaption') {
          n.querySelectorAll('img').forEach(img => blocks.push({ type: 'img', src: img.getAttribute('src') }));
          const runs = trimRuns(runsFrom(n, {}));
          if (runs.length) blocks.push({ type: 'p', runs });
        }
        else if (tag === 'ul' || tag === 'ol') {
          let i = 0;
          for (const li of n.children) {
            if (li.tagName.toLowerCase() !== 'li') continue;
            const clone = li.cloneNode(true);
            clone.querySelectorAll('ul, ol').forEach(x => x.remove());
            const runs = trimRuns(runsFrom(clone, {}));
            if (runs.length) blocks.push({ type: 'li', ordered: tag === 'ol', index: ++i, depth, runs });
            li.querySelectorAll(':scope > ul, :scope > ol').forEach(sub => walk({ children: [sub] }, depth + 1));
          }
        }
        else if (tag === 'table') {
          const rows = [...n.querySelectorAll('tr')].map(tr => [...tr.children].map(td => runsText(trimRuns(runsFrom(td, {}))).replace(/\n/g, ' ')));
          if (rows.length) blocks.push({ type: 'table', rows });
        }
        else if (tag === 'pre') blocks.push({ type: 'code', text: n.textContent.replace(/\n$/, '') });
        else if (tag === 'img') blocks.push({ type: 'img', src: n.getAttribute('src') });
        else if (tag === 'hr') blocks.push({ type: 'hr' });
        else if (n.children.length) walk(n, depth);
        else { const runs = trimRuns(runsFrom(n, {})); if (runs.length) blocks.push({ type: 'p', runs }); }
      }
    };
    walk(doc.body, 0);
    // текст прямо в <body> без тегов
    if (!blocks.length && doc.body.textContent.trim()) return textToBlocks(doc.body.textContent);
    return blocks;
  }

  function textToBlocks(text) {
    return String(text).replace(/\r\n?/g, '\n').split(/\n\s*\n/).map(p => p.replace(/\f/g, '').trim()).filter(Boolean)
      .map(p => ({ type: 'p', runs: [{ text: p }] }));
  }

  function blocksToText(blocks) {
    return blocks.map(b => {
      if (b.type === 'table') return b.rows.map(r => r.join('\t')).join('\n');
      if (b.type === 'li') return '  '.repeat(b.depth || 0) + (b.ordered ? b.index + '. ' : '• ') + runsText(b.runs);
      if (b.type === 'code') return b.text;
      if (b.type === 'hr') return '———';
      if (b.type === 'pagebreak' || b.type === 'img') return '';
      return runsText(b.runs);
    }).filter(s => s !== '').join('\n\n') + '\n';
  }

  function blocksToHtml(blocks) {
    const runs = rs => rs.map(r => { let t = esc(r.text).replace(/\n/g, '<br>'); if (r.bold) t = '<strong>' + t + '</strong>'; if (r.italic) t = '<em>' + t + '</em>'; return t; }).join('');
    const parts = []; let list = null;
    const closeList = () => { if (list) { parts.push('</' + list + '>'); list = null; } };
    for (const b of blocks) {
      if (b.type === 'li') { const t = b.ordered ? 'ol' : 'ul'; if (list !== t) { closeList(); parts.push('<' + t + '>'); list = t; } parts.push('<li>' + runs(b.runs) + '</li>'); continue; }
      closeList();
      if (b.type === 'h') parts.push('<h' + b.level + '>' + runs(b.runs) + '</h' + b.level + '>');
      else if (b.type === 'p') parts.push('<p>' + runs(b.runs) + '</p>');
      else if (b.type === 'table') parts.push('<table>' + b.rows.map(r => '<tr>' + r.map(c => '<td>' + esc(c) + '</td>').join('') + '</tr>').join('') + '</table>');
      else if (b.type === 'code') parts.push('<pre>' + esc(b.text) + '</pre>');
      else if (b.type === 'hr') parts.push('<hr>');
      else if (b.type === 'img' && b.src) parts.push('<p><img src="' + esc(b.src) + '" alt=""></p>');
    }
    closeList();
    return parts.join('\n');
  }

  /* ---------------- сборка DOCX ---------------- */

  async function blocksToDocx(blocks) {
    const D = await load('docx');
    const H = [null, D.HeadingLevel.HEADING_1, D.HeadingLevel.HEADING_2, D.HeadingLevel.HEADING_3, D.HeadingLevel.HEADING_4, D.HeadingLevel.HEADING_5, D.HeadingLevel.HEADING_6];
    const tr = rs => rs.flatMap(r => r.text.split('\n').map((t, i) => new D.TextRun({ text: t, bold: r.bold, italics: r.italic, break: i ? 1 : 0 })));
    const children = [];
    let pendingBreak = false;
    for (const b of blocks) {
      if (b.type === 'pagebreak') { pendingBreak = true; continue; }
      const extra = pendingBreak ? { pageBreakBefore: true } : {};
      pendingBreak = false;
      if (b.type === 'h') children.push(new D.Paragraph(Object.assign({ heading: H[b.level] || H[3], children: tr(b.runs) }, extra)));
      else if (b.type === 'li') children.push(new D.Paragraph(Object.assign({ children: [new D.TextRun({ text: (b.ordered ? b.index + '.' : '•') + '\t' })].concat(tr(b.runs)), indent: { left: 360 * ((b.depth || 0) + 1), hanging: 360 } }, extra)));
      else if (b.type === 'table') {
        const cols = Math.max(...b.rows.map(r => r.length));
        children.push(new D.Table({
          width: { size: 100, type: D.WidthType.PERCENTAGE },
          rows: b.rows.map(r => new D.TableRow({ children: Array.from({ length: cols }, (_, i) => new D.TableCell({ children: [new D.Paragraph(r[i] || '')] })) }))
        }));
      }
      else if (b.type === 'code') children.push(new D.Paragraph(Object.assign({ children: b.text.split('\n').map((t, i) => new D.TextRun({ text: t, font: 'Consolas', break: i ? 1 : 0 })) }, extra)));
      else if (b.type === 'hr') children.push(new D.Paragraph({ children: [new D.TextRun('———')] }));
      else if (b.type === 'p') children.push(new D.Paragraph(Object.assign({ children: tr(b.runs) }, extra)));
    }
    if (!children.length) children.push(new D.Paragraph(''));
    const doc = new D.Document({ styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } }, sections: [{ children }] });
    return D.Packer.toBlob(doc);
  }

  /* ---------------- сборка PDF с переносом строк ---------------- */

  const PAGE = { a4: [595.28, 841.89], letter: [612, 792] };

  async function blocksToPdf(blocks, o) {
    const { PDFDocument, rgb } = await load('pdflib');
    const fk = await load('fontkit');
    const f = await fonts();
    const doc = await PDFDocument.create();
    doc.registerFontkit(fk);
    const R = await doc.embedFont(f.regular, { subset: true });
    const B = await doc.embedFont(f.bold, { subset: true });
    const [PW, PH] = PAGE[o.pageSize] || PAGE.a4;
    const M = 56, W = PW - M * 2, base = +o.fontSize || 11;
    const ink = rgb(0.07, 0.08, 0.12), line = rgb(0.75, 0.77, 0.8);
    let page, y;
    const newPage = () => { page = doc.addPage([PW, PH]); y = PH - M; };
    newPage();
    const ensure = h => { if (y - h < M) newPage(); };
    // Символы, которых нет в шрифте (например, эмодзи), заменяем, иначе PDF не соберётся
    const charsets = new Map([[R, new Set(R.getCharacterSet())], [B, new Set(B.getCharacterSet())]]);
    const safe = (font, t) => { const cs = charsets.get(font); let s = ''; for (const ch of t) s += cs.has(ch.codePointAt(0)) || ch === ' ' ? ch : '?'; return s; };

    function wrap(runs, size, width) {
      // слова со стилем → строки, каждая строка — список кусков { text, font, w }
      const words = [];
      for (const r of runs) {
        const font = r.bold ? B : R;
        for (const part of r.text.split(/(\n| +)/)) {
          if (part === '\n') words.push({ nl: true });
          else if (part) words.push({ text: safe(font, part), font, space: /^ +$/.test(part) });
        }
      }
      const lines = []; let cur = [], cw = 0;
      const push = () => { while (cur.length && cur[cur.length - 1].space) cur.pop(); lines.push(cur); cur = []; cw = 0; };
      for (const w of words) {
        if (w.nl) { push(); continue; }
        if (w.space && !cur.length) continue;
        let ww = w.font.widthOfTextAtSize(w.text, size);
        if (cw + ww > width && cur.length && !w.space) push();
        // слово длиннее строки режем по буквам
        while (ww > width && !w.space) {
          let k = w.text.length;
          while (k > 1 && w.font.widthOfTextAtSize(w.text.slice(0, k), size) > width - cw) k--;
          cur.push({ text: w.text.slice(0, k), font: w.font, w: w.font.widthOfTextAtSize(w.text.slice(0, k), size) });
          push(); w.text = w.text.slice(k); ww = w.font.widthOfTextAtSize(w.text, size);
        }
        if (w.space && cw + ww > width) continue;
        cur.push({ text: w.text, font: w.font, w: ww }); cw += ww;
      }
      if (cur.length) push();
      return lines;
    }
    function drawLines(lines, x, size, lh) {
      for (const ln of lines) {
        ensure(lh);
        let cx = x;
        for (const piece of ln) { page.drawText(piece.text, { x: cx, y: y - size, size, font: piece.font, color: ink }); cx += piece.w; }
        y -= lh;
      }
    }

    for (const b of blocks) {
      if (b.type === 'pagebreak') { newPage(); continue; }
      if (b.type === 'h') {
        const size = [0, base * 1.9, base * 1.5, base * 1.25, base * 1.1, base, base][b.level] || base;
        y -= size * 0.6; ensure(size * 2.4);
        drawLines(wrap(b.runs.map(r => Object.assign({}, r, { bold: true })), size, W), M, size, size * 1.3);
        y -= size * 0.35;
      } else if (b.type === 'p') {
        drawLines(wrap(b.runs, base, W), M, base, base * 1.45); y -= base * 0.7;
      } else if (b.type === 'li') {
        const ind = 18 * ((b.depth || 0) + 1), mark = b.ordered ? b.index + '.' : '•';
        const lines = wrap(b.runs, base, W - ind);
        ensure(base * 1.45);
        page.drawText(mark, { x: M + ind - 14, y: y - base, size: base, font: R, color: ink });
        drawLines(lines, M + ind, base, base * 1.45); y -= base * 0.35;
      } else if (b.type === 'code') {
        drawLines(wrap([{ text: b.text }], base * 0.9, W - 12), M + 12, base * 0.9, base * 1.3); y -= base * 0.7;
      } else if (b.type === 'hr') {
        ensure(base); page.drawLine({ start: { x: M, y: y - base / 2 }, end: { x: PW - M, y: y - base / 2 }, thickness: 0.7, color: line }); y -= base * 1.2;
      } else if (b.type === 'table') {
        const cols = Math.max(...b.rows.map(r => r.length)), cw = W / cols, pad = 4, size = base * 0.9, lh = size * 1.35;
        b.rows.forEach((row, ri) => {
          const cells = Array.from({ length: cols }, (_, i) => wrap([{ text: row[i] || '', bold: ri === 0 && b.rows.length > 1 }], size, cw - pad * 2));
          const h = Math.max(...cells.map(c => Math.max(1, c.length))) * lh + pad * 2;
          ensure(h);
          cells.forEach((c, i) => {
            const x = M + i * cw;
            page.drawRectangle({ x, y: y - h, width: cw, height: h, borderColor: line, borderWidth: 0.6 });
            c.forEach((ln, li) => { let cx = x + pad; for (const piece of ln) { page.drawText(piece.text, { x: cx, y: y - pad - size - li * lh, size, font: piece.font, color: ink }); cx += piece.w; } });
          });
          y -= h;
        });
        y -= base * 0.8;
      } else if (b.type === 'img' && b.src && /^data:image\/(png|jpe?g)/.test(b.src)) {
        try {
          const bytes = Uint8Array.from(atob(b.src.split(',')[1]), c => c.charCodeAt(0));
          const img = /png/.test(b.src.slice(0, 20)) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
          const k = Math.min(1, W / img.width, (PH - M * 2) / img.height);
          const w = img.width * k, h = img.height * k;
          ensure(h); page.drawImage(img, { x: M, y: y - h, width: w, height: h }); y -= h + base * 0.8;
        } catch (e) { /* неподдерживаемую картинку пропускаем */ }
      }
    }
    return new Blob([await doc.save()], { type: 'application/pdf' });
  }

  /* ---------------- Word, текст, Markdown, HTML ---------------- */

  async function docxHtml(file) {
    const m = await load('mammoth');
    try { return (await m.convertToHtml({ arrayBuffer: await file.arrayBuffer() })).value; }
    catch (e) { throw new Error('Не получилось открыть DOCX: файл повреждён или это старый формат .doc'); }
  }

  async function sourceBlocks(file, kind) {
    if (kind === 'docx') return htmlToBlocks(await docxHtml(file));
    if (kind === 'html') return htmlToBlocks(await file.text());
    if (kind === 'md') { const mk = await load('marked'); return htmlToBlocks(mk.parse(await file.text())); }
    if (kind === 'txt') return textToBlocks(await file.text());
    throw new Error('Неподдерживаемый документ');
  }

  async function textual(file, kind, target, o) {
    if (target === 'html' && kind === 'md') {
      const mk = await load('marked');
      return [out(file.name, 'html', textBlob(htmlPage(base(file.name), mk.parse(await file.text())), 'html'))];
    }
    const blocks = await sourceBlocks(file, kind);
    if (!blocks.length) throw new Error('В документе нет текста');
    if (target === 'pdf') return [out(file.name, 'pdf', await blocksToPdf(blocks, o))];
    if (target === 'docx') return [out(file.name, 'docx', await blocksToDocx(blocks))];
    if (target === 'txt') return [out(file.name, 'txt', textBlob(blocksToText(blocks), 'txt'))];
    if (target === 'html') return [out(file.name, 'html', textBlob(htmlPage(base(file.name), kind === 'docx' ? await docxHtml(file) : blocksToHtml(blocks)), 'html'))];
    if (target === 'md') return [out(file.name, 'md', textBlob(blocksToMarkdown(blocks), 'md'))];
    throw new Error('Такое преобразование не поддерживается');
  }

  function blocksToMarkdown(blocks) {
    const runs = rs => rs.map(r => { let t = r.text.replace(/\n/g, '  \n'); if (r.bold && t.trim()) t = '**' + t + '**'; if (r.italic && t.trim()) t = '*' + t + '*'; return t; }).join('');
    return blocks.map(b => {
      if (b.type === 'h') return '#'.repeat(b.level) + ' ' + runsText(b.runs);
      if (b.type === 'li') return '  '.repeat(b.depth || 0) + (b.ordered ? b.index + '. ' : '- ') + runs(b.runs);
      if (b.type === 'table') { const r = b.rows; return [r[0], r[0].map(() => '---')].concat(r.slice(1)).map(x => '| ' + x.map(c => c.replace(/\|/g, '\\|')).join(' | ') + ' |').join('\n'); }
      if (b.type === 'code') return '```\n' + b.text + '\n```';
      if (b.type === 'hr') return '---';
      if (b.type === 'p') return runs(b.runs);
      return '';
    }).filter(Boolean).join('\n\n') + '\n';
  }

  /* ---------------- таблицы ---------------- */

  async function sheets(file, kind, target, o) {
    const X = await load('xlsx');
    let wb;
    try {
      if (kind === 'json') {
        const data = JSON.parse(await file.text());
        const rows = Array.isArray(data) ? data : (Array.isArray(Object.values(data)[0]) ? Object.values(data)[0] : [data]);
        wb = X.utils.book_new();
        X.utils.book_append_sheet(wb, X.utils.json_to_sheet(rows.map(r => (r && typeof r === 'object') ? r : { value: r })), 'Лист1');
      } else if (kind === 'csv') {
        let text = await file.text();
        text = text.replace(/^﻿/, '');
        const first = text.split('\n')[0];
        const fs = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : (first.includes('\t') ? '\t' : ',');
        wb = X.read(text, { type: 'string', FS: fs, raw: true });
      } else wb = X.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
    } catch (e) { throw new Error(kind === 'json' ? 'В JSON ошибка: ' + e.message : 'Не получилось открыть таблицу: файл повреждён'); }

    const names = wb.SheetNames;
    const each = (fn, ext) => names.map(n => {
      const suffix = names.length > 1 ? '-' + n.replace(/[\\/:*?"<>|]/g, '_') : '';
      return out(file.name, ext, fn(wb.Sheets[n]), suffix);
    });
    if (target === 'xlsx') return [out(file.name, 'xlsx', new Blob([X.write(wb, { type: 'array', bookType: 'xlsx' })], { type: TARGETS.xlsx.mime }))];
    if (target === 'csv') {
      const FS = o.csvSeparator === ',' ? ',' : ';';
      // BOM — чтобы Excel правильно показал кириллицу
      return each(s => new Blob(['﻿' + X.utils.sheet_to_csv(s, { FS, blankrows: false })], { type: TARGETS.csv.mime }), 'csv');
    }
    if (target === 'json') return each(s => new Blob([JSON.stringify(X.utils.sheet_to_json(s, { defval: '' }), null, 2)], { type: TARGETS.json.mime }), 'json');
    if (target === 'html') return each(s => textBlob(htmlPage(base(file.name), X.utils.sheet_to_html(s, { header: '', footer: '' })), 'html'), 'html');
    if (target === 'pdf') {
      const blocks = [];
      names.forEach((n, i) => {
        if (i) blocks.push({ type: 'pagebreak' });
        if (names.length > 1) blocks.push({ type: 'h', level: 2, runs: [{ text: n }] });
        const rows = X.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: false, blankrows: false }).map(r => r.map(String));
        if (rows.length) blocks.push({ type: 'table', rows });
      });
      return [out(file.name, 'pdf', await blocksToPdf(blocks, o))];
    }
    throw new Error('Такое преобразование не поддерживается');
  }

  /* ---------------- главная функция ---------------- */

  async function convert(file, target, opts) {
    const o = opts || {};
    const kind = await detect(file);
    if (!kind) throw new Error('Формат не распознан');
    if (kind === 'doc') throw new Error('Старый формат .doc не поддерживается — сохраните файл в Word как .docx');
    if (!KINDS[kind].to.includes(target)) throw new Error(KINDS[kind].label + ' нельзя перевести в ' + TARGETS[target].label);
    if (kind === 'pdf') {
      if (target === 'jpg' || target === 'png') return pdfToImages(file, target, o);
      if (target === 'txt') return pdfToText(file);
      if (target === 'docx') return pdfToDocx(file);
      if (target === 'split') return splitPdf(file, o);
    }
    if (['xlsx', 'xls', 'ods', 'csv', 'json'].includes(kind)) return sheets(file, kind, target, o);
    return textual(file, kind, target, o);
  }

  global.RastrDocs = {
    version: '1.0.0',
    KINDS, TARGETS, LIBS,
    detect, convert, mergePdf, parseRanges,
    htmlToBlocks, textToBlocks, blocksToPdf, blocksToDocx
  };
})(window);
