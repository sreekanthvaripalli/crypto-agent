import { fetchFullMarketData } from './fetcher/coingecko';
import { saveMarketData, loadLatestMarketData, cleanOldData, closeDb } from './database/db';
import { analyzeAll } from './analyzer/classifier';
import { AdvancedIndicatorsCalculator } from './analyzer/advanced-indicators';
import { RiskManager } from './analyzer/risk-management';
import { MLSentimentAnalyzer } from './analyzer/ml-sentiment';
import { printReport, exportReportToJson } from './output/reporter';
import { MarketReport, CoinAnalysis } from './types';
import { NewsValidator } from './analyzer/news-validator';
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

  // ─── Calculate advanced indicators ──────────────────────────────────────────
  console.log(chalk.cyan(`📈 Calculating advanced technical indicators...`));
  const advancedCalculator = new AdvancedIndicatorsCalculator();
  const enhancedAnalyses = analyzed.map(coin => ({
    ...coin,
    advancedIndicators: advancedCalculator.calculateAllAdvancedIndicators(coin)
  }));

  // ─── Calculate risk metrics ─────────────────────────────────────────────────
  console.log(chalk.cyan(`⚠️  Calculating risk metrics and position sizing...`));
  const riskManager = new RiskManager();
  const riskEnhancedAnalyses = enhancedAnalyses.map(coin => ({
    ...coin,
    riskMetrics: riskManager.calculateRiskMetrics(coin)
  }));

  // ─── Validate with ML-enhanced news context ─────────────────────────────────
  console.log(chalk.cyan(`🤖 Analyzing news sentiment with ML...`));
  const newsValidator = new NewsValidator();
  const mlSentimentAnalyzer = new MLSentimentAnalyzer(newsValidator.newsService);
  const validatedAnalyses = await Promise.all(
    riskEnhancedAnalyses.map(analysis => mlSentimentAnalyzer.analyzeSentimentWithML(analysis))
  );

  // ─── Separate into categories ───────────────────────────────────────────────
  const buyList = validatedAnalyses
    .filter((a) => a.recommendation === 'BUY' && a.confidenceScore >= 0.6)
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .slice(0, CONFIG.maxBuyResults);

  const avoidList = validatedAnalyses
    .filter((a) => a.recommendation === 'AVOID' && a.confidenceScore >= 0.6)
    .sort((a, b) => a.confidenceScore - b.confidenceScore)
    .slice(0, CONFIG.maxAvoidResults);

  const watchList = validatedAnalyses
    .filter((a) => a.recommendation === 'WATCHLIST' || a.confidenceScore < 0.6)
    .sort((a, b) => b.confidenceScore - (a.confidenceScore || 0))
    .slice(0, CONFIG.maxWatchResults);

  // ─── Build enhanced analysis objects ────────────────────────────────────────
  const enhancedBuyList = buyList.map(a => ({
    ...analyzed.find(an => an.coin.id === a.coinId)!,
    newsValidation: a
  }));

  const enhancedAvoidList = avoidList.map(a => ({
    ...analyzed.find(an => an.coin.id === a.coinId)!,
    newsValidation: a
  }));

  const enhancedWatchList = watchList.map(a => ({
    ...analyzed.find(an => an.coin.id === a.coinId)!,
    newsValidation: a
  }));

  // ─── Build report ───────────────────────────────────────────────────────────
  const report: MarketReport = {
    generatedAt: new Date(),
    totalCoinsAnalyzed: analyzed.length,
    buyList: enhancedBuyList,
    watchList: enhancedWatchList,
    avoidList: enhancedAvoidList,
  };

  // ─── Print enhanced report with news validation ────────────────────────────
  console.log(chalk.cyan('\n📊 Enhanced Report with News Validation'));
  console.log(chalk.gray('───────────────────────────────────────────'));
  console.log(chalk.gray('Recommendation | News Sentiment | Alignment | Confidence'));
  console.log(chalk.gray('─────────────────────────────────────────────────────────'));

  buyList.forEach((a, i) => {
    console.log(chalk.green(
      `${i + 1}. ${a.coinName.padEnd(20)} | ${a.newsSentiment.padEnd(13)} | ${a.alignment.padEnd(9)} | ${Math.round(a.confidenceScore * 100)}%`
    ));
  });

  watchList.forEach((a, i) => {
    console.log(chalk.yellow(
      `${i + 1}. ${a.coinName.padEnd(20)} | ${a.newsSentiment.padEnd(13)} | ${a.alignment.padEnd(9)} | ${Math.round(a.confidenceScore * 100)}%`
    ));
  });

  avoidList.forEach((a, i) => {
    console.log(chalk.red(
      `${i + 1}. ${a.coinName.padEnd(20)} | ${a.newsSentiment.padEnd(13)} | ${a.alignment.padEnd(9)} | ${Math.round(a.confidenceScore * 100)}%`
    ));
  });

  console.log(chalk.gray('─────────────────────────────────────────────────────────'));
  console.log(chalk.gray(`\n✅ ${buyList.length} strong buys, ${watchList.length} watchlist, ${avoidList.length} avoid recommendations`));
  console.log(chalk.gray(`   Based on ${validatedAnalyses.length} coins analyzed with news validation\n`));

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
