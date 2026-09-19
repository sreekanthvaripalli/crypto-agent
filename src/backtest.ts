import chalk from 'chalk';
import { fetchFullMarketData } from './fetcher/coingecko';
import { loadLatestMarketData, closeDb } from './database/db';
import { runBacktest, DEFAULT_HORIZONS_IN_DAYS } from './analyzer/backtest';
import { loadWeights } from './analyzer/scoring-config';
import { printBacktestReport, exportBacktestToJson } from './output/backtest-reporter';

// ─── Configuration ───────────────────────────────────────────────────────────
const CONFIG = {
  topCoinsLimit: 50,
  forceRefresh: false,
  exportJson: true,
  includeOutcomes: false,
  step: 1,
  horizonsInDays: [...DEFAULT_HORIZONS_IN_DAYS],
};

// Parse CLI args
const args = process.argv.slice(2);
if (args.includes('--refresh')) CONFIG.forceRefresh = true;
if (args.includes('--no-json')) CONFIG.exportJson = false;
if (args.includes('--outcomes')) CONFIG.includeOutcomes = true;

const limitArg = args.find((a) => a.startsWith('--limit='));
if (limitArg) CONFIG.topCoinsLimit = parseInt(limitArg.split('=')[1], 10) || 50;

const stepArg = args.find((a) => a.startsWith('--step='));
if (stepArg) CONFIG.step = Math.max(1, parseInt(stepArg.split('=')[1], 10) || 1);

const horizonsArg = args.find((a) => a.startsWith('--horizons='));
if (horizonsArg) {
  const parsed = horizonsArg
    .split('=')[1]
    .split(',')
    .map((v) => parseInt(v, 10))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (parsed.length > 0) CONFIG.horizonsInDays = parsed;
}

async function run(): Promise<void> {
  console.log(chalk.cyan.bold('\n Crypto Signal Backtest Starting...\n'));

  let coins;

  if (!CONFIG.forceRefresh) {
    const cached = loadLatestMarketData();
    if (cached && cached.length > 0) {
      coins = cached.slice(0, CONFIG.topCoinsLimit);
      console.log(
        chalk.gray(` Using cached data (${coins.length} coins). Use --refresh to fetch fresh data.\n`)
      );
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

  console.log(chalk.cyan(`⏳ Replaying ${coins.length} coins through the live classifier...`));
  console.log(chalk.gray(`   step=${CONFIG.step}, horizons=${CONFIG.horizonsInDays.join(',')}d\n`));

  const report = runBacktest(coins, {
    horizonsInDays: CONFIG.horizonsInDays,
    step: CONFIG.step,
    includeOutcomes: CONFIG.includeOutcomes,
    weights: loadWeights(),
  });

  printBacktestReport(report);

  if (CONFIG.exportJson) {
    const jsonPath = exportBacktestToJson(report);
    console.log(chalk.gray(`  📄 Backtest report saved: ${jsonPath}\n`));
  }

  closeDb();
}

run().catch((err) => {
  console.error(chalk.red(`\n💥 Unexpected error: ${err.message}`));
  console.error(err.stack);
  closeDb();
  process.exit(1);
});