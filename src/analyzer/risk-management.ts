import { EnhancedCoinAnalysis, RiskMetrics, PortfolioImpact, OHLCCandle } from '../types';
import { ChandelierExit } from 'technicalindicators';

/**
 * Advanced risk management and portfolio analysis
 */
export class RiskManager {
  
  private readonly RISK_FREE_RATE = 0.02; // 2% annual risk-free rate
  private readonly CONFIDENCE_LEVEL = 1.645; // 95% confidence level for VaR

  /**
   * Calculate comprehensive risk metrics for a coin
   * @param marketCandles optional BTC (market proxy) candles for beta calculation
   */
  calculateRiskMetrics(coin: EnhancedCoinAnalysis, marketCandles?: OHLCCandle[]): RiskMetrics {
    const candles = coin.coin.ohlcData;

    // Coins with no/partial OHLC data (failed or rate-limited fetch) get
    // neutral metrics instead of crashing the whole run.
    if (candles.length < 2) {
      return {
        volatility: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        var95: 0,
        beta: 1,
        positionSize: 0,
        stopLossLevel: 0.05,
        takeProfitLevel: 0.1,
      };
    }

    const periodsPerYear = this.estimatePeriodsPerYear(candles);
    const returns = this.calculateReturns(candles);

    const volatility = this.calculateVolatility(returns, periodsPerYear);
    const maxDrawdown = this.calculateMaxDrawdown(candles);
    const sharpeRatio = this.calculateSharpeRatio(returns, periodsPerYear);
    const var95 = this.calculateVaR(returns, periodsPerYear);
    const beta =
      marketCandles && marketCandles.length >= 3
        ? this.calculateBeta(candles, marketCandles)
        : 1.0;

    // Position sizing using Kelly Criterion
    const positionSize = this.calculatePositionSize(coin, sharpeRatio, volatility);

    // Stop loss / take profit levels (daily-scale + ATR-based — NOT annualized;
    // annualized vol would produce absurd >100% stops)
    const dailyVolatility = this.calculateDailyVolatility(returns, periodsPerYear);
    const stopLossLevel = this.calculateStopLoss(coin, dailyVolatility);
    const takeProfitLevel = this.calculateTakeProfit(coin, dailyVolatility);
    const trailingStopLevel = this.calculateTrailingStop(coin);

    return {
      volatility,
      maxDrawdown,
      sharpeRatio,
      var95,
      beta,
      positionSize,
      stopLossLevel,
      takeProfitLevel,
      trailingStopLevel: trailingStopLevel ?? undefined
    };
  }

  /**
   * Calculate portfolio impact metrics
   */
  calculatePortfolioImpact(coin: EnhancedCoinAnalysis, portfolioCoins: EnhancedCoinAnalysis[]): PortfolioImpact {
    const portfolioReturns = this.getPortfolioReturns(portfolioCoins);
    const coinReturns = this.calculateReturns(coin.coin.ohlcData);

    const correlationWithPortfolio = this.calculateCorrelation(coinReturns, portfolioReturns);
    const diversificationScore = this.calculateDiversificationScore(correlationWithPortfolio);
    const riskContribution = this.calculateRiskContribution(coin, portfolioCoins);
    const expectedReturn = this.calculateExpectedReturn(coin);
    const optimalWeight = this.calculateOptimalWeight(coin, portfolioCoins);

    return {
      correlationWithPortfolio,
      diversificationScore,
      riskContribution,
      expectedReturn,
      optimalWeight
    };
  }

  /**
   * Calculate portfolio-level risk analysis
   */
  calculatePortfolioAnalysis(coins: EnhancedCoinAnalysis[]): any {
    if (coins.length === 0) {
      return {
        totalValue: 0,
        diversificationScore: 0,
        overallRisk: 'medium' as const,
        expectedReturn: 0,
        recommendedRebalancing: [] as string[],
        riskMetrics: { portfolioVolatility: 0, maxDrawdown: 0, sharpeRatio: 0 },
      };
    }

    const totalValue = coins.reduce((sum, coin) => sum + coin.coin.marketCap, 0);
    const diversificationScore = this.calculatePortfolioDiversification(coins);
    const overallRisk = this.determineOverallRisk(coins);
    const expectedReturn = this.calculatePortfolioExpectedReturn(coins);

    // Portfolio risk metrics (weighted per-period return series)
    const portfolioReturns = this.getPortfolioReturns(coins);
    const sampleCandles = coins.find((c) => c.coin.ohlcData.length >= 2)?.coin.ohlcData;
    const periodsPerYear = sampleCandles ? this.estimatePeriodsPerYear(sampleCandles) : 365;
    const portfolioVolatility = this.calculateVolatility(portfolioReturns, periodsPerYear);
    const portfolioMaxDrawdown = this.calculatePortfolioMaxDrawdown(portfolioReturns);
    const portfolioSharpeRatio = this.calculatePortfolioSharpeRatio(portfolioReturns, periodsPerYear);

    return {
      totalValue,
      diversificationScore,
      overallRisk,
      expectedReturn,
      recommendedRebalancing: this.getRebalancingRecommendations(coins),
      riskMetrics: {
        portfolioVolatility,
        maxDrawdown: portfolioMaxDrawdown,
        sharpeRatio: portfolioSharpeRatio
      }
    };
  }

  // Risk calculation methods

  private calculateReturns(candles: OHLCCandle[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const prevClose = candles[i - 1].close;
      if (prevClose === 0) continue; // guard against division by zero
      returns.push((candles[i].close - prevClose) / prevClose);
    }
    return returns;
  }

  /**
   * Estimate the number of return periods per year from candle timestamps
   * (CoinGecko returns 4-hourly candles for 7-30 day windows).
   */
  private estimatePeriodsPerYear(candles: OHLCCandle[]): number {
    if (candles.length < 2) return 365; // assume daily data
    const diffs: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const d = candles[i].timestamp - candles[i - 1].timestamp;
      if (d > 0) diffs.push(d);
    }
    if (diffs.length === 0) return 365;
    diffs.sort((a, b) => a - b);
    const medianMs = diffs[Math.floor(diffs.length / 2)];
    const msPerYear = 365 * 24 * 60 * 60 * 1000;
    return Math.max(1, Math.round(msPerYear / medianMs));
  }

  /**
   * Annualized volatility from per-period returns.
   */
  private calculateVolatility(returns: number[], periodsPerYear: number): number {
    if (returns.length === 0) return 0;

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;

    return Math.sqrt(variance) * Math.sqrt(periodsPerYear);
  }

  /**
   * Daily volatility from per-period returns (periodsPerYear/365 periods per day).
   * Used for stop-loss sizing — stops must be on a daily time scale.
   */
  private calculateDailyVolatility(returns: number[], periodsPerYear: number): number {
    const periodsPerDay = Math.max(1, periodsPerYear / 365);
    return this.calculateVolatility(returns, periodsPerDay);
  }

  private calculateMaxDrawdown(candles: OHLCCandle[]): number {
    if (candles.length === 0) return 0;
    let maxDrawdown = 0;
    let peak = candles[0].close;

    for (const candle of candles) {
      if (candle.close > peak) {
        peak = candle.close;
      }
      if (peak > 0) {
        const drawdown = (peak - candle.close) / peak;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
      }
    }

    return maxDrawdown;
  }

  /**
   * Annualized Sharpe ratio: (annualized return − risk-free rate) / annualized volatility.
   */
  private calculateSharpeRatio(returns: number[], periodsPerYear: number): number {
    if (returns.length === 0) return 0;

    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const annualizedReturn = meanReturn * periodsPerYear;
    const annualizedVol = this.calculateVolatility(returns, periodsPerYear);

    if (annualizedVol === 0) return 0;
    return (annualizedReturn - this.RISK_FREE_RATE) / annualizedVol;
  }

  /**
   * Parametric daily VaR at 95% confidence: z-score × daily volatility.
   * Returns a positive fraction (0.05 = 5% expected worst daily loss).
   */
  private calculateVaR(returns: number[], periodsPerYear: number): number {
    if (returns.length === 0) return 0;

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const perPeriodVol = Math.sqrt(variance);
    const dailyVol = perPeriodVol * Math.sqrt(periodsPerYear / 365);

    return this.CONFIDENCE_LEVEL * dailyVol;
  }

  /**
   * Beta vs a market proxy (e.g. BTC): cov(coin, market) / var(market).
   * Return series are aligned by truncating to the common shortest length.
   */
  private calculateBeta(coinCandles: OHLCCandle[], marketCandles: OHLCCandle[]): number {
    const n = Math.min(coinCandles.length, marketCandles.length);
    if (n < 3) return 1.0;

    const coinReturns = this.calculateReturns(coinCandles.slice(-n));
    const marketReturns = this.calculateReturns(marketCandles.slice(-n));
    if (coinReturns.length < 2 || coinReturns.length !== marketReturns.length) return 1.0;

    const m = coinReturns.length;
    const meanCoin = coinReturns.reduce((s, r) => s + r, 0) / m;
    const meanMarket = marketReturns.reduce((s, r) => s + r, 0) / m;

    let covariance = 0;
    let marketVariance = 0;
    for (let i = 0; i < m; i++) {
      covariance += (coinReturns[i] - meanCoin) * (marketReturns[i] - meanMarket);
      marketVariance += Math.pow(marketReturns[i] - meanMarket, 2);
    }

    return marketVariance === 0 ? 1.0 : covariance / marketVariance;
  }

  private calculatePositionSize(coin: EnhancedCoinAnalysis, _sharpeRatio: number, _volatility: number): number {
    // Kelly Criterion: f = (bp - q) / b
    // Where b = odds received, p = probability of winning, q = probability of losing
    
    const winProbability = Math.max(0.5, (coin.score + 100) / 200); // Normalize score to probability
    const lossProbability = 1 - winProbability;
    const odds = 1.0; // 1:1 odds assumption
    
    const kellyFraction = (odds * winProbability - lossProbability) / odds;

    // No edge -> no position (never force a minimum on negative edge)
    if (kellyFraction <= 0) return 0;

    // Risk-adjusted position size
    const riskAdjustedSize = Math.min(kellyFraction * 0.5, 0.1); // Max 10% position

    return Math.max(riskAdjustedSize, 0.01); // Minimum 1% for positive edge
  }

  /**
   * Dynamic stop-loss as a fraction below entry price:
   * - ATR-based when available: 2× ATR distance from entry (standard
   *   volatility stop — matches the documented behavior)
   * - otherwise 2× DAILY volatility (annualized vol gives absurd >100% stops)
   * - widened for weak technical signals (low/negative score)
   * - clamped to a sane 5%–50% band
   */
  private calculateStopLoss(coin: EnhancedCoinAnalysis, dailyVolatility: number): number {
    const price = coin.coin.currentPrice;
    const atr = coin.advancedIndicators?.atr;

    let stopPercent: number;
    if (atr && atr > 0 && price > 0) {
      // ATR-multiple stop: 2× ATR below entry
      stopPercent = (2 * atr) / price;
    } else {
      // 2× daily volatility fallback
      stopPercent = 2 * dailyVolatility;
    }

    // Weak signals -> wider stop; strong signals -> tighter
    stopPercent *= 1 - coin.score / 200;

    return Math.min(0.5, Math.max(0.05, stopPercent)); // clamp to 5%–50%
  }

  /**
   * Take-profit at a 2:1 risk-reward ratio above the stop distance.
   */
  private calculateTakeProfit(coin: EnhancedCoinAnalysis, dailyVolatility: number): number {
    return this.calculateStopLoss(coin, dailyVolatility) * 2;
  }

  /**
   * Chandelier-exit style trailing stop: (highest high − 3 × ATR) expressed
   * as a fraction below the current price. Rises with the trend, falls never —
   * use it to protect gains once a position is in profit.
   * Returns null when there is not enough candle history.
   */
  private calculateTrailingStop(coin: EnhancedCoinAnalysis): number | null {
    const candles = coin.coin.ohlcData;
    const period = 22;
    if (candles.length < period + 1) return null;

    try {
      // NOTE: the package's .d.ts declares number[] but the runtime returns
      // objects { exitLong, exitShort } — hence the cast.
      const exits = ChandelierExit.calculate({
        high: candles.map((c) => c.high),
        low: candles.map((c) => c.low),
        close: candles.map((c) => c.close),
        period,
        multiplier: 3,
      }) as unknown as { exitLong: number; exitShort: number }[];

      const last = exits[exits.length - 1];
      const price = coin.coin.currentPrice;
      if (!last || !Number.isFinite(last.exitLong) || price <= 0) return null;

      const level = (price - last.exitLong) / price;
      if (!Number.isFinite(level)) return null;
      if (level <= 0) return 0; // price already below the trailing stop
      return Math.min(level, 0.5);
    } catch {
      return null;
    }
  }

  private calculateCorrelation(returns1: number[], returns2: number[]): number {
    if (returns1.length < 3 || returns2.length < 3) return 0;

    // Align series by truncating to the common shortest length
    const n = Math.min(returns1.length, returns2.length);
    const r1 = returns1.slice(-n);
    const r2 = returns2.slice(-n);

    const mean1 = r1.reduce((sum, r) => sum + r, 0) / n;
    const mean2 = r2.reduce((sum, r) => sum + r, 0) / n;

    let numerator = 0;
    let sumSq1 = 0;
    let sumSq2 = 0;

    for (let i = 0; i < n; i++) {
      const diff1 = r1[i] - mean1;
      const diff2 = r2[i] - mean2;

      numerator += diff1 * diff2;
      sumSq1 += diff1 * diff1;
      sumSq2 += diff2 * diff2;
    }

    const denominator = Math.sqrt(sumSq1 * sumSq2);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  private calculateDiversificationScore(correlation: number): number {
    // Higher diversification score for lower correlation
    return Math.max(0, 1 - Math.abs(correlation));
  }

  private calculateRiskContribution(coin: EnhancedCoinAnalysis, portfolioCoins: EnhancedCoinAnalysis[]): number {
    // Simplified risk contribution calculation
    const coinWeight = coin.coin.marketCap / portfolioCoins.reduce((sum, c) => sum + c.coin.marketCap, 0);
    return coinWeight * coin.coin.priceChange7dPercent / 100;
  }

  private calculateExpectedReturn(coin: EnhancedCoinAnalysis): number {
    // Expected return based on technical score and momentum
    const momentumFactor = coin.coin.priceChange7dPercent / 100;
    const scoreFactor = coin.score / 100;
    
    return (momentumFactor + scoreFactor) / 2;
  }

  private calculateOptimalWeight(coin: EnhancedCoinAnalysis, portfolioCoins: EnhancedCoinAnalysis[]): number {
    // Simplified optimal weight calculation
    const expectedReturn = this.calculateExpectedReturn(coin);
    const riskContribution = this.calculateRiskContribution(coin, portfolioCoins);
    
    return Math.max(0, expectedReturn - riskContribution);
  }

  private getPortfolioReturns(portfolioCoins: EnhancedCoinAnalysis[]): number[] {
    // Weighted per-period portfolio return series. Coins are weighted by
    // market cap; return series are aligned by truncating to the common
    // shortest length so periods line up across coins.
    const withData = portfolioCoins.filter((c) => c.coin.ohlcData.length >= 2);
    if (withData.length === 0) return [];

    const minLength = Math.min(...withData.map((c) => c.coin.ohlcData.length - 1));
    const totalValue = withData.reduce((sum, coin) => sum + coin.coin.marketCap, 0) || 1;

    const portfolio: number[] = new Array(minLength).fill(0);
    for (const coin of withData) {
      const returns = this.calculateReturns(coin.coin.ohlcData).slice(-minLength);
      const weight = coin.coin.marketCap / totalValue;
      for (let i = 0; i < minLength; i++) {
        portfolio[i] += returns[i] * weight;
      }
    }

    return portfolio;
  }

  private calculatePortfolioDiversification(coins: EnhancedCoinAnalysis[]): number {
    // Calculate average correlation between coins
    let totalCorrelation = 0;
    let correlationCount = 0;

    for (let i = 0; i < coins.length; i++) {
      for (let j = i + 1; j < coins.length; j++) {
        const returns1 = this.calculateReturns(coins[i].coin.ohlcData);
        const returns2 = this.calculateReturns(coins[j].coin.ohlcData);
        const correlation = this.calculateCorrelation(returns1, returns2);
        totalCorrelation += correlation;
        correlationCount++;
      }
    }

    const avgCorrelation = correlationCount > 0 ? totalCorrelation / correlationCount : 0;
    return Math.max(0, 1 - Math.abs(avgCorrelation));
  }

  private determineOverallRisk(coins: EnhancedCoinAnalysis[]): 'low' | 'medium' | 'high' {
    if (coins.length === 0) return 'medium';
    const avgVolatility = coins.reduce((sum, coin) => sum + (coin.riskMetrics?.volatility || 0), 0) / coins.length;
    
    if (avgVolatility < 0.5) return 'low';
    if (avgVolatility < 1.0) return 'medium';
    return 'high';
  }

  private calculatePortfolioExpectedReturn(coins: EnhancedCoinAnalysis[]): number {
    const totalValue = coins.reduce((sum, coin) => sum + coin.coin.marketCap, 0);
    
    return coins.reduce((sum, coin) => {
      const weight = coin.coin.marketCap / totalValue;
      const expectedReturn = this.calculateExpectedReturn(coin);
      return sum + (weight * expectedReturn);
    }, 0);
  }

  private calculatePortfolioMaxDrawdown(portfolioReturns: number[]): number {
    // Max drawdown from the cumulative weighted return series
    if (portfolioReturns.length === 0) return 0;
    let equity = 1;
    let peak = 1;
    let maxDrawdown = 0;
    for (const r of portfolioReturns) {
      equity *= 1 + r;
      peak = Math.max(peak, equity);
      if (peak > 0) {
        maxDrawdown = Math.max(maxDrawdown, (peak - equity) / peak);
      }
    }
    return maxDrawdown;
  }

  private calculatePortfolioSharpeRatio(portfolioReturns: number[], periodsPerYear: number): number {
    if (portfolioReturns.length === 0) return 0;
    const meanReturn = portfolioReturns.reduce((sum, r) => sum + r, 0) / portfolioReturns.length;
    const annualizedReturn = meanReturn * periodsPerYear;
    const annualizedVol = this.calculateVolatility(portfolioReturns, periodsPerYear);
    if (annualizedVol === 0) return 0;
    return (annualizedReturn - this.RISK_FREE_RATE) / annualizedVol;
  }

  private getRebalancingRecommendations(coins: EnhancedCoinAnalysis[]): string[] {
    const recommendations: string[] = [];
    
    for (const coin of coins) {
      if (coin.riskMetrics?.volatility && coin.riskMetrics.volatility > 1.5) {
        recommendations.push(`${coin.coin.symbol}: Consider reducing position due to high volatility`);
      }
      
      if (coin.riskMetrics?.maxDrawdown && coin.riskMetrics.maxDrawdown > 0.5) {
        recommendations.push(`${coin.coin.symbol}: Consider reducing position due to high drawdown`);
      }
      
      if (coin.score < -50) {
        recommendations.push(`${coin.coin.symbol}: Consider exiting position`);
      }
    }
    
    return recommendations;
  }
}