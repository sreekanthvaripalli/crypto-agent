import { CoinMarketData, BacktestOutcome } from '../types';
import { runBacktest } from './backtest';
import { DEFAULT_WEIGHTS, ScoringWeights, normalizeWeights } from './scoring-config';

export interface TuneOptions {
  /** Random candidates to try (default 60) */
  candidates?: number;
  /** Evaluate every Nth candle during backtests (default 3 — keeps it fast) */
  step?: number;
  /** Fraction of the timeline (by signal timestamp) used for training (default 0.6) */
  trainFraction?: number;
  /** Seed for the reproducible random search (default 42) */
  seed?: number;
  /** Forward horizons in days (default 1, 3, 7) */
  horizonsInDays?: number[];
  /** Minimum BUY signals required in the validation split (default 10) */
  minBuySamples?: number;
}

export interface SplitEvaluation {
  buyMinusAvoid: Record<string, number>;
  buySamples: number;
  avoidSamples: number;
}

export interface WeightEvaluation {
  weights: ScoringWeights;
  train: SplitEvaluation;
  validation: SplitEvaluation;
  /** Mean validation BUY − AVOID across horizons; −Infinity when invalid */
  objective: number;
  samples: number;
}

export interface TuningReport {
  generatedAt: Date;
  samples: number;
  candidatesEvaluated: number;
  trainFraction: number;
  horizonsInDays: number[];
  baseline: WeightEvaluation;
  best: WeightEvaluation;
  top: WeightEvaluation[];
}

/**
 * Deterministic PRNG (mulberry32) so a tuning run is reproducible
 * from its seed alone.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Produce a candidate weight set by scaling each signal weight of `base`
 * by a random factor in [0.5, 1.5] and drawing fresh classification
 * thresholds. Thresholds keep their sign conventions (BUY positive,
 * AVOID negative) and stay in sane ranges.
 */
export function randomizeWeights(base: ScoringWeights, rng: () => number): ScoringWeights {
  const out = { ...base };
  const scaleKeys: (keyof ScoringWeights)[] = [
    'rsiDeepOversold',
    'rsiOversold',
    'rsiMild',
    'macdCrossover',
    'macdOngoing',
    'macdHistogram',
    'emaTrend',
    'bollinger',
    'priceDipDeep',
    'priceDip',
    'priceRallyDeep',
    'priceRally',
    'volumeSpike',
    'mfi',
  ];

  for (const key of scaleKeys) {
    const factor = 0.5 + rng(); // 0.5 .. 1.5
    out[key] = Math.round(base[key] * factor * 100) / 100;
  }

  out.buyThreshold = Math.round(5 + rng() * 55); // 5 .. 60
  out.avoidThreshold = -Math.round(5 + rng() * 55); // -60 .. -5
  return out;
}

/** Split outcomes chronologically: earlier signals train, later validate. */
function splitOutcomes(
  outcomes: BacktestOutcome[],
  trainFraction: number
): { train: BacktestOutcome[]; validation: BacktestOutcome[] } {
  const sorted = [...outcomes].sort((a, b) => a.timestamp - b.timestamp);
  const cut = Math.max(1, Math.floor(sorted.length * trainFraction));
  return { train: sorted.slice(0, cut), validation: sorted.slice(cut) };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** BUY − AVOID spread per horizon plus sample counts for one split. */
function evaluateSplit(
  outcomes: BacktestOutcome[],
  horizons: number[]
): SplitEvaluation {
  const buy = outcomes.filter((o) => o.category === 'BUY');
  const avoid = outcomes.filter((o) => o.category === 'AVOID');

  const buyMinusAvoid: Record<string, number> = {};
  for (const h of horizons) {
    const key = `${h}d`;
    const buyReturns = buy.map((o) => o.forwardReturns[key] ?? 0);
    const avoidReturns = avoid.map((o) => o.forwardReturns[key] ?? 0);
    buyMinusAvoid[key] =
      buyReturns.length && avoidReturns.length
        ? average(buyReturns) - average(avoidReturns)
        : 0;
  }

  return { buyMinusAvoid, buySamples: buy.length, avoidSamples: avoid.length };
}

/**
 * Objective = mean validation BUY − AVOID across horizons.
 * Candidates without enough validation BUY samples are invalid (−Infinity) —
 * otherwise degenerate weights that never say BUY would "win" trivially.
 */
function objectiveOf(
  validation: SplitEvaluation,
  horizons: number[],
  minBuySamples: number
): number {
  if (validation.buySamples < minBuySamples || validation.avoidSamples < 1) {
    return -Infinity;
  }
  return (
    horizons.reduce((sum, h) => sum + validation.buyMinusAvoid[`${h}d`], 0) / horizons.length
  );
}

/**
 * Search for classifier weights that maximize the validation-split signal edge.
 *
 * ⚠️ The candidate set is scored on the same 30-day window it will trade in —
 * treat the "best" weights as a starting point, not a proven strategy.
 */
export function tuneWeights(
  coins: CoinMarketData[],
  options: TuneOptions = {}
): TuningReport {
  const candidateCount = Math.max(1, options.candidates ?? 60);
  const step = Math.max(1, options.step ?? 3);
  const trainFraction = Math.min(0.9, Math.max(0.3, options.trainFraction ?? 0.6));
  const rng = mulberry32(options.seed ?? 42);
  const horizons = options.horizonsInDays ?? [1, 3, 7];
  const minBuySamples = Math.max(1, options.minBuySamples ?? 10);

  const evaluate = (weights: ScoringWeights): WeightEvaluation => {
    const report = runBacktest(coins, {
      horizonsInDays: horizons,
      step,
      includeOutcomes: true,
      weights,
    });
    const outcomes = report.outcomes ?? [];
    const { train, validation } = splitOutcomes(outcomes, trainFraction);
    const trainEval = evaluateSplit(train, horizons);
    const validationEval = evaluateSplit(validation, horizons);

    return {
      weights: normalizeWeights(weights),
      train: trainEval,
      validation: validationEval,
      objective: objectiveOf(validationEval, horizons, minBuySamples),
      samples: outcomes.length,
    };
  };

  // Baseline: the shipped defaults, so every candidate has something to beat.
  const baseline = evaluate({ ...DEFAULT_WEIGHTS });

  const evaluated: WeightEvaluation[] = [baseline];
  for (let i = 0; i < candidateCount; i++) {
    evaluated.push(evaluate(randomizeWeights(DEFAULT_WEIGHTS, rng)));
  }

  // Stable sort: highest objective first; ties keep baseline ahead.
  evaluated.sort((a, b) => b.objective - a.objective);

  return {
    generatedAt: new Date(),
    samples: baseline.samples,
    candidatesEvaluated: candidateCount + 1,
    trainFraction,
    horizonsInDays: horizons,
    baseline,
    best: evaluated[0],
    top: evaluated.slice(0, 10),
  };
}