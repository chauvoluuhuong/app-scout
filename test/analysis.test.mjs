import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignTiers, clusterLayout, estimateRevenue, monthlyPrice, revenueBucket, sameProduct, segmentStats, spiralLayout } from '../server/analysis.mjs';
import { human, pageText, parseCount, queryMatch } from '../server/lib/util.mjs';

test('parseCount reads store labels', () => {
  assert.equal(parseCount('5M+'), 5000000);
  assert.equal(parseCount('43.2K'), 43200);
  assert.equal(parseCount('1,234,567 users'), 1234567);
  assert.equal(parseCount(null), null);
  assert.equal(human(1234567), '1.2M');
});

test('pageText keeps visible text only', () => {
  assert.deepEqual(pageText('<div>In-App Purchases</div><script>x()</script><p>Pro &amp; More</p><p>$9.99</p>'), ['In-App Purchases', 'Pro & More', '$9.99']);
});

test('queryMatch scores word overlap', () => {
  assert.equal(queryMatch('ai meeting notes', { name: 'Meeting Notes AI', summary: '' }), 1);
  assert.equal(queryMatch('ai meeting notes', { name: 'Meeting tracker', summary: '' }), 0.5);
  assert.equal(queryMatch('ai', { name: 'x' }), 1);
});

test('monthlyPrice normalises weekly and yearly plans and skips credits', () => {
  assert.equal(monthlyPrice({ iapItems: [{ name: 'Pro Yearly', price: '$59.99' }, { name: 'Pro Weekly', price: '$4.99' }, { name: '100 credits', price: '$1.99' }] }), 5);
  assert.equal(monthlyPrice({ iapItems: [] }), null);
});

test('estimateRevenue uses App Store ratings x 50..100 and labels the result', () => {
  const e = estimateRevenue({ store: 'appstore', ratingsCount: 10000, iapItems: [{ name: 'Pro Monthly', price: '$10.00' }] });
  assert.equal(e.revenueLow, 10000 * 50 * 0.3 * 0.01 * 10);
  assert.equal(e.revenueHigh, 10000 * 100 * 0.3 * 0.04 * 10);
  assert.match(e.revenueLabel, /^est\. \$/);
  assert.equal(e.revenueConf, 'L');
  assert.equal(estimateRevenue({ store: 'github', users: 100 }).revenue, null);
});

test('sameProduct matches one product across stores, and not look-alikes', () => {
  assert.equal(sameProduct({ name: 'Otter Transcribe Voice Notes' }, { name: 'OtterAI Transcribe Voice Notes' }), true);
  assert.equal(sameProduct({ name: 'Fireflies: AI notetaker' }, { name: 'Fireflies: AI meeting notes', developer: '' }), false);
  assert.equal(sameProduct({ name: 'Fireflies: AI notetaker', developer: 'Fireflies.ai Corp' }, { name: 'Fireflies: AI meeting notes', developer: 'Fireflies.ai' }), true);
  assert.equal(sameProduct({ name: 'Granola - AI Meeting Notes' }, { name: 'Granola - AI Meeting Notes' }), true);
  assert.equal(sameProduct({ name: 'Summary - AI Note Taker' }, { name: 'Smart Noter - AI Note Taker' }), false);
  assert.equal(sameProduct({ name: 'AI Meeting Notes' }, { name: 'AI Transcribe. Speech to Text' }), false);
  assert.equal(sameProduct({ name: 'ChatGPT' }, { name: 'ChatGPT' }), true);
});

test('revenueBucket splits at $10k and $1M a month', () => {
  assert.deepEqual([revenueBucket(null), revenueBucket(9999), revenueBucket(5e5), revenueBucket(2e6)], [null, 0, 1, 2]);
});

test('assignTiers ranks within each store', () => {
  const apps = [{ store: 'play', users: 100 }, { store: 'play', users: 10 }, { store: 'play', users: 1 }, { store: 'appstore', users: 5 }, { store: 'github', users: 0 }];
  assignTiers(apps);
  assert.deepEqual(apps.map((a) => a.tier), [2, 1, 0, 2, 0]);
});

test('layouts place every app inside the world', () => {
  const apps = Array.from({ length: 60 }, (_, i) => ({ id: `a${i}`, seg: `s${i % 3}`, kw: `s${i % 3}k${i % 2}` }));
  spiralLayout(apps);
  assert.ok(apps.every((a) => Number.isFinite(a.x) && Number.isFinite(a.y)));
  const segments = [0, 1, 2].map((i) => ({ id: `s${i}` }));
  const keywords = segments.flatMap((s) => [0, 1].map((j) => ({ id: `${s.id}k${j}`, seg: s.id })));
  clusterLayout(apps, segments, keywords);
  assert.ok(apps.every((a) => a.x > 0 && a.x < 1000 && a.y > 0 && a.y < 600));
  const st = segmentStats(segments[0], apps, apps.length);
  assert.equal(st.apps, 20);
});
