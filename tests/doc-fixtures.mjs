// Тестовые документы, собранные в коде: PDF с текстом, DOCX с заголовком и таблицей, CSV, Markdown и др.
// Плюс чтение ZIP (DOCX/XLSX — это ZIP-архивы), чтобы проверять, что внутри результата.
import zlib from 'node:zlib';

/* ---------- PDF: страницы с текстом шрифтом Helvetica ---------- */
export function pdf(pages) {
  const parts = [], offsets = [];
  let len = 0;
  const push = s => { const b = Buffer.from(s, 'latin1'); parts.push(b); len += b.length; };
  const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n${body}\nendobj\n`); };
  push('%PDF-1.4\n');
  const n = pages.length;
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${n} >>`);
  obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  pages.forEach((lines, i) => {
    const content = 'BT /F1 14 Tf 72 740 Td 18 TL ' + lines.map(l => `(${l.replace(/[()\\]/g, '\\$&')}) Tj T*`).join(' ') + ' ET';
    obj(4 + i * 2, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    obj(5 + i * 2, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  const size = 4 + n * 2, xref = len;
  push(`xref\n0 ${size}\n0000000000 65535 f \n` + Array.from({ length: size - 1 }, (_, i) => String(offsets[i + 1]).padStart(10, '0') + ' 00000 n \n').join(''));
  push(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(parts);
}

/* ---------- ZIP без сжатия ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = d => { let c = 0xFFFFFFFF; for (const b of d) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

export function zip(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nm = Buffer.from(name), data = Buffer.from(content), crc = crc32(data);
    const loc = Buffer.alloc(30); loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(0x0800, 6);
    loc.writeUInt32LE(crc, 14); loc.writeUInt32LE(data.length, 18); loc.writeUInt32LE(data.length, 22); loc.writeUInt16LE(nm.length, 26);
    const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(data.length, 20); cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(nm.length, 28); cen.writeUInt32LE(offset, 42);
    parts.push(loc, nm, data); central.push(cen, nm);
    offset += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

// Чтение ZIP по центральному каталогу, с распаковкой deflate
export function unzip(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const files = {};
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString('utf8');
    const lnlen = buf.readUInt16LE(off + 26), lelen = buf.readUInt16LE(off + 28);
    const data = buf.subarray(off + 30 + lnlen + lelen, off + 30 + lnlen + lelen + csize);
    files[name] = method === 8 ? zlib.inflateRawSync(data) : Buffer.from(data);
    p += 46 + nlen + elen + clen;
  }
  return files;
}

/* ---------- DOCX: заголовок, жирный текст, таблица, список ---------- */
export function docx() {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const r = (t, b) => `<w:r>${b ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${t}</w:t></w:r>`;
  const p = (inner, style) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${inner}</w:p>`;
  const cell = t => `<w:tc><w:p>${r(t)}</w:p></w:tc>`;
  return zip({
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/_rels/document.xml.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'word/styles.xml': `<?xml version="1.0" encoding="UTF-8"?><w:styles ${W}><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`,
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>` +
      p(r('Отчёт за сентябрь'), 'Heading1') +
      p(r('Привет,', true) + r(' Растр! Это тестовый документ.')) +
      `<w:tbl><w:tr>${cell('Имя')}${cell('Возраст')}</w:tr><w:tr>${cell('Анна')}${cell('30')}</w:tr></w:tbl>` +
      p(r('Последний абзац.')) +
      '</w:body></w:document>'
  });
}

export const text = {
  csv: 'Имя;Возраст;Город\nАнна;30;Москва\nБорис;41;Казань\n',
  md: '# Заголовок\n\nАбзац с **жирным** словом.\n\n- первый пункт\n- второй пункт\n\n| Имя | Город |\n| --- | --- |\n| Анна | Москва |\n',
  txt: 'Первый абзац простого текста.\n\nВторой абзац, тоже на русском.\n',
  html: '<!doctype html><html><body><h1>Страница</h1><p>Текст <b>страницы</b>.</p><ul><li>Раз</li><li>Два</li></ul></body></html>',
  json: JSON.stringify([{ name: 'Анна', age: 30 }, { name: 'Борис', age: 41 }])
};
