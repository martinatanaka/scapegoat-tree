# scapegoat-tree

A self-balancing binary search tree that rebuilds subtrees when their height exceeds a configurable logarithmic bound. No balance factors are stored on nodes; rebalancing is triggered lazily by the scapegoat-tree invariant and performed in linear time on the offending subtree.

```js
import { ScapegoatTree, defaultCompare } from 'scapegoat-tree';

const tree = new ScapegoatTree(defaultCompare, 0.6);
tree.insert(5, 'five');
tree.insert(2, 'two');
tree.insert(8, 'eight');

console.log(tree.find(2));      // 'two'
console.log(tree.minKey());     // 2
console.log(tree.maxKey());     // 8

tree.forEach((key, value) => {
  console.log(key, value);
});

tree.remove(5);
console.log(tree.has(5));      // false
console.log(tree.size);        // 2
```

Exports:
- `ScapegoatTree` — the tree class. Constructor: `new ScapegoatTree(compare = defaultCompare, alpha = 0.6)`, where `compare(a, b)` returns a negative number, zero, or a positive number (same convention as `Array.prototype.sort`), and `alpha` is the balance parameter in the half-open interval `(0.5, 1)`.
- `defaultCompare` — a numeric comparator (negative/zero/positive) for plain number keys. Pass your own comparator for any other key type.

Methods: `insert(key, value) -> boolean` (true if a new node was added, false on update), `remove(key) -> boolean`, `find(key) -> value | undefined`, `has(key) -> boolean`, `forEach((key, value) => boolean | void) -> boolean` (return true from the callback to stop early; the method returns true iff it stopped), `keys() -> Array`, `values() -> Array`, `min() / max() -> value | undefined`, `minKey() / maxKey() -> key | undefined`, `clear()`, `isEmpty() -> boolean`, `height() -> number` (edges on the longest root-to-leaf path; -1 for an empty tree). The `size` getter returns the current key count.

## Why this exists

Scapegoat trees are useful when you want guaranteed logarithmic lookup height without paying per-node balance bookkeeping on every mutation. The cost is paid instead in occasional O(subtree) rebuilds, which amortize to O(log n) per insert and O(log n) per delete. This library targets callers who want a small, dependency-free ordered map with those amortized bounds and no per-node metadata.

The trade-off: deletions are handled lazily. After a delete, the tree is not rebuilt locally; only when the live node count falls below `alpha * maxSize` is the whole root rebuilt in one pass. This keeps single deletes cheap and matches the original scapegoat-tree analysis, but it means a long sequence of deletions can briefly leave the tree taller than its insert bound until the global rebuild fires.

## Awkward edge

`alpha = 0.5` is rejected by the constructor. At 0.5 the height bound `log_{1/alpha}(n)` becomes `log_2(n)`, which would demand a perfectly balanced tree after every insert and cause a rebuild on essentially each operation. Values >= 1 disable balancing entirely and are also rejected. Pick a value like 0.6 or 0.7 for the usual balance between rebuild frequency and height.

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

