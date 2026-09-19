import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fetchFullMarketData } from './fetcher/coingecko';
import { loadLatestMarketData, closeDb } from './database/db';
import { tuneWeights } from './analyzer/tuner';
import { SplitEvaluation } from './analyzer/tuner';

type SplitView = SplitEvaluation;

const CONFIG = {
  topCoinsLimit: 50,
  forceRefresh: false,
  candidates: 60,
  step: 3,
  seed: 42,
  trainFraction: 0.6,
  minBuy: 10,
  apply: false,
};

const args = process.argv.slice(2);
if (args.includes('--refresh')) CONFIG.forceRefresh = true;
if (args.includes('--apply')) CONFIG.apply = true;

const numArg = (name: string, fallback: number): number => {
  const arg = args.find((a) => a.startsWith(`--${name}=`));
  if (!arg) return fallback;
  const parsed = parseFloat(arg.split('=')[1]);
  return Number.isFinite(parsed) ? parsed : fallback;
};

CONFIG.topCoinsLimit = numArg('limit', CONFIG.topCoinsLimit);
CONFIG.candidates = Math.max(1, numArg('candidates', CONFIG.candidates));
CONFIG.step = Math.max(1, numArg('step', CONFIG.step));
CONFIG.seed = numArg('seed', CONFIG.seed);
CONFIG.trainFraction = Math.min(0.9, Math.max(0.3, numArg('train-fraction', CONFIG.trainFraction)));
CONFIG.minBuy = Math.max(1, numArg('min-buy', CONFIG.minBuy));

const WEIGHTS_FILE = path.join(process.cwd(), 'scoring-weights.json');
const pct = (v: number): string => `${v > 0 ? '+' : ''}${(v * 100).toFixed(2)}%`;
const colorEdge = (v: number): string =>
  !Number.isFinite(v)
    ? chalk.gray('invalid')
    : v > 0
      ? chalk.greenBright(pct(v))
      : v < 0
        ? chalk.redBright(pct(v))
        : chalk.gray('0.00%');

async function run(): Promise<void> {
  console.log(chalk.cyan.bold('\n🎯 Classifier Weight Tuning — backtest as fitness function\n'));

  const hasCustomWeights = fs.existsSync(WEIGHTS_FILE);
  console.log(
    chalk.gray(
      `  Scoring weights: ${hasCustomWeights ? 'scoring-weights.json (custom)' : 'built-in defaults'}`
    )
  );
  console.log(
    chalk.gray(
      `  Candidates: ${CONFIG.candidates}   step: ${CONFIG.step}   seed: ${CONFIG.seed}   train split: ${(CONFIG.trainFraction * 100).toFixed(0)}%   min BUY (validation): ${CONFIG.minBuy}\n`
    )
  );

  let coins;
  if (!CONFIG.forceRefresh) {
    const cached = loadLatestMarketData();
    if (cached && cached.length > 0) {
      coins = cached.slice(0, CONFIG.topCoinsLimit);
      console.log(chalk.gray(` Using cached data (${coins.length} coins). Use --refresh to fetch fresh data.\n`));
    }
  }

  if (!coins) {
    try {
      coins = await fetchFullMarketData(CONFIG.topCoinsLimit);
    } catch (err) {
      console.error(chalk.red(`\n❌ Failed to fetch market data: ${(err as Error).message}`));
      process.exit(1);
    }
  }

  if (!coins || coins.length === 0) {
    console.error(chalk.red('❌ No coin data available. Exiting.'));
    process.exit(1);
  }

  console.log(chalk.cyan(`⏳ Evaluating baseline + ${CONFIG.candidates} candidates...`));
  console.log(chalk.gray(`   (each candidate replays ${coins.length} coins — this can take a while)\n`));

  const report = tuneWeights(coins, {
    candidates: CONFIG.candidates,
    step: CONFIG.step,
    seed: CONFIG.seed,
    trainFraction: CONFIG.trainFraction,
    minBuySamples: CONFIG.minBuy,
  });

  const renderSplit = (
    label: string,
    evaluation: { train: SplitView; validation: SplitView; objective: number },
    split: SplitView
  ): string => {
    const parts = report.horizonsInDays.map((h) => `${h}d: ${colorEdge(split.buyMinusAvoid[`${h}d`] ?? 0)}`);
    const objective =
      split === evaluation.validation
        ? evaluation.objective // validity-aware (may be invalid / -Infinity)
        : report.horizonsInDays.reduce((s, h) => s + (split.buyMinusAvoid[`${h}d`] ?? 0), 0) /
          report.horizonsInDays.length;
    return `${chalk.bold(label)} BUY−AVOID  ${parts.join('   ')}  ${chalk.gray(`(${split.buySamples} BUY)`)}  →  objective ${colorEdge(objective)}`;
  };

  console.log(chalk.cyan('── Baseline (built-in defaults) ──────────────────────────'));
  console.log('  ' + renderSplit('TRAIN     ', report.baseline, report.baseline.train));
  console.log('  ' + renderSplit('VALIDATION', report.baseline, report.baseline.validation));

  console.log('\n' + chalk.cyan('── Best candidate (by VALIDATION objective) ──────────────'));
  console.log('  ' + renderSplit('TRAIN     ', report.best, report.best.train));
  console.log('  ' + renderSplit('VALIDATION', report.best, report.best.validation));

  const bestOk = Number.isFinite(report.best.objective);
  const baseOk = Number.isFinite(report.baseline.objective);
  if (bestOk && baseOk && report.best.objective > report.baseline.objective) {
    console.log(
      chalk.green(
        `\n  ✅ Best candidate beats the baseline by ${pct(report.best.objective - report.baseline.objective)} (validation)`
      )
    );
  } else {
    console.log(chalk.yellow(`\n  ⚠️  No candidate beat the baseline — keep the current weights.`));
  }

  console.log('\n' + chalk.cyan('── Top candidates ────────────────────────────────────────'));
  report.top.forEach((candidate, i) => {
    const marker = candidate === report.best ? chalk.green(' ← best') : '';
    const spreads = report.horizonsInDays
      .map((h) => colorEdge(candidate.validation.buyMinusAvoid[`${h}d`] ?? 0))
      .join(' / ');
    console.log(
      `  ${String(i + 1).padStart(2)}. objective ${colorEdge(candidate.objective)}   val 1d/3d/7d: ${spreads}   BUY(val): ${candidate.validation.buySamples}${marker}`
    );
  });

  console.log('\n' + chalk.cyan('── Best weights ──────────────────────────────────────────'));
  console.log(chalk.white(JSON.stringify(report.best.weights, null, 2)));

  if (CONFIG.apply) {
    fs.writeFileSync(WEIGHTS_FILE, JSON.stringify(report.best.weights, null, 2) + '\n');
    console.log(chalk.green(`\n  ✅ Saved to ${WEIGHTS_FILE} — the agent will use these weights automatically.`));
  } else {
    console.log(
      chalk.gray(
        `\n  ℹ️  To apply: rerun with --apply, or save the JSON above as scoring-weights.json in the project root.`
      )
    );
  }

  console.log(chalk.gray('\n  ⚠️  Tuned on one 30-day window with overlapping samples — validate on fresh'));
  console.log(chalk.gray('      data before trusting it. Not financial advice.\n'));

  closeDb();
}

run().catch((err) => {
  console.error(chalk.red(`\n💥 Unexpected error: ${err.message}`));
  console.error(err.stack);
  closeDb();
  process.exit(1);
});