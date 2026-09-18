import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { saveMarketData, loadLatestMarketData, cleanOldData } from '../database/db';
import { CoinMarketData } from '../types';

function makeCoin(id: string): CoinMarketData {
  return {
    id,
    symbol: id.toUpperCase(),
    name: `Coin ${id}`,
    currentPrice: 1,
    marketCap: 1,
    volume24h: 1,
    priceChange1d: 0,
    priceChange7d: 0,
    priceChange24hPercent: 0,
    priceChange7dPercent: 0,
    ohlcData: [
      { timestamp: 1, open: 1, high: 1, low: 1, close: 1 },
      { timestamp: 2, open: 1, high: 1, low: 1, close: 1.1 },
    ],
  };
}

/** Redirect the cache to a fresh temp dir for each test. */
function useTempDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crypto-agent-test-'));
  process.env.CRYPTO_AGENT_DATA_DIR = dir;
  return dir;
}

test('saves and loads a market snapshot', () => {
  const dir = useTempDataDir();
  const coins = [makeCoin('btc'), makeCoin('eth')];
  saveMarketData(coins);
  const loaded = loadLatestMarketData();
  assert.ok(loaded);
  assert.equal(loaded.length, 2);
  assert.equal(loaded[0].id, 'btc');
  assert.ok(fs.existsSync(path.join(dir, 'market-cache.json')));
});

test('caps stored snapshots at MAX_ENTRIES and prunes old data', async () => {
  useTempDataDir();
  for (let i = 0; i < 15; i++) {
    saveMarketData([makeCoin(`coin-${i}`)]);
    // Ensure unique fetchedAt timestamps so ordering is deterministic
    await new Promise((resolve) => setTimeout(resolve, 3));
  }
  // 15 saves → store must never exceed the cap of 12
  const raw = JSON.parse(
    fs.readFileSync(
      path.join(process.env.CRYPTO_AGENT_DATA_DIR!, 'market-cache.json'),
      'utf-8'
    )
  );
  assert.ok(raw.entries.length <= 12, `expected <= 12 entries, got ${raw.entries.length}`);
  assert.equal(loadLatestMarketData()![0].id, 'coin-14');
});

test('cleanOldData removes stale snapshots', () => {
  const dir = useTempDataDir();
  saveMarketData([makeCoin('fresh')]);
  // Hand-age the stored entry beyond the 7-day retention window
  const cacheFile = path.join(dir, 'market-cache.json');
  const store = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
  store.entries[0].fetchedAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
  fs.writeFileSync(cacheFile, JSON.stringify(store));
  cleanOldData();
  const after = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
  assert.equal(after.entries.length, 0);
  assert.equal(loadLatestMarketData(), null);
});
