import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateIndicators } from '../analyzer/indicators';
import { CoinMarketData, OHLCCandle } from '../types';

/** Deterministic synthetic candle builder. */
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
      high: close * 1.01,
      low: close * 0.98,
      close,
    });
  }
  return out;
}

function coinWith(candles: OHLCCandle[]): CoinMarketData {
  return {
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
  };
}

test('returns empty indicators when there is insufficient data', () => {
  const result = calculateIndicators(coinWith(makeCandles(10, (i) => 100 + i)));
  assert.equal(result.rsi, null);
  assert.equal(result.macd.macdLine, null);
  assert.equal(result.bollingerBands.position, 'unknown');
});

test('RSI is within [0, 100] on a steady uptrend', () => {
  const result = calculateIndicators(coinWith(makeCandles(60, (i) => 100 + i)));
  assert.ok(result.rsi !== null);
  assert.ok(result.rsi! > 50, `RSI should be > 50 in uptrend, got ${result.rsi}`);
  assert.ok(result.rsi! <= 100);
});

test('MACD detects bullish momentum after recent acceleration', () => {
  // 40 slow candles then a sharp acceleration — MACD crosses above signal
  const candles = makeCandles(60, (i) =>
    i < 40 ? 100 + i * 0.1 : 104 + (i - 40) * 0.5
  );
  const result = calculateIndicators(coinWith(candles));
  assert.ok(result.macd.macdLine !== null);
  assert.ok(result.macd.signalLine !== null);
  assert.ok(result.macd.macdLine! > result.macd.signalLine!);
});

test('EMA trend is uptrend when price rises steadily', () => {
  const result = calculateIndicators(coinWith(makeCandles(60, (i) => 100 + i)));
  assert.equal(result.emaTrend, 'uptrend');
  assert.ok(result.ema7! > result.ema14!);
});

test('Bollinger position is computed for 20+ candles', () => {
  const result = calculateIndicators(coinWith(makeCandles(40, (i) => 100 + i)));
  assert.ok(result.bollingerBands.upper !== null);
  assert.ok(['above_upper', 'below_lower', 'middle'].includes(result.bollingerBands.position));
});

test('real per-candle volume replaces the range proxy', () => {
  const candles = makeCandles(60, (i) => 100 + Math.sin(i / 5) * 5);
  const base = candles.map(() => 1000);
  // 3x volume surge in the recent half
  const surged = base.map((v, i) => (i >= 30 ? v * 3 : v));
  const coin = { ...coinWith(candles), candleVolumes: surged };

  const result = calculateIndicators(coin);
  assert.equal(result.volumeIsReal, true);
  assert.equal(result.volumeSpike, true);
  assert.ok(result.volumeChangePercent > 30);
  assert.ok(result.mfi !== null && Number.isFinite(result.mfi));
  assert.ok(result.mfi! >= 0 && result.mfi! <= 100);
});

test('without candleVolumes the range proxy is used and MFI is null', () => {
  const result = calculateIndicators(coinWith(makeCandles(60, (i) => 100 + Math.sin(i / 5) * 5)));
  assert.notEqual(result.volumeIsReal, true);
  assert.equal(result.mfi ?? null, null);
});

test('handles empty candle list safely', () => {
  const result = calculateIndicators(coinWith([]));
  assert.equal(result.rsi, null);
  assert.equal(result.volumeSpike, false);
});
