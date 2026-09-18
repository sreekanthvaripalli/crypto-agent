import { NewsService } from '../fetcher/news';
import { CoinAnalysis, NewsValidationResult, SignalCategory } from '../types';
import { POSITIVE_KEYWORDS, NEGATIVE_KEYWORDS, countKeywordMatches } from './sentiment-keywords';

export class NewsValidator {
  public newsService: NewsService;

  constructor() {
    this.newsService = new NewsService();
  }

  async validateAnalysis(analysis: CoinAnalysis): Promise<NewsValidationResult> {
    const news = await this.newsService.getTrendingNews();
    const coinNews = news.articles.filter(
      article => article.title.toLowerCase().includes(analysis.coin.name.toLowerCase())
    );

    const newsSentiment = this.determineOverallSentiment(coinNews);
    const alignment = this.calculateAlignment(analysis.category, newsSentiment);
    const confidenceScore = this.calculateConfidenceScore(analysis, coinNews, newsSentiment);
    const validationNotes = this.generateValidationNotes(analysis, coinNews, newsSentiment);

    return {
      coinId: analysis.coin.id,
      coinName: analysis.coin.name,
      recommendation: analysis.category,
      newsSentiment,
      alignment,
      confidenceScore,
      newsArticles: coinNews.length,
      validationNotes
    };
  }

  private analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
    // Shared word-boundary keyword scoring (single source of truth)
    const lowerText = text.toLowerCase();

    const positiveMatches = countKeywordMatches(lowerText, POSITIVE_KEYWORDS);
    const negativeMatches = countKeywordMatches(lowerText, NEGATIVE_KEYWORDS);

    if (positiveMatches > negativeMatches) return 'positive';
    if (negativeMatches > positiveMatches) return 'negative';
    return 'neutral';
  }

  private determineOverallSentiment(articles: any[]): 'positive' | 'negative' | 'neutral' {
    if (articles.length === 0) return 'neutral';

    const sentimentCounts: { positive: number; negative: number; neutral: number } = {
      positive: 0,
      negative: 0,
      neutral: 0
    };

    articles.forEach(article => {
      const title = article.title || '';
      const description = article.description || '';
      const combinedText = `${title} ${description}`;
      
      const sentiment = this.analyzeSentiment(combinedText);
      sentimentCounts[sentiment]++;
    });

    if (sentimentCounts.positive > sentimentCounts.negative && 
        sentimentCounts.positive > sentimentCounts.neutral) {
      return 'positive';
    } else if (sentimentCounts.negative > sentimentCounts.positive && 
               sentimentCounts.negative > sentimentCounts.neutral) {
      return 'negative';
    }

    return 'neutral';
  }

  private calculateAlignment(recommendation: SignalCategory, newsSentiment: string):
    'strong' | 'moderate' | 'weak' | 'conflicting' {
    // Fully aligned: the technical call matches the news sentiment direction
    const aligned: Record<SignalCategory, string[]> = {
      BUY: ['positive'],
      WATCHLIST: ['neutral'],
      AVOID: ['negative'],
    };

    // Partially aligned: no contradiction, but not a direct match
    const partiallyAligned: Record<SignalCategory, string[]> = {
      BUY: ['neutral'],
      WATCHLIST: ['positive', 'negative'],
      AVOID: ['neutral'],
    };

    if (aligned[recommendation]?.includes(newsSentiment)) {
      return 'strong';
    }
    if (partiallyAligned[recommendation]?.includes(newsSentiment)) {
      return 'moderate';
    }
    return 'conflicting';
  }

  /**
   * Base confidence derived from technical signal strength (score ±100).
   */
  private baseConfidence(analysis: CoinAnalysis): number {
    return 0.6 + Math.min(0.2, Math.abs(analysis.score) / 250);
  }

  private calculateConfidenceScore(
    analysis: CoinAnalysis,
    articles: any[],
    newsSentiment: string
  ): number {
    const baseScore = this.baseConfidence(analysis);
    const newsImpact = articles.length > 0 ? 0.2 : 0;
    const sentimentBonus = newsSentiment === 'neutral' ? 0 : 0.1;

    return Math.min(1, baseScore + newsImpact + sentimentBonus);
  }

  private generateValidationNotes(
    analysis: CoinAnalysis,
    articles: any[],
    newsSentiment: string
  ): string[] {
    const notes: string[] = [];

    if (articles.length === 0) {
      notes.push('No recent news articles found for this cryptocurrency.');
    } else {
      notes.push(`${articles.length} recent news articles analyzed.`);
      notes.push(`Overall news sentiment: ${newsSentiment}`);
    }

    notes.push(`Original recommendation confidence: ${Math.round(this.baseConfidence(analysis) * 100)}%`);
    notes.push(`Adjusted confidence with news context: ${Math.round(this.calculateConfidenceScore(analysis, articles, newsSentiment) * 100)}%`);

    return notes;
  }

  async getDetailedNewsAnalysis(coinId: string): Promise<any> {
    const [trendingNews, coinSpecificNews] = await Promise.all([
      this.newsService.getTrendingNews(),
      this.newsService.getNewsForCoin(coinId)
    ]);

    const relevantArticles = [
      ...trendingNews.articles.filter(article => 
        article.title.toLowerCase().includes(coinId.toLowerCase())
      ),
      ...coinSpecificNews
    ];

    const sentimentAnalysis = relevantArticles.reduce((acc, article) => {
      if (article.sentiment) {
        acc[article.sentiment]++;
      } else {
        acc.neutral++;
      }
      return acc;
    }, { positive: 0, negative: 0, neutral: 0 });

    return {
      totalArticles: relevantArticles.length,
      sentimentAnalysis,
      articles: relevantArticles.slice(0, 10),
      overallSentiment: this.determineOverallSentiment(relevantArticles)
    };
  }
}