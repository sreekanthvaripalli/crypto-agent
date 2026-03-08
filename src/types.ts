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
  recommendation: string;
  newsSentiment: 'positive' | 'negative' | 'neutral';
  alignment: 'strong' | 'moderate' | 'weak' | 'conflicting';
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
  volatility: number;
  maxDrawdown: number;
  sharpeRatio: number;
  var95: number;
  beta: number;
  positionSize: number;
  stopLossLevel: number;
  takeProfitLevel: number;
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
