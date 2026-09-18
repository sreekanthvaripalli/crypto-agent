import axios, { AxiosInstance } from 'axios';
import { CoinMarketData, OHLCCandle } from '../types';

const BASE_URL = 'https://api.coingecko.com/api/v3';

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
 * GET with retry + exponential backoff on 429 (rate limited).
 */
async function getWithRetry(url: string, params?: Record<string, unknown>): Promise<any> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await client.get(url, { params });
    } catch (err) {
      lastError = err;
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 429 && attempt < MAX_RETRIES) {
        const backoffMs = 60000 * attempt;
        console.log(`\n⚠️  Rate limited (429). Waiting ${backoffMs / 1000}s before retry ${attempt + 1}/${MAX_RETRIES}...`);
        await sleep(backoffMs);
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}

/**
 * Fetch top N coins by market cap with basic market data
 */
export async function fetchTopCoins(limit: number = 50): Promise<CoinMarketData[]> {
  console.log(`📡 Fetching top ${limit} coins from CoinGecko...`);

  const response = await getWithRetry('/coins/markets', {
    params: {
      vs_currency: 'usd',
      order: 'market_cap_desc',
      per_page: limit,
      page: 1,
      sparkline: false,
      price_change_percentage: '24h,7d',
    },
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
 * Fetch 30-day OHLC data for a specific coin.
 * CoinGecko returns 4-hourly candles for 3-30 day windows (~180 candles),
 * which is enough history for long-period indicators like Ichimoku (52)
 * and properly smoothed ADX (2×14).
 */
export async function fetchOHLC(coinId: string): Promise<OHLCCandle[]> {
  const response = await getWithRetry(`/coins/${coinId}/ohlc`, {
    params: {
      vs_currency: 'usd',
      days: 30,
    },
  });

  // Response format: [timestamp, open, high, low, close]
  return response.data.map((candle: any[]): OHLCCandle => ({
    timestamp: candle[0],
    open: candle[1],
    high: candle[2],
    low: candle[3],
    close: candle[4],
  }));
}

/**
 * Fetch full market data including OHLC for top N coins
 * Handles rate limiting with delays between API calls
 */
export async function fetchFullMarketData(limit: number = 50): Promise<CoinMarketData[]> {
  const coins = await fetchTopCoins(limit);
  const fullData: CoinMarketData[] = [];

  console.log(`📊 Fetching 7-day OHLC data for ${coins.length} coins...`);

  for (let i = 0; i < coins.length; i++) {
    const coin = coins[i];
    process.stdout.write(`\r  Processing: ${i + 1}/${coins.length} — ${coin.symbol.padEnd(10)}`);

    try {
      await sleep(DELAY_MS);
      const ohlcData = await fetchOHLC(coin.id);
      fullData.push({ ...coin, ohlcData });
    } catch (err) {
      // Retries (incl. 429 backoff) already happened inside getWithRetry.
      console.log(`\n❌ Failed to fetch OHLC for ${coin.symbol}: ${(err as Error).message}`);
      fullData.push({ ...coin, ohlcData: [] });
    }
  }

  console.log('\n✅ Market data fetch complete.\n');
  return fullData;
}
