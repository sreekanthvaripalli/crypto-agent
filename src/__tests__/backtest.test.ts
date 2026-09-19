import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildPointInTimeCoin,
  calculateSpreads,
  estimateCandlesPerDay,
  runBacktest,
  summarizeByCategory,
} from '../analyzer/backtest';
import { BacktestOutcome, CoinMarketData, OHLCCandle, SignalCategory } from '../types';

const FOUR_HOURS = 4 * 60 * 60 * 1000;

function makeCoin(closes: number[], id = 'test', symbol = 'TST'): CoinMarketData {
  const ohlcData: OHLCCandle[] = closes.map((close, i) => ({
    timestamp: 1_700_000_000_000 + i * FOUR_HOURS,
    open: close,
    high: close * 1.01,
    low: close * 0.99,
    close,
  }));
  return {
    id,
    symbol,
    name: id,
    currentPrice: closes[closes.length - 1],
    marketCap: 1e9,
    volume24h: 1e6,
    priceChange1d: 0,
    priceChange7d: 0,
    priceChange24hPercent: 0,
    priceChange7dPercent: 0,
    ohlcData,
  };
}

function sineCoin(
  n: number,
  period: number,
  amplitude: number,
  base: number,
  id = 'sine'
): CoinMarketData {
  const closes = Array.from(
    { length: n },
    (_, i) => base + amplitude * Math.sin((2 * Math.PI * i) / period)
  );
  return makeCoin(closes, id, 'SIN');
}

function outcome(category: SignalCategory, ret1d: number): BacktestOutcome {
  return {
    coinId: 'x',
    symbol: 'X',
    timestamp: 0,
    category,
    score: 0,
    forwardReturns: { '1d': ret1d },
    maxAdverseExcursion: -0.02,
    maxFavorableExcursion: 0.03,
  };
}

test('estimateCandlesPerDay infers 6 for 4-hourly candles and 1 for daily', () => {
  assert.equal(estimateCandlesPerDay(sineCoin(10, 5, 1, 100).ohlcData), 6);

  const daily = sineCoin(10, 5, 1, 100).ohlcData.map((c, i) => ({
    ...c,
    timestamp: 1_700_000_000_000 + i * 24 * 60 * 60 * 1000,
  }));
  assert.equal(estimateCandlesPerDay(daily), 1);
  assert.equal(estimateCandlesPerDay([]), 1);
});

test('point-in-time snapshots do not leak future candles', () => {
  const coin = sineCoin(120, 60, 10, 100);
  const snapshot = buildPointInTimeCoin(coin, 50, 6);

  const close50 = coin.ohlcData[50].close;
  const close44 = coin.ohlcData[44].close;
  const close8 = coin.ohlcData[8].close;

  assert.equal(snapshot.ohlcData.length, 51, 'must only contain candles up to index');
  assert.equal(snapshot.currentPrice, close50);
  assert.ok(Math.abs(snapshot.priceChange24hPercent - ((close50 - close44) / close44) * 100) < 1e-9);
  assert.ok(Math.abs(snapshot.priceChange7dPercent - ((close50 - close8) / close8) * 100) < 1e-9);

  // Corrupt every future candle: the snapshot must be completely unaffected
  for (let i = 51; i < coin.ohlcData.length; i++) {
    coin.ohlcData[i] = { ...coin.ohlcData[i], close: 99999, high: 99999, low: 99999 };
  }
  assert.deepEqual(buildPointInTimeCoin(coin, 50, 6), snapshot);
});

test('runBacktest counts samples exactly for a given length, step and horizon', () => {
  const coins = [sineCoin(100, 40, 10, 100)];
  // day=6, horizon 1d => maxHorizon 6, warmup max(20, 43, 35) = 43,
  // lastEvaluable = 100-6-1 = 93 => indices 43..93 = 51 samples
  const report = runBacktest(coins, { horizonsInDays: [1] });
  assert.equal(report.coinsAnalyzed, 1);
  assert.equal(report.candlesPerDay, 6);
  assert.equal(report.warmupCandles, 43);
  assert.equal(report.samples, 51);

  const stepped = runBacktest(coins, { horizonsInDays: [1], step: 5 });
  assert.equal(stepped.samples, 11); // 43,48,...,93
});

test('runBacktest skips coins without enough history', () => {
  const report = runBacktest([sineCoin(40, 20, 5, 100)], { horizonsInDays: [1] });
  assert.equal(report.coinsSkipped, 1);
  assert.equal(report.coinsAnalyzed, 0);
  assert.equal(report.samples, 0);
  assert.equal(report.stats.length, 3);
});

test('custom horizons produce matching keys and spreads', () => {
  const report = runBacktest([sineCoin(200, 120, 25, 100)], {
    horizonsInDays: [1, 2],
    includeOutcomes: true,
  });
  assert.deepEqual(report.horizonsInDays, [1, 2]);
  assert.equal(report.spreads.length, 2);
  assert.deepEqual(report.spreads.map((s) => s.horizon), ['1d', '2d']);
  assert.ok(report.outcomes && report.outcomes.length > 0);
  assert.ok('2d' in report.outcomes[0].forwardReturns);
  assert.ok(!('7d' in report.outcomes[0].forwardReturns));
});

test('forward returns and excursions match an independent recomputation', () => {
  const coins = [sineCoin(200, 120, 25, 100)];
  const report = runBacktest(coins, { horizonsInDays: [1, 7], includeOutcomes: true });
  const candles = coins[0].ohlcData;
  const day = report.candlesPerDay;
  const outcomes = report.outcomes!;

  assert.ok(outcomes.length > 0);
  for (const o of outcomes.slice(0, 40)) {
    const i = candles.findIndex((c) => c.timestamp === o.timestamp);
    assert.ok(i > 0);
    const entry = candles[i].close;

    assert.ok(Math.abs(o.forwardReturns['1d'] - (candles[i + day].close - entry) / entry) < 1e-12);
    assert.ok(
      Math.abs(o.forwardReturns['7d'] - (candles[i + 7 * day].close - entry) / entry) < 1e-12
    );

    let mae = 0;
    let mfe = 0;
    for (let j = i + 1; j <= i + 7 * day; j++) {
      mae = Math.min(mae, (candles[j].low - entry) / entry);
      mfe = Math.max(mfe, (candles[j].high - entry) / entry);
    }
    assert.ok(Math.abs(o.maxAdverseExcursion - mae) < 1e-12, 'MAE mismatch');
    assert.ok(Math.abs(o.maxFavorableExcursion - mfe) < 1e-12, 'MFE mismatch');
    assert.ok(o.maxAdverseExcursion <= 0 && o.maxFavorableExcursion >= 0);
  }
});

test('category stats are consistent with the raw outcomes', () => {
  const coins = [sineCoin(200, 120, 25, 100), sineCoin(200, 90, 15, 50, 'sine-2')];
  const report = runBacktest(coins, { horizonsInDays: [1, 7], includeOutcomes: true });
  const outcomes = report.outcomes!;

  assert.equal(report.samples, outcomes.length);
  for (const category of ['BUY', 'WATCHLIST', 'AVOID'] as SignalCategory[]) {
    const stat = report.stats.find((s) => s.category === category)!;
    const group = outcomes.filter((o) => o.category === category);
    assert.equal(stat.samples, group.length);

    if (group.length > 0) {
      const returns = group.map((o) => o.forwardReturns['7d']);
      const expected = returns.reduce((a, b) => a + b, 0) / returns.length;
      const h = stat.horizons.find((x) => x.horizon === '7d')!;
      assert.ok(Math.abs(h.avgReturn - expected) < 1e-12);
      assert.ok(h.hitRate >= 0 && h.hitRate <= 1);
    }
  }
});

test('summarizeByCategory computes hit rate, average, median and zero-fills gaps', () => {
  const outcomes = [
    outcome('BUY', 0.1),
    outcome('BUY', 0.02),
    outcome('BUY', -0.04),
    outcome('BUY', 0.06),
    outcome('AVOID', -0.05),
    outcome('AVOID', -0.01),
  ];
  const stats = summarizeByCategory(outcomes, [1]);

  const buy = stats.find((s) => s.category === 'BUY')!;
  assert.equal(buy.samples, 4);
  const h = buy.horizons[0];
  assert.equal(h.samples, 4);
  assert.equal(h.hitRate, 0.75);
  assert.ok(Math.abs(h.avgReturn - 0.035) < 1e-12);
  assert.ok(Math.abs(h.medianReturn - 0.04) < 1e-12);
  assert.ok(h.signalIr > 0.6 && h.signalIr < 0.8);

  const avoid = stats.find((s) => s.category === 'AVOID')!;
  assert.equal(avoid.horizons[0].hitRate, 0);

  // No WATCHLIST samples -> zero-filled stats, not NaN
  const watch = stats.find((s) => s.category === 'WATCHLIST')!;
  assert.equal(watch.samples, 0);
  assert.equal(watch.horizons[0].samples, 0);
  assert.equal(watch.horizons[0].hitRate, 0);
  assert.equal(watch.horizons[0].signalIr, 0);
});

test('calculateSpreads reports the BUY-vs-AVOID edge and baseline edge', () => {
  const outcomes = [
    outcome('BUY', 0.1),
    outcome('BUY', 0.02),
    outcome('AVOID', -0.05),
    outcome('AVOID', -0.01),
    outcome('WATCHLIST', 0.01),
  ];
  const spreads = calculateSpreads(outcomes, [1]);

  assert.equal(spreads.length, 1);
  // avg BUY = 0.06, avg AVOID = -0.03 => 0.09 ; avg all = 0.014 => 0.046
  assert.ok(Math.abs(spreads[0].buyMinusAvoid - 0.09) < 1e-12);
  assert.ok(Math.abs(spreads[0].buyMinusAll - 0.046) < 1e-12);
});

test('spreads are zero when a category has no samples', () => {
  const spreads = calculateSpreads([outcome('BUY', 0.05)], [1]);
  assert.equal(spreads[0].buyMinusAvoid, 0, 'no AVOID samples -> no comparison possible');
  assert.ok(Math.abs(spreads[0].buyMinusAll) < 1e-12);
});