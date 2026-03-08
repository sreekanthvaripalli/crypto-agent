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
}

export interface MarketReport {
  generatedAt: Date;
  totalCoinsAnalyzed: number;
  buyList: EnhancedCoinAnalysis[];
  watchList: EnhancedCoinAnalysis[];
  avoidList: EnhancedCoinAnalysis[];
}
