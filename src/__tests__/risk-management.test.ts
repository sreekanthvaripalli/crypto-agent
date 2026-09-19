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

test('stop-loss is ATR-based when ATR is available (2× ATR below entry)', () => {
  const base = coin(makeCandles(180, (i) => 100 + Math.sin(i / 5) * 3));
  const withAtr: EnhancedCoinAnalysis = { ...base, advancedIndicators: { atr: 6 } };
  const metrics = rm.calculateRiskMetrics(withAtr);
  const expected = Math.min(0.5, Math.max(0.05, (2 * 6) / base.coin.currentPrice));
  assert.ok(
    Math.abs(metrics.stopLossLevel - expected) < 1e-9,
    `expected ATR stop ${expected}, got ${metrics.stopLossLevel}`
  );
  assert.ok(Math.abs(metrics.takeProfitLevel - 2 * expected) < 1e-9);
});

test('stop-loss falls back to daily volatility and stays within the 5%–50% band', () => {
  const metrics = rm.calculateRiskMetrics(coin(makeCandles(180, (i) => 100 + Math.sin(i / 5) * 3)));
  // Regression guard for the old bug: the stop used 2× ANNUALIZED volatility,
  // which produced absurd >100% stops on real crypto data.
  assert.ok(metrics.stopLossLevel <= 0.5, `stop must be <= 50%, got ${metrics.stopLossLevel}`);
  assert.ok(metrics.stopLossLevel >= 0.05, `stop must be >= 5%, got ${metrics.stopLossLevel}`);
  assert.equal(metrics.takeProfitLevel, metrics.stopLossLevel * 2);
});

test('higher volatility widens the stop-loss (and respects the 50% ceiling)', () => {
  // Series built from explicit per-period returns so the unclamped stop
  // distances land inside the 5%–50% band (low-vol series clamp to the floor).
  const mk = (amp: number) =>
    seriesFromReturns(Array.from({ length: 179 }, (_, i) => amp * Math.sin(i / 3)));
  const calmStop = rm.calculateRiskMetrics(coin(mk(0.001))).stopLossLevel;
  const wildStop = rm.calculateRiskMetrics(coin(mk(0.03))).stopLossLevel;
  const extremeStop = rm.calculateRiskMetrics(coin(mk(0.10))).stopLossLevel;
  const cappedStop = rm.calculateRiskMetrics(coin(mk(0.15))).stopLossLevel;
  assert.equal(calmStop, 0.05); // calm series hits the 5% floor
  assert.ok(wildStop > calmStop && wildStop < 0.5, `wild stop out of band: ${wildStop}`);
  assert.ok(extremeStop > wildStop, `extreme ${extremeStop} should exceed wild ${wildStop}`);
  assert.equal(cappedStop, 0.5); // extreme series hits the 50% ceiling
});

test('bullish coins get tighter stops than bearish ones (confidence adjustment)', () => {
  // Base stop ≈ 17% so the ×0.6 / ×1.4 score adjustment isn't swallowed by the floor
  const candles = seriesFromReturns(
    Array.from({ length: 179 }, (_, i) => 0.05 * Math.sin(i / 3))
  );
  const bull = rm.calculateRiskMetrics(coin(candles, 80)).stopLossLevel;
  const bear = rm.calculateRiskMetrics(coin(candles, -80)).stopLossLevel;
  assert.ok(bull < bear, `bull stop ${bull} should be tighter than bear stop ${bear}`);
  assert.ok(bull >= 0.05 && bear <= 0.5);
});

test('trailing stop level is bounded when history is sufficient', () => {
  const candles = makeCandles(180, (i) => 100 * Math.pow(1.001, i));
  const metrics = rm.calculateRiskMetrics(coin(candles));
  assert.ok(metrics.trailingStopLevel !== undefined);
  assert.ok(metrics.trailingStopLevel! >= 0 && metrics.trailingStopLevel! <= 0.5);
});

test('trailing stop is absent without enough history', () => {
  const metrics = rm.calculateRiskMetrics(coin(makeCandles(20, (i) => 100 + i * 0.1)));
  assert.equal(metrics.trailingStopLevel, undefined);
});

test('take-profit maintains the 2:1 risk-reward ratio', () => {
  const metrics = rm.calculateRiskMetrics(coin(makeCandles(180, (i) => 100 + Math.sin(i / 5) * 3)));
  assert.ok(Math.abs(metrics.takeProfitLevel - 2 * metrics.stopLossLevel) < 1e-12);
});
