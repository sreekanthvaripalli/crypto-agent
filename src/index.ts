import { fetchFullMarketData } from './fetcher/coingecko';
import { saveMarketData, loadLatestMarketData, cleanOldData, closeDb } from './database/db';
import { analyzeAll } from './analyzer/classifier';
import { printReport, exportReportToJson } from './output/reporter';
import { MarketReport, CoinAnalysis } from './types';
import chalk from 'chalk';

// ─── Configuration ────────────────────────────────────────────────────────────
const CONFIG = {
  topCoinsLimit: 50,       // How many top coins to analyze (by market cap)
  forceRefresh: false,     // Set to true to always fetch fresh data
  exportJson: true,        // Export report to JSON file
  maxBuyResults: 10,       // Max coins in buy list
  maxWatchResults: 15,     // Max coins in watchlist
  maxAvoidResults: 10,     // Max coins in avoid list
};

// Parse CLI args
const args = process.argv.slice(2);
if (args.includes('--refresh')) CONFIG.forceRefresh = true;
if (args.includes('--no-json')) CONFIG.exportJson = false;
const limitArg = args.find((a) => a.startsWith('--limit='));
if (limitArg) CONFIG.topCoinsLimit = parseInt(limitArg.split('=')[1], 10) || 50;

async function run(): Promise<void> {
  console.log(chalk.cyan.bold('\n🤖 Crypto Market Analysis Agent Starting...\n'));

  let coins;

  // Try to load from cache first (unless forced refresh)
  if (!CONFIG.forceRefresh) {
    const cached = loadLatestMarketData();
    if (cached && cached.length > 0) {
      console.log(chalk.gray(`📂 Using cached data (${cached.length} coins). Use --refresh to fetch fresh data.\n`));
      coins = cached;
    }
  }

  // Fetch fresh data if no cache or forced refresh
  if (!coins) {
    try {
      coins = await fetchFullMarketData(CONFIG.topCoinsLimit);
      saveMarketData(coins);
      cleanOldData();
    } catch (err) {
      console.error(chalk.red(`\n❌ Failed to fetch market data: ${(err as Error).message}`));
      console.error(chalk.red('   Check your internet connection and try again.'));
      process.exit(1);
    }
  }

  if (!coins || coins.length === 0) {
    console.error(chalk.red('❌ No coin data available. Exiting.'));
    process.exit(1);
  }

  // ─── Analyze all coins ──────────────────────────────────────────────────────
  console.log(chalk.cyan(`🔬 Running technical analysis on ${coins.length} coins...`));
  const analyzed: CoinAnalysis[] = analyzeAll(coins);

  // ─── Separate into categories ───────────────────────────────────────────────
  const buyList = analyzed
    .filter((a) => a.category === 'BUY')
    .sort((a, b) => b.score - a.score)
    .slice(0, CONFIG.maxBuyResults);

  const avoidList = analyzed
    .filter((a) => a.category === 'AVOID')
    .sort((a, b) => a.score - b.score)
    .slice(0, CONFIG.maxAvoidResults);

  const watchList = analyzed
    .filter((a) => a.category === 'WATCHLIST')
    .sort((a, b) => b.score - a.score)
    .slice(0, CONFIG.maxWatchResults);

  // ─── Build report ───────────────────────────────────────────────────────────
  const report: MarketReport = {
    generatedAt: new Date(),
    totalCoinsAnalyzed: analyzed.length,
    buyList,
    watchList,
    avoidList,
  };

  // ─── Print report ───────────────────────────────────────────────────────────
  printReport(report);

  // ─── Export JSON ────────────────────────────────────────────────────────────
  if (CONFIG.exportJson) {
    const jsonPath = exportReportToJson(report);
    console.log(chalk.gray(`  📄 JSON report saved: ${jsonPath}\n`));
  }

  closeDb();
}

run().catch((err) => {
  console.error(chalk.red(`\n💥 Unexpected error: ${err.message}`));
  console.error(err.stack);
  closeDb();
  process.exit(1);
});
