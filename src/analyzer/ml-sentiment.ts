import { EnhancedCoinAnalysis, NewsValidationResult } from '../types';
import { NewsService } from '../fetcher/news';
import {
  POSITIVE_KEYWORDS,
  NEGATIVE_KEYWORDS,
  POSITIVE_CONTEXT_PATTERNS,
  NEGATIVE_CONTEXT_PATTERNS,
  countKeywordMatches,
} from './sentiment-keywords';

/**
 * Ensemble sentiment analysis: keyword scoring, TF-IDF weighting, and
 * context-pattern recognition combined into a single confidence-adjusted
 * result. Keyword lists are shared via ./sentiment-keywords.
 */
export class MLSentimentAnalyzer {
  private newsService: NewsService;

  constructor(newsService: NewsService) {
    this.newsService = newsService;
  }

  /**
   * Analyze sentiment using ML-enhanced approach
   */
  async analyzeSentimentWithML(coin: EnhancedCoinAnalysis): Promise<NewsValidationResult> {
    const news = await this.newsService.getTrendingNews();
    const coinNews = news.articles.filter(
      article => article.title.toLowerCase().includes(coin.coin.name.toLowerCase())
    );

    if (coinNews.length === 0) {
      return this.createNeutralResult(coin);
    }

    // Calculate sentiment scores using multiple methods
    const keywordScore = this.calculateKeywordSentiment(coinNews);
    const tfidfScore = this.calculateTFIDFSentiment(coinNews);
    const contextScore = this.calculateContextSentiment(coinNews);
    
    // Weighted ensemble approach
    const finalScore = this.calculateEnsembleScore(keywordScore, tfidfScore, contextScore);
    
    const sentiment = this.determineSentiment(finalScore);
    const alignment = this.calculateAlignment(coin.category, sentiment);
    const confidenceScore = this.calculateConfidenceScore(coin, finalScore, coinNews.length);

    return {
      coinId: coin.coin.id,
      coinName: coin.coin.name,
      recommendation: coin.category,
      newsSentiment: sentiment,
      alignment,
      confidenceScore,
      newsArticles: coinNews.length,
      validationNotes: this.generateValidationNotes(coinNews, finalScore, sentiment)
    };
  }

  /**
   * Calculate keyword-based sentiment
   */
  private calculateKeywordSentiment(articles: any[]): number {
    let positiveScore = 0;
    let negativeScore = 0;

    for (const article of articles) {
      const text = `${article.title} ${article.description || ''}`.toLowerCase();

      // Word-boundary matching avoids false positives ("up" inside "upgrade")
      positiveScore += countKeywordMatches(text, POSITIVE_KEYWORDS);
      negativeScore += countKeywordMatches(text, NEGATIVE_KEYWORDS);
    }

    const totalKeywords = positiveScore + negativeScore;
    if (totalKeywords === 0) return 0;

    return (positiveScore - negativeScore) / totalKeywords;
  }

  /**
   * Calculate TF-IDF based sentiment (exact token matching, no substrings)
   */
  private calculateTFIDFSentiment(articles: any[]): number {
    const positiveSet = new Set(POSITIVE_KEYWORDS);
    const negativeSet = new Set(NEGATIVE_KEYWORDS);

    // Tokenize documents (strip punctuation so "crash." matches "crash")
    const docTokens: string[][] = [];
    for (const article of articles) {
      const text = `${article.title} ${article.description || ''}`.toLowerCase();
      const words = text
        .split(/\s+/)
        .map((w) => w.replace(/[^a-z0-9-]/g, ''))
        .filter(Boolean);
      docTokens.push(words);
    }

    if (docTokens.length === 0) return 0;

    let sentimentScore = 0;

    for (const tokens of docTokens) {
      if (tokens.length === 0) continue;
      let articleScore = 0;

      // Count term occurrences once per document
      const termCounts = new Map<string, number>();
      for (const word of tokens) {
        termCounts.set(word, (termCounts.get(word) ?? 0) + 1);
      }

      for (const [term, count] of termCounts) {
        const tf = count / tokens.length;
        const docsContainingTerm = docTokens.filter((doc) => doc.includes(term)).length;
        const idf = docsContainingTerm === 0 ? 0 : Math.log(docTokens.length / docsContainingTerm);
        const tfidf = tf * idf;

        if (positiveSet.has(term)) {
          articleScore += tfidf;
        } else if (negativeSet.has(term)) {
          articleScore -= tfidf;
        }
      }

      sentimentScore += articleScore;
    }

    return sentimentScore / docTokens.length;
  }

  /**
   * Calculate context-based sentiment using phrase patterns
   */
  private calculateContextSentiment(articles: any[]): number {
    let contextScore = 0;
    let totalPhrases = 0;

    const positivePatterns = POSITIVE_CONTEXT_PATTERNS;

    const negativePatterns = NEGATIVE_CONTEXT_PATTERNS;

    for (const article of articles) {
      const text = `${article.title} ${article.description || ''}`;
      
      // Check positive patterns
      for (const pattern of positivePatterns) {
        if (pattern.test(text)) {
          contextScore += 1;
          totalPhrases++;
        }
      }
      
      // Check negative patterns
      for (const pattern of negativePatterns) {
        if (pattern.test(text)) {
          contextScore -= 1;
          totalPhrases++;
        }
      }
    }

    return totalPhrases === 0 ? 0 : contextScore / totalPhrases;
  }

  /**
   * Calculate ensemble score from multiple sentiment methods
   */
  private calculateEnsembleScore(keywordScore: number, tfidfScore: number, contextScore: number): number {
    // Weighted average with higher weight on TF-IDF and context
    const weights = { keyword: 0.3, tfidf: 0.4, context: 0.3 };
    
    return (keywordScore * weights.keyword) + 
           (tfidfScore * weights.tfidf) + 
           (contextScore * weights.context);
  }

  /**
   * Determine sentiment from score
   */
  private determineSentiment(score: number): 'positive' | 'negative' | 'neutral' {
    if (score > 0.1) return 'positive';
    if (score < -0.1) return 'negative';
    return 'neutral';
  }

  /**
   * Calculate alignment between technical and news sentiment
   */
  private calculateAlignment(category: string, sentiment: 'positive' | 'negative' | 'neutral'): 'strong' | 'moderate' | 'weak' | 'conflicting' {
    if (category === 'BUY') {
      if (sentiment === 'positive') return 'strong';
      if (sentiment === 'neutral') return 'moderate';
      return 'weak';
    } else if (category === 'AVOID') {
      if (sentiment === 'negative') return 'strong';
      if (sentiment === 'neutral') return 'moderate';
      return 'weak';
    } else {
      return 'moderate';
    }
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidenceScore(coin: EnhancedCoinAnalysis, sentimentScore: number, articleCount: number): number {
    // Confidence is normalized to a 0–1 scale (0.7 = 70%)
    let baseConfidence = 0.7;

    // Adjust based on sentiment alignment
    if (coin.category === 'BUY' && sentimentScore > 0.1) {
      baseConfidence += 0.2;
    } else if (coin.category === 'AVOID' && sentimentScore < -0.1) {
      baseConfidence += 0.2;
    } else if (Math.abs(sentimentScore) < 0.1) {
      baseConfidence += 0.1; // Neutral sentiment adds some confidence
    } else {
      baseConfidence -= 0.1; // Conflicting signals reduce confidence
    }

    // Adjust based on article count (more articles = higher confidence)
    if (articleCount >= 5) {
      baseConfidence += 0.05;
    } else if (articleCount === 0) {
      baseConfidence -= 0.1;
    }

    return Math.max(0.5, Math.min(0.95, baseConfidence));
  }

  /**
   * Generate validation notes
   */
  private generateValidationNotes(articles: any[], sentimentScore: number, sentiment: string): string[] {
    const notes: string[] = [];
    
    notes.push(`Sentiment Score: ${sentimentScore.toFixed(3)}`);
    notes.push(`Articles Analyzed: ${articles.length}`);
    notes.push(`Final Sentiment: ${sentiment}`);
    
    if (sentimentScore > 0.2) {
      notes.push('Strong positive sentiment detected');
    } else if (sentimentScore < -0.2) {
      notes.push('Strong negative sentiment detected');
    } else {
      notes.push('Neutral sentiment - no strong signals');
    }
    
    return notes;
  }

  /**
   * Create neutral result when no news is available
   */
  private createNeutralResult(coin: EnhancedCoinAnalysis): NewsValidationResult {
    return {
      coinId: coin.coin.id,
      coinName: coin.coin.name,
      recommendation: coin.category,
      newsSentiment: 'neutral',
      alignment: 'moderate',
      confidenceScore: 0.7,
      newsArticles: 0,
      validationNotes: ['No relevant news articles found for this coin']
    };
  }
}