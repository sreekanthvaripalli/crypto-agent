const { execSync } = require('child_process');
const { readdirSync } = require('fs');
const path = require('path');

const testsDir = path.join(__dirname, '..', 'dist', '__tests__');

const files = readdirSync(testsDir)
  .filter(f => f.endsWith('.test.js'))
  .sort();

if (files.length === 0) {
  console.error('No test files found in', testsDir);
  process.exit(1);
}

const filePaths = files.map(f => path.join(testsDir, f));
console.log('Running %d test files...', files.length);
files.forEach(f => console.log('  → ' + f));

try {
  execSync('node --test --test-concurrency=1 ' + filePaths.join(' '), {
    stdio: 'inherit'
  });
} catch (e) {
  process.exit(e.status || 1);
}
