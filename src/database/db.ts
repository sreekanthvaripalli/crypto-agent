import fs from 'fs';
import path from 'path';
import { CoinMarketData } from '../types';

function dataDir(): string {
  // Resolved lazily so tests (and callers) can redirect via env var
  return process.env.CRYPTO_AGENT_DATA_DIR || path.join(process.cwd(), 'data');
}

function cacheFile(): string {
  return path.join(dataDir(), 'market-cache.json');
}

const MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // keep snapshots for 7 days
const MAX_ENTRIES = 12; // hard cap so the cache file stays small

interface CacheEntry {
  fetchedAt: number;
  coins: CoinMarketData[];
}

interface CacheStore {
  entries: CacheEntry[];
}

function ensureDataDir(): void {
  if (!fs.existsSync(dataDir())) {
    fs.mkdirSync(dataDir(), { recursive: true });
  }
}

function loadCache(): CacheStore {
  ensureDataDir();
  if (!fs.existsSync(cacheFile())) {
    return { entries: [] };
  }
  try {
    const raw = fs.readFileSync(cacheFile(), 'utf-8');
    return JSON.parse(raw) as CacheStore;
  } catch {
    return { entries: [] };
  }
}

function saveCache(store: CacheStore): void {
  ensureDataDir();
  fs.writeFileSync(cacheFile(), JSON.stringify(store, null, 2), 'utf-8');
}

/**
 * Save market data snapshot to local JSON cache
 */
export function saveMarketData(coins: CoinMarketData[]): void {
  const store = loadCache();
  const now = Date.now();

  store.entries.push({ fetchedAt: now, coins });

  // Keep only recent snapshots (retention window + hard entry cap)
  const cutoff = now - RETENTION_MS;
  store.entries = store.entries.filter((e) => e.fetchedAt >= cutoff).slice(-MAX_ENTRIES);

  saveCache(store);
  console.log(`💾 Saved ${coins.length} coins to local cache.`);
}

/**
 * Load the most recent market snapshot if it's within MAX_AGE_MS
 */
export function loadLatestMarketData(): CoinMarketData[] | null {
  const store = loadCache();
  if (store.entries.length === 0) return null;

  const cutoff = Date.now() - MAX_AGE_MS;
  const recent = store.entries
    .filter((e) => e.fetchedAt >= cutoff)
    .sort((a, b) => b.fetchedAt - a.fetchedAt);

  if (recent.length === 0) return null;
  return recent[0].coins;
}

/**
 * Remove cache entries older than 30 days
 */
export function cleanOldData(): void {
  const store = loadCache();
  const before = store.entries.length;
  const cutoff = Date.now() - RETENTION_MS;
  store.entries = store.entries.filter((e) => e.fetchedAt >= cutoff).slice(-MAX_ENTRIES);
  const removed = before - store.entries.length;
  if (removed > 0) {
    saveCache(store);
    console.log(`🧹 Cleaned up ${removed} old cache entries.`);
  }
}

/**
 * No-op: kept for API compatibility with original SQLite version
 */
export function closeDb(): void {
  // Nothing to close for JSON file cache
}
