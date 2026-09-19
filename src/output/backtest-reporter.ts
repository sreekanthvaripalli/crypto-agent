import chalk from 'chalk';
import Table from 'cli-table3';
import fs from 'fs';
import path from 'path';
import { BacktestReport, SignalCategory } from '../types';

const DIVIDER = '━'.repeat(78);

const CATEGORY_COLORS: Record<SignalCategory, (s: string) => string> = {
  BUY: (s) => chalk.green(s),
  WATCHLIST: (s) => chalk.yellow(s),
  AVOID: (s) => chalk.red(s),
};

function formatPercent(value: number, digits = 2): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(digits)}%`;
}

function colorSigned(value: number): string {
  const str = formatPercent(value);
  if (value > 0) return chalk.greenBright(str);
  if (value < 0) return chalk.redBright(str);
  return chalk.gray(str);
}

/**
 * Print the backtest summary: per-category forward returns, risk excursions
 * and the BUY-vs-AVOID spread that tells you whether the ranking works.
 */
export function printBacktestReport(report: BacktestReport): void {
  console.log('\n' + chalk.cyan.bold('╔' + '═'.repeat(76) + '╗'));
  console.log(
    chalk.cyan.bold('║') +
      chalk.white.bold('       📊  SIGNAL BACKTEST — FORWARD RETURN ANALYSIS'.padEnd(76)) +
      chalk.cyan.bold('║')
  );
  console.log(chalk.cyan.bold('╚' + '═'.repeat(76) + '╝'));

  console.log(chalk.gray(`  Coins analyzed: ${report.coinsAnalyzed}   skipped (insufficient data): ${report.coinsSkipped}`));
  console.log(chalk.gray(`  Signals evaluated: ${report.samples}   candles/day: ${report.candlesPerDay}   warmup: ${report.warmupCandles} candles`));
  console.log(chalk.gray(`  Horizons: ${report.horizonsInDays.map((h) => `${h}d`).join(', ')}\n`));

  const horizons = report.horizonsInDays.map((h) => `${h}d`);
  const head = [chalk.bold('Category'), chalk.bold('Samples')];
  const widths = [10, 8];
  for (const h of horizons) {
    head.push(chalk.bold(`Hit ${h}`), chalk.bold(`Avg ${h}`));
    widths.push(8, 9);
  }
  head.push(chalk.bold('Avg MAE'), chalk.bold('IR last'));
  widths.push(9, 8);

  const table = new Table({
    head,
    style: { head: [], border: [] },
    colWidths: widths,
    wordWrap: true,
  });

  for (const stat of report.stats) {
    const color = CATEGORY_COLORS[stat.category];
    const row: string[] = [color(chalk.bold(stat.category)), String(stat.samples)];
    for (const h of horizons) {
      const hs = stat.horizons.find((x) => x.horizon === h);
      row.push(
        hs && hs.samples > 0 ? `${(hs.hitRate * 100).toFixed(0)}%` : chalk.gray('—'),
        hs && hs.samples > 0 ? colorSigned(hs.avgReturn) : chalk.gray('—')
      );
    }
    row.push(
      chalk.red(formatPercent(stat.avgMaxAdverseExcursion)),
      stat.horizons.length ? stat.horizons[stat.horizons.length - 1].signalIr.toFixed(2) : '—'
    );
    table.push(row);
  }

  console.log(table.toString());

  // ─── The key question: does BUY beat AVOID? ────────────────────────────────
  console.log('\n' + chalk.cyan(DIVIDER));
  console.log(chalk.cyan('  🎯 SIGNAL EDGE (BUY vs AVOID / vs ALL)'));
  console.log(chalk.cyan(DIVIDER));

  for (const spread of report.spreads) {
    const works = spread.buyMinusAvoid > 0;
    console.log(
      `  ${spread.horizon.padEnd(4)}  BUY − AVOID: ${colorSigned(spread.buyMinusAvoid).padEnd(20)}` +
        `BUY − ALL: ${colorSigned(spread.buyMinusAll).padEnd(20)}` +
        (works ? chalk.green('✓ edge') : chalk.red('✗ no edge'))
    );
  }

  console.log('\n' + chalk.gray(DIVIDER));
  console.log(chalk.gray('  ℹ️  Interpretation:'));
  console.log(chalk.gray('     • Hit rate = share of signals followed by a positive return.'));
  console.log(chalk.gray('     • Avg MAE = average worst drawdown from entry within the horizon.'));
  console.log(chalk.gray('     • IR = mean/std of forward returns (higher = more consistent).'));
  console.log(chalk.gray('     • A positive BUY − AVOID spread means the ranking has predictive power.'));
  console.log(chalk.yellow('     ⚠️  Samples overlap heavily and cover one 30-day regime — treat as'));
  console.log(chalk.yellow('         indicative, not statistical proof. Not financial advice.'));
  console.log(chalk.gray(DIVIDER) + '\n');
}

/**
 * Export the backtest summary to a JSON file
 */
export function exportBacktestToJson(report: BacktestReport): string {
  const outputDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = report.generatedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filePath = path.join(outputDir, `backtest-${timestamp}.json`);

  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        generatedAt: report.generatedAt.toISOString(),
        coinsAnalyzed: report.coinsAnalyzed,
        coinsSkipped: report.coinsSkipped,
        samples: report.samples,
        candlesPerDay: report.candlesPerDay,
        warmupCandles: report.warmupCandles,
        horizonsInDays: report.horizonsInDays,
        stats: report.stats,
        spreads: report.spreads,
        ...(report.outcomes ? { outcomes: report.outcomes } : {}),
      },
      null,
      2
    )
  );

  return filePath;
}