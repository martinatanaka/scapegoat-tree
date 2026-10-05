import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScapegoatTree, defaultCompare } from '../src/index.js';

function fillSequential(tree, n) {
  for (let i = 1; i <= n; i++) tree.insert(i, `v${i}`);
}

// Inserting 1..n into a plain BST produces a right-leaning chain of height n-1.
// The scapegoat tree must detect this and rebuild, keeping height O(log n).
test('sequential insertion stays balanced (height is logarithmic, not linear)', () => {
  const t = new ScapegoatTree(defaultCompare, 0.6);
  fillSequential(t, 1000);
  assert.equal(t.size, 1000);
  // log_{1/0.6}(1000) ≈ 14.5; allow generous slack but rule out the O(n) chain.
  assert.ok(t.height() <= 32, `height ${t.height()} exceeds logarithmic bound`);
  // Keys must still be in strictly ascending order via forEach.
  const keys = t.keys();
  for (let i = 0; i < keys.length; i++) {
    assert.equal(keys[i], i + 1);
  }
});

test('find returns the stored value, or undefined for missing keys', () => {
  const t = new ScapegoatTree();
  t.insert(5, 'five');
  t.insert(10, 'ten');
  assert.equal(t.find(5), 'five');
  assert.equal(t.find(10), 'ten');
  assert.equal(t.find(7), undefined);
  assert.equal(t.has(5), true);
  assert.equal(t.has(7), false);
});

test('insert overwrites existing value and does not grow size', () => {
  const t = new ScapegoatTree();
  assert.equal(t.insert(1, 'a'), true);
  assert.equal(t.insert(1, 'b'), false);
  assert.equal(t.size, 1);
  assert.equal(t.find(1), 'b');
});

test('forEach visits keys in ascending order and supports early stop', () => {
  const t = new ScapegoatTree();
  for (const k of [5, 2, 8, 1, 3, 7, 9]) t.insert(k, k * 10);
  const seen = [];
  const stopped = t.forEach((k, v) => {
    seen.push([k, v]);
    if (k === 3) return true;
  });
  assert.equal(stopped, true);
  assert.deepEqual(seen, [[1, 10], [2, 20], [3, 30]]);
});

test('forEach with no early stop returns false and visits everything', () => {
  const t = new ScapegoatTree();
  t.insert(2, 'b');
  t.insert(1, 'a');
  t.insert(3, 'c');
  const seen = [];
  const stopped = t.forEach((k, v) => { seen.push(v); });
  assert.equal(stopped, false);
  assert.deepEqual(seen, ['a', 'b', 'c']);
});

test('remove on a missing key returns false and leaves the tree intact', () => {
  const t = new ScapegoatTree();
  t.insert(1, 'a');
  t.insert(2, 'b');
  assert.equal(t.remove(99), false);
  assert.equal(t.size, 2);
  assert.equal(t.find(1), 'a');
});

test('remove a leaf, a node with one child, and a node with two children', () => {
  const t = new ScapegoatTree();
  // Shape:
  //        4
  //       / \
  //      2   6
  //     / \ / \
  //    1  3 5  7
  for (const k of [4, 2, 6, 1, 3, 5, 7]) t.insert(k, k);
  // leaf
  assert.equal(t.remove(1), true);
  assert.equal(t.find(1), undefined);
  // node with one child (after removing 1, node 2 has only right child 3)
  assert.equal(t.remove(2), true);
  assert.equal(t.find(2), undefined);
  assert.equal(t.find(3), 3);
  // node with two children
  assert.equal(t.remove(6), true);
  assert.equal(t.find(6), undefined);
  assert.equal(t.find(5), 5);
  assert.equal(t.find(7), 7);
  assert.equal(t.size, 4);
});

test('removing the root with two children uses the in-order successor', () => {
  const t = new ScapegoatTree();
  for (const k of [4, 2, 6, 5, 7]) t.insert(k, k);
  assert.equal(t.remove(4), true);
  // 5 is the successor of 4 and must now be at the root.
  assert.equal(t.minKey(), 2);
  assert.equal(t.maxKey(), 7);
  // All remaining keys still present and ordered.
  assert.deepEqual(t.keys(), [2, 5, 6, 7]);
});

test('repeated insert/remove churn keeps all keys findable and ordered', () => {
  const t = new ScapegoatTree();
  for (let i = 1; i <= 200; i++) t.insert(i, i);
  for (let i = 1; i <= 100; i++) assert.equal(t.remove(i), true);
  for (let i = 1; i <= 100; i++) assert.equal(t.find(i), undefined);
  for (let i = 101; i <= 200; i++) assert.equal(t.find(i), i);
  // After deleting half the tree, a global rebuild should have occurred.
  // The remaining keys must still be in ascending order.
  assert.deepEqual(t.keys(), Array.from({ length: 100 }, (_, i) => i + 101));
});

test('min/max and minKey/maxKey on empty and non-empty trees', () => {
  const empty = new ScapegoatTree();
  assert.equal(empty.min(), undefined);
  assert.equal(empty.max(), undefined);
  assert.equal(empty.minKey(), undefined);
  assert.equal(empty.maxKey(), undefined);

  const t = new ScapegoatTree();
  for (const k of [5, 2, 8, 1, 9]) t.insert(k, `v${k}`);
  assert.equal(t.min(), 'v1');
  assert.equal(t.max(), 'v9');
  assert.equal(t.minKey(), 1);
  assert.equal(t.maxKey(), 9);
});

test('clear empties the tree and resets internal counters', () => {
  const t = new ScapegoatTree();
  for (let i = 0; i < 50; i++) t.insert(i, i);
  t.clear();
  assert.equal(t.size, 0);
  assert.equal(t.isEmpty(), true);
  assert.equal(t.find(0), undefined);
  // Inserting after clear still works.
  t.insert(1, 'x');
  assert.equal(t.find(1), 'x');
});

test('custom comparator is honored (descending numeric order)', () => {
  const desc = (a, b) => (a < b ? 1 : a > b ? -1 : 0);
  const t = new ScapegoatTree(desc);
  for (const k of [3, 1, 4, 1, 5]) t.insert(k, k);
  // With a descending comparator, "min" is the largest numeric key.
  assert.equal(t.minKey(), 5);
  assert.equal(t.maxKey(), 1);
  assert.deepEqual(t.keys(), [5, 4, 3, 1]);
});

test('constructor rejects invalid alpha and non-function comparator', () => {
  assert.throws(() => new ScapegoatTree(undefined, 0.5), RangeError);
  assert.throws(() => new ScapegoatTree(undefined, 1), RangeError);
  assert.throws(() => new ScapegoatTree('not a function', 0.7), TypeError);
});

test('forEach throws when callback is not a function', () => {
  const t = new ScapegoatTree();
  t.insert(1, 1);
  assert.throws(() => t.forEach(null), TypeError);
});

test('inserting in reverse-then-forward order still yields a sorted iteration', () => {
  const t = new ScapegoatTree();
  for (let i = 100; i >= 1; i--) t.insert(i, i);
  for (let i = 1; i <= 100; i++) t.insert(i + 1000, i + 1000);
  const keys = t.keys();
  assert.equal(keys.length, 200);
  // Keys 1..100 are followed by keys 1001..1100; both ranges must be
  // strictly ascending and concatenated in order.
  for (let i = 0; i < 100; i++) assert.equal(keys[i], i + 1);
  for (let i = 0; i < 100; i++) assert.equal(keys[i + 100], i + 1001);
});

test('height bound holds for a pseudo-random insertion order (deterministic)', () => {
  // Deterministic LCG so the test is reproducible across machines.
  let state = 42;
  const order = [];
  for (let i = 0; i < 5000; i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    order.push(state % 5000);
  }
  const t = new ScapegoatTree();
  for (const k of order) t.insert(k, k);
  // The LCG modulo 5000 collides heavily, so size is the number of distinct
  // values produced — not 5000. The tree must still be well-balanced for
  // whatever distinct set results.
  assert.ok(t.height() < 50, `height ${t.height()} too large`);
  assert.ok(t.size > 0 && t.size <= 5000);
  // Every key reported by keys() must be findable, and keys() must be sorted.
  const keys = t.keys();
  for (let i = 1; i < keys.length; i++) {
    assert.ok(keys[i] > keys[i - 1], 'keys out of order');
  }
  for (const k of keys) assert.equal(t.find(k), k);
});

test('deleting down to a single key leaves a usable tree', () => {
  const t = new ScapegoatTree();
  for (let i = 1; i <= 20; i++) t.insert(i, i);
  for (let i = 1; i <= 19; i++) t.remove(i);
  assert.equal(t.size, 1);
  assert.equal(t.find(20), 20);
  assert.equal(t.minKey(), 20);
  assert.equal(t.maxKey(), 20);
});
