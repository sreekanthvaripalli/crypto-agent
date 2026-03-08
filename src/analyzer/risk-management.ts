import { EnhancedCoinAnalysis, RiskMetrics, PortfolioImpact } from '../types';

/**
 * Advanced risk management and portfolio analysis
 */
export class RiskManager {
  
  private readonly RISK_FREE_RATE = 0.02; // 2% annual risk-free rate
  private readonly CONFIDENCE_LEVEL = 1.645; // 95% confidence level for VaR

  /**
   * Calculate comprehensive risk metrics for a coin
   */
  calculateRiskMetrics(coin: EnhancedCoinAnalysis): RiskMetrics {
    const returns = this.calculateReturns(coin.coin.ohlcData);
    
    const volatility = this.calculateVolatility(returns);
    const maxDrawdown = this.calculateMaxDrawdown(coin.coin.ohlcData);
    const sharpeRatio = this.calculateSharpeRatio(returns, volatility);
    const var95 = this.calculateVaR(returns, volatility);
    const beta = this.calculateBeta(coin.coin.ohlcData); // Simplified calculation

    // Position sizing using Kelly Criterion
    const positionSize = this.calculatePositionSize(coin, sharpeRatio, volatility);

    // Stop loss and take profit levels
    const stopLossLevel = this.calculateStopLoss(coin, volatility);
    const takeProfitLevel = this.calculateTakeProfit(coin, volatility);

    return {
      volatility,
      maxDrawdown,
      sharpeRatio,
      var95,
      beta,
      positionSize,
      stopLossLevel,
      takeProfitLevel
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
    const totalValue = coins.reduce((sum, coin) => sum + coin.coin.marketCap, 0);
    const diversificationScore = this.calculatePortfolioDiversification(coins);
    const overallRisk = this.determineOverallRisk(coins);
    const expectedReturn = this.calculatePortfolioExpectedReturn(coins);

    // Portfolio risk metrics
    const portfolioReturns = this.getPortfolioReturns(coins);
    const portfolioVolatility = this.calculatePortfolioVolatility(coins, portfolioReturns);
    const portfolioMaxDrawdown = this.calculatePortfolioMaxDrawdown(coins);
    const portfolioSharpeRatio = this.calculatePortfolioSharpeRatio(portfolioReturns, portfolioVolatility);

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

  private calculateReturns(candles: any[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const returnPct = (candles[i].close - candles[i - 1].close) / candles[i - 1].close;
      returns.push(returnPct);
    }
    return returns;
  }

  private calculateVolatility(returns: number[]): number {
    if (returns.length === 0) return 0;
    
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    
    // Annualized volatility (assuming daily returns)
    return Math.sqrt(variance) * Math.sqrt(365);
  }

  private calculateMaxDrawdown(candles: any[]): number {
    let maxDrawdown = 0;
    let peak = candles[0].close;

    for (const candle of candles) {
      if (candle.close > peak) {
        peak = candle.close;
      }
      const drawdown = (peak - candle.close) / peak;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }

    return maxDrawdown;
  }

  private calculateSharpeRatio(returns: number[], volatility: number): number {
    if (volatility === 0) return 0;
    
    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const excessReturn = meanReturn - (this.RISK_FREE_RATE / 365); // Daily risk-free rate
    
    return excessReturn / volatility;
  }

  private calculateVaR(returns: number[], volatility: number): number {
    // Parametric VaR at 95% confidence
    return this.CONFIDENCE_LEVEL * volatility;
  }

  private calculateBeta(coinCandles: any[]): number {
    // Simplified beta calculation against a market proxy
    // In practice, this would compare against a market index
    return 1.0; // Placeholder
  }

  private calculatePositionSize(coin: EnhancedCoinAnalysis, sharpeRatio: number, volatility: number): number {
    // Kelly Criterion: f = (bp - q) / b
    // Where b = odds received, p = probability of winning, q = probability of losing
    
    const winProbability = Math.max(0.5, (coin.score + 100) / 200); // Normalize score to probability
    const lossProbability = 1 - winProbability;
    const odds = 1.0; // 1:1 odds assumption
    
    const kellyFraction = (odds * winProbability - lossProbability) / odds;
    
    // Risk-adjusted position size
    const riskAdjustedSize = Math.min(kellyFraction * 0.5, 0.1); // Max 10% position
    
    return Math.max(riskAdjustedSize, 0.01); // Minimum 1%
  }

  private calculateStopLoss(coin: EnhancedCoinAnalysis, volatility: number): number {
    // Dynamic stop loss based on volatility and risk tolerance
    const baseStopLoss = volatility * 2; // 2x volatility
    const riskAdjustedStopLoss = baseStopLoss * (1 - coin.score / 200); // Adjust based on confidence
    
    return Math.max(riskAdjustedStopLoss, 0.05); // Minimum 5% stop loss
  }

  private calculateTakeProfit(coin: EnhancedCoinAnalysis, volatility: number): number {
    // Risk-reward ratio of 2:1
    const stopLoss = this.calculateStopLoss(coin, volatility);
    return stopLoss * 2;
  }

  private calculateCorrelation(returns1: number[], returns2: number[]): number {
    if (returns1.length !== returns2.length || returns1.length === 0) return 0;

    const n = returns1.length;
    const mean1 = returns1.reduce((sum, r) => sum + r, 0) / n;
    const mean2 = returns2.reduce((sum, r) => sum + r, 0) / n;

    let numerator = 0;
    let sumSq1 = 0;
    let sumSq2 = 0;

    for (let i = 0; i < n; i++) {
      const diff1 = returns1[i] - mean1;
      const diff2 = returns2[i] - mean2;
      
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
    // Calculate weighted portfolio returns
    const totalValue = portfolioCoins.reduce((sum, coin) => sum + coin.coin.marketCap, 0);
    
    // Simplified portfolio return calculation
    return portfolioCoins.map(coin => {
      const weight = coin.coin.marketCap / totalValue;
      return coin.coin.priceChange7dPercent / 100 * weight;
    });
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

  private calculatePortfolioVolatility(coins: EnhancedCoinAnalysis[], portfolioReturns: number[]): number {
    // Simplified portfolio volatility calculation
    return this.calculateVolatility(portfolioReturns);
  }

  private calculatePortfolioMaxDrawdown(coins: EnhancedCoinAnalysis[]): number {
    // Simplified portfolio max drawdown
    return Math.max(...coins.map(coin => coin.riskMetrics?.maxDrawdown || 0));
  }

  private calculatePortfolioSharpeRatio(portfolioReturns: number[], portfolioVolatility: number): number {
    const meanReturn = portfolioReturns.reduce((sum, r) => sum + r, 0) / portfolioReturns.length;
    const excessReturn = meanReturn - (this.RISK_FREE_RATE / 365);
    
    return portfolioVolatility === 0 ? 0 : excessReturn / portfolioVolatility;
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