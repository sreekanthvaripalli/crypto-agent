import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessMarketRegime } from '../analyzer/market-regime';
import { OHLCCandle } from '../types';

const FOUR_HOURS = 4 * 60 * 60 * 1000;

function trendCandles(n: number, driftPerCandle: number): OHLCCandle[] {
  const candles: OHLCCandle[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    const close = price;
    candles.push({
      timestamp: 1_700_000_000_000 + i * FOUR_HOURS,
      open: close * 0.99,
      high: close * 1.01,
      low: close * 0.98,
      close,
    });
    price = price * (1 + driftPerCandle);
  }
  return candles;
}

test('strong BTC uptrend is risk-on', () => {
  const regime = assessMarketRegime(trendCandles(180, 0.002));
  assert.equal(regime.regime, 'risk-on');
  assert.equal(regime.demoteBuys, false);
  assert.ok(regime.btcTrendPct > 0);
});

test('strong BTC downtrend is risk-off and demotes BUY signals', () => {
  const regime = assessMarketRegime(trendCandles(180, -0.002));
  assert.equal(regime.regime, 'risk-off');
  assert.equal(regime.demoteBuys, true);
  assert.ok(regime.btcTrendPct < 0);
});

test('short series is neutral (not enough EMA history)', () => {
  const regime = assessMarketRegime(trendCandles(10, 0.002));
  assert.equal(regime.regime, 'neutral');
  assert.equal(regime.demoteBuys, false);
  assert.equal(regime.btcTrendPct, 0);
});