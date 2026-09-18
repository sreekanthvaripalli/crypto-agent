import axios from 'axios';
import { quickSentiment } from '../analyzer/sentiment-keywords';

export interface NewsArticle {
  title: string;
  description: string;
  url: string;
  publishedAt: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
}

export interface CryptoNews {
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
    // Shared word-boundary keyword scoring (single source of truth)
    const result = quickSentiment(text);
    return result === 1 ? 'positive' : result === -1 ? 'negative' : 'neutral';
  }

  async getNewsForCoin(coinId: string): Promise<NewsArticle[]> {
    try {
      // CoinGecko status updates are project announcements/updates — much
      // closer to news than /tickers, which only contains exchange pair data.
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/coins/${coinId}/status_updates`,
        { params: { per_page: 5 } }
      );
      const updates = response.data as any[];
      if (!Array.isArray(updates)) return [];

      return updates.map((update: any) => ({
        title: update.title || update.project?.name || 'Project update',
        description: update.description || '',
        url: update.project?.web_url || `https://www.coingecko.com/en/coins/${coinId}`,
        publishedAt: update.created_at || new Date().toISOString(),
        sentiment: this.analyzeSentiment(`${update.title || ''} ${update.description || ''}`)
      }));
    } catch (error) {
      console.error('Error fetching news for coin:', error);
      return [];
    }
  }
}