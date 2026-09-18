import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RiskManager } from '../analyzer/risk-management';
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
      high: close * 1.01,
      low: close * 0.98,
      close,
    });
  }
  return out;
}

function coin(candles: OHLCCandle[], score = 0): EnhancedCoinAnalysis {
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
    category: 'BUY',
    signals: [],
    score,
  };
}

const rm = new RiskManager();

test('does NOT crash on empty OHLC data (regression: candles[0] undefined)', () => {
  const metrics = rm.calculateRiskMetrics(coin([]));
  assert.equal(metrics.volatility, 0);
  assert.equal(metrics.maxDrawdown, 0);
  assert.equal(metrics.sharpeRatio, 0);
  assert.equal(metrics.var95, 0);
  assert.equal(metrics.positionSize, 0);
});

test('Sharpe ratio is time-correct (annualized return / annualized vol)', () => {
  // Constant positive drift => positive sharpe
  const metrics = rm.calculateRiskMetrics(coin(makeCandles(180, (i) => 100 * Math.pow(1.001, i))));
  assert.ok(metrics.sharpeRatio > 0, `sharpe should be positive, got ${metrics.sharpeRatio}`);
  // Sanity: a constant 0.1% per-4h drift annualized far exceeds the 2% risk-free rate
  assert.ok(metrics.sharpeRatio > 1);
});

test('VaR is daily-scaled, not annualized', () => {
  const metrics = rm.calculateRiskMetrics(coin(makeCandles(180, (i) => 100 + Math.sin(i) * 5)));
  // 4-hourly candles => daily vol ≈ per-period vol × 2 (6 periods/day → sqrt(6) ≈ 2.45)
  // Annualized vol must be strictly larger than daily VaR/1.645 for 4h candles
  assert.ok(metrics.var95 > 0);
  assert.ok(
    metrics.volatility > metrics.var95 / 1.645,
    'annualized vol must exceed daily vol for sub-daily candles'
  );
});

function seriesFromReturns(returns: number[], start = 100): OHLCCandle[] {
  const out: OHLCCandle[] = [];
  let price = start;
  for (let i = 0; i <= returns.length; i++) {
    const close = price;
    out.push({
      timestamp: 1_700_000_000_000 + i * 4 * 60 * 60 * 1000,
      open: close * 0.99,
      high: close * 1.01,
      low: close * 0.98,
      close,
    });
    if (i < returns.length) price = price * (1 + returns[i]);
  }
  return out;
}

test('Beta vs a market proxy reflects covariance ratio', () => {
  // Market with genuine variance; coin return series built as exact multiples
  const marketReturns: number[] = [];
  for (let i = 0; i < 179; i++) {
    marketReturns.push(0.001 * (1 + Math.sin(i / 7) * 0.5));
  }
  const market = seriesFromReturns(marketReturns);

  const same = seriesFromReturns(marketReturns, 200); // identical returns → β = 1
  const betaSame = rm.calculateRiskMetrics(coin(same), market).beta;
  assert.ok(Math.abs(betaSame - 1) < 1e-6, `beta of identical returns should be 1, got ${betaSame}`);

  const doubled = seriesFromReturns(marketReturns.map((r) => r * 2), 300); // 2× returns → β = 2
  const betaDouble = rm.calculateRiskMetrics(coin(doubled), market).beta;
  assert.ok(Math.abs(betaDouble - 2) < 1e-6, `beta should be 2, got ${betaDouble}`);
});

test('Kelly position size is 0 for a strongly bearish coin', () => {
  const candles = makeCandles(180, (i) => 100 - i * 0.1);
  const metrics = rm.calculateRiskMetrics(coin(candles, -100));
  assert.equal(metrics.positionSize, 0);
});

test('Kelly position size is capped at 10% for a strongly bullish coin', () => {
  const candles = makeCandles(180, (i) => 100 + i * 0.1);
  const metrics = rm.calculateRiskMetrics(coin(candles, 100));
  assert.ok(metrics.positionSize > 0 && metrics.positionSize <= 0.1);
});

test('Max drawdown matches the actual worst decline', () => {
  const candles = makeCandles(5, () => 0).map((c, i) => ({
    ...c,
    close: [100, 120, 60, 90, 110][i],
  }));
  const metrics = rm.calculateRiskMetrics(coin(candles));
  // peak 120 → trough 60 → drawdown = 50%
  assert.ok(Math.abs(metrics.maxDrawdown - 0.5) < 1e-9, `got ${metrics.maxDrawdown}`);
});

test('portfolio analysis works and includes risk metrics', () => {
  const coins = [
    coin(makeCandles(180, (i) => 100 + i * 0.1), 50),
    coin(makeCandles(180, (i) => 100 - i * 0.05), -20),
  ];
  (coins[0].coin as { id: string }).id = 'aaa';
  (coins[1].coin as { id: string }).id = 'bbb';
  const result = rm.calculatePortfolioAnalysis(coins) as {
    totalValue: number;
    diversificationScore: number;
    overallRisk: string;
    riskMetrics: { portfolioVolatility: number; maxDrawdown: number; sharpeRatio: number };
  };
  assert.equal(result.totalValue, 2e9);
  assert.ok(Number.isFinite(result.riskMetrics.portfolioVolatility));
  assert.ok(Number.isFinite(result.riskMetrics.maxDrawdown));
  assert.ok(['low', 'medium', 'high'].includes(result.overallRisk));
});

test('portfolio analysis returns zeros for an empty list', () => {
  const result = rm.calculatePortfolioAnalysis([]) as { totalValue: number; overallRisk: string };
  assert.equal(result.totalValue, 0);
  assert.equal(result.overallRisk, 'medium');
});
