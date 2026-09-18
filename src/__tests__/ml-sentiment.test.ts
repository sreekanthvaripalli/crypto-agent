import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MLSentimentAnalyzer } from '../analyzer/ml-sentiment';
import { NewsService, NewsArticle } from '../fetcher/news';
import { EnhancedCoinAnalysis } from '../types';

// Stub NewsService that serves canned articles without any network access
class StubNewsService extends NewsService {
  constructor(private articles: NewsArticle[]) {
    super();
  }
  override async getTrendingNews() {
    return { articles: this.articles, lastUpdated: new Date() };
  }
}

function coin(category: 'BUY' | 'AVOID' | 'WATCHLIST', score = 50): EnhancedCoinAnalysis {
  return {
    coin: {
      id: 'bitcoin',
      symbol: 'BTC',
      name: 'Bitcoin',
      currentPrice: 50000,
      marketCap: 1e12,
      volume24h: 1e10,
      priceChange1d: 0,
      priceChange7d: 0,
      priceChange24hPercent: 0,
      priceChange7dPercent: 0,
      ohlcData: [],
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
    category,
    signals: [],
    score,
  };
}

function article(title: string, description = ''): NewsArticle {
  return { title, description, url: '', publishedAt: new Date().toISOString() };
}

test('positive news on a BUY gives strong alignment and 0–1 confidence', async () => {
  const analyzer = new MLSentimentAnalyzer(
    new StubNewsService([article('Bitcoin surge continues as adoption grows')])
  );
  const result = await analyzer.analyzeSentimentWithML(coin('BUY'));
  assert.equal(result.newsSentiment, 'positive');
  assert.equal(result.alignment, 'strong');
  assert.ok(result.confidenceScore <= 1, `confidence must be 0–1, got ${result.confidenceScore}`);
  assert.ok(result.confidenceScore >= 0.5);
  assert.ok(result.coinName === 'Bitcoin');
});

test('negative news on a BUY is flagged as weak/conflicting', async () => {
  const analyzer = new MLSentimentAnalyzer(
    new StubNewsService([
      article('Bitcoin crash: exchange hacked, funds stolen in security breach')
    ])
  );
  const result = await analyzer.analyzeSentimentWithML(coin('BUY'));
  assert.equal(result.newsSentiment, 'negative');
  assert.notEqual(result.alignment, 'strong');
});

test('confidence stays within [0.5, 0.95] even with conflicting signals', async () => {
  const analyzer = new MLSentimentAnalyzer(
    new StubNewsService([article('Bitcoin rally'), article('Bitcoin crash')])
  );
  const result = await analyzer.analyzeSentimentWithML(coin('BUY', -50));
  assert.ok(result.confidenceScore >= 0.5 && result.confidenceScore <= 0.95);
});

test('no matching news returns a neutral result with 0.7 confidence', async () => {
  const analyzer = new MLSentimentAnalyzer(
    new StubNewsService([article('Ethereum upgrade announced')])
  );
  const result = await analyzer.analyzeSentimentWithML(coin('BUY'));
  assert.equal(result.newsSentiment, 'neutral');
  assert.equal(result.confidenceScore, 0.7);
  assert.equal(result.newsArticles, 0);
});
