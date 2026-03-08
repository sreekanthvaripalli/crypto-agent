import { EnhancedCoinAnalysis, AdvancedIndicators, IchimokuCloud, StochasticOscillator } from '../types';

/**
 * Calculate advanced technical indicators for enhanced analysis
 */
export class AdvancedIndicatorsCalculator {
  
  /**
   * Calculate Ichimoku Cloud indicators
   */
  calculateIchimokuCloud(candles: number[]): IchimokuCloud {
    if (candles.length < 52) {
      return this.getEmptyIchimoku();
    }

    // Standard Ichimoku periods
    const conversionPeriod = 9;
    const basePeriod = 26;
    const spanBPeriod = 52;

    // Calculate Conversion Line (Tenkan-sen)
    const conversionLine = this.calculateLine(candles, conversionPeriod);

    // Calculate Base Line (Kijun-sen)
    const baseLine = this.calculateLine(candles, basePeriod);

    // Calculate Leading Span A (Senkou Span A)
    const leadingSpanA = (conversionLine + baseLine) / 2;

    // Calculate Leading Span B (Senkou Span B)
    const leadingSpanB = this.calculateLine(candles, spanBPeriod);

    // Calculate Cloud boundaries
    const cloudTop = Math.max(leadingSpanA, leadingSpanB);
    const cloudBottom = Math.min(leadingSpanA, leadingSpanB);

    // Determine position relative to cloud
    const currentPrice = candles[candles.length - 1];
    const position = this.determineCloudPosition(currentPrice, cloudTop, cloudBottom);

    return {
      conversionLine,
      baseLine,
      leadingSpanA,
      leadingSpanB,
      laggingSpan: currentPrice, // Simplified - would need future projection
      cloudTop,
      cloudBottom,
      position
    };
  }

  /**
   * Calculate Average True Range (ATR)
   */
  calculateATR(candles: { high: number; low: number; close: number }[], period: number = 14): number {
    if (candles.length < period + 1) return 0;

    let trSum = 0;
    for (let i = 1; i <= period; i++) {
      const tr = this.calculateTrueRange(candles[i], candles[i - 1]);
      trSum += tr;
    }

    return trSum / period;
  }

  /**
   * Calculate Average Directional Index (ADX)
   */
  calculateADX(candles: { high: number; low: number; close: number }[], period: number = 14): number {
    if (candles.length < period + 1) return 0;

    const trValues: number[] = [];
    const plusDMValues: number[] = [];
    const minusDMValues: number[] = [];

    for (let i = 1; i < candles.length; i++) {
      const tr = this.calculateTrueRange(candles[i], candles[i - 1]);
      const plusDM = this.calculatePlusDM(candles[i], candles[i - 1]);
      const minusDM = this.calculateMinusDM(candles[i], candles[i - 1]);

      trValues.push(tr);
      plusDMValues.push(plusDM);
      minusDMValues.push(minusDM);
    }

    // Calculate smoothed values
    const smoothedTR = this.smoothValues(trValues, period);
    const smoothedPlusDM = this.smoothValues(plusDMValues, period);
    const smoothedMinusDM = this.smoothValues(minusDMValues, period);

    // Calculate DI+ and DI-
    const diPlus = (smoothedPlusDM / smoothedTR) * 100;
    const diMinus = (smoothedMinusDM / smoothedTR) * 100;

    // Calculate DX and ADX
    const dx = Math.abs(diPlus - diMinus) / (diPlus + diMinus) * 100;
    
    // Simple ADX calculation (would be smoothed in practice)
    return dx;
  }

  /**
   * Calculate Williams %R
   */
  calculateWilliamsR(candles: number[], period: number = 14): number {
    if (candles.length < period) return -50; // Neutral

    const recentCandles = candles.slice(-period);
    const highestHigh = Math.max(...recentCandles);
    const lowestLow = Math.min(...recentCandles);
    const currentClose = candles[candles.length - 1];

    if (highestHigh === lowestLow) return -50;

    return ((highestHigh - currentClose) / (highestHigh - lowestLow)) * -100;
  }

  /**
   * Calculate Commodity Channel Index (CCI)
   */
  calculateCCI(candles: number[], period: number = 14): number {
    if (candles.length < period) return 0;

    const recentCandles = candles.slice(-period);
    const typicalPrices = recentCandles.map(c => c); // Simplified - would use (H+L+C)/3
    const sma = typicalPrices.reduce((a, b) => a + b, 0) / period;
    const meanDeviation = this.calculateMeanDeviation(typicalPrices, sma);

    if (meanDeviation === 0) return 0;

    const currentTypicalPrice = typicalPrices[typicalPrices.length - 1];
    return (currentTypicalPrice - sma) / (0.015 * meanDeviation);
  }

  /**
   * Calculate Stochastic Oscillator
   */
  calculateStochasticOscillator(candles: { high: number; low: number; close: number }[], kPeriod: number = 14, dPeriod: number = 3): StochasticOscillator {
    if (candles.length < kPeriod) {
      return { k: 50, d: 50, signal: 50, position: 'neutral' };
    }

    const recentCandles = candles.slice(-kPeriod);
    const highestHigh = Math.max(...recentCandles.map(c => c.high));
    const lowestLow = Math.min(...recentCandles.map(c => c.low));
    const currentClose = candles[candles.length - 1].close;

    if (highestHigh === lowestLow) {
      return { k: 50, d: 50, signal: 50, position: 'neutral' };
    }

    const k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
    
    // Calculate D (moving average of K)
    const d = this.calculateSMA([k], dPeriod);
    
    // Calculate Signal line (moving average of D)
    const signal = this.calculateSMA([d], dPeriod);

    const position = this.determineStochasticPosition(k);

    return { k, d, signal, position };
  }

  /**
   * Calculate all advanced indicators for a coin
   */
  calculateAllAdvancedIndicators(coin: EnhancedCoinAnalysis): AdvancedIndicators {
    const closes = coin.coin.ohlcData.map(c => c.close);
    const candles = coin.coin.ohlcData;

    const advancedIndicators: AdvancedIndicators = {};

    // Ichimoku Cloud
    if (closes.length >= 52) {
      advancedIndicators.ichimoku = this.calculateIchimokuCloud(closes);
    }

    // ATR
    if (candles.length >= 15) {
      advancedIndicators.atr = this.calculateATR(candles);
    }

    // ADX
    if (candles.length >= 15) {
      advancedIndicators.adx = this.calculateADX(candles);
    }

    // Williams %R
    if (closes.length >= 14) {
      advancedIndicators.williamsR = this.calculateWilliamsR(closes);
    }

    // CCI
    if (closes.length >= 14) {
      advancedIndicators.cci = this.calculateCCI(closes);
    }

    // Stochastic Oscillator
    if (candles.length >= 14) {
      advancedIndicators.stochasticOscillator = this.calculateStochasticOscillator(candles);
    }

    return advancedIndicators;
  }

  // Helper methods

  private calculateLine(candles: number[], period: number): number {
    const recentCandles = candles.slice(-period);
    const highestHigh = Math.max(...recentCandles);
    const lowestLow = Math.min(...recentCandles);
    return (highestHigh + lowestLow) / 2;
  }

  private determineCloudPosition(price: number, cloudTop: number, cloudBottom: number): 'above_cloud' | 'below_cloud' | 'in_cloud' | 'cloud_transition' {
    if (price > cloudTop) return 'above_cloud';
    if (price < cloudBottom) return 'below_cloud';
    return 'in_cloud';
  }

  private calculateTrueRange(current: { high: number; low: number; close: number }, prev: { high: number; low: number; close: number }): number {
    const highLow = current.high - current.low;
    const highPrevClose = Math.abs(current.high - prev.close);
    const lowPrevClose = Math.abs(current.low - prev.close);
    return Math.max(highLow, highPrevClose, lowPrevClose);
  }

  private calculatePlusDM(current: { high: number; low: number }, prev: { high: number; low: number }): number {
    const upMove = current.high - prev.high;
    const downMove = prev.low - current.low;
    return upMove > downMove && upMove > 0 ? upMove : 0;
  }

  private calculateMinusDM(current: { high: number; low: number }, prev: { high: number; low: number }): number {
    const upMove = current.high - prev.high;
    const downMove = prev.low - current.low;
    return downMove > upMove && downMove > 0 ? downMove : 0;
  }

  private smoothValues(values: number[], period: number): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private calculateMeanDeviation(values: number[], mean: number): number {
    const deviations = values.map(val => Math.abs(val - mean));
    return deviations.reduce((sum, dev) => sum + dev, 0) / values.length;
  }

  private calculateSMA(values: number[], period: number): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private determineStochasticPosition(k: number): 'oversold' | 'overbought' | 'neutral' {
    if (k <= 20) return 'oversold';
    if (k >= 80) return 'overbought';
    return 'neutral';
  }

  private getEmptyIchimoku(): IchimokuCloud {
    return {
      conversionLine: 0,
      baseLine: 0,
      leadingSpanA: 0,
      leadingSpanB: 0,
      laggingSpan: 0,
      cloudTop: 0,
      cloudBottom: 0,
      position: 'in_cloud'
    };
  }
}