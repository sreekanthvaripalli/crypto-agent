import axios from 'axios';
import { CoinMarketData, OHLCCandle } from '../types';

const BINANCE_BASE_URL = 'https://api.binance.com/api/v3';

const client = axios.create({
  baseURL: BINANCE_BASE_URL,
  timeout: 10000,
  headers: {
    Accept: 'application/json',
    'User-Agent': 'crypto-agent/1.0',
  },
});

/**
 * Fetch 24hr tickers from Binance and map them to top USD/USDT coins
 */
export async function fetchBinanceTopCoins(limit: number = 50): Promise<CoinMarketData[]> {
  const response = await client.get('/ticker/24hr');
  const data: any[] = response.data;

  // Filter USDT pairs, excluding leverage tokens & odd stablecoin pairs
  const usdtPairs = data
    .filter(
      (item) =>
        item.symbol.endsWith('USDT') &&
        !item.symbol.includes('UP') &&
        !item.symbol.includes('DOWN') &&
        !item.symbol.includes('BEAR') &&
        !item.symbol.includes('BULL')
    )
    .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
    .slice(0, limit);

  return usdtPairs.map((item) => {
    const symbol = item.symbol.replace('USDT', '');
    const currentPrice = parseFloat(item.lastPrice);
    const priceChangePercent = parseFloat(item.priceChangePercent);
    const volume24h = parseFloat(item.quoteVolume);
    const priceChange1d = parseFloat(item.priceChange);

    return {
      id: symbol.toLowerCase(),
      symbol: symbol.toUpperCase(),
      name: symbol.toUpperCase(),
      currentPrice,
      marketCap: volume24h * 10, // Approx rank proxy if mcap not present
      volume24h,
      priceChange1d,
      priceChange7d: 0,
      priceChange24hPercent: priceChangePercent,
      priceChange7dPercent: 0,
      ohlcData: [],
      dataProvider: 'binance',
    };
  });
}

/**
 * Fetch OHLC klines from Binance for a given symbol (e.g., BTC, ETH)
 * Default: 4h interval, 30 days history (180 candles)
 */
export async function fetchBinanceOHLC(symbol: string, limit: number = 180): Promise<OHLCCandle[]> {
  const formattedSymbol = `${symbol.toUpperCase()}USDT`;
  const response = await client.get('/klines', {
    params: {
      symbol: formattedSymbol,
      interval: '4h',
      limit,
    },
  });

  return response.data.map((kline: any[]) => ({
    timestamp: kline[0],
    open: parseFloat(kline[1]),
    high: parseFloat(kline[2]),
    low: parseFloat(kline[3]),
    close: parseFloat(kline[4]),
  }));
}
