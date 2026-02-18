import fs from 'fs';
import path from 'path';
import { CoinMarketData } from '../types';

const DATA_DIR = path.join(process.cwd(), 'data');
const CACHE_FILE = path.join(DATA_DIR, 'market-cache.json');
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  fetchedAt: number;
  coins: CoinMarketData[];
}

interface CacheStore {
  entries: CacheEntry[];
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadCache(): CacheStore {
  ensureDataDir();
  if (!fs.existsSync(CACHE_FILE)) {
    return { entries: [] };
  }
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    return JSON.parse(raw) as CacheStore;
  } catch {
    return { entries: [] };
  }
}

function saveCache(store: CacheStore): void {
  ensureDataDir();
  fs.writeFileSync(CACHE_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

/**
 * Save market data snapshot to local JSON cache
 */
export function saveMarketData(coins: CoinMarketData[]): void {
  const store = loadCache();
  const now = Date.now();

  store.entries.push({ fetchedAt: now, coins });

  // Keep only last 30 days of entries to avoid unbounded growth
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  store.entries = store.entries.filter((e) => e.fetchedAt >= thirtyDaysAgo);

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
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  store.entries = store.entries.filter((e) => e.fetchedAt >= thirtyDaysAgo);
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
