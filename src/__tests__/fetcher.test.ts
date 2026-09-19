import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import http from 'node:http';

let server: http.Server;
let baseUrl = '';
let lastQuery = '';
let rateLimitedFetches = 0;

before(async () => {
  server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://localhost');
    lastQuery = u.searchParams.toString();

    if (u.pathname.endsWith('/coins/markets')) {
      // Guard mirrors CoinGecko's real 422: missing flat vs_currency param
      if (!u.searchParams.has('vs_currency')) {
        res.writeHead(422, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing parameter vs_currency' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify([
          {
            id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 100,
            market_cap: 1e6, total_volume: 1e3, price_change_24h: 1,
            price_change_percentage_24h: 2, price_change_percentage_7d_in_currency: 10,
          },
          {
            id: 'ethereum', symbol: 'eth', name: 'Ethereum', current_price: 50,
            market_cap: 5e5, total_volume: 500, price_change_24h: -1,
            price_change_percentage_24h: -2, price_change_percentage_7d_in_currency: -20,
          },
        ])
      );
      return;
    }

    if (u.pathname.includes('/ohlc')) {
      // Dedicated route: first call 429s with Retry-After, then always succeeds.
      // (Handled before the days check so the window ladder doesn't interfere.)
      if (u.pathname.includes('rate-limited-coin')) {
        if (rateLimitedFetches++ === 0) {
          res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '1' });
          res.end(JSON.stringify({ error: 'rate limited' }));
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify([[1700000000000, 1, 2, 0.5, 1.5], [1700014400000, 1.5, 2.5, 1, 2]]));
        return;
      }
      // Reject the 30-day window to exercise the fallback ladder
      if (u.searchParams.get('days') === '30') {
        res.writeHead(422, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'window not allowed' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify([[1700000000000, 1, 2, 0.5, 1.5], [1700014400000, 1.5, 2.5, 1, 2]]));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end('{}');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}/api/v3`;
  // Must be set BEFORE the fetcher module loads
  process.env.COINGECKO_BASE_URL = baseUrl;
});

after(() => new Promise<void>((resolve) => server.close(() => resolve())));

test('query params are sent flat (regression: params were nested as params[...])', async () => {
  const { fetchTopCoins } = await import('../fetcher/coingecko');
  const coins = await fetchTopCoins(2);

  assert.ok(lastQuery.includes('vs_currency=usd'), `flat param missing: ${lastQuery}`);
  assert.ok(!lastQuery.includes('params%5B'), `nested params detected: ${lastQuery}`);
  assert.equal(coins.length, 2);
  assert.equal(coins[0].id, 'bitcoin');
  assert.equal(coins[0].symbol, 'BTC');
  assert.equal(coins[0].priceChange7dPercent, 10);
  assert.equal(coins[1].priceChange24hPercent, -2);
});

test('OHLC falls back to a shorter window when 30d is rejected with 422', async () => {
  const { fetchOHLC } = await import('../fetcher/coingecko');
  const candles = await fetchOHLC('bitcoin');

  assert.ok(lastQuery.includes('days=14'), `expected fallback to days=14, got: ${lastQuery}`);
  assert.equal(candles.length, 2);
  assert.equal(candles[0].high, 2);
  assert.equal(candles[1].close, 2);
});

test('recovers from 429 by honoring the Retry-After header', async () => {
  const { fetchOHLC } = await import('../fetcher/coingecko');
  const started = Date.now();
  const candles = await fetchOHLC('rate-limited-coin');
  const elapsed = Date.now() - started;

  // First attempt 429s with retry-after: 1 → retry succeeds
  assert.equal(rateLimitedFetches, 2, 'expected exactly one retry');
  assert.equal(candles.length, 2);
  assert.ok(elapsed >= 900, `should have waited ~1s for Retry-After, took ${elapsed}ms`);
  assert.ok(elapsed < 10000, `should not use the 60s fallback, took ${elapsed}ms`);
});
