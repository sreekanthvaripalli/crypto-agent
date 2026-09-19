import { fetchFullMarketData } from './fetcher/coingecko';
import { saveMarketData, loadLatestMarketData, cleanOldData, closeDb } from './database/db';
import { analyzeAll } from './analyzer/classifier';
import { AdvancedIndicatorsCalculator } from './analyzer/advanced-indicators';
import { RiskManager } from './analyzer/risk-management';
import { MLSentimentAnalyzer } from './analyzer/ml-sentiment';
import { NewsService } from './fetcher/news';
import { printReport, exportReportToJson } from './output/reporter';
import { MarketReport, CoinAnalysis, EnhancedCoinAnalysis, NewsValidationResult, MarketRegime } from './types';
import { assessMarketRegime } from './analyzer/market-regime';
import { loadWeights } from './analyzer/scoring-config';
import { fetchDerivativesData, fetchOnChainMetrics } from './analyzer/derivatives-onchain';
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
      // Respect the --limit flag even on cache hits
      coins = cached.slice(0, CONFIG.topCoinsLimit);
      console.log(chalk.gray(`📂 Using cached data (${coins.length} coins). Use --refresh to fetch fresh data.\n`));
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
  const weights = loadWeights();
  const analyzed: CoinAnalysis[] = analyzeAll(coins, weights);

  // ─── BTC market regime gate ─────────────────────────────────────────────────
  // ~80% of altcoins follow BTC: in a BTC downtrend, BUY picks are demoted
  // to WATCHLIST no matter how good their individual setups look.
  const btcCandlesAll = coins.find((c) => c.id === 'bitcoin')?.ohlcData;
  const regimeAssessment =
    btcCandlesAll && btcCandlesAll.length >= 50 ? assessMarketRegime(btcCandlesAll) : null;
  let demotedCount = 0;
  if (regimeAssessment?.demoteBuys) {
    for (const analysis of analyzed) {
      if (analysis.category === 'BUY') {
        analysis.category = 'WATCHLIST';
        analysis.signals.push('🚦 BUY demoted — BTC risk-off regime (price below falling EMA20/EMA50)');
        demotedCount++;
      }
    }
    if (demotedCount > 0) {
      console.log(
        chalk.yellow(`🚦 BTC risk-off regime — demoted ${demotedCount} BUY signal(s) to WATCHLIST`)
      );
    }
  }
  const marketRegime: MarketRegime | undefined = regimeAssessment
    ? { ...regimeAssessment, demotedCount }
    : undefined;

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

  // Use BTC as the market proxy for beta (falls back to 1.0 if absent)
  const btcCandles = enhancedAnalyses.find((c) => c.coin.id === 'bitcoin')?.coin.ohlcData;

  const riskEnhancedAnalyses = enhancedAnalyses.map(coin => ({
    ...coin,
    riskMetrics: riskManager.calculateRiskMetrics(coin, btcCandles)
  }));

  // ─── Fetch Derivatives & On-Chain Analytics ──────────────────────────────────
  console.log(chalk.cyan(`⛓️ Fetching Derivatives & On-Chain analytics...`));
  const onChainData = await fetchOnChainMetrics();
  const derivativesPromises = riskEnhancedAnalyses.map(async (analysis) => {
    const deriv = await fetchDerivativesData(analysis.coin.symbol);
    return { ...analysis, derivatives: deriv, onChain: onChainData };
  });
  const derivEnhancedAnalyses = await Promise.all(derivativesPromises);

  // ─── Validate with ML-enhanced news context ─────────────────────────────────
  console.log(chalk.cyan(`🤖 Analyzing news sentiment with ML...`));
  // Share one NewsService instance so its cache is reused across coins
  const mlSentimentAnalyzer = new MLSentimentAnalyzer(new NewsService());
  const validatedAnalyses = await Promise.all(
    derivEnhancedAnalyses.map(analysis => mlSentimentAnalyzer.analyzeSentimentWithML(analysis))
  );

  // ─── Separate into categories ───────────────────────────────────────────────
  const buyList = validatedAnalyses
    .filter((a) => a.recommendation === 'BUY' && a.confidenceScore >= 0.6)
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .slice(0, CONFIG.maxBuyResults);

  const avoidList = validatedAnalyses
    .filter((a) => a.recommendation === 'AVOID' && a.confidenceScore >= 0.6)
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .slice(0, CONFIG.maxAvoidResults);

  const watchList = validatedAnalyses
    .filter((a) => a.recommendation === 'WATCHLIST' || a.confidenceScore < 0.6)
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .slice(0, CONFIG.maxWatchResults);

  // ─── Build enhanced analysis objects ────────────────────────────────────────
  // Spread from riskEnhancedAnalyses (NOT the base `analyzed` list) so the
  // advanced indicators and risk metrics actually reach the report/export.
  const enhancedById = new Map<string, CoinAnalysis & { advancedIndicators: unknown; riskMetrics: unknown }>(
    riskEnhancedAnalyses.map((c) => [c.coin.id, c])
  );

  const withNews = (a: NewsValidationResult): EnhancedCoinAnalysis => ({
    ...(enhancedById.get(a.coinId) as CoinAnalysis),
    newsValidation: a,
  });

  const enhancedBuyList: EnhancedCoinAnalysis[] = buyList.map(withNews);
  const enhancedAvoidList: EnhancedCoinAnalysis[] = avoidList.map(withNews);
  const enhancedWatchList: EnhancedCoinAnalysis[] = watchList.map(withNews);

  // ─── Portfolio-level analysis ────────────────────────────────────────────────
  console.log(chalk.cyan(`💼 Calculating portfolio-level analysis...`));
  const portfolioAnalysis = riskManager.calculatePortfolioAnalysis(riskEnhancedAnalyses);

  // ─── Build report ───────────────────────────────────────────────────────────
  const report: MarketReport = {
    generatedAt: new Date(),
    totalCoinsAnalyzed: analyzed.length,
    buyList: enhancedBuyList,
    watchList: enhancedWatchList,
    avoidList: enhancedAvoidList,
    portfolioAnalysis,
    marketRegime,
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
