import { NewsService } from '../fetcher/news';
import { CoinAnalysis } from '../types';

interface NewsValidationResult {
  coinId: string;
  coinName: string;
  recommendation: string;
  newsSentiment: 'positive' | 'negative' | 'neutral';
  alignment: 'strong' | 'moderate' | 'weak' | 'conflicting';
  confidenceScore: number;
  newsArticles: number;
  validationNotes: string[];
}

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
    const lowerText = text.toLowerCase();
    
    const positiveKeywords = [
      // Bullish indicators
      'moon', 'bull', 'surge', 'pump', 'breakout', 'rally',
      'buy', 'up', 'growth', 'gain', 'win', 'success',
      
      // Development & partnerships
      'launch', 'partnership', 'integration', 'adoption', 'upgrade',
      'listing', 'exchange', 'support', 'backed', 'investment',
      'funding', 'capital', 'vc', 'institutional',
      
      // Technical improvements
      'upgrade', 'improvement', 'enhancement', 'optimization',
      'scalability', 'speed', 'efficiency', 'innovation',
      
      // Market sentiment
      'demand', 'interest', 'popularity', 'trending', 'viral',
      'hype', 'buzz', 'excitement', 'optimism',
      
      // Adoption & utility
      'payment', 'merchant', 'ecommerce', 'real-world', 'utility',
      'use-case', 'application', 'product', 'service'
    ];
    
    const negativeKeywords = [
      // Bearish indicators
      'bear', 'dump', 'crash', 'plummet', 'sell-off', 'correction',
      'sell', 'down', 'loss', 'fail',
      
      // Security issues
      'hack', 'exploit', 'bug', 'vulnerability', 'security',
      'breach', 'theft', 'fraud', 'scam', 'phishing',
      
      // Regulatory issues
      'regulation', 'ban', 'prohibit', 'restrict', 'legal',
      'lawsuit', 'investigation', 'compliance', 'warning',
      
      // Technical problems
      'outage', 'downtime', 'error', 'failure', 'crash',
      'slow', 'lag', 'performance', 'issue', 'problem',
      
      // Market concerns
      'fud', 'fear', 'uncertainty', 'doubt', 'panic', 'concern',
      'risk', 'danger', 'warning', 'caution',
      
      // Team & governance issues
      'team', 'founder', 'ceo', 'leadership', 'management',
      'resign', 'quit', 'leave', 'scandal', 'controversy',
      
      // Geopolitical risks
      'war', 'conflict', 'tension', 'sanction', 'tariff',
      'trade war', 'geopolitical', 'invasion', 'military',
      'escalation', 'crisis', 'instability', 'turmoil',
      'embargo', 'blockade', 'political', 'election',
      'protest', 'unrest', 'strike', 'shutdown'
    ];
    
    if (positiveKeywords.some(word => lowerText.includes(word))) {
      return 'positive';
    } else if (negativeKeywords.some(word => lowerText.includes(word))) {
      return 'negative';
    }
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

  private calculateAlignment(recommendation: string, newsSentiment: string): 
    'strong' | 'moderate' | 'weak' | 'conflicting' {
    const recommendationMap: Record<string, string[]> = {
      'strong buy': ['positive'],
      'buy': ['positive', 'neutral'],
      'hold': ['neutral'],
      'sell': ['negative', 'neutral'],
      'strong sell': ['negative']
    };

    if (recommendationMap[recommendation]?.includes(newsSentiment)) {
      return 'strong';
    } else if (newsSentiment === 'neutral') {
      return 'moderate';
    } else if (recommendation === 'hold' && newsSentiment !== 'neutral') {
      return 'weak';
    }

    return 'conflicting';
  }

  private calculateConfidenceScore(
    analysis: any, 
    articles: any[], 
    newsSentiment: string
  ): number {
    const baseScore = analysis.confidenceScore || 0.7;
    const newsImpact = articles.length > 0 ? 0.2 : 0;
    const sentimentBonus = newsSentiment === 'neutral' ? 0 : 0.1;

    return Math.min(1, baseScore + newsImpact + sentimentBonus);
  }

  private generateValidationNotes(
    analysis: any, 
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

    notes.push(`Original recommendation confidence: ${(analysis.confidenceScore || 0.7) * 100}%`);
    notes.push(`Adjusted confidence with news context: ${this.calculateConfidenceScore(analysis, articles, newsSentiment) * 100}%`);

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