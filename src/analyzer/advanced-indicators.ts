import { EnhancedCoinAnalysis, AdvancedIndicators, IchimokuCloud, StochasticOscillator, OHLCCandle } from '../types';

/**
 * Calculate advanced technical indicators for enhanced analysis
 */
export class AdvancedIndicatorsCalculator {
  
  /**
   * Calculate Ichimoku Cloud indicators using candle highs/lows (standard periods).
   * Requires at least 52 candles for Senkou Span B.
   */
  calculateIchimokuCloud(candles: OHLCCandle[]): IchimokuCloud {
    if (candles.length < 52) {
      return this.getEmptyIchimoku();
    }

    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const closes = candles.map((c) => c.close);

    // Standard Ichimoku periods
    const conversionPeriod = 9;
    const basePeriod = 26;
    const spanBPeriod = 52;

    // Conversion Line (Tenkan-sen) and Base Line (Kijun-sen)
    const conversionLine = this.periodMidpoint(highs, lows, conversionPeriod);
    const baseLine = this.periodMidpoint(highs, lows, basePeriod);

    // Leading Span A (Senkou Span A) = (conversion + base) / 2
    const leadingSpanA = (conversionLine + baseLine) / 2;

    // Leading Span B (Senkou Span B) = midpoint of the last 52 periods
    const leadingSpanB = this.periodMidpoint(highs, lows, spanBPeriod);

    // Cloud boundaries
    const cloudTop = Math.max(leadingSpanA, leadingSpanB);
    const cloudBottom = Math.min(leadingSpanA, leadingSpanB);

    // Lagging Span (Chikou): current close plotted 26 periods back
    const laggingSpan = closes[Math.max(0, closes.length - 1 - 26)];

    // Position relative to cloud
    const currentPrice = closes[closes.length - 1];
    const position = this.determineCloudPosition(currentPrice, cloudTop, cloudBottom);

    return {
      conversionLine,
      baseLine,
      leadingSpanA,
      leadingSpanB,
      laggingSpan,
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
   * Calculate Average Directional Index (ADX) with Wilder smoothing.
   * ADX = Wilder MA of DX over `period`; needs ~2×period candles.
   */
  calculateADX(candles: OHLCCandle[], period: number = 14): number {
    if (candles.length < period * 2) return 0;

    const trValues: number[] = [];
    const plusDMValues: number[] = [];
    const minusDMValues: number[] = [];

    for (let i = 1; i < candles.length; i++) {
      trValues.push(this.calculateTrueRange(candles[i], candles[i - 1]));
      plusDMValues.push(this.calculatePlusDM(candles[i], candles[i - 1]));
      minusDMValues.push(this.calculateMinusDM(candles[i], candles[i - 1]));
    }

    // Wilder smoothing: first value = simple sum, then recursive smoothing
    const wilderSmooth = (values: number[]): number[] => {
      const out: number[] = [];
      let prev = values.slice(0, period).reduce((s, v) => s + v, 0);
      out.push(prev);
      for (let i = period; i < values.length; i++) {
        prev = prev - prev / period + values[i];
        out.push(prev);
      }
      return out;
    };

    const smoothedTR = wilderSmooth(trValues);
    const smoothedPlusDM = wilderSmooth(plusDMValues);
    const smoothedMinusDM = wilderSmooth(minusDMValues);

    // DX series
    const dx: number[] = [];
    for (let i = 0; i < smoothedTR.length; i++) {
      if (smoothedTR[i] === 0) {
        dx.push(0);
        continue;
      }
      const diPlus = (smoothedPlusDM[i] / smoothedTR[i]) * 100;
      const diMinus = (smoothedMinusDM[i] / smoothedTR[i]) * 100;
      const sum = diPlus + diMinus;
      dx.push(sum === 0 ? 0 : (Math.abs(diPlus - diMinus) / sum) * 100);
    }

    if (dx.length < period) return dx.length > 0 ? dx[dx.length - 1] : 0;

    // ADX = Wilder MA of DX
    let adx = dx.slice(0, period).reduce((s, v) => s + v, 0) / period;
    for (let i = period; i < dx.length; i++) {
      adx = (adx * (period - 1) + dx[i]) / period;
    }

    return adx;
  }

  /**
   * Calculate Williams %R using candle highs/lows.
   */
  calculateWilliamsR(candles: OHLCCandle[], period: number = 14): number {
    if (candles.length < period) return -50; // Neutral

    const recentCandles = candles.slice(-period);
    const highestHigh = Math.max(...recentCandles.map((c) => c.high));
    const lowestLow = Math.min(...recentCandles.map((c) => c.low));
    const currentClose = recentCandles[recentCandles.length - 1].close;

    if (highestHigh === lowestLow) return -50;

    return ((highestHigh - currentClose) / (highestHigh - lowestLow)) * -100;
  }

  /**
   * Calculate Commodity Channel Index (CCI) using typical price (H+L+C)/3.
   */
  calculateCCI(candles: OHLCCandle[], period: number = 14): number {
    if (candles.length < period) return 0;

    const recentCandles = candles.slice(-period);
    const typicalPrices = recentCandles.map((c) => (c.high + c.low + c.close) / 3);
    const sma = typicalPrices.reduce((a, b) => a + b, 0) / period;
    const meanDeviation = this.calculateMeanDeviation(typicalPrices, sma);

    if (meanDeviation === 0) return 0;

    const currentTypicalPrice = typicalPrices[typicalPrices.length - 1];
    return (currentTypicalPrice - sma) / (0.015 * meanDeviation);
  }

  /**
   * Calculate Stochastic Oscillator with a real %K series,
   * %D = SMA(%K, dPeriod) and signal = SMA(%D, dPeriod).
   */
  calculateStochasticOscillator(candles: OHLCCandle[], kPeriod: number = 14, dPeriod: number = 3): StochasticOscillator {
    if (candles.length < kPeriod + dPeriod) {
      return { k: 50, d: 50, signal: 50, position: 'neutral' };
    }

    // %K series across the whole window
    const kSeries: number[] = [];
    for (let i = kPeriod - 1; i < candles.length; i++) {
      const window = candles.slice(i - kPeriod + 1, i + 1);
      const highestHigh = Math.max(...window.map((c) => c.high));
      const lowestLow = Math.min(...window.map((c) => c.low));
      const close = candles[i].close;
      kSeries.push(
        highestHigh === lowestLow ? 50 : ((close - lowestLow) / (highestHigh - lowestLow)) * 100
      );
    }

    const dSeries = this.rollingSMA(kSeries, dPeriod);
    const signalSeries = this.rollingSMA(dSeries, dPeriod);

    const k = kSeries[kSeries.length - 1];
    const d = dSeries[dSeries.length - 1] ?? k;
    const signal = signalSeries[signalSeries.length - 1] ?? d;
    const position = this.determineStochasticPosition(k);

    return { k, d, signal, position };
  }

  /**
   * Calculate all advanced indicators for a coin
   */
  calculateAllAdvancedIndicators(coin: EnhancedCoinAnalysis): AdvancedIndicators {
    const candles = coin.coin.ohlcData;

    const advancedIndicators: AdvancedIndicators = {};

    // Ichimoku Cloud (needs 52 candles — satisfied by 30-day 4-hourly data)
    if (candles.length >= 52) {
      advancedIndicators.ichimoku = this.calculateIchimokuCloud(candles);
    }

    // ATR
    if (candles.length >= 15) {
      advancedIndicators.atr = this.calculateATR(candles);
    }

    // ADX (needs ~2× period candles for Wilder smoothing)
    if (candles.length >= 28) {
      advancedIndicators.adx = this.calculateADX(candles);
    }

    // Williams %R
    if (candles.length >= 14) {
      advancedIndicators.williamsR = this.calculateWilliamsR(candles);
    }

    // CCI
    if (candles.length >= 14) {
      advancedIndicators.cci = this.calculateCCI(candles);
    }

    // Stochastic Oscillator
    if (candles.length >= 17) {
      advancedIndicators.stochasticOscillator = this.calculateStochasticOscillator(candles);
    }

    return advancedIndicators;
  }

  // Helper methods

  /**
   * Midpoint of the highest high and lowest low over the last `period` candles.
   */
  private periodMidpoint(highs: number[], lows: number[], period: number): number {
    const recentHighs = highs.slice(-period);
    const recentLows = lows.slice(-period);
    return (Math.max(...recentHighs) + Math.min(...recentLows)) / 2;
  }

  private rollingSMA(values: number[], period: number): number[] {
    const out: number[] = [];
    for (let i = period - 1; i < values.length; i++) {
      const window = values.slice(i - period + 1, i + 1);
      out.push(window.reduce((s, v) => s + v, 0) / period);
    }
    return out;
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

  private calculateMeanDeviation(values: number[], mean: number): number {
    const deviations = values.map(val => Math.abs(val - mean));
    return deviations.reduce((sum, dev) => sum + dev, 0) / values.length;
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