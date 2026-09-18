/**
 * Shared sentiment keyword lists and matching helpers.
 *
 * These lists are the single source of truth used by the news fetcher,
 * the rule-based news validator, and the ML-style sentiment analyzer.
 * Matching is done on word boundaries to avoid false positives such as
 * "up" matching inside "upgrade" or "downtown".
 */

export const POSITIVE_KEYWORDS: string[] = [
  // Bullish indicators
  'moon', 'bull', 'bullish', 'surge', 'pump', 'breakout', 'rally',
  'buy', 'growth', 'gain', 'win', 'success',

  // Development & partnerships
  'launch', 'partnership', 'integration', 'adoption', 'upgrade',
  'listing', 'exchange', 'backed', 'investment',
  'funding', 'capital', 'institutional',

  // Technical improvements
  'improvement', 'enhancement', 'optimization',
  'scalability', 'speed', 'efficiency', 'innovation',

  // Market sentiment
  'demand', 'interest', 'popularity', 'trending', 'viral',
  'hype', 'buzz', 'excitement', 'optimism',

  // Adoption & utility
  'payment', 'merchant', 'ecommerce', 'real-world', 'utility',
  'use-case', 'application', 'product', 'service',

  // Regulatory clarity
  'approved', 'regulated', 'compliant', 'clearance',
  'greenlight', 'permit', 'license',
];

export const NEGATIVE_KEYWORDS: string[] = [
  // Bearish indicators
  'bear', 'bearish', 'dump', 'crash', 'plummet', 'sell-off',
  'loss', 'fail', 'failure',

  // Security issues
  'hack', 'exploit', 'bug', 'vulnerability', 'breach', 'theft',
  'fraud', 'scam', 'phishing',

  // Regulatory issues
  'regulation', 'ban', 'prohibit', 'restrict',
  'lawsuit', 'investigation', 'compliance', 'warning',
  'crackdown', 'prosecution', 'fine', 'penalty',

  // Technical problems
  'outage', 'downtime', 'error',
  'slow', 'lag', 'issue', 'problem',
  'glitch', 'malfunction',

  // Market concerns
  'fud', 'fear', 'uncertainty', 'doubt', 'panic', 'concern',
  'risk', 'danger', 'caution', 'alarm',

  // Team & governance issues
  'resign', 'quit', 'scandal', 'controversy',
  'embezzlement', 'mismanagement',

  // Geopolitical risks
  'war', 'conflict', 'tension', 'sanction', 'tariff',
  'trade war', 'geopolitical', 'invasion', 'military',
  'escalation', 'crisis', 'instability', 'turmoil',
  'embargo', 'blockade', 'unrest', 'strike', 'shutdown',

  // Economic concerns
  'inflation', 'recession', 'debt', 'default',
  'unemployment', 'stagflation', 'hyperinflation',
];

export const POSITIVE_CONTEXT_PATTERNS: RegExp[] = [
  /strong\s+performance/i,
  /significant\s+growth/i,
  /major\s+partnership/i,
  /record\s+high/i,
  /breakthrough\s+technology/i,
  /massive\s+adoption/i,
];

export const NEGATIVE_CONTEXT_PATTERNS: RegExp[] = [
  /significant\s+loss/i,
  /major\s+setback/i,
  /regulatory\s+issues/i,
  /security\s+breach/i,
  /technical\s+problems/i,
  /market\s+crash/i,
];

const regexCache = new Map<string, RegExp>();

/**
 * Get a cached word-boundary regex for a keyword (case-insensitive).
 */
export function keywordRegex(keyword: string): RegExp {
  let re = regexCache.get(keyword);
  if (!re) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    re = new RegExp(`\\b${escaped}\\b`, 'i');
    regexCache.set(keyword, re);
  }
  return re;
}

/**
 * Count how many of the given keywords appear in `text` using
 * word-boundary matching (no substring false positives).
 */
export function countKeywordMatches(text: string, keywords: string[]): number {
  let count = 0;
  for (const keyword of keywords) {
    if (keywordRegex(keyword).test(text)) count++;
  }
  return count;
}

/**
 * Simple keyword-based sentiment used by the news fetcher.
 * Returns 1 (positive), -1 (negative), or 0 (neutral).
 */
export function quickSentiment(text: string): 1 | -1 | 0 {
  const lower = text.toLowerCase();
  const positive = countKeywordMatches(lower, POSITIVE_KEYWORDS);
  const negative = countKeywordMatches(lower, NEGATIVE_KEYWORDS);
  if (positive > negative) return 1;
  if (negative > positive) return -1;
  return 0;
}
