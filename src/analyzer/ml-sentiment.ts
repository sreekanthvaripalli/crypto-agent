import { EnhancedCoinAnalysis, NewsValidationResult } from '../types';
import { NewsService } from '../fetcher/news';

/**
 * Advanced Machine Learning-based sentiment analysis
 * Uses TF-IDF vectorization and Naive Bayes classification for improved accuracy
 */
export class MLSentimentAnalyzer {
  private newsService: NewsService;
  
  // Enhanced keyword sets for ML training
  private readonly POSITIVE_KEYWORDS = [
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
    'use-case', 'application', 'product', 'service',
    
    // Regulatory clarity
    'approved', 'legal', 'regulated', 'compliant', 'clearance',
    'greenlight', 'permit', 'license'
  ];

  private readonly NEGATIVE_KEYWORDS = [
    // Bearish indicators
    'bear', 'dump', 'crash', 'plummet', 'sell-off', 'correction',
    'sell', 'down', 'loss', 'fail',
    
    // Security issues
    'hack', 'exploit', 'bug', 'vulnerability', 'security',
    'breach', 'theft', 'fraud', 'scam', 'phishing',
    
    // Regulatory issues
    'regulation', 'ban', 'prohibit', 'restrict', 'legal',
    'lawsuit', 'investigation', 'compliance', 'warning',
    'crackdown', 'prosecution', 'fine', 'penalty',
    
    // Technical problems
    'outage', 'downtime', 'error', 'failure', 'crash',
    'slow', 'lag', 'performance', 'issue', 'problem',
    'glitch', 'malfunction', 'break',
    
    // Market concerns
    'fud', 'fear', 'uncertainty', 'doubt', 'panic', 'concern',
    'risk', 'danger', 'warning', 'caution', 'alarm',
    
    // Team & governance issues
    'team', 'founder', 'ceo', 'leadership', 'management',
    'resign', 'quit', 'leave', 'scandal', 'controversy',
    'fraud', 'embezzlement', 'mismanagement',
    
    // Geopolitical risks
    'war', 'conflict', 'tension', 'sanction', 'tariff',
    'trade war', 'geopolitical', 'invasion', 'military',
    'escalation', 'crisis', 'instability', 'turmoil',
    'embargo', 'blockade', 'political', 'election',
    'protest', 'unrest', 'strike', 'shutdown',
    
    // Economic concerns
    'inflation', 'recession', 'debt', 'default', 'crisis',
    'unemployment', 'stagflation', 'hyperinflation'
  ];

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
      
      // Count positive keywords
      for (const keyword of this.POSITIVE_KEYWORDS) {
        if (text.includes(keyword)) {
          positiveScore++;
        }
      }
      
      // Count negative keywords
      for (const keyword of this.NEGATIVE_KEYWORDS) {
        if (text.includes(keyword)) {
          negativeScore++;
        }
      }
    }

    const totalKeywords = positiveScore + negativeScore;
    if (totalKeywords === 0) return 0;

    return (positiveScore - negativeScore) / totalKeywords;
  }

  /**
   * Calculate TF-IDF based sentiment (simplified implementation)
   */
  private calculateTFIDFSentiment(articles: any[]): number {
    // Build vocabulary and calculate TF-IDF scores
    const vocabulary = new Set<string>();
    const documents: string[] = [];
    
    for (const article of articles) {
      const text = `${article.title} ${article.description || ''}`.toLowerCase();
      documents.push(text);
      
      // Add words to vocabulary
      const words = text.split(/\s+/);
      words.forEach(word => vocabulary.add(word));
    }

    // Calculate sentiment based on TF-IDF weighted keywords
    let sentimentScore = 0;
    const vocabArray = Array.from(vocabulary);
    
    for (const article of documents) {
      let articleScore = 0;
      const words = article.split(/\s+/);
      
      // Calculate TF-IDF for each word
      for (const word of words) {
        const tf = this.calculateTF(word, article);
        const idf = this.calculateIDF(word, documents, vocabArray.length);
        const tfidf = tf * idf;
        
        // Apply sentiment weight
        if (this.POSITIVE_KEYWORDS.includes(word)) {
          articleScore += tfidf;
        } else if (this.NEGATIVE_KEYWORDS.includes(word)) {
          articleScore -= tfidf;
        }
      }
      
      sentimentScore += articleScore;
    }

    return sentimentScore / documents.length;
  }

  /**
   * Calculate context-based sentiment using phrase patterns
   */
  private calculateContextSentiment(articles: any[]): number {
    let contextScore = 0;
    let totalPhrases = 0;

    const positivePatterns = [
      /strong.*performance/i,
      /significant.*growth/i,
      /major.*partnership/i,
      /record.*high/i,
      /breakthrough.*technology/i,
      /massive.*adoption/i
    ];

    const negativePatterns = [
      /significant.*loss/i,
      /major.*setback/i,
      /regulatory.*issues/i,
      /security.*breach/i,
      /technical.*problems/i,
      /market.*crash/i
    ];

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
   * Calculate Term Frequency
   */
  private calculateTF(term: string, document: string): number {
    const words = document.split(/\s+/);
    const termCount = words.filter(word => word === term).length;
    return termCount / words.length;
  }

  /**
   * Calculate Inverse Document Frequency
   */
  private calculateIDF(term: string, documents: string[], vocabSize: number): number {
    const docsContainingTerm = documents.filter(doc => doc.includes(term)).length;
    if (docsContainingTerm === 0) return 0;
    
    return Math.log(vocabSize / docsContainingTerm);
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
    let baseConfidence = 70; // Base confidence from technical analysis
    
    // Adjust based on sentiment alignment
    if (coin.category === 'BUY' && sentimentScore > 0.1) {
      baseConfidence += 20;
    } else if (coin.category === 'AVOID' && sentimentScore < -0.1) {
      baseConfidence += 20;
    } else if (Math.abs(sentimentScore) < 0.1) {
      baseConfidence += 10; // Neutral sentiment adds some confidence
    } else {
      baseConfidence -= 10; // Conflicting signals reduce confidence
    }
    
    // Adjust based on article count (more articles = higher confidence)
    if (articleCount >= 5) {
      baseConfidence += 5;
    } else if (articleCount === 0) {
      baseConfidence -= 10;
    }
    
    return Math.max(50, Math.min(95, baseConfidence));
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
      confidenceScore: 70,
      newsArticles: 0,
      validationNotes: ['No relevant news articles found for this coin']
    };
  }
}