import axios, { AxiosInstance } from 'axios';
import { CoinMarketData, OHLCCandle } from '../types';

const BASE_URL = 'https://api.coingecko.com/api/v3';

// Rate limiter: CoinGecko free tier allows ~10-30 calls/min
const DELAY_MS = 2000; // 2 seconds between calls

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const client: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    Accept: 'application/json',
    'User-Agent': 'crypto-agent/1.0',
  },
});

/**
 * Fetch top N coins by market cap with basic market data
 */
export async function fetchTopCoins(limit: number = 50): Promise<CoinMarketData[]> {
  console.log(`📡 Fetching top ${limit} coins from CoinGecko...`);

  const response = await client.get('/coins/markets', {
    params: {
      vs_currency: 'usd',
      order: 'market_cap_desc',
      per_page: limit,
      page: 1,
      sparkline: false,
      price_change_percentage: '24h,7d',
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
 * Fetch 7-day OHLC data for a specific coin (CoinGecko returns 4-hourly candles for 7 days)
 */
export async function fetchOHLC(coinId: string): Promise<OHLCCandle[]> {
  const response = await client.get(`/coins/${coinId}/ohlc`, {
    params: {
      vs_currency: 'usd',
      days: 7,
    },
  });

  // Response format: [timestamp, open, high, low, close]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      const error = err as { response?: { status?: number } };
      if (error.response?.status === 429) {
        console.log(`\n⚠️  Rate limited. Waiting 60s before retrying ${coin.symbol}...`);
        await sleep(60000);
        try {
          const ohlcData = await fetchOHLC(coin.id);
          fullData.push({ ...coin, ohlcData });
        } catch {
          console.log(`\n❌ Skipping ${coin.symbol} (failed after retry)`);
          fullData.push({ ...coin, ohlcData: [] });
        }
      } else {
        console.log(`\n❌ Failed to fetch OHLC for ${coin.symbol}: ${(err as Error).message}`);
        fullData.push({ ...coin, ohlcData: [] });
      }
    }
  }

  console.log('\n✅ Market data fetch complete.\n');
  return fullData;
}
