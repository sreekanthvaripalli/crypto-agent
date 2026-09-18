import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeCoin, analyzeAll } from '../analyzer/classifier';
import { CoinMarketData } from '../types';

function makeCoin(priceChange7dPercent: number, trend: 'up' | 'down'): CoinMarketData {
  const n = 60;
  const step = trend === 'up' ? 0.4 : -0.4;
  const candles = [];
  for (let i = 0; i < n; i++) {
    const close = 100 * Math.pow(1 + step / 100, i);
    candles.push({
      timestamp: 1_700_000_000_000 + i * 4 * 60 * 60 * 1000,
      open: close * 0.99,
      high: close * 1.01,
      low: close * 0.98,
      close,
    });
  }
  return {
    id: 'test-coin',
    symbol: 'TST',
    name: 'Test Coin',
    currentPrice: candles[candles.length - 1].close,
    marketCap: 1e9,
    volume24h: 1e6,
    priceChange1d: 0,
    priceChange7d: priceChange7dPercent,
    priceChange24hPercent: 0,
    priceChange7dPercent,
    ohlcData: candles,
  };
}

test('a deep oversold dip classifies as BUY (contrarian logic)', () => {
  // The classifier is mean-reversion oriented: oversold + extended drop => BUY
  const analysis = analyzeCoin(makeCoin(-25, 'down'));
  assert.ok(analysis.indicators.rsi !== null && analysis.indicators.rsi <= 35);
  assert.equal(analysis.category, 'BUY');
  assert.ok(analysis.score > 0);
});

test('a steady mild uptrend stays WATCHLIST (overbought penalties offset momentum)', () => {
  // A slow grind up trips the overbought penalties, so it does not reach BUY
  const analysis = analyzeCoin(makeCoin(5, 'up'));
  assert.equal(analysis.category, 'WATCHLIST');
});

test('a strong rally with overbought RSI classifies as AVOID (contrarian logic)', () => {
  // The classifier is mean-reversion oriented: overbought + extended rally => AVOID
  const analysis = analyzeCoin(makeCoin(30, 'up'));
  assert.equal(analysis.category, 'AVOID');
  assert.ok(analysis.score < 0);
});

test('a mild downtrend with oversold RSI is treated as a potential value buy', () => {
  // Deeply oversold conditions flip the contrarian score positive
  const analysis = analyzeCoin(makeCoin(-5, 'down'));
  assert.ok(analysis.indicators.rsi !== null && analysis.indicators.rsi < 50);
  assert.notEqual(analysis.category, 'AVOID');
});

test('analyzeAll sorts results by score descending', () => {
  const coins = [makeCoin(-5, 'down'), makeCoin(5, 'up')];
  const results = analyzeAll(coins);
  assert.ok(results[0].score >= results[1].score);
});

test('score stays within [-100, 100]', () => {
  const analysis = analyzeCoin(makeCoin(30, 'up'));
  assert.ok(analysis.score <= 100 && analysis.score >= -100);
});
