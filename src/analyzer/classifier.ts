import { CoinMarketData, CoinAnalysis, TechnicalIndicators, SignalCategory } from '../types';
import { calculateIndicators } from './indicators';

/**
 * Score and classify a single coin based on its technical indicators.
 * Score range: -100 (strong sell) to +100 (strong buy)
 */
export function analyzeCoin(coin: CoinMarketData): CoinAnalysis {
  const indicators = calculateIndicators(coin);
  const { signals, score } = scoreIndicators(coin, indicators);
  const category = categorize(score, indicators);

  return { coin, indicators, category, signals, score };
}

/**
 * Analyze all coins and return classified results
 */
export function analyzeAll(coins: CoinMarketData[]): CoinAnalysis[] {
  return coins.map(analyzeCoin).sort((a, b) => b.score - a.score);
}

/**
 * Score a coin based on technical signals.
 * Positive score = bullish, Negative score = bearish
 */
function scoreIndicators(
  coin: CoinMarketData,
  ind: TechnicalIndicators
): { signals: string[]; score: number } {
  let score = 0;
  const signals: string[] = [];

  // ─── RSI Scoring ────────────────────────────────────────────────────────────
  if (ind.rsi !== null) {
    if (ind.rsi <= 25) {
      score += 30;
      signals.push(`🔥 RSI ${ind.rsi.toFixed(1)} — Heavily oversold (strong reversal signal)`);
    } else if (ind.rsi <= 35) {
      score += 20;
      signals.push(`📉 RSI ${ind.rsi.toFixed(1)} — Oversold (potential bounce)`);
    } else if (ind.rsi <= 45) {
      score += 10;
      signals.push(`📊 RSI ${ind.rsi.toFixed(1)} — Below midpoint (mild bullish lean)`);
    } else if (ind.rsi >= 75) {
      score -= 30;
      signals.push(`⚠️  RSI ${ind.rsi.toFixed(1)} — Heavily overbought (strong reversal risk)`);
    } else if (ind.rsi >= 65) {
      score -= 20;
      signals.push(`📈 RSI ${ind.rsi.toFixed(1)} — Overbought (caution)`);
    } else if (ind.rsi >= 55) {
      score -= 10;
      signals.push(`📊 RSI ${ind.rsi.toFixed(1)} — Above midpoint (mild bearish lean)`);
    } else {
      signals.push(`📊 RSI ${ind.rsi.toFixed(1)} — Neutral zone (45–55)`);
    }
  } else {
    signals.push('⚪ RSI — Insufficient data');
  }

  // ─── MACD Scoring ───────────────────────────────────────────────────────────
  if (ind.macd.macdLine !== null && ind.macd.signalLine !== null) {
    if (ind.macd.crossover === 'bullish') {
      score += 25;
      signals.push(`✅ MACD Bullish Crossover — Momentum turning upward`);
    } else if (ind.macd.crossover === 'bearish') {
      score -= 25;
      signals.push(`❌ MACD Bearish Crossover — Momentum turning downward`);
    } else if (ind.macd.macdLine > ind.macd.signalLine) {
      score += 10;
      signals.push(`📈 MACD above signal line — Bullish momentum ongoing`);
    } else if (ind.macd.macdLine < ind.macd.signalLine) {
      score -= 10;
      signals.push(`📉 MACD below signal line — Bearish momentum ongoing`);
    }

    // Histogram trend
    if (ind.macd.histogram !== null) {
      if (ind.macd.histogram > 0) {
        score += 5;
      } else {
        score -= 5;
      }
    }
  } else {
    signals.push('⚪ MACD — Insufficient data');
  }

  // ─── EMA Trend Scoring ──────────────────────────────────────────────────────
  if (ind.emaTrend === 'uptrend') {
    score += 15;
    signals.push(`📈 EMA7 > EMA14 — Short-term uptrend confirmed`);
  } else if (ind.emaTrend === 'downtrend') {
    score -= 15;
    signals.push(`📉 EMA7 < EMA14 — Short-term downtrend confirmed`);
  } else {
    signals.push(`➡️  EMA — Trend is neutral`);
  }

  // ─── Bollinger Bands Scoring ────────────────────────────────────────────────
  if (ind.bollingerBands.position === 'below_lower') {
    score += 15;
    signals.push(`⬇️  Price below lower Bollinger Band — Oversold, potential bounce`);
  } else if (ind.bollingerBands.position === 'above_upper') {
    score -= 15;
    signals.push(`⬆️  Price above upper Bollinger Band — Overbought, potential pullback`);
  } else if (ind.bollingerBands.position === 'middle') {
    signals.push(`📊 Price within Bollinger Bands — Consolidating`);
  }

  // ─── 7-Day Price Trend Scoring ──────────────────────────────────────────────
  const change7d = coin.priceChange7dPercent;
  if (change7d <= -20) {
    score += 10; // Deep dip — potential value buy
    signals.push(`📉 7d Price: ${change7d.toFixed(1)}% — Deep dip (possible accumulation zone)`);
  } else if (change7d <= -10) {
    score += 5;
    signals.push(`📉 7d Price: ${change7d.toFixed(1)}% — Significant dip`);
  } else if (change7d >= 20) {
    score -= 10; // Big run-up — could be overextended
    signals.push(`🚀 7d Price: +${change7d.toFixed(1)}% — Strong rally (watch for pullback)`);
  } else if (change7d >= 10) {
    score -= 5;
    signals.push(`📈 7d Price: +${change7d.toFixed(1)}% — Positive momentum`);
  } else {
    signals.push(`➡️  7d Price: ${change7d > 0 ? '+' : ''}${change7d.toFixed(1)}% — Moderate move`);
  }

  // ─── Volume Spike Scoring ───────────────────────────────────────────────────
  if (ind.volumeSpike) {
    // Volume spike is bullish if price is going up, bearish if going down
    if (coin.priceChange24hPercent > 0) {
      score += 10;
      signals.push(`📊 Volume spike (+${ind.volumeChangePercent.toFixed(0)}%) with price up — Strong buying`);
    } else {
      score -= 10;
      signals.push(`📊 Volume spike (+${ind.volumeChangePercent.toFixed(0)}%) with price down — Strong selling`);
    }
  }

  // Clamp score to [-100, +100]
  score = Math.max(-100, Math.min(100, score));

  return { signals, score };
}

/**
 * Classify based on score + indicator strength
 */
function categorize(score: number, ind: TechnicalIndicators): SignalCategory {
  if (score >= 25) return 'BUY';
  if (score <= -25) return 'AVOID';

  // Borderline cases — use RSI as tiebreaker
  if (score >= 10) {
    if (ind.rsi !== null && ind.rsi < 50) return 'BUY';
    return 'WATCHLIST';
  }

  if (score <= -10) {
    if (ind.rsi !== null && ind.rsi > 55) return 'AVOID';
    return 'WATCHLIST';
  }

  return 'WATCHLIST';
}
