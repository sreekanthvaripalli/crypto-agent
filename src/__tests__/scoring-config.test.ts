import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DEFAULT_WEIGHTS, loadWeights, normalizeWeights } from '../analyzer/scoring-config';

test('defaults replicate the legacy hand-picked constants', () => {
  assert.equal(DEFAULT_WEIGHTS.rsiDeepOversold, 30);
  assert.equal(DEFAULT_WEIGHTS.rsiOversold, 20);
  assert.equal(DEFAULT_WEIGHTS.rsiMild, 10);
  assert.equal(DEFAULT_WEIGHTS.macdCrossover, 25);
  assert.equal(DEFAULT_WEIGHTS.macdOngoing, 10);
  assert.equal(DEFAULT_WEIGHTS.macdHistogram, 5);
  assert.equal(DEFAULT_WEIGHTS.emaTrend, 15);
  assert.equal(DEFAULT_WEIGHTS.bollinger, 15);
  assert.equal(DEFAULT_WEIGHTS.priceDipDeep, 10);
  assert.equal(DEFAULT_WEIGHTS.priceDip, 5);
  assert.equal(DEFAULT_WEIGHTS.priceRallyDeep, 10);
  assert.equal(DEFAULT_WEIGHTS.priceRally, 5);
  assert.equal(DEFAULT_WEIGHTS.volumeSpike, 10);
  assert.equal(DEFAULT_WEIGHTS.buyThreshold, 25);
  assert.equal(DEFAULT_WEIGHTS.avoidThreshold, -25);
});

test('loadWeights merges overrides over defaults', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'weights-'));
  const file = path.join(dir, 'weights.json');
  fs.writeFileSync(file, JSON.stringify({ rsiDeepOversold: 45, buyThreshold: 40 }));

  const weights = loadWeights(file);
  assert.equal(weights.rsiDeepOversold, 45);
  assert.equal(weights.buyThreshold, 40);
  assert.equal(weights.rsiOversold, 20, 'unset fields keep defaults');
});

test('loadWeights ignores invalid values instead of breaking', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'weights-'));
  const file = path.join(dir, 'weights.json');
  fs.writeFileSync(
    file,
    JSON.stringify({ rsiDeepOversold: 'not-a-number', macdCrossover: 40, extra: 'ignored' })
  );

  const weights = loadWeights(file);
  assert.equal(weights.rsiDeepOversold, 30, 'invalid value falls back to default');
  assert.equal(weights.macdCrossover, 40, 'valid override applied');
  assert.equal((weights as unknown as Record<string, unknown>).extra, undefined);
});

test('loadWeights returns defaults for missing or corrupt files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'weights-'));
  const missing = path.join(dir, 'nope.json');
  assert.deepEqual(loadWeights(missing), DEFAULT_WEIGHTS);

  const corrupt = path.join(dir, 'corrupt.json');
  fs.writeFileSync(corrupt, '{ not valid json');
  assert.deepEqual(loadWeights(corrupt), DEFAULT_WEIGHTS);
});

test('normalizeWeights rounds to two decimals', () => {
  const weights = normalizeWeights({
    ...DEFAULT_WEIGHTS,
    macdCrossover: 25.6789,
    emaTrend: 15.004,
  });
  assert.equal(weights.macdCrossover, 25.68);
  assert.equal(weights.emaTrend, 15);
});
