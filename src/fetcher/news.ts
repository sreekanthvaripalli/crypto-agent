import axios from 'axios';

interface NewsArticle {
  title: string;
  description: string;
  url: string;
  publishedAt: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
}

interface CryptoNews {
  articles: NewsArticle[];
  lastUpdated: Date;
}

export class NewsService {
  private readonly API_URL = 'https://api.coingecko.com/api/v3/search/trending';
  private readonly NEWS_CACHE_TIME = 5 * 60 * 1000; // 5 minutes

  private cache: CryptoNews | null = null;
  private lastFetchTime = 0;

  async getTrendingNews(): Promise<CryptoNews> {
    const now = Date.now();
    
    // Return cached data if it's still fresh
    if (this.cache && now - this.lastFetchTime < this.NEWS_CACHE_TIME) {
      return this.cache;
    }

    try {
      const response = await axios.get(this.API_URL);
      const trendingData = response.data as any;

      const articles: NewsArticle[] = trendingData.coins.map((coin: any) => ({
        title: coin.item.name,
        description: coin.item.content?.title || 'Trending cryptocurrency',
        url: `https://www.coingecko.com/en/coins/${coin.item.slug}`,
        publishedAt: new Date().toISOString(),
        sentiment: this.analyzeSentiment(coin.item.content?.title || '')
      }));

      this.cache = {
        articles,
        lastUpdated: new Date()
      };
      this.lastFetchTime = now;

      return this.cache;
    } catch (error) {
      console.error('Error fetching crypto news:', error);
      return {
        articles: [],
        lastUpdated: new Date()
      };
    }
  }

  private analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
    const positiveKeywords = ['moon', 'bull', 'surge', 'pump', 'breakout', 'rally'];
    const negativeKeywords = ['bear', 'dump', 'crash', 'plummet', 'sell-off', 'correction'];

    const lowerText = text.toLowerCase();

    if (positiveKeywords.some(word => lowerText.includes(word))) {
      return 'positive';
    } else if (negativeKeywords.some(word => lowerText.includes(word))) {
      return 'negative';
    }

    return 'neutral';
  }

  async getNewsForCoin(coinId: string): Promise<NewsArticle[]> {
    try {
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/coins/${coinId}/tickers`
      );
      const tickersData = response.data as any;

      return tickersData.tickers.slice(0, 5).map((ticker: any) => ({
        title: ticker.base,
        description: ticker.target + ' ' + ticker.last,
        url: ticker.target_url,
        publishedAt: ticker.last_traded_at,
        sentiment: this.analyzeSentiment(ticker.base)
      }));
    } catch (error) {
      console.error('Error fetching news for coin:', error);
      return [];
    }
  }
}