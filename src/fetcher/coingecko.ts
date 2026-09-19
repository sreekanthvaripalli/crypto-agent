import axios, { AxiosInstance } from 'axios';
import { CoinMarketData, OHLCCandle } from '../types';

// Base URL can be overridden for tests (COINGECKO_BASE_URL)
const BASE_URL = process.env.COINGECKO_BASE_URL || 'https://api.coingecko.com/api/v3';

// Optional API key. Set COINGECKO_API_KEY to raise rate limits;
// COINGECKO_API_TIER selects the header type ('demo' | 'pro').
const API_KEY = process.env.COINGECKO_API_KEY || '';
const API_TIER = (process.env.COINGECKO_API_TIER || 'demo').toLowerCase();

// Rate limiter: CoinGecko free tier allows ~10-30 calls/min
const DELAY_MS = parseInt(process.env.FETCH_DELAY_MS || '2000', 10);
const MAX_RETRIES = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const client: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    Accept: 'application/json',
    'User-Agent': 'crypto-agent/1.0',
    ...(API_KEY
      ? { [API_TIER === 'pro' ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key']: API_KEY }
      : {}),
  },
});

/**
 * GET with retry + backoff for transient failures:
 * - 429 (rate limited): back off 60s × attempt
 * - 5xx / network errors: back off 3s × attempt
 * Other 4xx errors throw immediately (bad request, not transient).
 *
 * IMPORTANT: `params` is the flat query-param map — e.g.
 * getWithRetry('/coins/markets', { vs_currency: 'usd' }) → ?vs_currency=usd
 * (Passing an axios config object here double-nests the params!)
 */
async function getWithRetry(url: string, params: Record<string, unknown> = {}): Promise<any> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await client.get(url, { params });
    } catch (err) {
      lastError = err;
      const e = err as {
        response?: { status?: number; headers?: Record<string, unknown> };
        code?: string;
        message?: string;
      };
      const status = e.response?.status;
      const retriable =
        status === 429 || (typeof status === 'number' && status >= 500) || (!status && !!e.code);

      if (retriable && attempt < MAX_RETRIES) {
        // Honor the server's Retry-After on 429 so we wait exactly as long
        // as required instead of a fixed 60s per attempt.
        const backoffMs =
          status === 429
            ? retryAfterMs(e.response?.headers ?? {}, 60000 * attempt)
            : 3000 * attempt;
        console.log(
          `\n⚠️  ${status ?? e.code} on ${url} (attempt ${attempt}/${MAX_RETRIES}). Retrying in ${(backoffMs / 1000).toFixed(1)}s...`
        );
        await sleep(backoffMs);
      } else {
        throw enrichError(err, url);
      }
    }
  }

  throw enrichError(lastError, url);
}

/**
 * Resolve the wait time for a 429 from the Retry-After header.
 * Accepts either seconds ("30") or an HTTP-date, capped at 120s,
 * falling back to the supplied default when the header is absent/invalid.
 */
function retryAfterMs(headers: Record<string, unknown>, fallbackMs: number): number {
  const MAX_WAIT_MS = 120_000;
  const raw = headers['retry-after'] ?? headers['Retry-After'];

  if (typeof raw === 'string' && raw.trim().length > 0) {
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, MAX_WAIT_MS);
    }
    const dateMs = Date.parse(raw);
    if (!Number.isNaN(dateMs)) {
      return Math.max(0, Math.min(dateMs - Date.now(), MAX_WAIT_MS));
    }
  }

  return fallbackMs;
}

/**
 * Attach status, endpoint and API error detail to the error message so
 * failures are self-explanatory in the logs.
 */
function enrichError(err: unknown, url: string): Error {
  const e = err as {
    response?: { status?: number; data?: unknown };
    message?: string;
    code?: string;
  };
  const data = e.response?.data;
  let apiDetail = '';
  if (typeof data === 'object' && data !== null && 'error' in data) {
    apiDetail = String((data as { error: unknown }).error);
  } else if (typeof data === 'string' && data.length > 0) {
    apiDetail = data.slice(0, 200);
  }
  const label = e.response ? `HTTP ${e.response.status}` : e.code ?? 'network error';
  const detail = apiDetail ? ` — ${apiDetail}` : '';
  const enriched = new Error(`${e.message ?? String(err)} [${label} on ${url}${detail}]`) as Error & {
    response?: { status?: number; data?: unknown };
    code?: string;
  };
  // Preserve the original response/code so callers (e.g. the OHLC window
  // fallback ladder) can still branch on the HTTP status.
  enriched.response = e.response;
  enriched.code = e.code;
  return enriched;
}

/**
 * Fetch top N coins by market cap with basic market data
 */
export async function fetchTopCoins(limit: number = 50): Promise<CoinMarketData[]> {
  console.log(`📡 Fetching top ${limit} coins from CoinGecko...`);

  const response = await getWithRetry('/coins/markets', {
    vs_currency: 'usd',
    order: 'market_cap_desc',
    per_page: limit,
    page: 1,
    sparkline: false,
    price_change_percentage: '24h,7d',
  });

  return response.data.map((coin: any): CoinMarketData => ({
    id: coin.id,
    symbol: coin.symbol.toUpperCase(),
    name: coin.name,
    currentPrice: coin.current_price ?? 0,
    marketCap: coin.market_cap ?? 0,
    volume24h: coin.total_volume ?? 0,
    priceChange1d: coin.price_change_24h ?? 0,
    priceChange7d: (coin.current_price ?? 0) * ((coin.price_change_percentage_7d_in_currency ?? 0) / 100),
    priceChange24hPercent: coin.price_change_percentage_24h ?? 0,
    priceChange7dPercent: coin.price_change_percentage_7d_in_currency ?? 0,
    ohlcData: [],
  }));
}

/**
 * Fetch 30-day OHLC data for a coin, falling back to shorter windows
 * (14d, then 7d) if the API tier rejects the 30-day window, so that
 * data always flows.
 */
export async function fetchOHLC(coinId: string): Promise<OHLCCandle[]> {
  const windows = [30, 14, 7];
  let lastError: unknown;

  for (const days of windows) {
    try {
      const response = await getWithRetry(`/coins/${coinId}/ohlc`, {
        vs_currency: 'usd',
        days,
      });

      // Response format: [timestamp, open, high, low, close]
      return response.data.map((candle: any[]): OHLCCandle => ({
        timestamp: candle[0],
        open: candle[1],
        high: candle[2],
        low: candle[3],
        close: candle[4],
      }));
    } catch (err) {
      lastError = err;
      const status = (err as { response?: { status?: number } }).response?.status;
      // A 422 on the window size means this API tier doesn't allow it —
      // try a shorter window. Anything else is not window-related.
      if (status !== 422) break;
      console.log(`  ⚠️  days=${days} rejected for ${coinId} — trying a shorter window...`);
    }
  }

  throw lastError;
}

/**
 * Fetch hourly traded-volume history for a coin (30 days by default)
 * from /coins/{id}/market_chart.
 */
export async function fetchVolumeHistory(
  coinId: string,
  days: number = 30
): Promise<{ timestamp: number; volume: number }[]> {
  const response = await getWithRetry(`/coins/${coinId}/market_chart`, {
    vs_currency: 'usd',
    days,
  });
  const data = response.data as { total_volumes?: [number, number][] };
  return (data.total_volumes ?? []).map(([timestamp, volume]) => ({ timestamp, volume }));
}

/**
 * Sum hourly volume points into per-candle buckets aligned with the OHLC
 * candles, so indicators see exactly one volume number per candle.
 */
export function bucketVolumesIntoCandles(
  volumes: { timestamp: number; volume: number }[],
  candles: OHLCCandle[]
): number[] {
  const out: number[] = new Array(candles.length).fill(0);
  let idx = 0;

  for (let i = 0; i < candles.length; i++) {
    const end = i + 1 < candles.length ? candles[i + 1].timestamp : Infinity;
    while (idx < volumes.length && volumes[idx].timestamp < end) {
      if (volumes[idx].timestamp >= candles[i].timestamp) {
        out[i] += volumes[idx].volume;
      }
      idx++;
    }
  }

  return out;
}

/**
 * Fetch full market data including OHLC for top N coins
 * Handles rate limiting with delays between API calls
 */
export async function fetchFullMarketData(limit: number = 50): Promise<CoinMarketData[]> {
  const coins = await fetchTopCoins(limit);
  const fullData: CoinMarketData[] = [];

  console.log(`📊 Fetching 30-day OHLC + volume data for ${coins.length} coins...`);

  for (let i = 0; i < coins.length; i++) {
    const coin = coins[i];
    process.stdout.write(`\r  Processing: ${i + 1}/${coins.length} — ${coin.symbol.padEnd(10)}`);

    try {
      await sleep(DELAY_MS);
      const ohlcData = await fetchOHLC(coin.id);

      // Real per-candle volume. Optional: if this fails we fall back to the
      // price-range proxy for the volume-spike signal.
      let candleVolumes: number[] | undefined;
      try {
        await sleep(DELAY_MS);
        const volumeHistory = await fetchVolumeHistory(coin.id);
        candleVolumes = bucketVolumesIntoCandles(volumeHistory, ohlcData);
      } catch {
        console.log(`\n⚠️  Volume history unavailable for ${coin.symbol} — using price-range proxy`);
      }

      fullData.push({ ...coin, ohlcData, ...(candleVolumes ? { candleVolumes } : {}) });
    } catch (err) {
      // Retries (incl. 429 backoff) already happened inside getWithRetry.
      console.log(`\n❌ Failed to fetch OHLC for ${coin.symbol}: ${(err as Error).message}`);
      fullData.push({ ...coin, ohlcData: [] });
    }
  }

  console.log('\n✅ Market data fetch complete.\n');
  return fullData;
}
