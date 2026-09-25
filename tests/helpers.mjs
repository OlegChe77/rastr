// Общие помощники для тестов: статический сервер и запуск браузера.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

export const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Тесты проверяют собранный сайт — ровно то, что попадёт на хостинг
export const ROOT = path.join(PROJECT, 'dist');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json'
};

// Как обычный хостинг: /папка/ отдаёт /папка/index.html, неизвестный адрес — 404.html со статусом 404.
// /tests/ берётся из проекта, чтобы открывалась страница модульных тестов.
export async function startServer() {
  const server = http.createServer(async (req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const base = url.startsWith('/tests/') ? PROJECT : ROOT;
    let file = path.join(base, url.endsWith('/') ? url + 'index.html' : url);
    if (!file.startsWith(base)) { res.writeHead(403).end(); return; }
    try {
      const stat = await fs.stat(file).catch(() => null);
      if (stat && stat.isDirectory()) { res.writeHead(301, { location: url + '/' }).end(); return; }
      const body = await fs.readFile(file);
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404, { 'content-type': TYPES['.html'] }).end(await fs.readFile(path.join(ROOT, '404.html')).catch(() => 'not found'));
    }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: 'http://127.0.0.1:' + server.address().port, close: () => new Promise(r => server.close(r)) };
}

// Используем уже установленный Chrome или Edge, чтобы не скачивать браузер.
// Свой путь можно задать переменной BROWSER_PATH.
export async function launch() {
  const headless = process.env.HEADED !== '1';
  if (process.env.BROWSER_PATH) return chromium.launch({ executablePath: process.env.BROWSER_PATH, headless });
  const errors = [];
  for (const channel of ['chrome', 'msedge', 'chromium']) {
    try { return await chromium.launch({ channel, headless }); }
    catch (e) { errors.push(channel + ': ' + e.message.split('\n')[0]); }
  }
  throw new Error('Не найден Chrome или Edge. Укажите путь в BROWSER_PATH.\n' + errors.join('\n'));
}

// Минимальный 24-битный BMP заданного цвета — фикстура без внешних файлов
export function bmp(w, h, [r, g, b]) {
  const row = Math.ceil(w * 3 / 4) * 4, size = 54 + row * h, buf = Buffer.alloc(size);
  buf.write('BM', 0, 'latin1'); buf.writeUInt32LE(size, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(w, 18); buf.writeInt32LE(h, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(row * h, 34);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = 54 + y * row + x * 3; buf[p] = b; buf[p + 1] = g; buf[p + 2] = r;
  }
  return buf;
}

// BMP со случайным шумом: сжимается так же плохо, как настоящее фото
export function noisyBmp(w, h, seed = 1) {
  const buf = bmp(w, h, [0, 0, 0]);
  let s = seed;
  for (let i = 54; i < buf.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; buf[i] = s >> 16 & 255; }
  return buf;
}

export function zipEntries(buf) {
  const end = buf.length - 22;
  if (buf.readUInt32LE(end) !== 0x06054b50) throw new Error('не ZIP');
  const count = buf.readUInt16LE(end + 10), names = [];
  let p = buf.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    const n = buf.readUInt16LE(p + 28);
    names.push(buf.subarray(p + 46, p + 46 + n).toString('utf8'));
    p += 46 + n;
  }
  return names;
}
