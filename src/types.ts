export interface CoinMarketData {
  id: string;
  symbol: string;
  name: string;
  currentPrice: number;
  marketCap: number;
  volume24h: number;
  priceChange1d: number;
  priceChange7d: number;
  priceChange24hPercent: number;
  priceChange7dPercent: number;
  ohlcData: OHLCCandle[];
  /** Traded volume per candle (aligned 1:1 with ohlcData), when available */
  candleVolumes?: number[];
  /** Data provider source */
  dataProvider?: 'coingecko' | 'binance';
}

export interface OHLCCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface TechnicalIndicators {
  rsi: number | null;
  macd: {
    macdLine: number | null;
    signalLine: number | null;
    histogram: number | null;
    crossover: 'bullish' | 'bearish' | 'neutral';
  };
  ema7: number | null;
  ema14: number | null;
  emaTrend: 'uptrend' | 'downtrend' | 'neutral';
  bollingerBands: {
    upper: number | null;
    middle: number | null;
    lower: number | null;
    position: 'above_upper' | 'below_lower' | 'middle' | 'unknown';
  };
  volumeSpike: boolean;
  volumeChangePercent: number;
  /** Money Flow Index (0-100), only when per-candle volume is available */
  mfi?: number | null;
  /** true when volumeSpike was computed from real traded volume, not the price-range proxy */
  volumeIsReal?: boolean;
}

export type SignalCategory = 'BUY' | 'WATCHLIST' | 'AVOID';

export interface CoinAnalysis {
  coin: CoinMarketData;
  indicators: TechnicalIndicators;
  category: SignalCategory;
  signals: string[];
  score: number; // -100 to +100
}

export interface NewsValidationResult {
  coinId: string;
  coinName: string;
  recommendation: SignalCategory;
  newsSentiment: 'positive' | 'negative' | 'neutral';
  alignment: 'strong' | 'moderate' | 'weak' | 'conflicting';
  /** 0–1 scale (0.6 = 60%). Producers must normalize to this range. */
  confidenceScore: number;
  newsArticles: number;
  validationNotes: string[];
}

export interface EnhancedCoinAnalysis extends CoinAnalysis {
  newsValidation?: NewsValidationResult;
  advancedIndicators?: AdvancedIndicators;
  riskMetrics?: RiskMetrics;
  portfolioImpact?: PortfolioImpact;
}

export interface AdvancedIndicators {
  ichimoku?: IchimokuCloud;
  atr?: number;
  adx?: number;
  williamsR?: number;
  cci?: number;
  stochasticOscillator?: StochasticOscillator;
}

export interface IchimokuCloud {
  conversionLine: number;
  baseLine: number;
  leadingSpanA: number;
  leadingSpanB: number;
  laggingSpan: number;
  cloudTop: number;
  cloudBottom: number;
  position: 'above_cloud' | 'below_cloud' | 'in_cloud' | 'cloud_transition';
}

export interface StochasticOscillator {
  k: number;
  d: number;
  signal: number;
  position: 'oversold' | 'overbought' | 'neutral';
}

export interface RiskMetrics {
  volatility: number;      // annualized
  maxDrawdown: number;     // fraction of peak (0.5 = 50%)
  sharpeRatio: number;     // annualized
  var95: number;           // daily VaR at 95% (fraction, e.g. 0.06 = 6%)
  beta: number;            // vs BTC market proxy (1.0 fallback)
  positionSize: number;    // fraction of capital (Kelly-derived)
  stopLossLevel: number;   // fraction below entry (0.08 = -8% stop)
  takeProfitLevel: number; // fraction above entry (2:1 risk-reward)
  /** Chandelier-exit style trailing stop below current price (fraction) */
  trailingStopLevel?: number;
}

export interface PortfolioImpact {
  correlationWithPortfolio: number;
  diversificationScore: number;
  riskContribution: number;
  expectedReturn: number;
  optimalWeight: number;
}

export interface MarketReport {
  generatedAt: Date;
  totalCoinsAnalyzed: number;
  buyList: EnhancedCoinAnalysis[];
  watchList: EnhancedCoinAnalysis[];
  avoidList: EnhancedCoinAnalysis[];
  portfolioAnalysis?: PortfolioAnalysis;
  /** BTC-driven market regime assessment (when BTC data is available) */
  marketRegime?: MarketRegime;
}

export interface MarketRegime {
  /** risk-off demotes BUY signals to WATCHLIST */
  regime: 'risk-on' | 'neutral' | 'risk-off';
  /** % distance of BTC close from its EMA20 (negative = below trend) */
  btcTrendPct: number;
  demoteBuys: boolean;
  /** how many BUY signals were demoted */
  demotedCount: number;
}

export interface PortfolioAnalysis {
  totalValue: number;
  diversificationScore: number;
  overallRisk: 'low' | 'medium' | 'high';
  expectedReturn: number;
  recommendedRebalancing: string[];
  riskMetrics: {
    portfolioVolatility: number;
    maxDrawdown: number;
    sharpeRatio: number;
  };
}

// ─── Backtesting ─────────────────────────────────────────────────────────────

export interface BacktestOutcome {
  coinId: string;
  symbol: string;
  /** Candle timestamp at which the signal was generated */
  timestamp: number;
  category: SignalCategory;
  score: number;
  /** Forward return per horizon key (e.g. "1d", "7d"), as a fraction */
  forwardReturns: Record<string, number>;
  /** Worst return-to-low within the longest horizon (negative fraction) */
  maxAdverseExcursion: number;
  /** Best return-to-high within the longest horizon (positive fraction) */
  maxFavorableExcursion: number;
}

export interface HorizonStats {
  horizon: string;
  samples: number;
  /** Share of samples with a positive forward return */
  hitRate: number;
  avgReturn: number;
  medianReturn: number;
  /** mean / std of forward returns (per-signal information ratio) */
  signalIr: number;
}

export interface BacktestCategoryStats {
  category: SignalCategory;
  samples: number;
  avgMaxAdverseExcursion: number;
  avgMaxFavorableExcursion: number;
  horizons: HorizonStats[];
}

export interface BacktestSpread {
  horizon: string;
  /** avgReturn(BUY) − avgReturn(AVOID); positive means the ranking works */
  buyMinusAvoid: number;
  /** avgReturn(BUY) − avgReturn(all samples); the edge over picking at random */
  buyMinusAll: number;
}

export interface BacktestReport {
  generatedAt: Date;
  coinsAnalyzed: number;
  coinsSkipped: number;
  samples: number;
  /** 4-hourly candles => 6 per day */
  candlesPerDay: number;
  warmupCandles: number;
  horizonsInDays: number[];
  stats: BacktestCategoryStats[];
  spreads: BacktestSpread[];
  /** Raw per-signal outcomes (only when explicitly requested) */
  outcomes?: BacktestOutcome[];
}
