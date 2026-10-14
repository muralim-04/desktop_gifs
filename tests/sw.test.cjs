const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../extension/dist/sw.js'), 'utf8');
const id = '7993045760456588950';
const post = (rating = 'G') => ({
  id, content_rating: rating, content_description: 'Selected GIF',
  flags: [], media_formats: { tinygif: { url: 'https://media.tenor.com/fixture/selected.gif', dims: [120, 80] } },
});

function worker(results, apiStatus = 200) {
  const calls = [];
  let onMessage;
  const settings = Buffer.from(JSON.stringify({ API_V2_KEY: 'fixture-key', API_V2_CLIENT_KEY: 'fixture-client' })).toString('base64');
  const html = `<script id="store-cache" type="text/x-cache">{}</script><script id="data" type="text/x-cache">${settings}</script>`;
  const context = vm.createContext({
    chrome: {
      runtime: {
        id: 'fixture-extension',
        onInstalled: { addListener() {} },
        onMessage: { addListener(listener) { onMessage = listener; } },
      },
    },
    URL, URLSearchParams, atob, AbortSignal,
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (url === 'https://tenor.com/') return { ok: true, url, text: async () => html };
      return { ok: apiStatus === 200, status: apiStatus, json: async () => ({ results }) };
    },
  });
  vm.runInContext(source, context);
  return {
    check: () => new Promise((resolve, reject) => {
      const listenerWillRespond = onMessage(
        { type: 'check', id },
        { id: 'fixture-extension' },
        (response) => response.ok ? resolve(response.gifs) : reject(new Error(response.error)),
      );
      assert.equal(listenerWillRespond, true);
    }),
    calls,
  };
}

test('selected G-rated IDs get a verified result even when a favorite has no rating metadata', async () => {
  const w = worker([post()]);
  const checked = await w.check();
  assert.equal(checked[0].id, id);
  assert.equal(checked[0].contentRating, 'G');
  const url = new URL(w.calls[1].url);
  assert.equal(url.pathname, '/v2/posts');
  assert.equal(url.searchParams.get('ids'), id);
  assert.equal(url.searchParams.get('contentfilter'), 'off');
  assert.equal(w.calls[1].init.credentials, 'omit');
});

// The worker reports the rating; content.js refuses a GIF that is not G, and
// posts one whose rating is unknown without retrying it.
for (const rating of ['PG', 'PG-13', 'R']) {
  test(`${rating}-rated selections are reported with their rating`, async () => {
    const checked = await worker([post(rating)]).check();
    assert.equal(checked[0].contentRating, rating);
  });
}

test('a missing rating is reported as unknown, never as G', async () => {
  const item = post();
  delete item.content_rating;
  assert.equal((await worker([item]).check())[0].contentRating, null);
});

test('a response for another ID does not count as the selected GIF', async () => {
  assert.equal((await worker([{ ...post(), id: '12345678' }]).check()).length, 0);
});

test('stickers and missing GIF formats are not returned', async () => {
  assert.equal((await worker([{ ...post(), flags: ['sticker'] }]).check()).length, 0);
  assert.equal((await worker([{ ...post(), media_formats: {} }]).check()).length, 0);
});

test('API failure is surfaced instead of assuming a suitable rating', async () => {
  await assert.rejects(worker([], 503).check(), /Tenor returned HTTP 503/);
});
