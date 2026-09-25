// Прогоняет модульные тесты плагина (tests/unit.js) в настоящем браузере
// и выдаёт каждый как отдельный тест node:test.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch } from './helpers.mjs';

let server, browser, results;

before(async () => {
  server = await startServer();
  browser = await launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.goto(server.url + '/tests/unit.html');
  results = await page.evaluate(() => window.__done);
  assert.deepEqual(pageErrors, [], 'ошибки JavaScript на странице тестов');
});

after(async () => { await browser?.close(); await server?.close(); });

test('модульные тесты плагина', async t => {
  assert.ok(results.length >= 50, 'найдено тестов: ' + results.length);
  for (const r of results) {
    await t.test(r.name, { skip: r.status === 'skip' ? r.error : false }, () => {
      if (r.status === 'fail') assert.fail(r.error);
    });
  }
});
