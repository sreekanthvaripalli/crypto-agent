import cron from 'node-cron';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

// ─── Schedule Configuration ───────────────────────────────────────────────────
// Default: Run every day at 8:00 AM local time
// Cron format: 'minute hour day-of-month month day-of-week'
const SCHEDULE = process.env.CRON_SCHEDULE || '0 8 * * *';

// Prefer the compiled dist/index.js when the scheduler itself runs compiled
// (node dist/scheduler.js); fall back to ts-node for source runs.
const compiledScript = path.join(__dirname, 'index.js');
const sourceScript = path.join(__dirname, 'index.ts');
const runningCompiled =
  __dirname.replace(/\\/g, '/').includes('/dist') && fs.existsSync(compiledScript);

const AGENT_SCRIPT = runningCompiled ? compiledScript : sourceScript;
const AGENT_CMD = runningCompiled ? `node "${AGENT_SCRIPT}"` : `npx ts-node "${AGENT_SCRIPT}"`;

function runAgent(): void {
  const timestamp = new Date().toLocaleString();
  console.log(chalk.cyan(`\n⏰ [${timestamp}] Scheduled run triggered...\n`));

  const cmd = `${AGENT_CMD} --refresh`;

  const child = exec(cmd, { cwd: process.cwd() });

  child.stdout?.on('data', (data: string) => process.stdout.write(data));
  child.stderr?.on('data', (data: string) => process.stderr.write(data));

  child.on('close', (code: number | null) => {
    if (code === 0) {
      console.log(chalk.green(`\n✅ [${new Date().toLocaleString()}] Agent run completed successfully.\n`));
    } else {
      console.log(chalk.red(`\n❌ [${new Date().toLocaleString()}] Agent run failed with exit code ${code}.\n`));
    }
  });
}

// ─── Validate Cron Expression ─────────────────────────────────────────────────
if (!cron.validate(SCHEDULE)) {
  console.error(chalk.red(`❌ Invalid cron expression: "${SCHEDULE}"`));
  console.error(chalk.gray('   Use format: "minute hour day month weekday"'));
  console.error(chalk.gray('   Example for 8:00 AM daily: "0 8 * * *"'));
  process.exit(1);
}

// ─── Start Scheduler ─────────────────────────────────────────────────────────
console.log(chalk.cyan.bold('\n📅 Crypto Market Analysis Scheduler Started'));
console.log(chalk.gray(`   Schedule: "${SCHEDULE}"`));
console.log(chalk.gray('   Common schedules:'));
console.log(chalk.gray('     Every day at 8:00 AM  → "0 8 * * *"'));
console.log(chalk.gray('     Every 6 hours         → "0 */6 * * *"'));
console.log(chalk.gray('     Every hour            → "0 * * * *"'));
console.log(chalk.gray('\n   Set CRON_SCHEDULE env variable to change schedule.'));
console.log(chalk.gray('   Press Ctrl+C to stop.\n'));

// Run immediately on startup
console.log(chalk.yellow('▶  Running initial analysis now...\n'));
runAgent();

// Schedule recurring runs
cron.schedule(SCHEDULE, () => {
  runAgent();
});

console.log(chalk.green(`✅ Scheduler active. Next run at the scheduled time.\n`));
