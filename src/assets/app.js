/* Растр — интерфейс конвертера. Вся работа с форматами — в rastr-convert.js */
(function () {
  'use strict';
  const R = window.RastrConvert;
  const $ = id => document.getElementById(id);
  if (!R || !$('fmts')) return;

  const ICON_DL = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 2v8m0 0L4.5 6.5M8 10l3.5-3.5M2.5 13.5h11"/></svg>';
  const ICON_X = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
  const PREVIEWABLE = ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif', 'image/bmp', 'image/x-icon', 'image/svg+xml'];

  // Настройки конкретной страницы (например, /png-v-jpg/ сразу выбирает JPG)
  let preset = {};
  try { preset = JSON.parse(($('preset') || {}).textContent || '{}'); } catch (e) {}

  const state = { items: [], format: 'webp', rotate: 0, flipH: false, flipV: false, busy: false };
  let seq = 0;

  /* ---------- utils ---------- */
  function fmtSize(b) {
    if (b < 1024) return b + ' Б';
    if (b < 1024 * 1024) return (b / 1024).toFixed(b < 10240 ? 1 : 0).replace('.', ',') + ' КБ';
    return (b / 1048576).toFixed(1).replace('.', ',') + ' МБ';
  }
  function fmtLimit(bytes) { const kb = bytes / 1000; return kb >= 1000 && kb % 1000 === 0 ? kb / 1000 + ' МБ' : kb + ' КБ'; }
  function plural(n, a, b, c) { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c; }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  let toastTimer;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  }
  function save(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function opts() {
    const mode = $('resize-mode').value;
    return {
      quality: +$('quality').value / 100,
      background: $('bg').value,
      gifColors: +$('gif-colors').value,
      gifDither: $('gif-dither').checked,
      icoSizes: [...document.querySelectorAll('#ico-sizes input:checked')].map(i => +i.value),
      resize: { mode, percent: +$('resize-percent').value || 100, width: +$('resize-w').value || 1, height: +$('resize-h').value || 1 },
      rotate: state.rotate, flipH: state.flipH, flipV: state.flipV,
      // «сжать до N КБ»: считаем КБ по 1000 байт — так файл пройдёт проверку и там, где КБ = 1024 байта
      targetBytes: $('target-on').checked ? Math.max(1, +$('target-kb').value || 0) * 1000 : 0
    };
  }

  /* ---------- formats UI ---------- */
  const fmts = R.formats();
  $('in-list').textContent = 'Принимаем: ' + R.inputs.join(' · ');

  $('fmts').innerHTML = fmts.map(f =>
    '<button type="button" class="fmt" data-id="' + f.id + '" aria-pressed="false"' +
    (f.supported() ? '' : ' disabled title="Этот браузер не умеет кодировать ' + f.label + '"') + '>' +
    '<span class="fmt-ext">' + f.label + '</span><span class="fmt-note">' + esc(f.note) + '</span>' +
    (f.alpha ? '<span class="alpha" aria-label="прозрачность"></span>' : '') + '</button>'
  ).join('');

  // Таблица форматов есть только на главной; её строки уже в HTML, здесь только отмечаем недоступные
  const refBody = $('ref-body');
  if (refBody) {
    refBody.querySelectorAll('tr').forEach(tr => {
      const f = R.format(tr.dataset.id);
      if (f && !f.supported()) tr.lastElementChild.insertAdjacentHTML('beforeend', ' <span class="err">— недоступен в этом браузере</span>');
    });
  }

  function setFormat(id, remember) {
    const f = R.format(id);
    if (!f || !f.supported()) return false;
    state.format = id;
    document.querySelectorAll('.fmt').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === id));
    if (refBody) refBody.querySelectorAll('tr').forEach(r => r.setAttribute('aria-selected', r.dataset.id === id));
    document.querySelectorAll('[data-opt]').forEach(s => { s.hidden = !f.options.includes(s.dataset.opt); });
    $('fmt-use').textContent = f.use + '.';
    $('run').textContent = 'Конвертировать в ' + f.label;
    if (remember) { try { localStorage.setItem('rastr.format', id); } catch (e) {} }
    updateSummary();
    return true;
  }
  // На тематических страницах выбор не запоминаем, чтобы не сбивать главную
  const remember = !preset.format;
  $('fmts').addEventListener('click', e => { const b = e.target.closest('.fmt'); if (b && !b.disabled) setFormat(b.dataset.id, remember); });
  if (refBody) {
    refBody.addEventListener('click', e => {
      const r = e.target.closest('tr'); if (!r) return;
      setFormat(r.dataset.id, remember);
      $('app').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    refBody.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.id) setFormat(e.target.dataset.id, remember); });
  }

  /* ---------- option controls ---------- */
  $('quality').addEventListener('input', () => { $('quality-v').textContent = $('quality').value + '%'; });

  // Сжатие до заданного веса: качество подбирается автоматически, ползунок качества не используется
  function syncTarget() {
    const on = $('target-on').checked;
    $('target-fields').hidden = !on;
    $('quality').disabled = on;
    $('quality').closest('.sec').classList.toggle('is-auto', on);
    $('quality-v').textContent = on ? 'авто' : $('quality').value + '%';
    const kb = String(+$('target-kb').value);
    $('target-chips').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.kb === kb));
  }
  $('target-on').addEventListener('change', syncTarget);
  $('target-kb').addEventListener('input', syncTarget);
  $('target-chips').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $('target-kb').value = b.dataset.kb; syncTarget();
  });
  $('gif-colors').addEventListener('input', () => { $('gif-colors-v').textContent = $('gif-colors').value; });

  const SWATCHES = ['#ffffff', '#000000', '#eef0f5', '#f5e6c8', '#0a86a8', '#d3175e'];
  $('swatches').innerHTML = SWATCHES.map(c => '<button type="button" class="sw" style="background:' + c + '" data-c="' + c + '" aria-label="Фон ' + c + '"></button>').join('');
  $('swatches').addEventListener('click', e => { const b = e.target.closest('.sw'); if (b) $('bg').value = b.dataset.c.toLowerCase(); });

  $('ico-sizes').innerHTML = [16, 24, 32, 48, 64, 128, 256].map(s =>
    '<label><input type="checkbox" value="' + s + '"' + ([16, 32, 48, 256].includes(s) ? ' checked' : '') + '>' + s + '</label>').join('');

  function updateResizeUI() {
    const m = $('resize-mode').value;
    $('resize-fields').hidden = m === 'none';
    $('f-percent').hidden = m !== 'percent';
    $('f-w').hidden = !['width', 'fit', 'exact'].includes(m);
    $('f-h').hidden = !['height', 'fit', 'exact'].includes(m);
    updateSummary();
  }
  $('resize-mode').addEventListener('change', updateResizeUI);
  ['resize-percent', 'resize-w', 'resize-h'].forEach(id => $(id).addEventListener('input', updateSummary));

  $('rotate').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    state.rotate = +b.dataset.rot;
    $('rotate').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
    updateSummary();
  });
  ['flip-h', 'flip-v'].forEach(id => $(id).addEventListener('click', () => {
    const on = $(id).getAttribute('aria-pressed') !== 'true';
    $(id).setAttribute('aria-pressed', on);
    state[id === 'flip-h' ? 'flipH' : 'flipV'] = on;
  }));

  /* ---------- queue ---------- */
  async function addFiles(files) {
    const list = [...files].filter(f => f && f.size);
    if (!list.length) return;
    for (const file of list) {
      const item = { id: ++seq, file, name: file.name || ('картинка-' + seq + '.png'), size: file.size, status: 'loading' };
      state.items.push(item);
      renderRow(item);
    }
    updateSummary();
    for (const item of state.items.filter(i => i.status === 'loading' && !i.decoding)) {
      item.decoding = true;
      try {
        item.decoded = await R.decode(item.file);
        item.width = item.decoded.width; item.height = item.decoded.height;
        item.thumb = makeThumb(item.decoded);
        item.status = 'ready';
      } catch (err) {
        item.status = 'error'; item.error = err.message;
      }
      renderRow(item);
    }
    updateSummary();
  }

  function makeThumb(d) {
    const s = 144, k = Math.min(1, s / Math.max(d.width, d.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(d.width * k)); c.height = Math.max(1, Math.round(d.height * k));
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
    x.drawImage(d.source, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }

  function rowEl(item) {
    let li = document.querySelector('.row[data-id="' + item.id + '"]');
    if (!li) {
      li = document.createElement('li'); li.className = 'row'; li.dataset.id = item.id;
      $('list').appendChild(li);
    }
    return li;
  }

  function renderRow(item) {
    const li = rowEl(item);
    li.dataset.status = item.status;
    const src = item.decoded ? item.decoded.format : '…';
    const dims = item.width ? item.width + '×' + item.height : '';
    let res = '';
    if (item.status === 'loading') res = '<span>Читаем файл…</span>';
    else if (item.status === 'ready') res = '<span>Ждёт конвертации</span>';
    else if (item.status === 'working') res = '<span>Конвертируем…</span>';
    else if (item.status === 'error') res = '<span class="err">' + esc(item.error) + '</span>';
    else if (item.status === 'done') {
      const r = item.result, pct = Math.round((r.blob.size / item.size - 1) * 100);
      res = '<span aria-hidden="true">→</span><span class="tag acc">' + r.format.label + '</span>' +
        '<span class="mono">' + r.width + '×' + r.height + ' · ' + fmtSize(r.blob.size) + '</span>' +
        '<span class="mono delta ' + (pct <= 0 ? 'down' : 'up') + '">' + (pct > 0 ? '+' : pct < 0 ? '−' : '') + Math.abs(pct) + '%</span>' +
        (r.fit ? (r.fit.reached
          ? '<span class="mono fit">≤ ' + fmtLimit(r.fit.limit) + ' · качество ' + Math.round(r.fit.quality * 100) + '%' + (r.fit.scaled ? ' · уменьшено' : '') + '</span>'
          : '<span class="err">не удалось сжать до ' + fmtLimit(r.fit.limit) + '</span>') : '');
    }
    li.innerHTML =
      '<button type="button" class="thumb" data-act="preview" aria-label="Открыть предпросмотр ' + esc(item.name) + '"' + (item.thumb ? '' : ' disabled') + '>' +
        (item.thumb ? '<img src="' + item.thumb + '" alt="">' : '') + '</button>' +
      '<div style="min-width:0">' +
        '<div class="row-name" title="' + esc(item.name) + '">' + esc(item.name) + '</div>' +
        '<div class="row-meta"><span class="tag">' + esc(src) + '</span><span class="mono">' + [dims, fmtSize(item.size)].filter(Boolean).join(' · ') + '</span></div>' +
        '<div class="row-res">' + res + '</div>' +
      '</div>' +
      '<div class="row-actions">' +
        '<button type="button" class="btn" data-act="dl"' + (item.status === 'done' ? '' : ' disabled') + '>' + ICON_DL + 'Скачать</button>' +
        '<button type="button" class="btn icon ghost" data-act="rm" aria-label="Убрать из очереди">' + ICON_X + '</button>' +
      '</div>';
  }

  function updateSummary() {
    const n = state.items.length;
    const total = state.items.reduce((s, i) => s + i.size, 0);
    const done = state.items.filter(i => i.status === 'done');
    $('q-summary').textContent = n ? n + ' ' + plural(n, 'файл', 'файла', 'файлов') + ' · ' + fmtSize(total) +
      (done.length ? ' → ' + fmtSize(done.reduce((s, i) => s + i.result.blob.size, 0)) : '') : '';
    // пустую очередь не показываем: на экране остаётся только зона загрузки
    $('queue').hidden = n === 0;
    // с файлами зона загрузки сворачивается в узкую строку «Добавить ещё файлы»
    $('app').classList.toggle('has-files', n > 0);
    $('clear').hidden = n === 0;
    $('zip').disabled = done.length === 0 || state.busy;
    $('run').disabled = state.busy || !state.items.some(i => i.decoded);

    const first = state.items.find(i => i.decoded);
    const m = $('resize-mode').value;
    if (first && m !== 'none') {
      const s = R.computeSize(first.width, first.height, opts().resize);
      $('resize-hint').textContent = first.width + '×' + first.height + ' → ' + s.width + '×' + s.height + ' (первый файл)';
    } else $('resize-hint').textContent = '';
  }

  $('list').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const item = state.items.find(i => i.id === +b.closest('.row').dataset.id); if (!item) return;
    if (b.dataset.act === 'rm') {
      state.items = state.items.filter(i => i !== item);
      b.closest('.row').remove(); updateSummary();
    } else if (b.dataset.act === 'dl' && item.result) {
      save(item.result.blob, item.result.name);
    } else if (b.dataset.act === 'preview') openPreview(item);
  });
  $('clear').addEventListener('click', () => { state.items = []; $('list').innerHTML = ''; updateSummary(); });

  /* ---------- convert ---------- */
  async function run() {
    if (state.busy) return;
    const f = R.format(state.format), o = opts();
    const items = state.items.filter(i => i.decoded);
    if (!items.length) return;
    state.busy = true; updateSummary();
    $('run').textContent = 'Конвертируем…';
    const single = f.id === 'pdf' && $('pdf-single').checked;
    const pages = [];
    let ok = 0;
    for (const item of items) {
      item.status = 'working'; renderRow(item);
      await new Promise(r => setTimeout(r, 16));
      try {
        const canvas = R.prepare(item.decoded, o);
        if (single) { pages.push(canvas); item.status = 'ready'; }
        else {
          let blob, w = canvas.width, h = canvas.height, fit = null;
          if (o.targetBytes && f.lossy) {
            const r = await R.encodeToSize(canvas, f.id, o.targetBytes, o);
            blob = r.blob; w = r.width; h = r.height;
            fit = { limit: o.targetBytes, reached: r.reached, quality: r.quality, scaled: r.scaled };
          } else blob = await R.encode(canvas, f.id, o);
          item.result = { blob, name: R.outputName(item.name, f.id), width: w, height: h, format: f, fit };
          item.status = 'done';
        }
        ok++;
      } catch (err) {
        item.status = 'error'; item.error = err.message || 'Не получилось сконвертировать';
      }
      renderRow(item);
    }
    if (single && pages.length) {
      try {
        const blob = await R.pdfFromCanvases(pages, o);
        save(blob, 'растр-' + pages.length + '-стр.pdf');
        toast('Собран PDF на ' + pages.length + ' ' + plural(pages.length, 'страницу', 'страницы', 'страниц') + ' · ' + fmtSize(blob.size));
      } catch (err) { toast('PDF не собрался: ' + err.message); }
    } else if (ok) {
      toast('Готово: ' + ok + ' ' + plural(ok, 'файл', 'файла', 'файлов') + ' в ' + f.label);
    }
    state.busy = false;
    $('run').textContent = 'Конвертировать в ' + f.label;
    updateSummary();
  }
  $('run').addEventListener('click', run);

  $('zip').addEventListener('click', async () => {
    const done = state.items.filter(i => i.status === 'done');
    if (!done.length) return;
    if (done.length === 1) return save(done[0].result.blob, done[0].result.name);
    $('zip').disabled = true;
    try {
      const blob = await R.zip(done.map(i => ({ name: i.result.name, blob: i.result.blob })));
      save(blob, 'растр-' + done.length + '-файлов.zip');
      toast('Архив готов · ' + fmtSize(blob.size));
    } finally { updateSummary(); }
  });

  /* ---------- preview ---------- */
  let dlgItem = null, dlgUrl = null;
  function openPreview(item) {
    dlgItem = item;
    $('dlg-title').textContent = item.name;
    const big = document.createElement('canvas');
    const k = Math.min(1, 1600 / Math.max(item.width, item.height));
    big.width = Math.round(item.width * k); big.height = Math.round(item.height * k);
    big.getContext('2d').drawImage(item.decoded.source, 0, 0, big.width, big.height);
    $('dlg-before').innerHTML = '<img alt="Оригинал" src="' + big.toDataURL('image/png') + '">';
    $('dlg-before-cap').innerHTML = '<span class="tag">' + esc(item.decoded.format) + '</span> оригинал · ' + item.width + '×' + item.height + ' · ' + fmtSize(item.size);
    if (dlgUrl) { URL.revokeObjectURL(dlgUrl); dlgUrl = null; }
    const r = item.result;
    if (!r) {
      $('dlg-after').innerHTML = '<div class="noprev">Ещё не сконвертировано. Нажмите «Конвертировать».</div>';
      $('dlg-after-cap').textContent = '';
    } else if (PREVIEWABLE.includes(r.blob.type)) {
      dlgUrl = URL.createObjectURL(r.blob);
      $('dlg-after').innerHTML = '<img alt="Результат" src="' + dlgUrl + '">';
    } else {
      $('dlg-after').innerHTML = '<div class="noprev">Браузер не показывает ' + r.format.label + ', но файл готов. Скачайте его и откройте в подходящей программе.</div>';
    }
    if (r) $('dlg-after-cap').innerHTML = '<span class="tag acc">' + r.format.label + '</span> результат · ' + r.width + '×' + r.height + ' · ' + fmtSize(r.blob.size);
    $('dlg-dl').disabled = !r;
    $('dlg').showModal();
  }
  $('dlg-close').addEventListener('click', () => $('dlg').close());
  $('dlg').addEventListener('click', e => { if (e.target === $('dlg')) $('dlg').close(); });
  $('dlg-dl').addEventListener('click', () => { if (dlgItem && dlgItem.result) save(dlgItem.result.blob, dlgItem.result.name); });

  /* ---------- input: pick, drop, paste ---------- */
  $('file').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
  const drop = $('drop');
  let depth = 0;
  window.addEventListener('dragenter', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { depth++; drop.classList.add('over'); } });
  window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) drop.classList.remove('over'); });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => {
    e.preventDefault(); depth = 0; drop.classList.remove('over');
    if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });
  window.addEventListener('paste', e => {
    const files = [...(e.clipboardData ? e.clipboardData.files : [])];
    if (files.length) { addFiles(files.map((f, i) => new File([f], f.name && f.name !== 'image.png' ? f.name : 'вставка-' + (seq + i + 1) + '.png', { type: f.type }))); toast('Вставлено из буфера'); }
  });

  /* ---------- старт ---------- */
  if (preset.quality) { $('quality').value = Math.round(preset.quality * 100); $('quality-v').textContent = $('quality').value + '%'; }
  if (preset.resize) {
    $('resize-mode').value = preset.resize.mode;
    if (preset.resize.percent) $('resize-percent').value = preset.resize.percent;
    if (preset.resize.width) $('resize-w').value = preset.resize.width;
    if (preset.resize.height) $('resize-h').value = preset.resize.height;
  }
  if (preset.pdfSingle) $('pdf-single').checked = true;
  if (preset.targetKB) { $('target-on').checked = true; $('target-kb').value = preset.targetKB; }
  syncTarget();
  if (preset.icoSizes) document.querySelectorAll('#ico-sizes input').forEach(i => { i.checked = preset.icoSizes.includes(+i.value); });

  let start = preset.format;
  if (!start) { try { start = localStorage.getItem('rastr.format'); } catch (e) {} }
  if (!setFormat(start || 'webp', false) && !setFormat(preset.fallback || 'webp', false)) setFormat('png', false);
  updateResizeUI();
})();
