import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AdvancedIndicatorsCalculator,
} from '../analyzer/advanced-indicators';
import { EnhancedCoinAnalysis, OHLCCandle } from '../types';

function makeCandles(
  n: number,
  fn: (i: number) => number,
  startTs = 1_700_000_000_000,
  stepMs = 4 * 60 * 60 * 1000
): OHLCCandle[] {
  const out: OHLCCandle[] = [];
  for (let i = 0; i < n; i++) {
    const close = fn(i);
    out.push({
      timestamp: startTs + i * stepMs,
      open: close * 0.99,
      high: close * 1.02,
      low: close * 0.98,
      close,
    });
  }
  return out;
}

function coinWith(candles: OHLCCandle[]): EnhancedCoinAnalysis {
  return {
    coin: {
      id: 'test-coin',
      symbol: 'TST',
      name: 'Test Coin',
      currentPrice: candles.length ? candles[candles.length - 1].close : 0,
      marketCap: 1e9,
      volume24h: 1e6,
      priceChange1d: 0,
      priceChange7d: 0,
      priceChange24hPercent: 0,
      priceChange7dPercent: 0,
      ohlcData: candles,
    },
    indicators: {
      rsi: null,
      macd: { macdLine: null, signalLine: null, histogram: null, crossover: 'neutral' },
      ema7: null,
      ema14: null,
      emaTrend: 'neutral',
      bollingerBands: { upper: null, middle: null, lower: null, position: 'unknown' },
      volumeSpike: false,
      volumeChangePercent: 0,
    },
    category: 'WATCHLIST',
    signals: [],
    score: 0,
  };
}

const calc = new AdvancedIndicatorsCalculator();
const uptrend = makeCandles(180, (i) => 100 + i);
const mixed = makeCandles(180, (i) => 100 + Math.sin(i / 5) * 10 + i * 0.2);

test('Ichimoku computes with 30-day 4-hourly data and uses high/low', () => {
  const ichimoku = calc.calculateIchimokuCloud(uptrend);
  assert.ok(ichimoku.cloudTop >= ichimoku.cloudBottom);
  assert.ok(['above_cloud', 'below_cloud', 'in_cloud', 'cloud_transition'].includes(ichimoku.position));
  // In a steady uptrend the price should be at or above the cloud
  assert.equal(ichimoku.position, 'above_cloud');
});

test('Ichimoku returns empty cloud when fewer than 52 candles', () => {
  const ichimoku = calc.calculateIchimokuCloud(uptrend.slice(0, 40));
  assert.equal(ichimoku.conversionLine, 0);
  assert.equal(ichimoku.position, 'in_cloud');
});

test('ADX is a smoothed value within [0, 100]', () => {
  const adx = calc.calculateADX(uptrend, 14);
  assert.ok(adx > 0 && adx <= 100, `ADX should be in (0, 100], got ${adx}`);
  // A strong monotonic trend should produce a high ADX
  assert.ok(adx > 25, `ADX for a monotonic uptrend should be > 25, got ${adx}`);
});

test('ADX returns 0 when there is not enough data', () => {
  assert.equal(calc.calculateADX(uptrend.slice(0, 20), 14), 0);
});

test('Stochastic %D differs from %K (real moving average, not single sample)', () => {
  const stoch = calc.calculateStochasticOscillator(mixed, 14, 3);
  assert.ok(stoch.k >= 0 && stoch.k <= 100);
  assert.ok(stoch.d >= 0 && stoch.d <= 100);
  assert.ok(stoch.signal >= 0 && stoch.signal <= 100);
  assert.notEqual(stoch.d, stoch.k, '%D must be an SMA of the %K series, not %K itself');
  assert.notEqual(stoch.signal, stoch.d, 'signal must be an SMA of the %D series');
});

test('Williams %R stays within [-100, 0] and uses highs/lows', () => {
  const wr = calc.calculateWilliamsR(uptrend, 14);
  assert.ok(wr <= 0 && wr >= -100, `Williams %R out of range: ${wr}`);
  // Latest close is the highest close in an uptrend; with high = close*1.02
  // the close never touches the high, so %R should be > -100
  assert.ok(wr > -100);
});

test('CCI uses typical price and returns a finite number', () => {
  const cci = calc.calculateCCI(mixed, 14);
  assert.ok(Number.isFinite(cci));
});

test('ATR is positive and finite', () => {
  const atr = calc.calculateATR(uptrend, 14);
  assert.ok(atr > 0 && Number.isFinite(atr));
});

test('calculateAllAdvancedIndicators fills every indicator with enough candles', () => {
  const result = calc.calculateAllAdvancedIndicators(coinWith(uptrend));
  assert.ok(result.ichimoku);
  assert.ok(typeof result.atr === 'number' && result.atr > 0);
  assert.ok(typeof result.adx === 'number' && result.adx > 0);
  assert.ok(typeof result.williamsR === 'number');
  assert.ok(typeof result.cci === 'number');
  assert.ok(result.stochasticOscillator);
});
