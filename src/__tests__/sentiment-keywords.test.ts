import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  countKeywordMatches,
  keywordRegex,
  quickSentiment,
  POSITIVE_KEYWORDS,
  NEGATIVE_KEYWORDS,
} from '../analyzer/sentiment-keywords';

test('word-boundary matching avoids substring false positives', () => {
  // 'up' must not match inside 'upgrade' or 'upgrading'
  assert.equal(countKeywordMatches('upgrading the upgrade', ['up']), 0);
  // 'crash' must not match inside 'crashproof'
  assert.equal(countKeywordMatches('crashproof system', ['crash']), 0);
  // exact word still matches
  assert.equal(countKeywordMatches('the market will up today', ['up']), 1);
});

test('multiword and hyphenated keywords match correctly', () => {
  assert.equal(countKeywordMatches('escalating trade war fears', ['trade war']), 1);
  assert.equal(countKeywordMatches('major sell-off underway', ['sell-off']), 1);
  assert.equal(countKeywordMatches('the selloff continues', ['sell-off']), 0); // different word
});

test('keywordRegex is case-insensitive and cached', () => {
  assert.ok(keywordRegex('moon').test('TO THE MOON'));
  assert.equal(keywordRegex('moon'), keywordRegex('moon')); // cached instance
});

test('quickSentiment classifies positive/negative/neutral', () => {
  assert.equal(quickSentiment('bullish surge with record partnership'), 1);
  assert.equal(quickSentiment('crash and hack investigation'), -1);
  assert.equal(quickSentiment('the price moved sideways'), 0);
  assert.equal(quickSentiment('no keywords at all here'), 0);
});

test('shared keyword lists are non-empty and have no exact duplicates', () => {
  assert.ok(POSITIVE_KEYWORDS.length > 30);
  assert.ok(NEGATIVE_KEYWORDS.length > 40);
  assert.equal(new Set(POSITIVE_KEYWORDS).size, POSITIVE_KEYWORDS.length);
  assert.equal(new Set(NEGATIVE_KEYWORDS).size, NEGATIVE_KEYWORDS.length);
});
