import {
  BacktestCategoryStats,
  BacktestOutcome,
  BacktestReport,
  BacktestSpread,
  CoinMarketData,
  HorizonStats,
  OHLCCandle,
  SignalCategory,
} from '../types';
import { analyzeCoin } from './classifier';

export const DEFAULT_HORIZONS_IN_DAYS = [1, 3, 7];

export interface BacktestOptions {
  /** Forward-return horizons measured in days (default: 1, 3, 7) */
  horizonsInDays?: number[];
  /**
   * Candles of history required before a signal is evaluated. Defaults to
   * enough for the 7-day change, Bollinger Bands and MACD.
   */
  warmupCandles?: number;
  /** Evaluate every Nth candle (default 1). Use 2–3 to speed up large runs. */
  step?: number;
  /** Include raw per-signal outcomes in the report (default false) */
  includeOutcomes?: boolean;
}

/**
 * Infer how many candles make up a day from their timestamps
 * (CoinGecko returns 4-hourly candles => 6 per day).
 */
export function estimateCandlesPerDay(candles: OHLCCandle[]): number {
  if (candles.length < 2) return 1;

  const diffs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const d = candles[i].timestamp - candles[i - 1].timestamp;
    if (d > 0) diffs.push(d);
  }
  if (diffs.length === 0) return 1;

  diffs.sort((a, b) => a - b);
  const medianMs = diffs[Math.floor(diffs.length / 2)];
  return Math.max(1, Math.round((24 * 60 * 60 * 1000) / medianMs));
}

/**
 * Build a point-in-time view of a coin as it looked at `index`.
 *
 * IMPORTANT: every price/percentage is derived from candles up to and
 * including `index`. Reusing the cached live values (which come from "now")
 * would leak future information into historical signals and invalidate the
 * whole backtest.
 */
export function buildPointInTimeCoin(
  coin: CoinMarketData,
  index: number,
  candlesPerDay: number
): CoinMarketData {
  const history = coin.ohlcData.slice(0, index + 1);
  const day = Math.max(1, Math.round(candlesPerDay));
  const current = history[history.length - 1].close;

  const percentChange = (candlesBack: number): number => {
    const ref = history[history.length - 1 - candlesBack]?.close;
    if (!ref) return 0;
    return ((current - ref) / ref) * 100;
  };

  const absoluteChange = (candlesBack: number): number => {
    const ref = history[history.length - 1 - candlesBack]?.close;
    if (!ref) return 0;
    return current - ref;
  };

  return {
    ...coin,
    currentPrice: current,
    ohlcData: history,
    priceChange24hPercent: percentChange(day),
    priceChange7dPercent: percentChange(day * 7),
    priceChange1d: absoluteChange(day),
    priceChange7d: absoluteChange(day * 7),
  };
}

/**
 * Walk-forward backtest: replay every historical candle through the live
 * classifier and measure what happened next.
 */
export function runBacktest(
  coins: CoinMarketData[],
  options: BacktestOptions = {}
): BacktestReport {
  const horizons = options.horizonsInDays ?? DEFAULT_HORIZONS_IN_DAYS;
  const step = Math.max(1, options.step ?? 1);

  const outcomes: BacktestOutcome[] = [];
  let coinsAnalyzed = 0;
  let coinsSkipped = 0;
  let candlesPerDay = 1;
  let warmupCandles = 0;

  for (const coin of coins) {
    const candles = coin.ohlcData;
    const day = Math.max(1, Math.round(estimateCandlesPerDay(candles)));

    // Default warmup: enough history for the 7-day change (7 days),
    // Bollinger Bands (20) and MACD (26 + 9 signal ≈ 35).
    const warmup = Math.max(options.warmupCandles ?? 0, 20, day * 7 + 1, 35);
    const maxHorizon = Math.max(...horizons) * day;

    // Need `warmup` candles behind us and the longest horizon ahead of us
    if (candles.length < warmup + maxHorizon + 1) {
      coinsSkipped++;
      continue;
    }

    coinsAnalyzed++;
    candlesPerDay = day;
    warmupCandles = warmup;

    const lastEvaluableIndex = candles.length - maxHorizon - 1;

    for (let i = warmup; i <= lastEvaluableIndex; i += step) {
      const snapshot = buildPointInTimeCoin(coin, i, day);
      const analysis = analyzeCoin(snapshot);
      const entry = candles[i].close;
      if (entry === 0) continue;

      const forwardReturns: Record<string, number> = {};
      for (const h of horizons) {
        const exitIndex = Math.min(i + h * day, candles.length - 1);
        forwardReturns[`${h}d`] = (candles[exitIndex].close - entry) / entry;
      }

      // Excursions over the longest horizon
      let maxAdverse = 0;
      let maxFavorable = 0;
      const excursionEnd = Math.min(i + maxHorizon, candles.length - 1);
      for (let j = i + 1; j <= excursionEnd; j++) {
        maxAdverse = Math.min(maxAdverse, (candles[j].low - entry) / entry);
        maxFavorable = Math.max(maxFavorable, (candles[j].high - entry) / entry);
      }

      outcomes.push({
        coinId: coin.id,
        symbol: coin.symbol,
        timestamp: candles[i].timestamp,
        category: analysis.category,
        score: analysis.score,
        forwardReturns,
        maxAdverseExcursion: maxAdverse,
        maxFavorableExcursion: maxFavorable,
      });
    }
  }

  return {
    generatedAt: new Date(),
    coinsAnalyzed,
    coinsSkipped,
    samples: outcomes.length,
    candlesPerDay,
    warmupCandles,
    horizonsInDays: horizons,
    stats: summarizeByCategory(outcomes, horizons),
    spreads: calculateSpreads(outcomes, horizons),
    ...(options.includeOutcomes ? { outcomes } : {}),
  };
}

/** Aggregate outcomes per signal category. Exported for direct testing. */
export function summarizeByCategory(
  outcomes: BacktestOutcome[],
  horizons: number[]
): BacktestCategoryStats[] {
  const categories: SignalCategory[] = ['BUY', 'WATCHLIST', 'AVOID'];

  return categories.map((category) => {
    const group = outcomes.filter((o) => o.category === category);

    const horizonStats: HorizonStats[] = horizons.map((h) => {
      const key = `${h}d`;
      const returns = group.map((o) => o.forwardReturns[key] ?? 0);
      const mean = average(returns);
      const sd = stdDev(returns);

      return {
        horizon: key,
        samples: returns.length,
        hitRate: returns.length === 0 ? 0 : returns.filter((r) => r > 0).length / returns.length,
        avgReturn: mean,
        medianReturn: median(returns),
        signalIr: sd === 0 ? 0 : mean / sd,
      };
    });

    return {
      category,
      samples: group.length,
      avgMaxAdverseExcursion: average(group.map((o) => o.maxAdverseExcursion)),
      avgMaxFavorableExcursion: average(group.map((o) => o.maxFavorableExcursion)),
      horizons: horizonStats,
    };
  });
}

/** Does the ranking actually rank? BUY minus AVOID and BUY minus baseline. */
export function calculateSpreads(outcomes: BacktestOutcome[], horizons: number[]): BacktestSpread[] {
  return horizons.map((h) => {
    const key = `${h}d`;
    const all = outcomes.map((o) => o.forwardReturns[key] ?? 0);
    const buy = outcomes.filter((o) => o.category === 'BUY').map((o) => o.forwardReturns[key] ?? 0);
    const avoid = outcomes
      .filter((o) => o.category === 'AVOID')
      .map((o) => o.forwardReturns[key] ?? 0);

    const avgBuy = average(buy);
    return {
      horizon: key,
      buyMinusAvoid: buy.length && avoid.length ? avgBuy - average(avoid) : 0,
      buyMinusAll: buy.length ? avgBuy - average(all) : 0,
    };
  });
}

// ─── Small statistics helpers ────────────────────────────────────────────────

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((v) => Math.pow(v - mean, 2))));
}