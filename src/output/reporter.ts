import chalk, { ChalkInstance } from 'chalk';
import Table from 'cli-table3';
import { MarketReport, EnhancedCoinAnalysis, PortfolioAnalysis } from '../types';
import fs from 'fs';
import path from 'path';

const DIVIDER = '━'.repeat(72);

function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(6)}`;
}

function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function colorPercent(value: number): string {
  const str = formatPercent(value);
  if (value > 3) return chalk.greenBright(str);
  if (value > 0) return chalk.green(str);
  if (value < -3) return chalk.redBright(str);
  if (value < 0) return chalk.red(str);
  return chalk.gray(str);
}

function colorScore(score: number): string {
  const str = `${score > 0 ? '+' : ''}${score}`;
  if (score >= 40) return chalk.bgGreen.black(` ${str} `);
  if (score >= 20) return chalk.greenBright(str);
  if (score >= 0) return chalk.green(str);
  if (score <= -40) return chalk.bgRed.white(` ${str} `);
  if (score <= -20) return chalk.redBright(str);
  return chalk.red(str);
}

function formatRSI(rsi: number | null): string {
  if (rsi === null) return chalk.gray('N/A');
  const str = rsi.toFixed(1);
  if (rsi <= 30) return chalk.greenBright(str);
  if (rsi >= 70) return chalk.redBright(str);
  return chalk.white(str);
}

function buildSummaryTable(analyses: EnhancedCoinAnalysis[]): string {
  const table = new Table({
    head: [
      chalk.bold('Symbol'),
      chalk.bold('Name'),
      chalk.bold('Price'),
      chalk.bold('24h %'),
      chalk.bold('7d %'),
      chalk.bold('RSI'),
      chalk.bold('MACD'),
      chalk.bold('EMA Trend'),
      chalk.bold('Score'),
      chalk.bold('Stop'),
      chalk.bold('Target'),
    ],
    style: { head: [], border: [] },
    colWidths: [9, 14, 14, 9, 9, 7, 10, 11, 9, 8, 8],
    wordWrap: true,
  });

  for (const a of analyses) {
    const { coin, indicators, score } = a;
    const macdStr =
      indicators.macd.crossover === 'bullish'
        ? chalk.greenBright('↑ Cross')
        : indicators.macd.crossover === 'bearish'
        ? chalk.redBright('↓ Cross')
        : indicators.macd.macdLine !== null && indicators.macd.signalLine !== null
        ? indicators.macd.macdLine > indicators.macd.signalLine
          ? chalk.green('Bullish')
          : chalk.red('Bearish')
        : chalk.gray('N/A');

    const emaTrend =
      indicators.emaTrend === 'uptrend'
        ? chalk.greenBright('↑ Up')
        : indicators.emaTrend === 'downtrend'
        ? chalk.redBright('↓ Down')
        : chalk.gray('→ Flat');

    table.push([
      chalk.bold(coin.symbol),
      coin.name.slice(0, 12),
      formatPrice(coin.currentPrice),
      colorPercent(coin.priceChange24hPercent),
      colorPercent(coin.priceChange7dPercent),
      formatRSI(indicators.rsi),
      macdStr,
      emaTrend,
      colorScore(score),
      a.riskMetrics ? colorPercent(-a.riskMetrics.stopLossLevel * 100) : chalk.gray('—'),
      a.riskMetrics ? colorPercent(a.riskMetrics.takeProfitLevel * 100) : chalk.gray('—'),
    ]);
  }

  return table.toString();
}

function printSection(
  title: string,
  emoji: string,
  color: ChalkInstance,
  analyses: EnhancedCoinAnalysis[],
  showSignals: boolean = true
): void {
  if (analyses.length === 0) return;

  console.log('\n' + color(DIVIDER));
  console.log(color(`${emoji}  ${title.toUpperCase()} (${analyses.length} coins)`));
  console.log(color(DIVIDER));

  console.log(buildSummaryTable(analyses));

  if (showSignals) {
    for (const a of analyses.slice(0, 5)) {
      // Show signals for top 5 only to keep output manageable
      console.log(color(`\n  📌 ${chalk.bold(a.coin.symbol)} — ${a.coin.name}`));
      for (const signal of a.signals) {
        console.log(`     ${signal}`);
      }
      // Exit plan: stop-loss / take-profit as % and absolute price levels
      if (a.riskMetrics) {
        const entry = a.coin.currentPrice;
        const stopPrice = entry * (1 - a.riskMetrics.stopLossLevel);
        const targetPrice = entry * (1 + a.riskMetrics.takeProfitLevel);
        console.log(
          chalk.red(`     🛑 Stop-loss: ${formatPercent(-a.riskMetrics.stopLossLevel * 100)} → exit at ${formatPrice(stopPrice)}`)
        );
        console.log(
          chalk.green(`     🎯 Take-profit: ${formatPercent(a.riskMetrics.takeProfitLevel * 100)} → exit at ${formatPrice(targetPrice)}`)
        );
        if (a.riskMetrics.trailingStopLevel !== undefined) {
          const trailPrice = entry * (1 - a.riskMetrics.trailingStopLevel);
          console.log(
            chalk.magenta(
              `     🔁 Trailing stop: ${formatPercent(-a.riskMetrics.trailingStopLevel * 100)} → exit at ${formatPrice(trailPrice)} (rises with the trend)`
            )
          );
        }
      }
    }
  }
}

/**
 * Print portfolio-level analysis section
 */
function printPortfolioSection(portfolio: PortfolioAnalysis): void {
  console.log('\n' + chalk.cyan(DIVIDER));
  console.log(chalk.cyan('💼  PORTFOLIO-LEVEL ANALYSIS'));
  console.log(chalk.cyan(DIVIDER));

  console.log(`  Combined market cap of analyzed coins: ${formatPrice(portfolio.totalValue)}`);
  console.log(`  Diversification score:             ${(portfolio.diversificationScore * 100).toFixed(1)}%`);
  console.log(`  Overall risk level:                ${portfolio.overallRisk.toUpperCase()}`);
  console.log(`  Expected return (momentum-based):  ${formatPercent(portfolio.expectedReturn * 100)}`);
  console.log(`  Portfolio volatility (annualized): ${(portfolio.riskMetrics.portfolioVolatility * 100).toFixed(2)}%`);
  console.log(`  Portfolio max drawdown:            ${(portfolio.riskMetrics.maxDrawdown * 100).toFixed(2)}%`);
  console.log(`  Portfolio Sharpe ratio:            ${portfolio.riskMetrics.sharpeRatio.toFixed(2)}`);

  if (portfolio.recommendedRebalancing.length > 0) {
    console.log(chalk.yellow('\n  🔧 Rebalancing suggestions:'));
    for (const rec of portfolio.recommendedRebalancing.slice(0, 8)) {
      console.log(chalk.yellow(`     • ${rec}`));
    }
  }
}

/**
 * Print the full market report to terminal
 */
export function printReport(report: MarketReport): void {
  const ts = report.generatedAt.toLocaleString('en-US', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  console.log('\n');
  console.log(chalk.cyan.bold('╔' + '═'.repeat(70) + '╗'));
  console.log(chalk.cyan.bold('║') + chalk.white.bold('       📊  CRYPTO MARKET ANALYSIS REPORT'.padEnd(70)) + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('║') + chalk.gray(`       Generated: ${ts}`.padEnd(70)) + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('║') + chalk.gray(`       Coins Analyzed: ${report.totalCoinsAnalyzed}`.padEnd(70)) + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('╚' + '═'.repeat(70) + '╝'));

  // Market regime banner (when BTC data was available)
  if (report.marketRegime) {
    const regime = report.marketRegime;
    const trend = `BTC ${regime.btcTrendPct >= 0 ? '+' : ''}${regime.btcTrendPct.toFixed(1)}% vs EMA20`;
    const demoted = regime.demotedCount > 0 ? ` — ${regime.demotedCount} BUY demoted` : '';
    const icon = regime.regime === 'risk-off' ? '🚦' : regime.regime === 'risk-on' ? '🟢' : '⚪';
    const color =
      regime.regime === 'risk-off' ? chalk.red : regime.regime === 'risk-on' ? chalk.green : chalk.gray;
    console.log(
      color(`  ${icon} Market regime: ${regime.regime.toUpperCase()} (${trend})${demoted}`)
    );
  }

  printSection(
    '🟢 BUY CANDIDATES',
    '🟢',
    chalk.green,
    report.buyList,
    true
  );

  printSection(
    '🟡 WATCHLIST',
    '🟡',
    chalk.yellow,
    report.watchList,
    true
  );

  printSection(
    '🔴 AVOID / POTENTIAL DROP',
    '🔴',
    chalk.red,
    report.avoidList,
    true
  );

  // Portfolio-level analysis (when available)
  if (report.portfolioAnalysis) {
    printPortfolioSection(report.portfolioAnalysis);
  }

  // Footer summary
  console.log('\n' + chalk.gray(DIVIDER));
  console.log(chalk.gray(`  Summary: `));
  console.log(chalk.green(`    🟢 Buy Candidates:  ${report.buyList.length}`));
  console.log(chalk.yellow(`    🟡 Watchlist:       ${report.watchList.length}`));
  console.log(chalk.red(`    🔴 Avoid:            ${report.avoidList.length}`));
  console.log(chalk.gray(DIVIDER));
  console.log(chalk.gray('\n  ⚠️  DISCLAIMER: This is NOT financial advice. Always do your own research.\n'));
}

/**
 * Export report to JSON file
 */
export function exportReportToJson(report: MarketReport): string {
  const outputDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = report.generatedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filePath = path.join(outputDir, `report-${timestamp}.json`);

  const jsonData = {
    generatedAt: report.generatedAt.toISOString(),
    totalCoinsAnalyzed: report.totalCoinsAnalyzed,
    buyList: report.buyList.map(summarizeCoin),
    watchList: report.watchList.map(summarizeCoin),
    avoidList: report.avoidList.map(summarizeCoin),
    portfolioAnalysis: report.portfolioAnalysis,
    marketRegime: report.marketRegime,
  };

  fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
  return filePath;
}

function summarizeCoin(a: EnhancedCoinAnalysis) {
  return {
    symbol: a.coin.symbol,
    name: a.coin.name,
    price: a.coin.currentPrice,
    change24h: a.coin.priceChange24hPercent,
    change7d: a.coin.priceChange7dPercent,
    score: a.score,
    rsi: a.indicators.rsi,
    macdCrossover: a.indicators.macd.crossover,
    emaTrend: a.indicators.emaTrend,
    bbPosition: a.indicators.bollingerBands.position,
    volumeSpike: a.indicators.volumeSpike,
    signals: a.signals,
    newsValidation: a.newsValidation
      ? {
          sentiment: a.newsValidation.newsSentiment,
          alignment: a.newsValidation.alignment,
          confidence: a.newsValidation.confidenceScore,
          articles: a.newsValidation.newsArticles,
        }
      : undefined,
    riskMetrics: a.riskMetrics,
    advancedIndicators: a.advancedIndicators
      ? {
          atr: a.advancedIndicators.atr,
          adx: a.advancedIndicators.adx,
          williamsR: a.advancedIndicators.williamsR,
          cci: a.advancedIndicators.cci,
          ichimokuPosition: a.advancedIndicators.ichimoku?.position,
          stochastic: a.advancedIndicators.stochasticOscillator?.position,
        }
      : undefined,
  };
}
