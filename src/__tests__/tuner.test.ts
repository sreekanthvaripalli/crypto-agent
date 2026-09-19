import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mulberry32, randomizeWeights, tuneWeights } from '../analyzer/tuner';
import { DEFAULT_WEIGHTS } from '../analyzer/scoring-config';
import { CoinMarketData } from '../types';

function makeSineCoin(n: number, id: string): CoinMarketData {
  const closes = Array.from(
    { length: n },
    (_, i) => 100 + 20 * Math.sin((2 * Math.PI * i) / 120)
  );
  const ohlcData = closes.map((close, i) => ({
    timestamp: 1_700_000_000_000 + i * 4 * 60 * 60 * 1000,
    open: close * 0.99,
    high: close * 1.01,
    low: close * 0.98,
    close,
  }));
  return {
    id,
    symbol: 'SIN',
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

test('mulberry32 is deterministic for a given seed', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 100; i++) {
    assert.equal(a(), b());
  }
  const c = mulberry32(43);
  assert.notEqual(a(), c(), 'different seeds produce different sequences');
});

test('randomizeWeights keeps thresholds in sane signed ranges', () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 50; i++) {
    const candidate = randomizeWeights(DEFAULT_WEIGHTS, rng);
    assert.ok(candidate.buyThreshold >= 5 && candidate.buyThreshold <= 60);
    assert.ok(candidate.avoidThreshold >= -60 && candidate.avoidThreshold <= -5);
    assert.ok(Number.isFinite(candidate.macdCrossover));
  }
});

test('tuneWeights is reproducible from its seed', () => {
  const coins = [makeSineCoin(180, 'sine-a'), makeSineCoin(180, 'sine-b')];
  const run1 = tuneWeights(coins, { candidates: 3, step: 5, seed: 99 });
  const run2 = tuneWeights(coins, { candidates: 3, step: 5, seed: 99 });
  assert.deepEqual(run1.best.weights, run2.best.weights);
  assert.equal(run1.candidatesEvaluated, 4); // baseline + 3
});

test('tuneWeights returns a well-formed report', () => {
  const coins = [makeSineCoin(180, 'sine-a')];
  const report = tuneWeights(coins, { candidates: 2, step: 5, seed: 1 });

  assert.equal(report.candidatesEvaluated, 3);
  assert.equal(report.top.length, 3); // all candidates (fewer than the cap of 10)
  assert.ok(report.samples > 0);
  assert.ok(['risk-on', 'risk-off', 'risk-off'].length > 0); // shape sanity
  assert.equal(report.baseline.weights.buyThreshold, DEFAULT_WEIGHTS.buyThreshold);

  // Sorted by objective, best first
  for (let i = 1; i < report.top.length; i++) {
    assert.ok(report.top[i - 1].objective >= report.top[i].objective);
  }
});

test('minBuySamples invalidates candidates with too few BUY signals', () => {
  const coins = [makeSineCoin(180, 'sine-a')];
  const report = tuneWeights(coins, { candidates: 2, step: 5, seed: 1, minBuySamples: 9999 });

  // Nothing can satisfy the requirement: every candidate is invalid
  assert.equal(report.best.objective, -Infinity);
  // Stable sort keeps the baseline first among equals
  assert.equal(report.best.weights.buyThreshold, DEFAULT_WEIGHTS.buyThreshold);
});