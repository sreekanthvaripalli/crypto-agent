import fs from 'fs';
import path from 'path';

/**
 * Tunable scoring weights for the classifier.
 *
 * Every field is a signed point value contributed to a coin's score
 * (range −100..+100), except the two thresholds which define the
 * BUY / AVOID boundaries.
 *
 * Defaults replicate the original hand-picked constants exactly, so
 * behavior is unchanged until `scoring-weights.json` overrides them.
 */
export interface ScoringWeights {
  // RSI buckets
  rsiDeepOversold: number;   // RSI ≤ 25
  rsiOversold: number;       // RSI ≤ 35
  rsiMild: number;           // RSI ≤ 45
  // MACD
  macdCrossover: number;     // fresh bullish/bearish crossover
  macdOngoing: number;       // MACD above/below signal (no fresh cross)
  macdHistogram: number;     // histogram positive/negative
  // Trend & bands
  emaTrend: number;          // EMA7 vs EMA14
  bollinger: number;         // price outside bands
  // 7-day price change buckets
  priceDipDeep: number;      // ≤ −20%
  priceDip: number;          // ≤ −10%
  priceRallyDeep: number;    // ≥ +20%
  priceRally: number;        // ≥ +10%
  // Volume & flow
  volumeSpike: number;       // volume/活动 spike aligned with price direction
  mfi: number;               // Money Flow Index oversold/overbought
  // Classification thresholds
  buyThreshold: number;      // score ≥ this → BUY
  avoidThreshold: number;    // score ≤ this → AVOID (negative)
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  rsiDeepOversold: 30,
  rsiOversold: 20,
  rsiMild: 10,
  macdCrossover: 25,
  macdOngoing: 10,
  macdHistogram: 5,
  emaTrend: 15,
  bollinger: 15,
  priceDipDeep: 10,
  priceDip: 5,
  priceRallyDeep: 10,
  priceRally: 5,
  volumeSpike: 10,
  mfi: 5,
  buyThreshold: 25,
  avoidThreshold: -25,
};

const WEIGHTS_FILE = 'scoring-weights.json';

/** Numeric weight fields (everything except nothing — all fields are numeric). */
const NUMERIC_KEYS = Object.keys(DEFAULT_WEIGHTS) as (keyof ScoringWeights)[];

function sanitize(input: unknown): Partial<ScoringWeights> {
  if (typeof input !== 'object' || input === null) return {};
  const out: Partial<ScoringWeights> = {};
  for (const key of NUMERIC_KEYS) {
    const value = (input as Record<string, unknown>)[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Load scoring weights: `scoring-weights.json` in the working directory
 * overrides individual fields of the defaults. Invalid or missing values
 * fall back to defaults, so a broken file can never break the agent.
 */
export function loadWeights(filePath?: string): ScoringWeights {
  const target = filePath ?? path.join(process.cwd(), WEIGHTS_FILE);
  try {
    if (!fs.existsSync(target)) return { ...DEFAULT_WEIGHTS };
    const raw = JSON.parse(fs.readFileSync(target, 'utf-8'));
    return { ...DEFAULT_WEIGHTS, ...sanitize(raw) };
  } catch {
    return { ...DEFAULT_WEIGHTS };
  }
}

/** Round every weight to 2 decimals for stable, readable config output. */
export function normalizeWeights(weights: ScoringWeights): ScoringWeights {
  const out = { ...weights };
  for (const key of NUMERIC_KEYS) {
    out[key] = Math.round(out[key] * 100) / 100;
  }
  return out;
}