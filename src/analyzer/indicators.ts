import {
  RSI,
  MACD,
  EMA,
  BollingerBands,
} from 'technicalindicators';
import { CoinMarketData, TechnicalIndicators, OHLCCandle } from '../types';

/**
 * Calculate all technical indicators from OHLC data
 */
export function calculateIndicators(coin: CoinMarketData): TechnicalIndicators {
  const candles = coin.ohlcData;

  // Need at least 14 candles for meaningful indicators
  if (candles.length < 14) {
    return buildEmptyIndicators(coin);
  }

  const closes = candles.map((c: OHLCCandle) => c.close);

  // ─── RSI (14-period) ───────────────────────────────────────────────────────
  const rsiValues = RSI.calculate({ values: closes, period: 14 });
  const rsi = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : null;

  // ─── MACD (12, 26, 9) ──────────────────────────────────────────────────────
  const macdResult = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });

  let macdLine: number | null = null;
  let signalLine: number | null = null;
  let histogram: number | null = null;
  let crossover: 'bullish' | 'bearish' | 'neutral' = 'neutral';

  if (macdResult.length >= 2) {
    const latest = macdResult[macdResult.length - 1];
    const prev = macdResult[macdResult.length - 2];

    macdLine = latest.MACD ?? null;
    signalLine = latest.signal ?? null;
    histogram = latest.histogram ?? null;

    // Detect crossover: MACD line crossing above/below signal line
    if (
      prev.MACD !== undefined &&
      prev.signal !== undefined &&
      latest.MACD !== undefined &&
      latest.signal !== undefined
    ) {
      if (prev.MACD <= prev.signal && latest.MACD > latest.signal) {
        crossover = 'bullish';
      } else if (prev.MACD >= prev.signal && latest.MACD < latest.signal) {
        crossover = 'bearish';
      }
    }
  }

  // ─── EMA 7 & EMA 14 ────────────────────────────────────────────────────────
  const ema7Values = EMA.calculate({ values: closes, period: 7 });
  const ema14Values = EMA.calculate({ values: closes, period: 14 });

  const ema7 = ema7Values.length > 0 ? ema7Values[ema7Values.length - 1] : null;
  const ema14 = ema14Values.length > 0 ? ema14Values[ema14Values.length - 1] : null;

  let emaTrend: 'uptrend' | 'downtrend' | 'neutral' = 'neutral';
  if (ema7 !== null && ema14 !== null) {
    if (ema7 > ema14) emaTrend = 'uptrend';
    else if (ema7 < ema14) emaTrend = 'downtrend';
  }

  // ─── Bollinger Bands (20-period, 2 std dev) ─────────────────────────────────
  let bbUpper: number | null = null;
  let bbMiddle: number | null = null;
  let bbLower: number | null = null;
  let bbPosition: 'above_upper' | 'below_lower' | 'middle' | 'unknown' = 'unknown';

  if (closes.length >= 20) {
    const bbResult = BollingerBands.calculate({
      values: closes,
      period: 20,
      stdDev: 2,
    });

    if (bbResult.length > 0) {
      const latestBB = bbResult[bbResult.length - 1];
      bbUpper = latestBB.upper;
      bbMiddle = latestBB.middle;
      bbLower = latestBB.lower;
      const price = coin.currentPrice;

      if (price > latestBB.upper) bbPosition = 'above_upper';
      else if (price < latestBB.lower) bbPosition = 'below_lower';
      else bbPosition = 'middle';
    }
  }

  // ─── Volume Spike Detection ─────────────────────────────────────────────────
  // Since CoinGecko OHLC endpoint has no per-candle volume, we approximate
  // activity by comparing the price range (high - low) of the most recent
  // candles vs older candles. A spike means recent volatility is much higher.
  const { volumeSpike, volumeChangePercent } = detectVolatilitySpike(candles);

  return {
    rsi,
    macd: { macdLine, signalLine, histogram, crossover },
    ema7,
    ema14,
    emaTrend,
    bollingerBands: {
      upper: bbUpper,
      middle: bbMiddle,
      lower: bbLower,
      position: bbPosition,
    },
    volumeSpike,
    volumeChangePercent,
  };
}

/**
 * Detect volatility spike by comparing recent candle ranges vs earlier candles.
 * CoinGecko OHLC doesn't include volume per candle, so we use price range as
 * a proxy for trading activity.
 */
function detectVolatilitySpike(candles: OHLCCandle[]): {
  volumeSpike: boolean;
  volumeChangePercent: number;
} {
  if (candles.length < 6) return { volumeSpike: false, volumeChangePercent: 0 };

  const ranges = candles.map((c) => (c.high - c.low) / c.close * 100); // normalize by price

  // Split into first half (older) and second half (recent)
  const mid = Math.floor(ranges.length / 2);
  const older = ranges.slice(0, mid);
  const recent = ranges.slice(mid);

  const avgOlder = older.reduce((s, v) => s + v, 0) / older.length;
  const avgRecent = recent.reduce((s, v) => s + v, 0) / recent.length;

  const changePercent = avgOlder > 0 ? ((avgRecent - avgOlder) / avgOlder) * 100 : 0;
  const spike = changePercent > 30; // Recent volatility 30%+ higher than earlier

  return { volumeSpike: spike, volumeChangePercent: changePercent };
}

/**
 * Build empty indicators for coins with insufficient data
 */
function buildEmptyIndicators(coin: CoinMarketData): TechnicalIndicators {
  return {
    rsi: null,
    macd: { macdLine: null, signalLine: null, histogram: null, crossover: 'neutral' },
    ema7: null,
    ema14: null,
    emaTrend: 'neutral',
    bollingerBands: { upper: null, middle: null, lower: null, position: 'unknown' },
    volumeSpike: false,
    volumeChangePercent: coin.priceChange24hPercent ?? 0,
  };
}
