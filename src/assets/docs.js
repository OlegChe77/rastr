/* Растр — интерфейс конвертера документов. Вся работа с форматами — в rastr-docs.js */
(function () {
  'use strict';
  const D = window.RastrDocs, R = window.RastrConvert;
  const $ = id => document.getElementById(id);
  if (!D || !$('targets')) return;

  const ICON_DL = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 2v8m0 0L4.5 6.5M8 10l3.5-3.5M2.5 13.5h11"/></svg>';
  const ICON_X = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
  const ICON_UP = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 13V3m0 0L4 7m4-4 4 4"/></svg>';

  let preset = {};
  try { preset = JSON.parse(($('preset') || {}).textContent || '{}'); } catch (e) {}

  // Варианты «во что конвертировать»: какие настройки показывать и какие входные форматы подходят
  const TARGETS = {
    pdf: { label: 'PDF', note: 'Документ', show: ['pdfout'] },
    docx: { label: 'Word', note: 'Файл .docx', show: [] },
    txt: { label: 'TXT', note: 'Только текст', show: [] },
    html: { label: 'HTML', note: 'Веб-страница', show: [] },
    md: { label: 'Markdown', note: 'Разметка .md', show: [] },
    jpg: { label: 'JPG', note: 'Страницы фото', show: ['images', 'pages'] },
    png: { label: 'PNG', note: 'Страницы без потерь', show: ['images', 'pages'] },
    xlsx: { label: 'Excel', note: 'Таблица .xlsx', show: [] },
    csv: { label: 'CSV', note: 'Для Excel и 1С', show: ['csv'] },
    json: { label: 'JSON', note: 'Для программистов', show: [] },
    split: { label: 'Разделить', note: 'PDF на части', show: ['split'] },
    merge: { label: 'Объединить', note: 'Несколько PDF в один', show: ['merge'] }
  };
  const canDo = (kind, t) => kind && D.KINDS[kind] && (t === 'merge' ? kind === 'pdf' : D.KINDS[kind].to.includes(t));

  const state = { items: [], target: preset.target || 'pdf', dpi: preset.dpi || 150, split: 'each', pageSize: 'a4', fontSize: 11, sep: ';', busy: false };
  let seq = 0;

  /* ---------- утилиты ---------- */
  function fmtSize(b) {
    if (b < 1024) return b + ' Б';
    if (b < 1048576) return (b / 1024).toFixed(b < 10240 ? 1 : 0).replace('.', ',') + ' КБ';
    return (b / 1048576).toFixed(1).replace('.', ',') + ' МБ';
  }
  function plural(n, a, b, c) { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c; }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  let toastTimer;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200); }
  function save(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function saveOutputs(outs, zipName) {
    if (outs.length === 1) return save(outs[0].blob, outs[0].name);
    save(await R.zip(outs), zipName);
  }
  const opts = () => ({ dpi: state.dpi, pages: $('pages').value, splitMode: state.split, pageSize: state.pageSize, fontSize: state.fontSize, csvSeparator: state.sep });

  /* ---------- выбор формата ---------- */
  const shown = preset.targets || Object.keys(TARGETS);
  $('targets').innerHTML = shown.map(id => '<button type="button" class="fmt" data-id="' + id + '" aria-pressed="false">' +
    '<span class="fmt-ext">' + TARGETS[id].label + '</span><span class="fmt-note">' + TARGETS[id].note + '</span></button>').join('');

  function runText() { return preset.runLabel || (state.target === 'merge' ? 'Объединить PDF' : state.target === 'split' ? 'Разделить PDF' : 'Конвертировать в ' + TARGETS[state.target].label); }

  function setTarget(id) {
    if (!TARGETS[id]) return;
    state.target = id;
    document.querySelectorAll('#targets .fmt').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === id));
    document.querySelectorAll('[data-show]').forEach(s => { s.hidden = !TARGETS[id].show.includes(s.dataset.show); });
    // диапазон страниц при разделении нужен только в режиме «выбранные страницы»
    if (id === 'split') $('sec-pages').hidden = state.split !== 'range';
    $('app').classList.toggle('is-merge', id === 'merge');
    $('run').textContent = runText();
    state.items.forEach(renderRow);
    updateSummary();
  }
  $('targets').addEventListener('click', e => { const b = e.target.closest('.fmt'); if (b) setTarget(b.dataset.id); });

  // Сегментированные переключатели настроек
  function seg(id, key, cast) {
    $(id).addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      state[key] = cast ? cast(b.dataset.v) : b.dataset.v;
      $(id).querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
      if (key === 'split') setTarget('split');
    });
    $(id).querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.v) === String(state[key])));
  }
  seg('dpi', 'dpi', Number); seg('split-mode', 'split'); seg('page-size', 'pageSize'); seg('font-size', 'fontSize', Number); seg('csv-sep', 'sep');

  /* ---------- очередь ---------- */
  async function addFiles(files) {
    const list = [...files].filter(f => f && f.size);
    if (!list.length) return;
    for (const file of list) {
      const item = { id: ++seq, file, name: file.name || ('документ-' + seq), size: file.size, status: 'loading' };
      state.items.push(item); renderRow(item);
    }
    updateSummary();
    for (const item of state.items.filter(i => i.status === 'loading' && !i.detecting)) {
      item.detecting = true;
      try {
        item.kind = await D.detect(item.file);
        if (!item.kind) { item.status = 'error'; item.error = 'Формат не распознан: подойдут PDF, DOCX, XLSX, CSV, TXT, Markdown, HTML, JSON'; }
        else if (item.kind === 'doc') { item.status = 'error'; item.error = 'Старый формат .doc не поддерживается — сохраните файл в Word как .docx'; }
        else item.status = 'ready';
      } catch (e) { item.status = 'error'; item.error = e.message; }
      renderRow(item);
    }
    updateSummary();
  }

  function rowEl(item) {
    let li = document.querySelector('.row[data-id="' + item.id + '"]');
    if (!li) { li = document.createElement('li'); li.className = 'row doc-row'; li.dataset.id = item.id; $('list').appendChild(li); }
    return li;
  }

  function renderRow(item) {
    const li = rowEl(item);
    const fits = item.kind && canDo(item.kind, state.target);
    li.dataset.status = item.status;
    let res = '';
    if (item.status === 'loading') res = '<span>Читаем файл…</span>';
    else if (item.status === 'error') res = '<span class="err">' + esc(item.error) + '</span>';
    else if (item.status === 'working') res = '<span>Конвертируем…</span>';
    else if (item.status === 'done') {
      const outs = item.outputs, total = outs.reduce((s, o) => s + o.blob.size, 0);
      res = '<span aria-hidden="true">→</span><span class="tag acc">' + esc(item.resultLabel) + '</span><span class="mono">' +
        (outs.length > 1 ? outs.length + ' ' + plural(outs.length, 'файл', 'файла', 'файлов') + ' · ' : '') + fmtSize(total) + '</span>' +
        (item.note ? '<span class="mono">' + esc(item.note) + '</span>' : '');
    }
    else if (!fits) res = '<span class="err">' + (state.target === 'merge' ? 'Объединять можно только PDF'
      : item.kind === state.target ? 'Файл уже в формате ' + TARGETS[state.target].label
      : 'Этот файл нельзя перевести в ' + TARGETS[state.target].label) + '</span>';
    else res = '<span>' + (state.target === 'merge' ? 'Войдёт в общий PDF' : 'Ждёт конвертации') + '</span>';
    const kindLabel = item.kind && D.KINDS[item.kind] ? D.KINDS[item.kind].label : (item.status === 'loading' ? '…' : '?');
    li.innerHTML =
      '<div class="doc-ic" aria-hidden="true">' + esc(kindLabel) + '</div>' +
      '<div style="min-width:0">' +
        '<div class="row-name" title="' + esc(item.name) + '">' + esc(item.name) + '</div>' +
        '<div class="row-meta"><span class="tag">' + esc(kindLabel) + '</span><span class="mono">' + fmtSize(item.size) + '</span></div>' +
        '<div class="row-res">' + res + '</div>' +
      '</div>' +
      '<div class="row-actions">' +
        '<button type="button" class="btn icon ghost order" data-act="up" aria-label="Выше в очереди">' + ICON_UP + '</button>' +
        '<button type="button" class="btn icon ghost order down" data-act="down" aria-label="Ниже в очереди">' + ICON_UP + '</button>' +
        '<button type="button" class="btn" data-act="dl"' + (item.status === 'done' ? '' : ' disabled') + '>' + ICON_DL + 'Скачать</button>' +
        '<button type="button" class="btn icon ghost" data-act="rm" aria-label="Убрать из очереди">' + ICON_X + '</button>' +
      '</div>';
  }

  function updateSummary() {
    const n = state.items.length, total = state.items.reduce((s, i) => s + i.size, 0);
    const done = state.items.filter(i => i.status === 'done');
    const suitable = state.items.filter(i => i.status !== 'error' && i.status !== 'loading' && canDo(i.kind, state.target));
    $('q-summary').textContent = n ? n + ' ' + plural(n, 'файл', 'файла', 'файлов') + ' · ' + fmtSize(total) : '';
    $('queue').hidden = n === 0;
    $('app').classList.toggle('has-files', n > 0);
    $('clear').hidden = n === 0;
    $('zip').disabled = !done.length || state.busy;
    $('run').disabled = state.busy || (state.target === 'merge' ? suitable.length < 2 : !suitable.length);
    $('merge-hint').textContent = state.target === 'merge' && suitable.length < 2 ? 'Добавьте хотя бы два PDF.' : 'Страницы пойдут в порядке очереди — меняйте его стрелками у файлов.';
  }

  $('list').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const li = b.closest('.row'), i = state.items.findIndex(x => x.id === +li.dataset.id), item = state.items[i];
    if (!item) return;
    const act = b.dataset.act;
    if (act === 'rm') { state.items.splice(i, 1); li.remove(); updateSummary(); }
    else if (act === 'dl' && item.outputs) saveOutputs(item.outputs, item.name.replace(/\.[^.]+$/, '') + '.zip');
    else if (act === 'up' || act === 'down') {
      const j = act === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= state.items.length) return;
      [state.items[i], state.items[j]] = [state.items[j], state.items[i]];
      if (act === 'up') li.parentNode.insertBefore(li, li.previousElementSibling); else li.parentNode.insertBefore(li.nextElementSibling, li);
    }
  });
  $('clear').addEventListener('click', () => { state.items = []; state.merged = null; $('list').innerHTML = ''; updateSummary(); });

  /* ---------- конвертация ---------- */
  async function run() {
    if (state.busy) return;
    const t = state.target, o = opts();
    const items = state.items.filter(i => i.status !== 'error' && i.status !== 'loading' && canDo(i.kind, t));
    if (!items.length) return;
    state.busy = true; updateSummary();
    $('run').textContent = 'Обрабатываем…';
    try {
      if (t === 'merge') {
        items.forEach(i => { i.status = 'working'; renderRow(i); });
        try {
          const merged = await D.mergePdf(items.map(i => i.file));
          items.forEach(i => { i.status = 'done'; i.outputs = [merged]; i.resultLabel = 'PDF'; i.note = 'в общем файле'; renderRow(i); });
          save(merged.blob, merged.name);
          toast('Объединено ' + items.length + ' ' + plural(items.length, 'файл', 'файла', 'файлов') + ' · ' + fmtSize(merged.blob.size));
        } catch (e) { items.forEach(i => { i.status = 'error'; i.error = e.message; renderRow(i); }); }
      } else {
        let ok = 0;
        for (const item of items) {
          item.status = 'working'; renderRow(item);
          await new Promise(r => setTimeout(r, 16));
          try {
            item.outputs = await D.convert(item.file, t, o);
            item.resultLabel = t === 'split' ? 'PDF' : TARGETS[t].label;
            item.note = '';
            item.status = 'done'; ok++;
          } catch (e) { item.status = 'error'; item.error = e.message || 'Не получилось сконвертировать'; }
          renderRow(item);
        }
        if (ok) toast('Готово: ' + ok + ' ' + plural(ok, 'файл', 'файла', 'файлов'));
      }
    } finally {
      state.busy = false;
      $('run').textContent = runText();
      updateSummary();
    }
  }
  $('run').addEventListener('click', run);

  $('zip').addEventListener('click', async () => {
    const seen = new Set(), outs = [];
    for (const i of state.items) if (i.status === 'done') for (const o of i.outputs) if (!seen.has(o)) { seen.add(o); outs.push(o); }
    if (!outs.length) return;
    $('zip').disabled = true;
    try { await saveOutputs(outs, 'растр-документы-' + outs.length + '.zip'); } finally { updateSummary(); }
  });

  /* ---------- ввод файлов ---------- */
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

  if (preset.tool) $('app').classList.add('tool-' + preset.tool);
  setTarget(state.target);
})();
