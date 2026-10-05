/**
 * Scapegoat tree implementation.
 *
 * A scapegoat tree is a self-balancing binary search tree that does not store
 * balance information in its nodes. Instead, after an insertion or deletion
 * that leaves the tree too imbalanced, it locates a single "scapegoat" node
 * — the highest node on the search path whose subtree violates the height
 * or weight invariant — and rebuilds that subtree into a perfectly balanced
 * shape in linear time.
 *
 * The balancing parameter `alpha` (in the half-open interval (0.5, 1))
 * controls how slack the tree is. Values close to 0.5 keep the tree tight
 * (more frequent rebuilds, lower height); values close to 1 allow the tree
 * to drift toward a plain BST (fewer rebuilds, higher worst-case height).
 *
 * Design choices:
 *   - Recursive search-path walk for scapegoat discovery. The tree is never
 *     deeper than O(log_{1/alpha} n), so recursion is safe for any realistic n.
 *   - Deletion uses the classic scapegoat strategy: shrink the tree lazily
 *     by removing the node, and only rebuild the whole root when the live
 *     node count drops below alpha * max_node_count. This avoids per-delete
 *     rebuilding while still guaranteeing amortized O(log n) deletions.
 *   - Comparators are plain functions (a, b) => number, matching the
 *     Array.prototype.sort convention, so callers can reuse comparators
 *     they already have.
 */

/**
 * Default comparator for numbers (and for strings via coercion-safe ordering).
 * Returns negative when a < b, zero when equal, positive when a > b.
 *
 * Implemented with subtraction for numbers. We deliberately do not try to
 * handle strings here — a library that silently orders "10" before "2" via
 * numeric subtraction, or silently orders numbers via locale-aware string
 * comparison, is a library that surprises its users. Callers with non-numeric
 * keys pass their own comparator.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function defaultCompare(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Build a perfectly balanced BST from an in-order array of nodes.
 * The array is mutated (consumed) to avoid an extra allocation; callers
 * pass a freshly allocated array each time, so this is safe and keeps
 * memory churn low.
 *
 * @param {Array<Node|null>} nodes
 * @param {number} start
 * @param {number} end inclusive upper bound
 * @returns {Node|null}
 */
function buildPerfect(nodes, start, end) {
  if (start > end) return null;
  const mid = (start + end) >> 1;
  const node = nodes[mid];
  node.left = buildPerfect(nodes, start, mid - 1);
  node.right = buildPerfect(nodes, mid + 1, end);
  return node;
}

/**
 * Flatten a subtree into the provided array in in-order, then rebuild it
 * as a perfectly balanced tree. Returns the new subtree root.
 *
 * In-order is essential here: it preserves the BST key ordering, which is
 * the only invariant a rebuild must not violate.
 *
 * @param {Node|null} node
 * @returns {Node|null}
 */
function rebuild(node) {
  const nodes = [];
  let cur = node;
  const stack = [];
  while (cur !== null || stack.length > 0) {
    while (cur !== null) {
      stack.push(cur);
      cur = cur.left;
    }
    cur = stack.pop();
    nodes.push(cur);
    cur = cur.right;
  }
  return buildPerfect(nodes, 0, nodes.length - 1);
}

/**
 * Count nodes in a subtree. Used only on the scapegoat candidate's children,
 * which are by definition bounded in size, so recursion depth is bounded.
 *
 * @param {Node|null} node
 * @returns {number}
 */
function count(node) {
  if (node === null) return 0;
  return 1 + count(node.left) + count(node.right);
}

class Node {
  constructor(key, value) {
    this.key = key;
    this.value = value;
    /** @type {Node|null} */
    this.left = null;
    /** @type {Node|null} */
    this.right = null;
  }
}

export class ScapegoatTree {
  /**
   * @param {(a: any, b: any) => number} compare
   * @param {number} alpha  Balance parameter in (0.5, 1).
   */
  constructor(compare = defaultCompare, alpha = 0.6) {
    if (typeof compare !== 'function') {
      throw new TypeError('compare must be a function');
    }
    if (!(alpha > 0.5 && alpha < 1)) {
      // alpha == 0.5 would require perfect balance at all times (degenerate);
      // alpha >= 1 disables balancing entirely. Both are excluded so the
      // tree's documented O(log n) bound actually holds.
      throw new RangeError('alpha must be in the half-open interval (0.5, 1)');
    }
    this._compare = compare;
    this._alpha = alpha;
    this._root = null;
    this._size = 0;
    this._maxSize = 0;
  }

  /**
   * The base used for height bounds: log_{1/alpha}(n). Because alpha in
   * (0.5, 1), 1/alpha is in (1, 2), so this grows strictly slower than
   * log2(n) as alpha approaches 0.5 and approaches log2(n) as alpha -> 1.
   * @param {number} n
   * @returns {number}
   */
  _logAlpha(n) {
    return Math.log(n) / Math.log(1 / this._alpha);
  }

  /** Number of keys currently in the tree. */
  get size() {
    return this._size;
  }

  /**
   * True when the tree contains no keys.
   */
  isEmpty() {
    return this._root === null;
  }

  /**
   * Insert a key/value pair. Overwrites the value if the key exists.
   * Returns true if a new node was added, false if an existing key was updated.
   *
   * @param {*} key
   * @param {*} value
   * @returns {boolean}
   */
  insert(key, value) {
    const path = [];
    let node = this._root;
    let parent = null;
    let cmp = 0;
    while (node !== null) {
      cmp = this._compare(key, node.key);
      if (cmp === 0) {
        node.value = value;
        return false;
      }
      parent = node;
      path.push(node);
      node = cmp < 0 ? node.left : node.right;
    }

    const newNode = new Node(key, value);
    if (parent === null) {
      this._root = newNode;
    } else if (cmp < 0) {
      parent.left = newNode;
    } else {
      parent.right = newNode;
    }
    this._size++;
    this._maxSize = Math.max(this._maxSize, this._size);
    path.push(newNode);

    // Height bound: the deepest node's depth must be <= log_{1/alpha}(size).
    // depth of root is 0, so path.length - 1 is the depth of newNode.
    const depth = path.length - 1;
    const hBound = Math.floor(this._logAlpha(this._size));
    if (depth <= hBound) {
      return true;
    }

    this._rebalanceAfterInsert(path);
    return true;
  }

  /**
   * Walk the insertion path from the inserted node upward and rebuild the
   * first node whose subtree is alpha-weight-imbalanced. Rebuilding the
   * lowest such node is insufficient (the tree could still violate the
   * height invariant above it), so we must take the first one we find.
   *
   * @param {Node[]} path  path from root to the newly inserted node, inclusive
   */
  _rebalanceAfterInsert(path) {
    const n = path.length;
    // Iterate from just above the inserted node upward to the root.
    // The inserted node itself has a trivially balanced (single-node) subtree,
    // so we start at index n - 2.
    for (let i = n - 2; i >= 0; i--) {
      const node = path[i];
      const child = path[i + 1];
      const leftSize = count(node.left);
      const rightSize = count(node.right);
      const total = leftSize + rightSize + 1;

      // A node is a scapegoat if either child holds strictly more than
      // alpha * (total) of its subtree's nodes. Using strict > (not >=)
      // avoids rebuilding a perfectly balanced tree whose child is exactly
      // at the threshold, which is the common case after a previous rebuild.
      const threshold = this._alpha * total;
      if (leftSize > threshold || rightSize > threshold) {
        const rebuilt = rebuild(node);
        if (i === 0) {
          this._root = rebuilt;
        } else {
          const parent = path[i - 1];
          if (parent.left === node) {
            parent.left = rebuilt;
          } else {
            parent.right = rebuilt;
          }
        }
        return;
      }
    }
  }

  /**
   * Remove the node with the given key, if present.
   * Returns true if a node was removed, false if the key was not found.
   *
   * @param {*} key
   * @returns {boolean}
   */
  remove(key) {
    const path = [];
    let node = this._root;
    while (node !== null) {
      const cmp = this._compare(key, node.key);
      if (cmp === 0) break;
      path.push(node);
      node = cmp < 0 ? node.left : node.right;
    }
    if (node === null) return false;

    // Standard BST deletion by case.
    if (node.left !== null && node.right !== null) {
      // Inline successor search so we capture the successor's parent path
      // exactly, including the case where the successor is the node's
      // immediate right child (splicing must preserve that link).
      let succParent = node;
      let succ = node.right;
      path.push(node);
      while (succ.left !== null) {
        succParent = succ;
        path.push(succ);
        succ = succ.left;
      }
      node.key = succ.key;
      node.value = succ.value;
      // Now delete `succ`, which has at most a right child.
      if (succParent.left === succ) {
        succParent.left = succ.right;
      } else {
        succParent.right = succ.right;
      }
    } else {
      const replacement = node.left !== null ? node.left : node.right;
      if (path.length === 0) {
        this._root = replacement;
      } else {
        const parent = path[path.length - 1];
        if (parent.left === node) {
          parent.left = replacement;
        } else {
          parent.right = replacement;
        }
      }
    }

    this._size--;
    // Lazy global rebuild: when the live count drops below alpha * maxSize,
    // the tree has lost enough mass that scattered rebuilds on individual
    // deletes are not worth their cost; rebuild the whole root in one pass.
    if (this._size > 0 && this._size < this._alpha * this._maxSize) {
      this._root = rebuild(this._root);
      this._maxSize = this._size;
    } else if (this._size === 0) {
      this._maxSize = 0;
      this._root = null;
    }
    return true;
  }

  /**
   * Lookup a value by key. Returns undefined if the key is absent.
   * @param {*} key
   * @returns {*}
   */
  find(key) {
    let node = this._root;
    while (node !== null) {
      const cmp = this._compare(key, node.key);
      if (cmp === 0) return node.value;
      node = cmp < 0 ? node.left : node.right;
    }
    return undefined;
  }

  has(key) {
    return this.find(key) !== undefined;
  }

  /**
   * Returns the value for the smallest key, or undefined if empty.
   */
  min() {
    if (this._root === null) return undefined;
    let node = this._root;
    while (node.left !== null) node = node.left;
    return node.value;
  }

  /**
   * Returns the value for the largest key, or undefined if empty.
   */
  max() {
    if (this._root === null) return undefined;
    let node = this._root;
    while (node.right !== null) node = node.right;
    return node.value;
  }

  /**
   * The smallest key in the tree, or undefined if empty.
   */
  minKey() {
    if (this._root === null) return undefined;
    let node = this._root;
    while (node.left !== null) node = node.left;
    return node.key;
  }

  /**
   * The largest key in the tree, or undefined if empty.
   */
  maxKey() {
    if (this._root === null) return undefined;
    let node = this._root;
    while (node.right !== null) node = node.right;
    return node.key;
  }

  /**
   * Visit all (key, value) pairs in ascending key order. Iteration stops
   * early if the callback returns true, in which case this method returns
   * true; otherwise it returns false. This "signal to stop" convention is
   * chosen over throwing because it is cheaper and composes better with
   * callers that only need the first match in a range.
   *
   * @param {(key: *, value: *) => boolean|void} callback
   * @returns {boolean} true if the callback signaled stop.
   */
  forEach(callback) {
    if (typeof callback !== 'function') {
      throw new TypeError('callback must be a function');
    }
    const stack = [];
    let node = this._root;
    while (node !== null || stack.length > 0) {
      while (node !== null) {
        stack.push(node);
        node = node.left;
      }
      node = stack.pop();
      if (callback(node.key, node.value) === true) return true;
      node = node.right;
    }
    return false;
  }

  /**
   * Return an array of all keys in ascending order.
   */
  keys() {
    const out = [];
    this.forEach((k) => { out.push(k); });
    return out;
  }

  /**
   * Return an array of all values in ascending key order.
   */
  values() {
    const out = [];
    this.forEach((_, v) => { out.push(v); });
    return out;
  }

  /**
   * Remove all entries.
   */
  clear() {
    this._root = null;
    this._size = 0;
    this._maxSize = 0;
  }

  /**
   * Height of the tree (number of edges on the longest root-to-leaf path).
   * An empty tree has height -1 by convention, matching the recurrence
   * h(null) = -1; h(node) = 1 + max(h(left), h(right)).
   * Exposed primarily for tests and for callers who want to verify the
   * logarithmic bound holds.
   */
  height() {
    const h = (node) => (node === null ? -1 : 1 + Math.max(h(node.left), h(node.right)));
    return h(this._root);
  }
}
