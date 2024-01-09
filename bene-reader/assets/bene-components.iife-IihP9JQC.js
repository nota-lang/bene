var BeneComponents = function(exports) {
  "use strict";
  var _a2;
  const DefaultBufferLength = 1024;
  let nextPropID = 0;
  let Range$1 = class Range {
    constructor(from, to) {
      this.from = from;
      this.to = to;
    }
  };
  class NodeProp {
    /**
    Create a new node prop type.
    */
    constructor(config = {}) {
      this.id = nextPropID++;
      this.perNode = !!config.perNode;
      this.deserialize = config.deserialize || (() => {
        throw new Error("This node type doesn't define a deserialize function");
      });
    }
    /**
    This is meant to be used with
    [`NodeSet.extend`](#common.NodeSet.extend) or
    [`LRParser.configure`](#lr.ParserConfig.props) to compute
    prop values for each node type in the set. Takes a [match
    object](#common.NodeType^match) or function that returns undefined
    if the node type doesn't get this prop, and the prop's value if
    it does.
    */
    add(match) {
      if (this.perNode)
        throw new RangeError("Can't add per-node props to node types");
      if (typeof match != "function")
        match = NodeType.match(match);
      return (type) => {
        let result = match(type);
        return result === void 0 ? null : [this, result];
      };
    }
  }
  NodeProp.closedBy = new NodeProp({ deserialize: (str) => str.split(" ") });
  NodeProp.openedBy = new NodeProp({ deserialize: (str) => str.split(" ") });
  NodeProp.group = new NodeProp({ deserialize: (str) => str.split(" ") });
  NodeProp.isolate = new NodeProp({ deserialize: (value) => {
    if (value && value != "rtl" && value != "ltr" && value != "auto")
      throw new RangeError("Invalid value for isolate: " + value);
    return value || "auto";
  } });
  NodeProp.contextHash = new NodeProp({ perNode: true });
  NodeProp.lookAhead = new NodeProp({ perNode: true });
  NodeProp.mounted = new NodeProp({ perNode: true });
  class MountedTree {
    constructor(tree, overlay, parser2) {
      this.tree = tree;
      this.overlay = overlay;
      this.parser = parser2;
    }
    /**
    @internal
    */
    static get(tree) {
      return tree && tree.props && tree.props[NodeProp.mounted.id];
    }
  }
  const noProps = /* @__PURE__ */ Object.create(null);
  class NodeType {
    /**
    @internal
    */
    constructor(name2, props, id, flags = 0) {
      this.name = name2;
      this.props = props;
      this.id = id;
      this.flags = flags;
    }
    /**
    Define a node type.
    */
    static define(spec) {
      let props = spec.props && spec.props.length ? /* @__PURE__ */ Object.create(null) : noProps;
      let flags = (spec.top ? 1 : 0) | (spec.skipped ? 2 : 0) | (spec.error ? 4 : 0) | (spec.name == null ? 8 : 0);
      let type = new NodeType(spec.name || "", props, spec.id, flags);
      if (spec.props)
        for (let src of spec.props) {
          if (!Array.isArray(src))
            src = src(type);
          if (src) {
            if (src[0].perNode)
              throw new RangeError("Can't store a per-node prop on a node type");
            props[src[0].id] = src[1];
          }
        }
      return type;
    }
    /**
    Retrieves a node prop for this type. Will return `undefined` if
    the prop isn't present on this node.
    */
    prop(prop) {
      return this.props[prop.id];
    }
    /**
    True when this is the top node of a grammar.
    */
    get isTop() {
      return (this.flags & 1) > 0;
    }
    /**
    True when this node is produced by a skip rule.
    */
    get isSkipped() {
      return (this.flags & 2) > 0;
    }
    /**
    Indicates whether this is an error node.
    */
    get isError() {
      return (this.flags & 4) > 0;
    }
    /**
    When true, this node type doesn't correspond to a user-declared
    named node, for example because it is used to cache repetition.
    */
    get isAnonymous() {
      return (this.flags & 8) > 0;
    }
    /**
    Returns true when this node's name or one of its
    [groups](#common.NodeProp^group) matches the given string.
    */
    is(name2) {
      if (typeof name2 == "string") {
        if (this.name == name2)
          return true;
        let group = this.prop(NodeProp.group);
        return group ? group.indexOf(name2) > -1 : false;
      }
      return this.id == name2;
    }
    /**
    Create a function from node types to arbitrary values by
    specifying an object whose property names are node or
    [group](#common.NodeProp^group) names. Often useful with
    [`NodeProp.add`](#common.NodeProp.add). You can put multiple
    names, separated by spaces, in a single property name to map
    multiple node names to a single value.
    */
    static match(map) {
      let direct = /* @__PURE__ */ Object.create(null);
      for (let prop in map)
        for (let name2 of prop.split(" "))
          direct[name2] = map[prop];
      return (node) => {
        for (let groups = node.prop(NodeProp.group), i2 = -1; i2 < (groups ? groups.length : 0); i2++) {
          let found = direct[i2 < 0 ? node.name : groups[i2]];
          if (found)
            return found;
        }
      };
    }
  }
  NodeType.none = new NodeType(
    "",
    /* @__PURE__ */ Object.create(null),
    0,
    8
    /* NodeFlag.Anonymous */
  );
  class NodeSet {
    /**
    Create a set with the given types. The `id` property of each
    type should correspond to its position within the array.
    */
    constructor(types2) {
      this.types = types2;
      for (let i2 = 0; i2 < types2.length; i2++)
        if (types2[i2].id != i2)
          throw new RangeError("Node type ids should correspond to array positions when creating a node set");
    }
    /**
    Create a copy of this set with some node properties added. The
    arguments to this method can be created with
    [`NodeProp.add`](#common.NodeProp.add).
    */
    extend(...props) {
      let newTypes = [];
      for (let type of this.types) {
        let newProps = null;
        for (let source of props) {
          let add = source(type);
          if (add) {
            if (!newProps)
              newProps = Object.assign({}, type.props);
            newProps[add[0].id] = add[1];
          }
        }
        newTypes.push(newProps ? new NodeType(type.name, newProps, type.id, type.flags) : type);
      }
      return new NodeSet(newTypes);
    }
  }
  const CachedNode = /* @__PURE__ */ new WeakMap(), CachedInnerNode = /* @__PURE__ */ new WeakMap();
  var IterMode;
  (function(IterMode2) {
    IterMode2[IterMode2["ExcludeBuffers"] = 1] = "ExcludeBuffers";
    IterMode2[IterMode2["IncludeAnonymous"] = 2] = "IncludeAnonymous";
    IterMode2[IterMode2["IgnoreMounts"] = 4] = "IgnoreMounts";
    IterMode2[IterMode2["IgnoreOverlays"] = 8] = "IgnoreOverlays";
  })(IterMode || (IterMode = {}));
  class Tree {
    /**
    Construct a new tree. See also [`Tree.build`](#common.Tree^build).
    */
    constructor(type, children, positions, length, props) {
      this.type = type;
      this.children = children;
      this.positions = positions;
      this.length = length;
      this.props = null;
      if (props && props.length) {
        this.props = /* @__PURE__ */ Object.create(null);
        for (let [prop, value] of props)
          this.props[typeof prop == "number" ? prop : prop.id] = value;
      }
    }
    /**
    @internal
    */
    toString() {
      let mounted = MountedTree.get(this);
      if (mounted && !mounted.overlay)
        return mounted.tree.toString();
      let children = "";
      for (let ch of this.children) {
        let str = ch.toString();
        if (str) {
          if (children)
            children += ",";
          children += str;
        }
      }
      return !this.type.name ? children : (/\W/.test(this.type.name) && !this.type.isError ? JSON.stringify(this.type.name) : this.type.name) + (children.length ? "(" + children + ")" : "");
    }
    /**
    Get a [tree cursor](#common.TreeCursor) positioned at the top of
    the tree. Mode can be used to [control](#common.IterMode) which
    nodes the cursor visits.
    */
    cursor(mode = 0) {
      return new TreeCursor(this.topNode, mode);
    }
    /**
    Get a [tree cursor](#common.TreeCursor) pointing into this tree
    at the given position and side (see
    [`moveTo`](#common.TreeCursor.moveTo).
    */
    cursorAt(pos, side = 0, mode = 0) {
      let scope = CachedNode.get(this) || this.topNode;
      let cursor = new TreeCursor(scope);
      cursor.moveTo(pos, side);
      CachedNode.set(this, cursor._tree);
      return cursor;
    }
    /**
    Get a [syntax node](#common.SyntaxNode) object for the top of the
    tree.
    */
    get topNode() {
      return new TreeNode(this, 0, 0, null);
    }
    /**
    Get the [syntax node](#common.SyntaxNode) at the given position.
    If `side` is -1, this will move into nodes that end at the
    position. If 1, it'll move into nodes that start at the
    position. With 0, it'll only enter nodes that cover the position
    from both sides.
    
    Note that this will not enter
    [overlays](#common.MountedTree.overlay), and you often want
    [`resolveInner`](#common.Tree.resolveInner) instead.
    */
    resolve(pos, side = 0) {
      let node = resolveNode(CachedNode.get(this) || this.topNode, pos, side, false);
      CachedNode.set(this, node);
      return node;
    }
    /**
    Like [`resolve`](#common.Tree.resolve), but will enter
    [overlaid](#common.MountedTree.overlay) nodes, producing a syntax node
    pointing into the innermost overlaid tree at the given position
    (with parent links going through all parent structure, including
    the host trees).
    */
    resolveInner(pos, side = 0) {
      let node = resolveNode(CachedInnerNode.get(this) || this.topNode, pos, side, true);
      CachedInnerNode.set(this, node);
      return node;
    }
    /**
    In some situations, it can be useful to iterate through all
    nodes around a position, including those in overlays that don't
    directly cover the position. This method gives you an iterator
    that will produce all nodes, from small to big, around the given
    position.
    */
    resolveStack(pos, side = 0) {
      return stackIterator(this, pos, side);
    }
    /**
    Iterate over the tree and its children, calling `enter` for any
    node that touches the `from`/`to` region (if given) before
    running over such a node's children, and `leave` (if given) when
    leaving the node. When `enter` returns `false`, that node will
    not have its children iterated over (or `leave` called).
    */
    iterate(spec) {
      let { enter, leave, from = 0, to = this.length } = spec;
      let mode = spec.mode || 0, anon = (mode & IterMode.IncludeAnonymous) > 0;
      for (let c2 = this.cursor(mode | IterMode.IncludeAnonymous); ; ) {
        let entered = false;
        if (c2.from <= to && c2.to >= from && (!anon && c2.type.isAnonymous || enter(c2) !== false)) {
          if (c2.firstChild())
            continue;
          entered = true;
        }
        for (; ; ) {
          if (entered && leave && (anon || !c2.type.isAnonymous))
            leave(c2);
          if (c2.nextSibling())
            break;
          if (!c2.parent())
            return;
          entered = true;
        }
      }
    }
    /**
    Get the value of the given [node prop](#common.NodeProp) for this
    node. Works with both per-node and per-type props.
    */
    prop(prop) {
      return !prop.perNode ? this.type.prop(prop) : this.props ? this.props[prop.id] : void 0;
    }
    /**
    Returns the node's [per-node props](#common.NodeProp.perNode) in a
    format that can be passed to the [`Tree`](#common.Tree)
    constructor.
    */
    get propValues() {
      let result = [];
      if (this.props)
        for (let id in this.props)
          result.push([+id, this.props[id]]);
      return result;
    }
    /**
    Balance the direct children of this tree, producing a copy of
    which may have children grouped into subtrees with type
    [`NodeType.none`](#common.NodeType^none).
    */
    balance(config = {}) {
      return this.children.length <= 8 ? this : balanceRange(NodeType.none, this.children, this.positions, 0, this.children.length, 0, this.length, (children, positions, length) => new Tree(this.type, children, positions, length, this.propValues), config.makeTree || ((children, positions, length) => new Tree(NodeType.none, children, positions, length)));
    }
    /**
    Build a tree from a postfix-ordered buffer of node information,
    or a cursor over such a buffer.
    */
    static build(data) {
      return buildTree(data);
    }
  }
  Tree.empty = new Tree(NodeType.none, [], [], 0);
  class FlatBufferCursor {
    constructor(buffer, index) {
      this.buffer = buffer;
      this.index = index;
    }
    get id() {
      return this.buffer[this.index - 4];
    }
    get start() {
      return this.buffer[this.index - 3];
    }
    get end() {
      return this.buffer[this.index - 2];
    }
    get size() {
      return this.buffer[this.index - 1];
    }
    get pos() {
      return this.index;
    }
    next() {
      this.index -= 4;
    }
    fork() {
      return new FlatBufferCursor(this.buffer, this.index);
    }
  }
  class TreeBuffer {
    /**
    Create a tree buffer.
    */
    constructor(buffer, length, set) {
      this.buffer = buffer;
      this.length = length;
      this.set = set;
    }
    /**
    @internal
    */
    get type() {
      return NodeType.none;
    }
    /**
    @internal
    */
    toString() {
      let result = [];
      for (let index = 0; index < this.buffer.length; ) {
        result.push(this.childString(index));
        index = this.buffer[index + 3];
      }
      return result.join(",");
    }
    /**
    @internal
    */
    childString(index) {
      let id = this.buffer[index], endIndex = this.buffer[index + 3];
      let type = this.set.types[id], result = type.name;
      if (/\W/.test(result) && !type.isError)
        result = JSON.stringify(result);
      index += 4;
      if (endIndex == index)
        return result;
      let children = [];
      while (index < endIndex) {
        children.push(this.childString(index));
        index = this.buffer[index + 3];
      }
      return result + "(" + children.join(",") + ")";
    }
    /**
    @internal
    */
    findChild(startIndex, endIndex, dir, pos, side) {
      let { buffer } = this, pick = -1;
      for (let i2 = startIndex; i2 != endIndex; i2 = buffer[i2 + 3]) {
        if (checkSide(side, pos, buffer[i2 + 1], buffer[i2 + 2])) {
          pick = i2;
          if (dir > 0)
            break;
        }
      }
      return pick;
    }
    /**
    @internal
    */
    slice(startI, endI, from) {
      let b2 = this.buffer;
      let copy = new Uint16Array(endI - startI), len = 0;
      for (let i2 = startI, j2 = 0; i2 < endI; ) {
        copy[j2++] = b2[i2++];
        copy[j2++] = b2[i2++] - from;
        let to = copy[j2++] = b2[i2++] - from;
        copy[j2++] = b2[i2++] - startI;
        len = Math.max(len, to);
      }
      return new TreeBuffer(copy, len, this.set);
    }
  }
  function checkSide(side, pos, from, to) {
    switch (side) {
      case -2:
        return from < pos;
      case -1:
        return to >= pos && from < pos;
      case 0:
        return from < pos && to > pos;
      case 1:
        return from <= pos && to > pos;
      case 2:
        return to > pos;
      case 4:
        return true;
    }
  }
  function resolveNode(node, pos, side, overlays) {
    var _a3;
    while (node.from == node.to || (side < 1 ? node.from >= pos : node.from > pos) || (side > -1 ? node.to <= pos : node.to < pos)) {
      let parent = !overlays && node instanceof TreeNode && node.index < 0 ? null : node.parent;
      if (!parent)
        return node;
      node = parent;
    }
    let mode = overlays ? 0 : IterMode.IgnoreOverlays;
    if (overlays)
      for (let scan = node, parent = scan.parent; parent; scan = parent, parent = scan.parent) {
        if (scan instanceof TreeNode && scan.index < 0 && ((_a3 = parent.enter(pos, side, mode)) === null || _a3 === void 0 ? void 0 : _a3.from) != scan.from)
          node = parent;
      }
    for (; ; ) {
      let inner = node.enter(pos, side, mode);
      if (!inner)
        return node;
      node = inner;
    }
  }
  class BaseNode {
    cursor(mode = 0) {
      return new TreeCursor(this, mode);
    }
    getChild(type, before = null, after = null) {
      let r2 = getChildren(this, type, before, after);
      return r2.length ? r2[0] : null;
    }
    getChildren(type, before = null, after = null) {
      return getChildren(this, type, before, after);
    }
    resolve(pos, side = 0) {
      return resolveNode(this, pos, side, false);
    }
    resolveInner(pos, side = 0) {
      return resolveNode(this, pos, side, true);
    }
    matchContext(context) {
      return matchNodeContext(this, context);
    }
    enterUnfinishedNodesBefore(pos) {
      let scan = this.childBefore(pos), node = this;
      while (scan) {
        let last = scan.lastChild;
        if (!last || last.to != scan.to)
          break;
        if (last.type.isError && last.from == last.to) {
          node = scan;
          scan = last.prevSibling;
        } else {
          scan = last;
        }
      }
      return node;
    }
    get node() {
      return this;
    }
    get next() {
      return this.parent;
    }
  }
  class TreeNode extends BaseNode {
    constructor(_tree, from, index, _parent) {
      super();
      this._tree = _tree;
      this.from = from;
      this.index = index;
      this._parent = _parent;
    }
    get type() {
      return this._tree.type;
    }
    get name() {
      return this._tree.type.name;
    }
    get to() {
      return this.from + this._tree.length;
    }
    nextChild(i2, dir, pos, side, mode = 0) {
      for (let parent = this; ; ) {
        for (let { children, positions } = parent._tree, e2 = dir > 0 ? children.length : -1; i2 != e2; i2 += dir) {
          let next = children[i2], start = positions[i2] + parent.from;
          if (!checkSide(side, pos, start, start + next.length))
            continue;
          if (next instanceof TreeBuffer) {
            if (mode & IterMode.ExcludeBuffers)
              continue;
            let index = next.findChild(0, next.buffer.length, dir, pos - start, side);
            if (index > -1)
              return new BufferNode(new BufferContext(parent, next, i2, start), null, index);
          } else if (mode & IterMode.IncludeAnonymous || (!next.type.isAnonymous || hasChild(next))) {
            let mounted;
            if (!(mode & IterMode.IgnoreMounts) && (mounted = MountedTree.get(next)) && !mounted.overlay)
              return new TreeNode(mounted.tree, start, i2, parent);
            let inner = new TreeNode(next, start, i2, parent);
            return mode & IterMode.IncludeAnonymous || !inner.type.isAnonymous ? inner : inner.nextChild(dir < 0 ? next.children.length - 1 : 0, dir, pos, side);
          }
        }
        if (mode & IterMode.IncludeAnonymous || !parent.type.isAnonymous)
          return null;
        if (parent.index >= 0)
          i2 = parent.index + dir;
        else
          i2 = dir < 0 ? -1 : parent._parent._tree.children.length;
        parent = parent._parent;
        if (!parent)
          return null;
      }
    }
    get firstChild() {
      return this.nextChild(
        0,
        1,
        0,
        4
        /* Side.DontCare */
      );
    }
    get lastChild() {
      return this.nextChild(
        this._tree.children.length - 1,
        -1,
        0,
        4
        /* Side.DontCare */
      );
    }
    childAfter(pos) {
      return this.nextChild(
        0,
        1,
        pos,
        2
        /* Side.After */
      );
    }
    childBefore(pos) {
      return this.nextChild(
        this._tree.children.length - 1,
        -1,
        pos,
        -2
        /* Side.Before */
      );
    }
    enter(pos, side, mode = 0) {
      let mounted;
      if (!(mode & IterMode.IgnoreOverlays) && (mounted = MountedTree.get(this._tree)) && mounted.overlay) {
        let rPos = pos - this.from;
        for (let { from, to } of mounted.overlay) {
          if ((side > 0 ? from <= rPos : from < rPos) && (side < 0 ? to >= rPos : to > rPos))
            return new TreeNode(mounted.tree, mounted.overlay[0].from + this.from, -1, this);
        }
      }
      return this.nextChild(0, 1, pos, side, mode);
    }
    nextSignificantParent() {
      let val = this;
      while (val.type.isAnonymous && val._parent)
        val = val._parent;
      return val;
    }
    get parent() {
      return this._parent ? this._parent.nextSignificantParent() : null;
    }
    get nextSibling() {
      return this._parent && this.index >= 0 ? this._parent.nextChild(
        this.index + 1,
        1,
        0,
        4
        /* Side.DontCare */
      ) : null;
    }
    get prevSibling() {
      return this._parent && this.index >= 0 ? this._parent.nextChild(
        this.index - 1,
        -1,
        0,
        4
        /* Side.DontCare */
      ) : null;
    }
    get tree() {
      return this._tree;
    }
    toTree() {
      return this._tree;
    }
    /**
    @internal
    */
    toString() {
      return this._tree.toString();
    }
  }
  function getChildren(node, type, before, after) {
    let cur = node.cursor(), result = [];
    if (!cur.firstChild())
      return result;
    if (before != null) {
      while (!cur.type.is(before))
        if (!cur.nextSibling())
          return result;
    }
    for (; ; ) {
      if (after != null && cur.type.is(after))
        return result;
      if (cur.type.is(type))
        result.push(cur.node);
      if (!cur.nextSibling())
        return after == null ? result : [];
    }
  }
  function matchNodeContext(node, context, i2 = context.length - 1) {
    for (let p2 = node.parent; i2 >= 0; p2 = p2.parent) {
      if (!p2)
        return false;
      if (!p2.type.isAnonymous) {
        if (context[i2] && context[i2] != p2.name)
          return false;
        i2--;
      }
    }
    return true;
  }
  class BufferContext {
    constructor(parent, buffer, index, start) {
      this.parent = parent;
      this.buffer = buffer;
      this.index = index;
      this.start = start;
    }
  }
  class BufferNode extends BaseNode {
    get name() {
      return this.type.name;
    }
    get from() {
      return this.context.start + this.context.buffer.buffer[this.index + 1];
    }
    get to() {
      return this.context.start + this.context.buffer.buffer[this.index + 2];
    }
    constructor(context, _parent, index) {
      super();
      this.context = context;
      this._parent = _parent;
      this.index = index;
      this.type = context.buffer.set.types[context.buffer.buffer[index]];
    }
    child(dir, pos, side) {
      let { buffer } = this.context;
      let index = buffer.findChild(this.index + 4, buffer.buffer[this.index + 3], dir, pos - this.context.start, side);
      return index < 0 ? null : new BufferNode(this.context, this, index);
    }
    get firstChild() {
      return this.child(
        1,
        0,
        4
        /* Side.DontCare */
      );
    }
    get lastChild() {
      return this.child(
        -1,
        0,
        4
        /* Side.DontCare */
      );
    }
    childAfter(pos) {
      return this.child(
        1,
        pos,
        2
        /* Side.After */
      );
    }
    childBefore(pos) {
      return this.child(
        -1,
        pos,
        -2
        /* Side.Before */
      );
    }
    enter(pos, side, mode = 0) {
      if (mode & IterMode.ExcludeBuffers)
        return null;
      let { buffer } = this.context;
      let index = buffer.findChild(this.index + 4, buffer.buffer[this.index + 3], side > 0 ? 1 : -1, pos - this.context.start, side);
      return index < 0 ? null : new BufferNode(this.context, this, index);
    }
    get parent() {
      return this._parent || this.context.parent.nextSignificantParent();
    }
    externalSibling(dir) {
      return this._parent ? null : this.context.parent.nextChild(
        this.context.index + dir,
        dir,
        0,
        4
        /* Side.DontCare */
      );
    }
    get nextSibling() {
      let { buffer } = this.context;
      let after = buffer.buffer[this.index + 3];
      if (after < (this._parent ? buffer.buffer[this._parent.index + 3] : buffer.buffer.length))
        return new BufferNode(this.context, this._parent, after);
      return this.externalSibling(1);
    }
    get prevSibling() {
      let { buffer } = this.context;
      let parentStart = this._parent ? this._parent.index + 4 : 0;
      if (this.index == parentStart)
        return this.externalSibling(-1);
      return new BufferNode(this.context, this._parent, buffer.findChild(
        parentStart,
        this.index,
        -1,
        0,
        4
        /* Side.DontCare */
      ));
    }
    get tree() {
      return null;
    }
    toTree() {
      let children = [], positions = [];
      let { buffer } = this.context;
      let startI = this.index + 4, endI = buffer.buffer[this.index + 3];
      if (endI > startI) {
        let from = buffer.buffer[this.index + 1];
        children.push(buffer.slice(startI, endI, from));
        positions.push(0);
      }
      return new Tree(this.type, children, positions, this.to - this.from);
    }
    /**
    @internal
    */
    toString() {
      return this.context.buffer.childString(this.index);
    }
  }
  function iterStack(heads) {
    if (!heads.length)
      return null;
    let pick = 0, picked = heads[0];
    for (let i2 = 1; i2 < heads.length; i2++) {
      let node = heads[i2];
      if (node.from > picked.from || node.to < picked.to) {
        picked = node;
        pick = i2;
      }
    }
    let next = picked instanceof TreeNode && picked.index < 0 ? null : picked.parent;
    let newHeads = heads.slice();
    if (next)
      newHeads[pick] = next;
    else
      newHeads.splice(pick, 1);
    return new StackIterator(newHeads, picked);
  }
  class StackIterator {
    constructor(heads, node) {
      this.heads = heads;
      this.node = node;
    }
    get next() {
      return iterStack(this.heads);
    }
  }
  function stackIterator(tree, pos, side) {
    let inner = tree.resolveInner(pos, side), layers = null;
    for (let scan = inner instanceof TreeNode ? inner : inner.context.parent; scan; scan = scan.parent) {
      if (scan.index < 0) {
        let parent = scan.parent;
        (layers || (layers = [inner])).push(parent.resolve(pos, side));
        scan = parent;
      } else {
        let mount = MountedTree.get(scan.tree);
        if (mount && mount.overlay && mount.overlay[0].from <= pos && mount.overlay[mount.overlay.length - 1].to >= pos) {
          let root = new TreeNode(mount.tree, mount.overlay[0].from + scan.from, -1, scan);
          (layers || (layers = [inner])).push(resolveNode(root, pos, side, false));
        }
      }
    }
    return layers ? iterStack(layers) : inner;
  }
  class TreeCursor {
    /**
    Shorthand for `.type.name`.
    */
    get name() {
      return this.type.name;
    }
    /**
    @internal
    */
    constructor(node, mode = 0) {
      this.mode = mode;
      this.buffer = null;
      this.stack = [];
      this.index = 0;
      this.bufferNode = null;
      if (node instanceof TreeNode) {
        this.yieldNode(node);
      } else {
        this._tree = node.context.parent;
        this.buffer = node.context;
        for (let n2 = node._parent; n2; n2 = n2._parent)
          this.stack.unshift(n2.index);
        this.bufferNode = node;
        this.yieldBuf(node.index);
      }
    }
    yieldNode(node) {
      if (!node)
        return false;
      this._tree = node;
      this.type = node.type;
      this.from = node.from;
      this.to = node.to;
      return true;
    }
    yieldBuf(index, type) {
      this.index = index;
      let { start, buffer } = this.buffer;
      this.type = type || buffer.set.types[buffer.buffer[index]];
      this.from = start + buffer.buffer[index + 1];
      this.to = start + buffer.buffer[index + 2];
      return true;
    }
    /**
    @internal
    */
    yield(node) {
      if (!node)
        return false;
      if (node instanceof TreeNode) {
        this.buffer = null;
        return this.yieldNode(node);
      }
      this.buffer = node.context;
      return this.yieldBuf(node.index, node.type);
    }
    /**
    @internal
    */
    toString() {
      return this.buffer ? this.buffer.buffer.childString(this.index) : this._tree.toString();
    }
    /**
    @internal
    */
    enterChild(dir, pos, side) {
      if (!this.buffer)
        return this.yield(this._tree.nextChild(dir < 0 ? this._tree._tree.children.length - 1 : 0, dir, pos, side, this.mode));
      let { buffer } = this.buffer;
      let index = buffer.findChild(this.index + 4, buffer.buffer[this.index + 3], dir, pos - this.buffer.start, side);
      if (index < 0)
        return false;
      this.stack.push(this.index);
      return this.yieldBuf(index);
    }
    /**
    Move the cursor to this node's first child. When this returns
    false, the node has no child, and the cursor has not been moved.
    */
    firstChild() {
      return this.enterChild(
        1,
        0,
        4
        /* Side.DontCare */
      );
    }
    /**
    Move the cursor to this node's last child.
    */
    lastChild() {
      return this.enterChild(
        -1,
        0,
        4
        /* Side.DontCare */
      );
    }
    /**
    Move the cursor to the first child that ends after `pos`.
    */
    childAfter(pos) {
      return this.enterChild(
        1,
        pos,
        2
        /* Side.After */
      );
    }
    /**
    Move to the last child that starts before `pos`.
    */
    childBefore(pos) {
      return this.enterChild(
        -1,
        pos,
        -2
        /* Side.Before */
      );
    }
    /**
    Move the cursor to the child around `pos`. If side is -1 the
    child may end at that position, when 1 it may start there. This
    will also enter [overlaid](#common.MountedTree.overlay)
    [mounted](#common.NodeProp^mounted) trees unless `overlays` is
    set to false.
    */
    enter(pos, side, mode = this.mode) {
      if (!this.buffer)
        return this.yield(this._tree.enter(pos, side, mode));
      return mode & IterMode.ExcludeBuffers ? false : this.enterChild(1, pos, side);
    }
    /**
    Move to the node's parent node, if this isn't the top node.
    */
    parent() {
      if (!this.buffer)
        return this.yieldNode(this.mode & IterMode.IncludeAnonymous ? this._tree._parent : this._tree.parent);
      if (this.stack.length)
        return this.yieldBuf(this.stack.pop());
      let parent = this.mode & IterMode.IncludeAnonymous ? this.buffer.parent : this.buffer.parent.nextSignificantParent();
      this.buffer = null;
      return this.yieldNode(parent);
    }
    /**
    @internal
    */
    sibling(dir) {
      if (!this.buffer)
        return !this._tree._parent ? false : this.yield(this._tree.index < 0 ? null : this._tree._parent.nextChild(this._tree.index + dir, dir, 0, 4, this.mode));
      let { buffer } = this.buffer, d2 = this.stack.length - 1;
      if (dir < 0) {
        let parentStart = d2 < 0 ? 0 : this.stack[d2] + 4;
        if (this.index != parentStart)
          return this.yieldBuf(buffer.findChild(
            parentStart,
            this.index,
            -1,
            0,
            4
            /* Side.DontCare */
          ));
      } else {
        let after = buffer.buffer[this.index + 3];
        if (after < (d2 < 0 ? buffer.buffer.length : buffer.buffer[this.stack[d2] + 3]))
          return this.yieldBuf(after);
      }
      return d2 < 0 ? this.yield(this.buffer.parent.nextChild(this.buffer.index + dir, dir, 0, 4, this.mode)) : false;
    }
    /**
    Move to this node's next sibling, if any.
    */
    nextSibling() {
      return this.sibling(1);
    }
    /**
    Move to this node's previous sibling, if any.
    */
    prevSibling() {
      return this.sibling(-1);
    }
    atLastNode(dir) {
      let index, parent, { buffer } = this;
      if (buffer) {
        if (dir > 0) {
          if (this.index < buffer.buffer.buffer.length)
            return false;
        } else {
          for (let i2 = 0; i2 < this.index; i2++)
            if (buffer.buffer.buffer[i2 + 3] < this.index)
              return false;
        }
        ({ index, parent } = buffer);
      } else {
        ({ index, _parent: parent } = this._tree);
      }
      for (; parent; { index, _parent: parent } = parent) {
        if (index > -1)
          for (let i2 = index + dir, e2 = dir < 0 ? -1 : parent._tree.children.length; i2 != e2; i2 += dir) {
            let child = parent._tree.children[i2];
            if (this.mode & IterMode.IncludeAnonymous || child instanceof TreeBuffer || !child.type.isAnonymous || hasChild(child))
              return false;
          }
      }
      return true;
    }
    move(dir, enter) {
      if (enter && this.enterChild(
        dir,
        0,
        4
        /* Side.DontCare */
      ))
        return true;
      for (; ; ) {
        if (this.sibling(dir))
          return true;
        if (this.atLastNode(dir) || !this.parent())
          return false;
      }
    }
    /**
    Move to the next node in a
    [pre-order](https://en.wikipedia.org/wiki/Tree_traversal#Pre-order,_NLR)
    traversal, going from a node to its first child or, if the
    current node is empty or `enter` is false, its next sibling or
    the next sibling of the first parent node that has one.
    */
    next(enter = true) {
      return this.move(1, enter);
    }
    /**
    Move to the next node in a last-to-first pre-order traveral. A
    node is followed by its last child or, if it has none, its
    previous sibling or the previous sibling of the first parent
    node that has one.
    */
    prev(enter = true) {
      return this.move(-1, enter);
    }
    /**
    Move the cursor to the innermost node that covers `pos`. If
    `side` is -1, it will enter nodes that end at `pos`. If it is 1,
    it will enter nodes that start at `pos`.
    */
    moveTo(pos, side = 0) {
      while (this.from == this.to || (side < 1 ? this.from >= pos : this.from > pos) || (side > -1 ? this.to <= pos : this.to < pos))
        if (!this.parent())
          break;
      while (this.enterChild(1, pos, side)) {
      }
      return this;
    }
    /**
    Get a [syntax node](#common.SyntaxNode) at the cursor's current
    position.
    */
    get node() {
      if (!this.buffer)
        return this._tree;
      let cache = this.bufferNode, result = null, depth = 0;
      if (cache && cache.context == this.buffer) {
        scan:
          for (let index = this.index, d2 = this.stack.length; d2 >= 0; ) {
            for (let c2 = cache; c2; c2 = c2._parent)
              if (c2.index == index) {
                if (index == this.index)
                  return c2;
                result = c2;
                depth = d2 + 1;
                break scan;
              }
            index = this.stack[--d2];
          }
      }
      for (let i2 = depth; i2 < this.stack.length; i2++)
        result = new BufferNode(this.buffer, result, this.stack[i2]);
      return this.bufferNode = new BufferNode(this.buffer, result, this.index);
    }
    /**
    Get the [tree](#common.Tree) that represents the current node, if
    any. Will return null when the node is in a [tree
    buffer](#common.TreeBuffer).
    */
    get tree() {
      return this.buffer ? null : this._tree._tree;
    }
    /**
    Iterate over the current node and all its descendants, calling
    `enter` when entering a node and `leave`, if given, when leaving
    one. When `enter` returns `false`, any children of that node are
    skipped, and `leave` isn't called for it.
    */
    iterate(enter, leave) {
      for (let depth = 0; ; ) {
        let mustLeave = false;
        if (this.type.isAnonymous || enter(this) !== false) {
          if (this.firstChild()) {
            depth++;
            continue;
          }
          if (!this.type.isAnonymous)
            mustLeave = true;
        }
        for (; ; ) {
          if (mustLeave && leave)
            leave(this);
          mustLeave = this.type.isAnonymous;
          if (this.nextSibling())
            break;
          if (!depth)
            return;
          this.parent();
          depth--;
          mustLeave = true;
        }
      }
    }
    /**
    Test whether the current node matches a given context—a sequence
    of direct parent node names. Empty strings in the context array
    are treated as wildcards.
    */
    matchContext(context) {
      if (!this.buffer)
        return matchNodeContext(this.node, context);
      let { buffer } = this.buffer, { types: types2 } = buffer.set;
      for (let i2 = context.length - 1, d2 = this.stack.length - 1; i2 >= 0; d2--) {
        if (d2 < 0)
          return matchNodeContext(this.node, context, i2);
        let type = types2[buffer.buffer[this.stack[d2]]];
        if (!type.isAnonymous) {
          if (context[i2] && context[i2] != type.name)
            return false;
          i2--;
        }
      }
      return true;
    }
  }
  function hasChild(tree) {
    return tree.children.some((ch) => ch instanceof TreeBuffer || !ch.type.isAnonymous || hasChild(ch));
  }
  function buildTree(data) {
    var _a3;
    let { buffer, nodeSet, maxBufferLength = DefaultBufferLength, reused = [], minRepeatType = nodeSet.types.length } = data;
    let cursor = Array.isArray(buffer) ? new FlatBufferCursor(buffer, buffer.length) : buffer;
    let types2 = nodeSet.types;
    let contextHash = 0, lookAhead = 0;
    function takeNode(parentStart, minPos, children2, positions2, inRepeat, depth) {
      let { id, start, end, size } = cursor;
      let lookAheadAtStart = lookAhead;
      while (size < 0) {
        cursor.next();
        if (size == -1) {
          let node2 = reused[id];
          children2.push(node2);
          positions2.push(start - parentStart);
          return;
        } else if (size == -3) {
          contextHash = id;
          return;
        } else if (size == -4) {
          lookAhead = id;
          return;
        } else {
          throw new RangeError(`Unrecognized record size: ${size}`);
        }
      }
      let type = types2[id], node, buffer2;
      let startPos = start - parentStart;
      if (end - start <= maxBufferLength && (buffer2 = findBufferSize(cursor.pos - minPos, inRepeat))) {
        let data2 = new Uint16Array(buffer2.size - buffer2.skip);
        let endPos = cursor.pos - buffer2.size, index = data2.length;
        while (cursor.pos > endPos)
          index = copyToBuffer(buffer2.start, data2, index);
        node = new TreeBuffer(data2, end - buffer2.start, nodeSet);
        startPos = buffer2.start - parentStart;
      } else {
        let endPos = cursor.pos - size;
        cursor.next();
        let localChildren = [], localPositions = [];
        let localInRepeat = id >= minRepeatType ? id : -1;
        let lastGroup = 0, lastEnd = end;
        while (cursor.pos > endPos) {
          if (localInRepeat >= 0 && cursor.id == localInRepeat && cursor.size >= 0) {
            if (cursor.end <= lastEnd - maxBufferLength) {
              makeRepeatLeaf(localChildren, localPositions, start, lastGroup, cursor.end, lastEnd, localInRepeat, lookAheadAtStart);
              lastGroup = localChildren.length;
              lastEnd = cursor.end;
            }
            cursor.next();
          } else if (depth > 2500) {
            takeFlatNode(start, endPos, localChildren, localPositions);
          } else {
            takeNode(start, endPos, localChildren, localPositions, localInRepeat, depth + 1);
          }
        }
        if (localInRepeat >= 0 && lastGroup > 0 && lastGroup < localChildren.length)
          makeRepeatLeaf(localChildren, localPositions, start, lastGroup, start, lastEnd, localInRepeat, lookAheadAtStart);
        localChildren.reverse();
        localPositions.reverse();
        if (localInRepeat > -1 && lastGroup > 0) {
          let make = makeBalanced(type);
          node = balanceRange(type, localChildren, localPositions, 0, localChildren.length, 0, end - start, make, make);
        } else {
          node = makeTree(type, localChildren, localPositions, end - start, lookAheadAtStart - end);
        }
      }
      children2.push(node);
      positions2.push(startPos);
    }
    function takeFlatNode(parentStart, minPos, children2, positions2) {
      let nodes = [];
      let nodeCount = 0, stopAt = -1;
      while (cursor.pos > minPos) {
        let { id, start, end, size } = cursor;
        if (size > 4) {
          cursor.next();
        } else if (stopAt > -1 && start < stopAt) {
          break;
        } else {
          if (stopAt < 0)
            stopAt = end - maxBufferLength;
          nodes.push(id, start, end);
          nodeCount++;
          cursor.next();
        }
      }
      if (nodeCount) {
        let buffer2 = new Uint16Array(nodeCount * 4);
        let start = nodes[nodes.length - 2];
        for (let i2 = nodes.length - 3, j2 = 0; i2 >= 0; i2 -= 3) {
          buffer2[j2++] = nodes[i2];
          buffer2[j2++] = nodes[i2 + 1] - start;
          buffer2[j2++] = nodes[i2 + 2] - start;
          buffer2[j2++] = j2;
        }
        children2.push(new TreeBuffer(buffer2, nodes[2] - start, nodeSet));
        positions2.push(start - parentStart);
      }
    }
    function makeBalanced(type) {
      return (children2, positions2, length2) => {
        let lookAhead2 = 0, lastI = children2.length - 1, last, lookAheadProp;
        if (lastI >= 0 && (last = children2[lastI]) instanceof Tree) {
          if (!lastI && last.type == type && last.length == length2)
            return last;
          if (lookAheadProp = last.prop(NodeProp.lookAhead))
            lookAhead2 = positions2[lastI] + last.length + lookAheadProp;
        }
        return makeTree(type, children2, positions2, length2, lookAhead2);
      };
    }
    function makeRepeatLeaf(children2, positions2, base2, i2, from, to, type, lookAhead2) {
      let localChildren = [], localPositions = [];
      while (children2.length > i2) {
        localChildren.push(children2.pop());
        localPositions.push(positions2.pop() + base2 - from);
      }
      children2.push(makeTree(nodeSet.types[type], localChildren, localPositions, to - from, lookAhead2 - to));
      positions2.push(from - base2);
    }
    function makeTree(type, children2, positions2, length2, lookAhead2 = 0, props) {
      if (contextHash) {
        let pair2 = [NodeProp.contextHash, contextHash];
        props = props ? [pair2].concat(props) : [pair2];
      }
      if (lookAhead2 > 25) {
        let pair2 = [NodeProp.lookAhead, lookAhead2];
        props = props ? [pair2].concat(props) : [pair2];
      }
      return new Tree(type, children2, positions2, length2, props);
    }
    function findBufferSize(maxSize, inRepeat) {
      let fork = cursor.fork();
      let size = 0, start = 0, skip = 0, minStart = fork.end - maxBufferLength;
      let result = { size: 0, start: 0, skip: 0 };
      scan:
        for (let minPos = fork.pos - maxSize; fork.pos > minPos; ) {
          let nodeSize2 = fork.size;
          if (fork.id == inRepeat && nodeSize2 >= 0) {
            result.size = size;
            result.start = start;
            result.skip = skip;
            skip += 4;
            size += 4;
            fork.next();
            continue;
          }
          let startPos = fork.pos - nodeSize2;
          if (nodeSize2 < 0 || startPos < minPos || fork.start < minStart)
            break;
          let localSkipped = fork.id >= minRepeatType ? 4 : 0;
          let nodeStart = fork.start;
          fork.next();
          while (fork.pos > startPos) {
            if (fork.size < 0) {
              if (fork.size == -3)
                localSkipped += 4;
              else
                break scan;
            } else if (fork.id >= minRepeatType) {
              localSkipped += 4;
            }
            fork.next();
          }
          start = nodeStart;
          size += nodeSize2;
          skip += localSkipped;
        }
      if (inRepeat < 0 || size == maxSize) {
        result.size = size;
        result.start = start;
        result.skip = skip;
      }
      return result.size > 4 ? result : void 0;
    }
    function copyToBuffer(bufferStart, buffer2, index) {
      let { id, start, end, size } = cursor;
      cursor.next();
      if (size >= 0 && id < minRepeatType) {
        let startIndex = index;
        if (size > 4) {
          let endPos = cursor.pos - (size - 4);
          while (cursor.pos > endPos)
            index = copyToBuffer(bufferStart, buffer2, index);
        }
        buffer2[--index] = startIndex;
        buffer2[--index] = end - bufferStart;
        buffer2[--index] = start - bufferStart;
        buffer2[--index] = id;
      } else if (size == -3) {
        contextHash = id;
      } else if (size == -4) {
        lookAhead = id;
      }
      return index;
    }
    let children = [], positions = [];
    while (cursor.pos > 0)
      takeNode(data.start || 0, data.bufferStart || 0, children, positions, -1, 0);
    let length = (_a3 = data.length) !== null && _a3 !== void 0 ? _a3 : children.length ? positions[0] + children[0].length : 0;
    return new Tree(types2[data.topID], children.reverse(), positions.reverse(), length);
  }
  const nodeSizeCache = /* @__PURE__ */ new WeakMap();
  function nodeSize(balanceType, node) {
    if (!balanceType.isAnonymous || node instanceof TreeBuffer || node.type != balanceType)
      return 1;
    let size = nodeSizeCache.get(node);
    if (size == null) {
      size = 1;
      for (let child of node.children) {
        if (child.type != balanceType || !(child instanceof Tree)) {
          size = 1;
          break;
        }
        size += nodeSize(balanceType, child);
      }
      nodeSizeCache.set(node, size);
    }
    return size;
  }
  function balanceRange(balanceType, children, positions, from, to, start, length, mkTop, mkTree) {
    let total = 0;
    for (let i2 = from; i2 < to; i2++)
      total += nodeSize(balanceType, children[i2]);
    let maxChild = Math.ceil(
      total * 1.5 / 8
      /* Balance.BranchFactor */
    );
    let localChildren = [], localPositions = [];
    function divide(children2, positions2, from2, to2, offset) {
      for (let i2 = from2; i2 < to2; ) {
        let groupFrom = i2, groupStart = positions2[i2], groupSize = nodeSize(balanceType, children2[i2]);
        i2++;
        for (; i2 < to2; i2++) {
          let nextSize = nodeSize(balanceType, children2[i2]);
          if (groupSize + nextSize >= maxChild)
            break;
          groupSize += nextSize;
        }
        if (i2 == groupFrom + 1) {
          if (groupSize > maxChild) {
            let only = children2[groupFrom];
            divide(only.children, only.positions, 0, only.children.length, positions2[groupFrom] + offset);
            continue;
          }
          localChildren.push(children2[groupFrom]);
        } else {
          let length2 = positions2[i2 - 1] + children2[i2 - 1].length - groupStart;
          localChildren.push(balanceRange(balanceType, children2, positions2, groupFrom, i2, groupStart, length2, null, mkTree));
        }
        localPositions.push(groupStart + offset - start);
      }
    }
    divide(children, positions, from, to, 0);
    return (mkTop || mkTree)(localChildren, localPositions, length);
  }
  class TreeFragment {
    /**
    Construct a tree fragment. You'll usually want to use
    [`addTree`](#common.TreeFragment^addTree) and
    [`applyChanges`](#common.TreeFragment^applyChanges) instead of
    calling this directly.
    */
    constructor(from, to, tree, offset, openStart = false, openEnd = false) {
      this.from = from;
      this.to = to;
      this.tree = tree;
      this.offset = offset;
      this.open = (openStart ? 1 : 0) | (openEnd ? 2 : 0);
    }
    /**
    Whether the start of the fragment represents the start of a
    parse, or the end of a change. (In the second case, it may not
    be safe to reuse some nodes at the start, depending on the
    parsing algorithm.)
    */
    get openStart() {
      return (this.open & 1) > 0;
    }
    /**
    Whether the end of the fragment represents the end of a
    full-document parse, or the start of a change.
    */
    get openEnd() {
      return (this.open & 2) > 0;
    }
    /**
    Create a set of fragments from a freshly parsed tree, or update
    an existing set of fragments by replacing the ones that overlap
    with a tree with content from the new tree. When `partial` is
    true, the parse is treated as incomplete, and the resulting
    fragment has [`openEnd`](#common.TreeFragment.openEnd) set to
    true.
    */
    static addTree(tree, fragments = [], partial = false) {
      let result = [new TreeFragment(0, tree.length, tree, 0, false, partial)];
      for (let f2 of fragments)
        if (f2.to > tree.length)
          result.push(f2);
      return result;
    }
    /**
    Apply a set of edits to an array of fragments, removing or
    splitting fragments as necessary to remove edited ranges, and
    adjusting offsets for fragments that moved.
    */
    static applyChanges(fragments, changes, minGap = 128) {
      if (!changes.length)
        return fragments;
      let result = [];
      let fI = 1, nextF = fragments.length ? fragments[0] : null;
      for (let cI = 0, pos = 0, off = 0; ; cI++) {
        let nextC = cI < changes.length ? changes[cI] : null;
        let nextPos = nextC ? nextC.fromA : 1e9;
        if (nextPos - pos >= minGap)
          while (nextF && nextF.from < nextPos) {
            let cut = nextF;
            if (pos >= cut.from || nextPos <= cut.to || off) {
              let fFrom = Math.max(cut.from, pos) - off, fTo = Math.min(cut.to, nextPos) - off;
              cut = fFrom >= fTo ? null : new TreeFragment(fFrom, fTo, cut.tree, cut.offset + off, cI > 0, !!nextC);
            }
            if (cut)
              result.push(cut);
            if (nextF.to > nextPos)
              break;
            nextF = fI < fragments.length ? fragments[fI++] : null;
          }
        if (!nextC)
          break;
        pos = nextC.toA;
        off = nextC.toA - nextC.toB;
      }
      return result;
    }
  }
  class Parser {
    /**
    Start a parse, returning a [partial parse](#common.PartialParse)
    object. [`fragments`](#common.TreeFragment) can be passed in to
    make the parse incremental.
    
    By default, the entire input is parsed. You can pass `ranges`,
    which should be a sorted array of non-empty, non-overlapping
    ranges, to parse only those ranges. The tree returned in that
    case will start at `ranges[0].from`.
    */
    startParse(input, fragments, ranges) {
      if (typeof input == "string")
        input = new StringInput(input);
      ranges = !ranges ? [new Range$1(0, input.length)] : ranges.length ? ranges.map((r2) => new Range$1(r2.from, r2.to)) : [new Range$1(0, 0)];
      return this.createParse(input, fragments || [], ranges);
    }
    /**
    Run a full parse, returning the resulting tree.
    */
    parse(input, fragments, ranges) {
      let parse = this.startParse(input, fragments, ranges);
      for (; ; ) {
        let done = parse.advance();
        if (done)
          return done;
      }
    }
  }
  class StringInput {
    constructor(string2) {
      this.string = string2;
    }
    get length() {
      return this.string.length;
    }
    chunk(from) {
      return this.string.slice(from);
    }
    get lineChunks() {
      return false;
    }
    read(from, to) {
      return this.string.slice(from, to);
    }
  }
  new NodeProp({ perNode: true });
  class Stack {
    /**
    @internal
    */
    constructor(p2, stack, state, reducePos, pos, score, buffer, bufferBase, curContext, lookAhead = 0, parent) {
      this.p = p2;
      this.stack = stack;
      this.state = state;
      this.reducePos = reducePos;
      this.pos = pos;
      this.score = score;
      this.buffer = buffer;
      this.bufferBase = bufferBase;
      this.curContext = curContext;
      this.lookAhead = lookAhead;
      this.parent = parent;
    }
    /**
    @internal
    */
    toString() {
      return `[${this.stack.filter((_2, i2) => i2 % 3 == 0).concat(this.state)}]@${this.pos}${this.score ? "!" + this.score : ""}`;
    }
    // Start an empty stack
    /**
    @internal
    */
    static start(p2, state, pos = 0) {
      let cx = p2.parser.context;
      return new Stack(p2, [], state, pos, pos, 0, [], 0, cx ? new StackContext(cx, cx.start) : null, 0, null);
    }
    /**
    The stack's current [context](#lr.ContextTracker) value, if
    any. Its type will depend on the context tracker's type
    parameter, or it will be `null` if there is no context
    tracker.
    */
    get context() {
      return this.curContext ? this.curContext.context : null;
    }
    // Push a state onto the stack, tracking its start position as well
    // as the buffer base at that point.
    /**
    @internal
    */
    pushState(state, start) {
      this.stack.push(this.state, start, this.bufferBase + this.buffer.length);
      this.state = state;
    }
    // Apply a reduce action
    /**
    @internal
    */
    reduce(action) {
      var _a3;
      let depth = action >> 19, type = action & 65535;
      let { parser: parser2 } = this.p;
      let dPrec = parser2.dynamicPrecedence(type);
      if (dPrec)
        this.score += dPrec;
      if (depth == 0) {
        this.pushState(parser2.getGoto(this.state, type, true), this.reducePos);
        if (type < parser2.minRepeatTerm)
          this.storeNode(type, this.reducePos, this.reducePos, 4, true);
        this.reduceContext(type, this.reducePos);
        return;
      }
      let base2 = this.stack.length - (depth - 1) * 3 - (action & 262144 ? 6 : 0);
      let start = base2 ? this.stack[base2 - 2] : this.p.ranges[0].from, size = this.reducePos - start;
      if (size >= 2e3 && !((_a3 = this.p.parser.nodeSet.types[type]) === null || _a3 === void 0 ? void 0 : _a3.isAnonymous)) {
        if (start == this.p.lastBigReductionStart) {
          this.p.bigReductionCount++;
          this.p.lastBigReductionSize = size;
        } else if (this.p.lastBigReductionSize < size) {
          this.p.bigReductionCount = 1;
          this.p.lastBigReductionStart = start;
          this.p.lastBigReductionSize = size;
        }
      }
      let bufferBase = base2 ? this.stack[base2 - 1] : 0, count = this.bufferBase + this.buffer.length - bufferBase;
      if (type < parser2.minRepeatTerm || action & 131072) {
        let pos = parser2.stateFlag(
          this.state,
          1
          /* StateFlag.Skipped */
        ) ? this.pos : this.reducePos;
        this.storeNode(type, start, pos, count + 4, true);
      }
      if (action & 262144) {
        this.state = this.stack[base2];
      } else {
        let baseStateID = this.stack[base2 - 3];
        this.state = parser2.getGoto(baseStateID, type, true);
      }
      while (this.stack.length > base2)
        this.stack.pop();
      this.reduceContext(type, start);
    }
    // Shift a value into the buffer
    /**
    @internal
    */
    storeNode(term, start, end, size = 4, isReduce = false) {
      if (term == 0 && (!this.stack.length || this.stack[this.stack.length - 1] < this.buffer.length + this.bufferBase)) {
        let cur = this, top2 = this.buffer.length;
        if (top2 == 0 && cur.parent) {
          top2 = cur.bufferBase - cur.parent.bufferBase;
          cur = cur.parent;
        }
        if (top2 > 0 && cur.buffer[top2 - 4] == 0 && cur.buffer[top2 - 1] > -1) {
          if (start == end)
            return;
          if (cur.buffer[top2 - 2] >= start) {
            cur.buffer[top2 - 2] = end;
            return;
          }
        }
      }
      if (!isReduce || this.pos == end) {
        this.buffer.push(term, start, end, size);
      } else {
        let index = this.buffer.length;
        if (index > 0 && this.buffer[index - 4] != 0)
          while (index > 0 && this.buffer[index - 2] > end) {
            this.buffer[index] = this.buffer[index - 4];
            this.buffer[index + 1] = this.buffer[index - 3];
            this.buffer[index + 2] = this.buffer[index - 2];
            this.buffer[index + 3] = this.buffer[index - 1];
            index -= 4;
            if (size > 4)
              size -= 4;
          }
        this.buffer[index] = term;
        this.buffer[index + 1] = start;
        this.buffer[index + 2] = end;
        this.buffer[index + 3] = size;
      }
    }
    // Apply a shift action
    /**
    @internal
    */
    shift(action, type, start, end) {
      if (action & 131072) {
        this.pushState(action & 65535, this.pos);
      } else if ((action & 262144) == 0) {
        let nextState = action, { parser: parser2 } = this.p;
        if (end > this.pos || type <= parser2.maxNode) {
          this.pos = end;
          if (!parser2.stateFlag(
            nextState,
            1
            /* StateFlag.Skipped */
          ))
            this.reducePos = end;
        }
        this.pushState(nextState, start);
        this.shiftContext(type, start);
        if (type <= parser2.maxNode)
          this.buffer.push(type, start, end, 4);
      } else {
        this.pos = end;
        this.shiftContext(type, start);
        if (type <= this.p.parser.maxNode)
          this.buffer.push(type, start, end, 4);
      }
    }
    // Apply an action
    /**
    @internal
    */
    apply(action, next, nextStart, nextEnd) {
      if (action & 65536)
        this.reduce(action);
      else
        this.shift(action, next, nextStart, nextEnd);
    }
    // Add a prebuilt (reused) node into the buffer.
    /**
    @internal
    */
    useNode(value, next) {
      let index = this.p.reused.length - 1;
      if (index < 0 || this.p.reused[index] != value) {
        this.p.reused.push(value);
        index++;
      }
      let start = this.pos;
      this.reducePos = this.pos = start + value.length;
      this.pushState(next, start);
      this.buffer.push(
        index,
        start,
        this.reducePos,
        -1
        /* size == -1 means this is a reused value */
      );
      if (this.curContext)
        this.updateContext(this.curContext.tracker.reuse(this.curContext.context, value, this, this.p.stream.reset(this.pos - value.length)));
    }
    // Split the stack. Due to the buffer sharing and the fact
    // that `this.stack` tends to stay quite shallow, this isn't very
    // expensive.
    /**
    @internal
    */
    split() {
      let parent = this;
      let off = parent.buffer.length;
      while (off > 0 && parent.buffer[off - 2] > parent.reducePos)
        off -= 4;
      let buffer = parent.buffer.slice(off), base2 = parent.bufferBase + off;
      while (parent && base2 == parent.bufferBase)
        parent = parent.parent;
      return new Stack(this.p, this.stack.slice(), this.state, this.reducePos, this.pos, this.score, buffer, base2, this.curContext, this.lookAhead, parent);
    }
    // Try to recover from an error by 'deleting' (ignoring) one token.
    /**
    @internal
    */
    recoverByDelete(next, nextEnd) {
      let isNode = next <= this.p.parser.maxNode;
      if (isNode)
        this.storeNode(next, this.pos, nextEnd, 4);
      this.storeNode(0, this.pos, nextEnd, isNode ? 8 : 4);
      this.pos = this.reducePos = nextEnd;
      this.score -= 190;
    }
    /**
    Check if the given term would be able to be shifted (optionally
    after some reductions) on this stack. This can be useful for
    external tokenizers that want to make sure they only provide a
    given token when it applies.
    */
    canShift(term) {
      for (let sim = new SimulatedStack(this); ; ) {
        let action = this.p.parser.stateSlot(
          sim.state,
          4
          /* ParseState.DefaultReduce */
        ) || this.p.parser.hasAction(sim.state, term);
        if (action == 0)
          return false;
        if ((action & 65536) == 0)
          return true;
        sim.reduce(action);
      }
    }
    // Apply up to Recover.MaxNext recovery actions that conceptually
    // inserts some missing token or rule.
    /**
    @internal
    */
    recoverByInsert(next) {
      if (this.stack.length >= 300)
        return [];
      let nextStates = this.p.parser.nextStates(this.state);
      if (nextStates.length > 4 << 1 || this.stack.length >= 120) {
        let best = [];
        for (let i2 = 0, s2; i2 < nextStates.length; i2 += 2) {
          if ((s2 = nextStates[i2 + 1]) != this.state && this.p.parser.hasAction(s2, next))
            best.push(nextStates[i2], s2);
        }
        if (this.stack.length < 120)
          for (let i2 = 0; best.length < 4 << 1 && i2 < nextStates.length; i2 += 2) {
            let s2 = nextStates[i2 + 1];
            if (!best.some((v2, i3) => i3 & 1 && v2 == s2))
              best.push(nextStates[i2], s2);
          }
        nextStates = best;
      }
      let result = [];
      for (let i2 = 0; i2 < nextStates.length && result.length < 4; i2 += 2) {
        let s2 = nextStates[i2 + 1];
        if (s2 == this.state)
          continue;
        let stack = this.split();
        stack.pushState(s2, this.pos);
        stack.storeNode(0, stack.pos, stack.pos, 4, true);
        stack.shiftContext(nextStates[i2], this.pos);
        stack.reducePos = this.pos;
        stack.score -= 200;
        result.push(stack);
      }
      return result;
    }
    // Force a reduce, if possible. Return false if that can't
    // be done.
    /**
    @internal
    */
    forceReduce() {
      let { parser: parser2 } = this.p;
      let reduce = parser2.stateSlot(
        this.state,
        5
        /* ParseState.ForcedReduce */
      );
      if ((reduce & 65536) == 0)
        return false;
      if (!parser2.validAction(this.state, reduce)) {
        let depth = reduce >> 19, term = reduce & 65535;
        let target = this.stack.length - depth * 3;
        if (target < 0 || parser2.getGoto(this.stack[target], term, false) < 0) {
          let backup = this.findForcedReduction();
          if (backup == null)
            return false;
          reduce = backup;
        }
        this.storeNode(0, this.pos, this.pos, 4, true);
        this.score -= 100;
      }
      this.reducePos = this.pos;
      this.reduce(reduce);
      return true;
    }
    /**
    Try to scan through the automaton to find some kind of reduction
    that can be applied. Used when the regular ForcedReduce field
    isn't a valid action. @internal
    */
    findForcedReduction() {
      let { parser: parser2 } = this.p, seen = [];
      let explore = (state, depth) => {
        if (seen.includes(state))
          return;
        seen.push(state);
        return parser2.allActions(state, (action) => {
          if (action & (262144 | 131072))
            ;
          else if (action & 65536) {
            let rDepth = (action >> 19) - depth;
            if (rDepth > 1) {
              let term = action & 65535, target = this.stack.length - rDepth * 3;
              if (target >= 0 && parser2.getGoto(this.stack[target], term, false) >= 0)
                return rDepth << 19 | 65536 | term;
            }
          } else {
            let found = explore(action, depth + 1);
            if (found != null)
              return found;
          }
        });
      };
      return explore(this.state, 0);
    }
    /**
    @internal
    */
    forceAll() {
      while (!this.p.parser.stateFlag(
        this.state,
        2
        /* StateFlag.Accepting */
      )) {
        if (!this.forceReduce()) {
          this.storeNode(0, this.pos, this.pos, 4, true);
          break;
        }
      }
      return this;
    }
    /**
    Check whether this state has no further actions (assumed to be a direct descendant of the
    top state, since any other states must be able to continue
    somehow). @internal
    */
    get deadEnd() {
      if (this.stack.length != 3)
        return false;
      let { parser: parser2 } = this.p;
      return parser2.data[parser2.stateSlot(
        this.state,
        1
        /* ParseState.Actions */
      )] == 65535 && !parser2.stateSlot(
        this.state,
        4
        /* ParseState.DefaultReduce */
      );
    }
    /**
    Restart the stack (put it back in its start state). Only safe
    when this.stack.length == 3 (state is directly below the top
    state). @internal
    */
    restart() {
      this.storeNode(0, this.pos, this.pos, 4, true);
      this.state = this.stack[0];
      this.stack.length = 0;
    }
    /**
    @internal
    */
    sameState(other) {
      if (this.state != other.state || this.stack.length != other.stack.length)
        return false;
      for (let i2 = 0; i2 < this.stack.length; i2 += 3)
        if (this.stack[i2] != other.stack[i2])
          return false;
      return true;
    }
    /**
    Get the parser used by this stack.
    */
    get parser() {
      return this.p.parser;
    }
    /**
    Test whether a given dialect (by numeric ID, as exported from
    the terms file) is enabled.
    */
    dialectEnabled(dialectID) {
      return this.p.parser.dialect.flags[dialectID];
    }
    shiftContext(term, start) {
      if (this.curContext)
        this.updateContext(this.curContext.tracker.shift(this.curContext.context, term, this, this.p.stream.reset(start)));
    }
    reduceContext(term, start) {
      if (this.curContext)
        this.updateContext(this.curContext.tracker.reduce(this.curContext.context, term, this, this.p.stream.reset(start)));
    }
    /**
    @internal
    */
    emitContext() {
      let last = this.buffer.length - 1;
      if (last < 0 || this.buffer[last] != -3)
        this.buffer.push(this.curContext.hash, this.pos, this.pos, -3);
    }
    /**
    @internal
    */
    emitLookAhead() {
      let last = this.buffer.length - 1;
      if (last < 0 || this.buffer[last] != -4)
        this.buffer.push(this.lookAhead, this.pos, this.pos, -4);
    }
    updateContext(context) {
      if (context != this.curContext.context) {
        let newCx = new StackContext(this.curContext.tracker, context);
        if (newCx.hash != this.curContext.hash)
          this.emitContext();
        this.curContext = newCx;
      }
    }
    /**
    @internal
    */
    setLookAhead(lookAhead) {
      if (lookAhead > this.lookAhead) {
        this.emitLookAhead();
        this.lookAhead = lookAhead;
      }
    }
    /**
    @internal
    */
    close() {
      if (this.curContext && this.curContext.tracker.strict)
        this.emitContext();
      if (this.lookAhead > 0)
        this.emitLookAhead();
    }
  }
  class StackContext {
    constructor(tracker, context) {
      this.tracker = tracker;
      this.context = context;
      this.hash = tracker.strict ? tracker.hash(context) : 0;
    }
  }
  class SimulatedStack {
    constructor(start) {
      this.start = start;
      this.state = start.state;
      this.stack = start.stack;
      this.base = this.stack.length;
    }
    reduce(action) {
      let term = action & 65535, depth = action >> 19;
      if (depth == 0) {
        if (this.stack == this.start.stack)
          this.stack = this.stack.slice();
        this.stack.push(this.state, 0, 0);
        this.base += 3;
      } else {
        this.base -= (depth - 1) * 3;
      }
      let goto = this.start.p.parser.getGoto(this.stack[this.base - 3], term, true);
      this.state = goto;
    }
  }
  class StackBufferCursor {
    constructor(stack, pos, index) {
      this.stack = stack;
      this.pos = pos;
      this.index = index;
      this.buffer = stack.buffer;
      if (this.index == 0)
        this.maybeNext();
    }
    static create(stack, pos = stack.bufferBase + stack.buffer.length) {
      return new StackBufferCursor(stack, pos, pos - stack.bufferBase);
    }
    maybeNext() {
      let next = this.stack.parent;
      if (next != null) {
        this.index = this.stack.bufferBase - next.bufferBase;
        this.stack = next;
        this.buffer = next.buffer;
      }
    }
    get id() {
      return this.buffer[this.index - 4];
    }
    get start() {
      return this.buffer[this.index - 3];
    }
    get end() {
      return this.buffer[this.index - 2];
    }
    get size() {
      return this.buffer[this.index - 1];
    }
    next() {
      this.index -= 4;
      this.pos -= 4;
      if (this.index == 0)
        this.maybeNext();
    }
    fork() {
      return new StackBufferCursor(this.stack, this.pos, this.index);
    }
  }
  function decodeArray(input, Type = Uint16Array) {
    if (typeof input != "string")
      return input;
    let array = null;
    for (let pos = 0, out = 0; pos < input.length; ) {
      let value = 0;
      for (; ; ) {
        let next = input.charCodeAt(pos++), stop = false;
        if (next == 126) {
          value = 65535;
          break;
        }
        if (next >= 92)
          next--;
        if (next >= 34)
          next--;
        let digit = next - 32;
        if (digit >= 46) {
          digit -= 46;
          stop = true;
        }
        value += digit;
        if (stop)
          break;
        value *= 46;
      }
      if (array)
        array[out++] = value;
      else
        array = new Type(value);
    }
    return array;
  }
  class CachedToken {
    constructor() {
      this.start = -1;
      this.value = -1;
      this.end = -1;
      this.extended = -1;
      this.lookAhead = 0;
      this.mask = 0;
      this.context = 0;
    }
  }
  const nullToken = new CachedToken();
  class InputStream {
    /**
    @internal
    */
    constructor(input, ranges) {
      this.input = input;
      this.ranges = ranges;
      this.chunk = "";
      this.chunkOff = 0;
      this.chunk2 = "";
      this.chunk2Pos = 0;
      this.next = -1;
      this.token = nullToken;
      this.rangeIndex = 0;
      this.pos = this.chunkPos = ranges[0].from;
      this.range = ranges[0];
      this.end = ranges[ranges.length - 1].to;
      this.readNext();
    }
    /**
    @internal
    */
    resolveOffset(offset, assoc) {
      let range = this.range, index = this.rangeIndex;
      let pos = this.pos + offset;
      while (pos < range.from) {
        if (!index)
          return null;
        let next = this.ranges[--index];
        pos -= range.from - next.to;
        range = next;
      }
      while (assoc < 0 ? pos > range.to : pos >= range.to) {
        if (index == this.ranges.length - 1)
          return null;
        let next = this.ranges[++index];
        pos += next.from - range.to;
        range = next;
      }
      return pos;
    }
    /**
    @internal
    */
    clipPos(pos) {
      if (pos >= this.range.from && pos < this.range.to)
        return pos;
      for (let range of this.ranges)
        if (range.to > pos)
          return Math.max(pos, range.from);
      return this.end;
    }
    /**
    Look at a code unit near the stream position. `.peek(0)` equals
    `.next`, `.peek(-1)` gives you the previous character, and so
    on.
    
    Note that looking around during tokenizing creates dependencies
    on potentially far-away content, which may reduce the
    effectiveness incremental parsing—when looking forward—or even
    cause invalid reparses when looking backward more than 25 code
    units, since the library does not track lookbehind.
    */
    peek(offset) {
      let idx = this.chunkOff + offset, pos, result;
      if (idx >= 0 && idx < this.chunk.length) {
        pos = this.pos + offset;
        result = this.chunk.charCodeAt(idx);
      } else {
        let resolved = this.resolveOffset(offset, 1);
        if (resolved == null)
          return -1;
        pos = resolved;
        if (pos >= this.chunk2Pos && pos < this.chunk2Pos + this.chunk2.length) {
          result = this.chunk2.charCodeAt(pos - this.chunk2Pos);
        } else {
          let i2 = this.rangeIndex, range = this.range;
          while (range.to <= pos)
            range = this.ranges[++i2];
          this.chunk2 = this.input.chunk(this.chunk2Pos = pos);
          if (pos + this.chunk2.length > range.to)
            this.chunk2 = this.chunk2.slice(0, range.to - pos);
          result = this.chunk2.charCodeAt(0);
        }
      }
      if (pos >= this.token.lookAhead)
        this.token.lookAhead = pos + 1;
      return result;
    }
    /**
    Accept a token. By default, the end of the token is set to the
    current stream position, but you can pass an offset (relative to
    the stream position) to change that.
    */
    acceptToken(token, endOffset = 0) {
      let end = endOffset ? this.resolveOffset(endOffset, -1) : this.pos;
      if (end == null || end < this.token.start)
        throw new RangeError("Token end out of bounds");
      this.token.value = token;
      this.token.end = end;
    }
    getChunk() {
      if (this.pos >= this.chunk2Pos && this.pos < this.chunk2Pos + this.chunk2.length) {
        let { chunk, chunkPos } = this;
        this.chunk = this.chunk2;
        this.chunkPos = this.chunk2Pos;
        this.chunk2 = chunk;
        this.chunk2Pos = chunkPos;
        this.chunkOff = this.pos - this.chunkPos;
      } else {
        this.chunk2 = this.chunk;
        this.chunk2Pos = this.chunkPos;
        let nextChunk = this.input.chunk(this.pos);
        let end = this.pos + nextChunk.length;
        this.chunk = end > this.range.to ? nextChunk.slice(0, this.range.to - this.pos) : nextChunk;
        this.chunkPos = this.pos;
        this.chunkOff = 0;
      }
    }
    readNext() {
      if (this.chunkOff >= this.chunk.length) {
        this.getChunk();
        if (this.chunkOff == this.chunk.length)
          return this.next = -1;
      }
      return this.next = this.chunk.charCodeAt(this.chunkOff);
    }
    /**
    Move the stream forward N (defaults to 1) code units. Returns
    the new value of [`next`](#lr.InputStream.next).
    */
    advance(n2 = 1) {
      this.chunkOff += n2;
      while (this.pos + n2 >= this.range.to) {
        if (this.rangeIndex == this.ranges.length - 1)
          return this.setDone();
        n2 -= this.range.to - this.pos;
        this.range = this.ranges[++this.rangeIndex];
        this.pos = this.range.from;
      }
      this.pos += n2;
      if (this.pos >= this.token.lookAhead)
        this.token.lookAhead = this.pos + 1;
      return this.readNext();
    }
    setDone() {
      this.pos = this.chunkPos = this.end;
      this.range = this.ranges[this.rangeIndex = this.ranges.length - 1];
      this.chunk = "";
      return this.next = -1;
    }
    /**
    @internal
    */
    reset(pos, token) {
      if (token) {
        this.token = token;
        token.start = pos;
        token.lookAhead = pos + 1;
        token.value = token.extended = -1;
      } else {
        this.token = nullToken;
      }
      if (this.pos != pos) {
        this.pos = pos;
        if (pos == this.end) {
          this.setDone();
          return this;
        }
        while (pos < this.range.from)
          this.range = this.ranges[--this.rangeIndex];
        while (pos >= this.range.to)
          this.range = this.ranges[++this.rangeIndex];
        if (pos >= this.chunkPos && pos < this.chunkPos + this.chunk.length) {
          this.chunkOff = pos - this.chunkPos;
        } else {
          this.chunk = "";
          this.chunkOff = 0;
        }
        this.readNext();
      }
      return this;
    }
    /**
    @internal
    */
    read(from, to) {
      if (from >= this.chunkPos && to <= this.chunkPos + this.chunk.length)
        return this.chunk.slice(from - this.chunkPos, to - this.chunkPos);
      if (from >= this.chunk2Pos && to <= this.chunk2Pos + this.chunk2.length)
        return this.chunk2.slice(from - this.chunk2Pos, to - this.chunk2Pos);
      if (from >= this.range.from && to <= this.range.to)
        return this.input.read(from, to);
      let result = "";
      for (let r2 of this.ranges) {
        if (r2.from >= to)
          break;
        if (r2.to > from)
          result += this.input.read(Math.max(r2.from, from), Math.min(r2.to, to));
      }
      return result;
    }
  }
  class TokenGroup {
    constructor(data, id) {
      this.data = data;
      this.id = id;
    }
    token(input, stack) {
      let { parser: parser2 } = stack.p;
      readToken(this.data, input, stack, this.id, parser2.data, parser2.tokenPrecTable);
    }
  }
  TokenGroup.prototype.contextual = TokenGroup.prototype.fallback = TokenGroup.prototype.extend = false;
  TokenGroup.prototype.fallback = TokenGroup.prototype.extend = false;
  class ExternalTokenizer {
    /**
    Create a tokenizer. The first argument is the function that,
    given an input stream, scans for the types of tokens it
    recognizes at the stream's position, and calls
    [`acceptToken`](#lr.InputStream.acceptToken) when it finds
    one.
    */
    constructor(token, options = {}) {
      this.token = token;
      this.contextual = !!options.contextual;
      this.fallback = !!options.fallback;
      this.extend = !!options.extend;
    }
  }
  function readToken(data, input, stack, group, precTable, precOffset) {
    let state = 0, groupMask = 1 << group, { dialect } = stack.p.parser;
    scan:
      for (; ; ) {
        if ((groupMask & data[state]) == 0)
          break;
        let accEnd = data[state + 1];
        for (let i2 = state + 3; i2 < accEnd; i2 += 2)
          if ((data[i2 + 1] & groupMask) > 0) {
            let term = data[i2];
            if (dialect.allows(term) && (input.token.value == -1 || input.token.value == term || overrides(term, input.token.value, precTable, precOffset))) {
              input.acceptToken(term);
              break;
            }
          }
        let next = input.next, low = 0, high = data[state + 2];
        if (input.next < 0 && high > low && data[accEnd + high * 3 - 3] == 65535) {
          state = data[accEnd + high * 3 - 1];
          continue scan;
        }
        for (; low < high; ) {
          let mid = low + high >> 1;
          let index = accEnd + mid + (mid << 1);
          let from = data[index], to = data[index + 1] || 65536;
          if (next < from)
            high = mid;
          else if (next >= to)
            low = mid + 1;
          else {
            state = data[index + 2];
            input.advance();
            continue scan;
          }
        }
        break;
      }
  }
  function findOffset(data, start, term) {
    for (let i2 = start, next; (next = data[i2]) != 65535; i2++)
      if (next == term)
        return i2 - start;
    return -1;
  }
  function overrides(token, prev, tableData, tableOffset) {
    let iPrev = findOffset(tableData, tableOffset, prev);
    return iPrev < 0 || findOffset(tableData, tableOffset, token) < iPrev;
  }
  const verbose = typeof process != "undefined" && process.env && /\bparse\b/.test(process.env.LOG);
  let stackIDs = null;
  function cutAt(tree, pos, side) {
    let cursor = tree.cursor(IterMode.IncludeAnonymous);
    cursor.moveTo(pos);
    for (; ; ) {
      if (!(side < 0 ? cursor.childBefore(pos) : cursor.childAfter(pos)))
        for (; ; ) {
          if ((side < 0 ? cursor.to < pos : cursor.from > pos) && !cursor.type.isError)
            return side < 0 ? Math.max(0, Math.min(
              cursor.to - 1,
              pos - 25
              /* Safety.Margin */
            )) : Math.min(tree.length, Math.max(
              cursor.from + 1,
              pos + 25
              /* Safety.Margin */
            ));
          if (side < 0 ? cursor.prevSibling() : cursor.nextSibling())
            break;
          if (!cursor.parent())
            return side < 0 ? 0 : tree.length;
        }
    }
  }
  class FragmentCursor {
    constructor(fragments, nodeSet) {
      this.fragments = fragments;
      this.nodeSet = nodeSet;
      this.i = 0;
      this.fragment = null;
      this.safeFrom = -1;
      this.safeTo = -1;
      this.trees = [];
      this.start = [];
      this.index = [];
      this.nextFragment();
    }
    nextFragment() {
      let fr = this.fragment = this.i == this.fragments.length ? null : this.fragments[this.i++];
      if (fr) {
        this.safeFrom = fr.openStart ? cutAt(fr.tree, fr.from + fr.offset, 1) - fr.offset : fr.from;
        this.safeTo = fr.openEnd ? cutAt(fr.tree, fr.to + fr.offset, -1) - fr.offset : fr.to;
        while (this.trees.length) {
          this.trees.pop();
          this.start.pop();
          this.index.pop();
        }
        this.trees.push(fr.tree);
        this.start.push(-fr.offset);
        this.index.push(0);
        this.nextStart = this.safeFrom;
      } else {
        this.nextStart = 1e9;
      }
    }
    // `pos` must be >= any previously given `pos` for this cursor
    nodeAt(pos) {
      if (pos < this.nextStart)
        return null;
      while (this.fragment && this.safeTo <= pos)
        this.nextFragment();
      if (!this.fragment)
        return null;
      for (; ; ) {
        let last = this.trees.length - 1;
        if (last < 0) {
          this.nextFragment();
          return null;
        }
        let top2 = this.trees[last], index = this.index[last];
        if (index == top2.children.length) {
          this.trees.pop();
          this.start.pop();
          this.index.pop();
          continue;
        }
        let next = top2.children[index];
        let start = this.start[last] + top2.positions[index];
        if (start > pos) {
          this.nextStart = start;
          return null;
        }
        if (next instanceof Tree) {
          if (start == pos) {
            if (start < this.safeFrom)
              return null;
            let end = start + next.length;
            if (end <= this.safeTo) {
              let lookAhead = next.prop(NodeProp.lookAhead);
              if (!lookAhead || end + lookAhead < this.fragment.to)
                return next;
            }
          }
          this.index[last]++;
          if (start + next.length >= Math.max(this.safeFrom, pos)) {
            this.trees.push(next);
            this.start.push(start);
            this.index.push(0);
          }
        } else {
          this.index[last]++;
          this.nextStart = start + next.length;
        }
      }
    }
  }
  class TokenCache {
    constructor(parser2, stream) {
      this.stream = stream;
      this.tokens = [];
      this.mainToken = null;
      this.actions = [];
      this.tokens = parser2.tokenizers.map((_2) => new CachedToken());
    }
    getActions(stack) {
      let actionIndex = 0;
      let main = null;
      let { parser: parser2 } = stack.p, { tokenizers } = parser2;
      let mask = parser2.stateSlot(
        stack.state,
        3
        /* ParseState.TokenizerMask */
      );
      let context = stack.curContext ? stack.curContext.hash : 0;
      let lookAhead = 0;
      for (let i2 = 0; i2 < tokenizers.length; i2++) {
        if ((1 << i2 & mask) == 0)
          continue;
        let tokenizer = tokenizers[i2], token = this.tokens[i2];
        if (main && !tokenizer.fallback)
          continue;
        if (tokenizer.contextual || token.start != stack.pos || token.mask != mask || token.context != context) {
          this.updateCachedToken(token, tokenizer, stack);
          token.mask = mask;
          token.context = context;
        }
        if (token.lookAhead > token.end + 25)
          lookAhead = Math.max(token.lookAhead, lookAhead);
        if (token.value != 0) {
          let startIndex = actionIndex;
          if (token.extended > -1)
            actionIndex = this.addActions(stack, token.extended, token.end, actionIndex);
          actionIndex = this.addActions(stack, token.value, token.end, actionIndex);
          if (!tokenizer.extend) {
            main = token;
            if (actionIndex > startIndex)
              break;
          }
        }
      }
      while (this.actions.length > actionIndex)
        this.actions.pop();
      if (lookAhead)
        stack.setLookAhead(lookAhead);
      if (!main && stack.pos == this.stream.end) {
        main = new CachedToken();
        main.value = stack.p.parser.eofTerm;
        main.start = main.end = stack.pos;
        actionIndex = this.addActions(stack, main.value, main.end, actionIndex);
      }
      this.mainToken = main;
      return this.actions;
    }
    getMainToken(stack) {
      if (this.mainToken)
        return this.mainToken;
      let main = new CachedToken(), { pos, p: p2 } = stack;
      main.start = pos;
      main.end = Math.min(pos + 1, p2.stream.end);
      main.value = pos == p2.stream.end ? p2.parser.eofTerm : 0;
      return main;
    }
    updateCachedToken(token, tokenizer, stack) {
      let start = this.stream.clipPos(stack.pos);
      tokenizer.token(this.stream.reset(start, token), stack);
      if (token.value > -1) {
        let { parser: parser2 } = stack.p;
        for (let i2 = 0; i2 < parser2.specialized.length; i2++)
          if (parser2.specialized[i2] == token.value) {
            let result = parser2.specializers[i2](this.stream.read(token.start, token.end), stack);
            if (result >= 0 && stack.p.parser.dialect.allows(result >> 1)) {
              if ((result & 1) == 0)
                token.value = result >> 1;
              else
                token.extended = result >> 1;
              break;
            }
          }
      } else {
        token.value = 0;
        token.end = this.stream.clipPos(start + 1);
      }
    }
    putAction(action, token, end, index) {
      for (let i2 = 0; i2 < index; i2 += 3)
        if (this.actions[i2] == action)
          return index;
      this.actions[index++] = action;
      this.actions[index++] = token;
      this.actions[index++] = end;
      return index;
    }
    addActions(stack, token, end, index) {
      let { state } = stack, { parser: parser2 } = stack.p, { data } = parser2;
      for (let set = 0; set < 2; set++) {
        for (let i2 = parser2.stateSlot(
          state,
          set ? 2 : 1
          /* ParseState.Actions */
        ); ; i2 += 3) {
          if (data[i2] == 65535) {
            if (data[i2 + 1] == 1) {
              i2 = pair(data, i2 + 2);
            } else {
              if (index == 0 && data[i2 + 1] == 2)
                index = this.putAction(pair(data, i2 + 2), token, end, index);
              break;
            }
          }
          if (data[i2] == token)
            index = this.putAction(pair(data, i2 + 1), token, end, index);
        }
      }
      return index;
    }
  }
  class Parse {
    constructor(parser2, input, fragments, ranges) {
      this.parser = parser2;
      this.input = input;
      this.ranges = ranges;
      this.recovering = 0;
      this.nextStackID = 9812;
      this.minStackPos = 0;
      this.reused = [];
      this.stoppedAt = null;
      this.lastBigReductionStart = -1;
      this.lastBigReductionSize = 0;
      this.bigReductionCount = 0;
      this.stream = new InputStream(input, ranges);
      this.tokens = new TokenCache(parser2, this.stream);
      this.topTerm = parser2.top[1];
      let { from } = ranges[0];
      this.stacks = [Stack.start(this, parser2.top[0], from)];
      this.fragments = fragments.length && this.stream.end - from > parser2.bufferLength * 4 ? new FragmentCursor(fragments, parser2.nodeSet) : null;
    }
    get parsedPos() {
      return this.minStackPos;
    }
    // Move the parser forward. This will process all parse stacks at
    // `this.pos` and try to advance them to a further position. If no
    // stack for such a position is found, it'll start error-recovery.
    //
    // When the parse is finished, this will return a syntax tree. When
    // not, it returns `null`.
    advance() {
      let stacks = this.stacks, pos = this.minStackPos;
      let newStacks = this.stacks = [];
      let stopped, stoppedTokens;
      if (this.bigReductionCount > 300 && stacks.length == 1) {
        let [s2] = stacks;
        while (s2.forceReduce() && s2.stack.length && s2.stack[s2.stack.length - 2] >= this.lastBigReductionStart) {
        }
        this.bigReductionCount = this.lastBigReductionSize = 0;
      }
      for (let i2 = 0; i2 < stacks.length; i2++) {
        let stack = stacks[i2];
        for (; ; ) {
          this.tokens.mainToken = null;
          if (stack.pos > pos) {
            newStacks.push(stack);
          } else if (this.advanceStack(stack, newStacks, stacks)) {
            continue;
          } else {
            if (!stopped) {
              stopped = [];
              stoppedTokens = [];
            }
            stopped.push(stack);
            let tok = this.tokens.getMainToken(stack);
            stoppedTokens.push(tok.value, tok.end);
          }
          break;
        }
      }
      if (!newStacks.length) {
        let finished = stopped && findFinished(stopped);
        if (finished) {
          if (verbose)
            console.log("Finish with " + this.stackID(finished));
          return this.stackToTree(finished);
        }
        if (this.parser.strict) {
          if (verbose && stopped)
            console.log("Stuck with token " + (this.tokens.mainToken ? this.parser.getName(this.tokens.mainToken.value) : "none"));
          throw new SyntaxError("No parse at " + pos);
        }
        if (!this.recovering)
          this.recovering = 5;
      }
      if (this.recovering && stopped) {
        let finished = this.stoppedAt != null && stopped[0].pos > this.stoppedAt ? stopped[0] : this.runRecovery(stopped, stoppedTokens, newStacks);
        if (finished) {
          if (verbose)
            console.log("Force-finish " + this.stackID(finished));
          return this.stackToTree(finished.forceAll());
        }
      }
      if (this.recovering) {
        let maxRemaining = this.recovering == 1 ? 1 : this.recovering * 3;
        if (newStacks.length > maxRemaining) {
          newStacks.sort((a2, b2) => b2.score - a2.score);
          while (newStacks.length > maxRemaining)
            newStacks.pop();
        }
        if (newStacks.some((s2) => s2.reducePos > pos))
          this.recovering--;
      } else if (newStacks.length > 1) {
        outer:
          for (let i2 = 0; i2 < newStacks.length - 1; i2++) {
            let stack = newStacks[i2];
            for (let j2 = i2 + 1; j2 < newStacks.length; j2++) {
              let other = newStacks[j2];
              if (stack.sameState(other) || stack.buffer.length > 500 && other.buffer.length > 500) {
                if ((stack.score - other.score || stack.buffer.length - other.buffer.length) > 0) {
                  newStacks.splice(j2--, 1);
                } else {
                  newStacks.splice(i2--, 1);
                  continue outer;
                }
              }
            }
          }
        if (newStacks.length > 12)
          newStacks.splice(
            12,
            newStacks.length - 12
            /* Rec.MaxStackCount */
          );
      }
      this.minStackPos = newStacks[0].pos;
      for (let i2 = 1; i2 < newStacks.length; i2++)
        if (newStacks[i2].pos < this.minStackPos)
          this.minStackPos = newStacks[i2].pos;
      return null;
    }
    stopAt(pos) {
      if (this.stoppedAt != null && this.stoppedAt < pos)
        throw new RangeError("Can't move stoppedAt forward");
      this.stoppedAt = pos;
    }
    // Returns an updated version of the given stack, or null if the
    // stack can't advance normally. When `split` and `stacks` are
    // given, stacks split off by ambiguous operations will be pushed to
    // `split`, or added to `stacks` if they move `pos` forward.
    advanceStack(stack, stacks, split) {
      let start = stack.pos, { parser: parser2 } = this;
      let base2 = verbose ? this.stackID(stack) + " -> " : "";
      if (this.stoppedAt != null && start > this.stoppedAt)
        return stack.forceReduce() ? stack : null;
      if (this.fragments) {
        let strictCx = stack.curContext && stack.curContext.tracker.strict, cxHash = strictCx ? stack.curContext.hash : 0;
        for (let cached = this.fragments.nodeAt(start); cached; ) {
          let match = this.parser.nodeSet.types[cached.type.id] == cached.type ? parser2.getGoto(stack.state, cached.type.id) : -1;
          if (match > -1 && cached.length && (!strictCx || (cached.prop(NodeProp.contextHash) || 0) == cxHash)) {
            stack.useNode(cached, match);
            if (verbose)
              console.log(base2 + this.stackID(stack) + ` (via reuse of ${parser2.getName(cached.type.id)})`);
            return true;
          }
          if (!(cached instanceof Tree) || cached.children.length == 0 || cached.positions[0] > 0)
            break;
          let inner = cached.children[0];
          if (inner instanceof Tree && cached.positions[0] == 0)
            cached = inner;
          else
            break;
        }
      }
      let defaultReduce = parser2.stateSlot(
        stack.state,
        4
        /* ParseState.DefaultReduce */
      );
      if (defaultReduce > 0) {
        stack.reduce(defaultReduce);
        if (verbose)
          console.log(base2 + this.stackID(stack) + ` (via always-reduce ${parser2.getName(
            defaultReduce & 65535
            /* Action.ValueMask */
          )})`);
        return true;
      }
      if (stack.stack.length >= 8400) {
        while (stack.stack.length > 6e3 && stack.forceReduce()) {
        }
      }
      let actions = this.tokens.getActions(stack);
      for (let i2 = 0; i2 < actions.length; ) {
        let action = actions[i2++], term = actions[i2++], end = actions[i2++];
        let last = i2 == actions.length || !split;
        let localStack = last ? stack : stack.split();
        let main = this.tokens.mainToken;
        localStack.apply(action, term, main ? main.start : localStack.pos, end);
        if (verbose)
          console.log(base2 + this.stackID(localStack) + ` (via ${(action & 65536) == 0 ? "shift" : `reduce of ${parser2.getName(
            action & 65535
            /* Action.ValueMask */
          )}`} for ${parser2.getName(term)} @ ${start}${localStack == stack ? "" : ", split"})`);
        if (last)
          return true;
        else if (localStack.pos > start)
          stacks.push(localStack);
        else
          split.push(localStack);
      }
      return false;
    }
    // Advance a given stack forward as far as it will go. Returns the
    // (possibly updated) stack if it got stuck, or null if it moved
    // forward and was given to `pushStackDedup`.
    advanceFully(stack, newStacks) {
      let pos = stack.pos;
      for (; ; ) {
        if (!this.advanceStack(stack, null, null))
          return false;
        if (stack.pos > pos) {
          pushStackDedup(stack, newStacks);
          return true;
        }
      }
    }
    runRecovery(stacks, tokens, newStacks) {
      let finished = null, restarted = false;
      for (let i2 = 0; i2 < stacks.length; i2++) {
        let stack = stacks[i2], token = tokens[i2 << 1], tokenEnd = tokens[(i2 << 1) + 1];
        let base2 = verbose ? this.stackID(stack) + " -> " : "";
        if (stack.deadEnd) {
          if (restarted)
            continue;
          restarted = true;
          stack.restart();
          if (verbose)
            console.log(base2 + this.stackID(stack) + " (restarted)");
          let done = this.advanceFully(stack, newStacks);
          if (done)
            continue;
        }
        let force = stack.split(), forceBase = base2;
        for (let j2 = 0; force.forceReduce() && j2 < 10; j2++) {
          if (verbose)
            console.log(forceBase + this.stackID(force) + " (via force-reduce)");
          let done = this.advanceFully(force, newStacks);
          if (done)
            break;
          if (verbose)
            forceBase = this.stackID(force) + " -> ";
        }
        for (let insert2 of stack.recoverByInsert(token)) {
          if (verbose)
            console.log(base2 + this.stackID(insert2) + " (via recover-insert)");
          this.advanceFully(insert2, newStacks);
        }
        if (this.stream.end > stack.pos) {
          if (tokenEnd == stack.pos) {
            tokenEnd++;
            token = 0;
          }
          stack.recoverByDelete(token, tokenEnd);
          if (verbose)
            console.log(base2 + this.stackID(stack) + ` (via recover-delete ${this.parser.getName(token)})`);
          pushStackDedup(stack, newStacks);
        } else if (!finished || finished.score < stack.score) {
          finished = stack;
        }
      }
      return finished;
    }
    // Convert the stack's buffer to a syntax tree.
    stackToTree(stack) {
      stack.close();
      return Tree.build({
        buffer: StackBufferCursor.create(stack),
        nodeSet: this.parser.nodeSet,
        topID: this.topTerm,
        maxBufferLength: this.parser.bufferLength,
        reused: this.reused,
        start: this.ranges[0].from,
        length: stack.pos - this.ranges[0].from,
        minRepeatType: this.parser.minRepeatTerm
      });
    }
    stackID(stack) {
      let id = (stackIDs || (stackIDs = /* @__PURE__ */ new WeakMap())).get(stack);
      if (!id)
        stackIDs.set(stack, id = String.fromCodePoint(this.nextStackID++));
      return id + stack;
    }
  }
  function pushStackDedup(stack, newStacks) {
    for (let i2 = 0; i2 < newStacks.length; i2++) {
      let other = newStacks[i2];
      if (other.pos == stack.pos && other.sameState(stack)) {
        if (newStacks[i2].score < stack.score)
          newStacks[i2] = stack;
        return;
      }
    }
    newStacks.push(stack);
  }
  class Dialect {
    constructor(source, flags, disabled) {
      this.source = source;
      this.flags = flags;
      this.disabled = disabled;
    }
    allows(term) {
      return !this.disabled || this.disabled[term] == 0;
    }
  }
  class LRParser extends Parser {
    /**
    @internal
    */
    constructor(spec) {
      super();
      this.wrappers = [];
      if (spec.version != 14)
        throw new RangeError(`Parser version (${spec.version}) doesn't match runtime version (${14})`);
      let nodeNames = spec.nodeNames.split(" ");
      this.minRepeatTerm = nodeNames.length;
      for (let i2 = 0; i2 < spec.repeatNodeCount; i2++)
        nodeNames.push("");
      let topTerms = Object.keys(spec.topRules).map((r2) => spec.topRules[r2][1]);
      let nodeProps = [];
      for (let i2 = 0; i2 < nodeNames.length; i2++)
        nodeProps.push([]);
      function setProp(nodeID, prop, value) {
        nodeProps[nodeID].push([prop, prop.deserialize(String(value))]);
      }
      if (spec.nodeProps)
        for (let propSpec of spec.nodeProps) {
          let prop = propSpec[0];
          if (typeof prop == "string")
            prop = NodeProp[prop];
          for (let i2 = 1; i2 < propSpec.length; ) {
            let next = propSpec[i2++];
            if (next >= 0) {
              setProp(next, prop, propSpec[i2++]);
            } else {
              let value = propSpec[i2 + -next];
              for (let j2 = -next; j2 > 0; j2--)
                setProp(propSpec[i2++], prop, value);
              i2++;
            }
          }
        }
      this.nodeSet = new NodeSet(nodeNames.map((name2, i2) => NodeType.define({
        name: i2 >= this.minRepeatTerm ? void 0 : name2,
        id: i2,
        props: nodeProps[i2],
        top: topTerms.indexOf(i2) > -1,
        error: i2 == 0,
        skipped: spec.skippedNodes && spec.skippedNodes.indexOf(i2) > -1
      })));
      if (spec.propSources)
        this.nodeSet = this.nodeSet.extend(...spec.propSources);
      this.strict = false;
      this.bufferLength = DefaultBufferLength;
      let tokenArray = decodeArray(spec.tokenData);
      this.context = spec.context;
      this.specializerSpecs = spec.specialized || [];
      this.specialized = new Uint16Array(this.specializerSpecs.length);
      for (let i2 = 0; i2 < this.specializerSpecs.length; i2++)
        this.specialized[i2] = this.specializerSpecs[i2].term;
      this.specializers = this.specializerSpecs.map(getSpecializer);
      this.states = decodeArray(spec.states, Uint32Array);
      this.data = decodeArray(spec.stateData);
      this.goto = decodeArray(spec.goto);
      this.maxTerm = spec.maxTerm;
      this.tokenizers = spec.tokenizers.map((value) => typeof value == "number" ? new TokenGroup(tokenArray, value) : value);
      this.topRules = spec.topRules;
      this.dialects = spec.dialects || {};
      this.dynamicPrecedences = spec.dynamicPrecedences || null;
      this.tokenPrecTable = spec.tokenPrec;
      this.termNames = spec.termNames || null;
      this.maxNode = this.nodeSet.types.length - 1;
      this.dialect = this.parseDialect();
      this.top = this.topRules[Object.keys(this.topRules)[0]];
    }
    createParse(input, fragments, ranges) {
      let parse = new Parse(this, input, fragments, ranges);
      for (let w2 of this.wrappers)
        parse = w2(parse, input, fragments, ranges);
      return parse;
    }
    /**
    Get a goto table entry @internal
    */
    getGoto(state, term, loose = false) {
      let table = this.goto;
      if (term >= table[0])
        return -1;
      for (let pos = table[term + 1]; ; ) {
        let groupTag = table[pos++], last = groupTag & 1;
        let target = table[pos++];
        if (last && loose)
          return target;
        for (let end = pos + (groupTag >> 1); pos < end; pos++)
          if (table[pos] == state)
            return target;
        if (last)
          return -1;
      }
    }
    /**
    Check if this state has an action for a given terminal @internal
    */
    hasAction(state, terminal) {
      let data = this.data;
      for (let set = 0; set < 2; set++) {
        for (let i2 = this.stateSlot(
          state,
          set ? 2 : 1
          /* ParseState.Actions */
        ), next; ; i2 += 3) {
          if ((next = data[i2]) == 65535) {
            if (data[i2 + 1] == 1)
              next = data[i2 = pair(data, i2 + 2)];
            else if (data[i2 + 1] == 2)
              return pair(data, i2 + 2);
            else
              break;
          }
          if (next == terminal || next == 0)
            return pair(data, i2 + 1);
        }
      }
      return 0;
    }
    /**
    @internal
    */
    stateSlot(state, slot) {
      return this.states[state * 6 + slot];
    }
    /**
    @internal
    */
    stateFlag(state, flag) {
      return (this.stateSlot(
        state,
        0
        /* ParseState.Flags */
      ) & flag) > 0;
    }
    /**
    @internal
    */
    validAction(state, action) {
      return !!this.allActions(state, (a2) => a2 == action ? true : null);
    }
    /**
    @internal
    */
    allActions(state, action) {
      let deflt = this.stateSlot(
        state,
        4
        /* ParseState.DefaultReduce */
      );
      let result = deflt ? action(deflt) : void 0;
      for (let i2 = this.stateSlot(
        state,
        1
        /* ParseState.Actions */
      ); result == null; i2 += 3) {
        if (this.data[i2] == 65535) {
          if (this.data[i2 + 1] == 1)
            i2 = pair(this.data, i2 + 2);
          else
            break;
        }
        result = action(pair(this.data, i2 + 1));
      }
      return result;
    }
    /**
    Get the states that can follow this one through shift actions or
    goto jumps. @internal
    */
    nextStates(state) {
      let result = [];
      for (let i2 = this.stateSlot(
        state,
        1
        /* ParseState.Actions */
      ); ; i2 += 3) {
        if (this.data[i2] == 65535) {
          if (this.data[i2 + 1] == 1)
            i2 = pair(this.data, i2 + 2);
          else
            break;
        }
        if ((this.data[i2 + 2] & 65536 >> 16) == 0) {
          let value = this.data[i2 + 1];
          if (!result.some((v2, i3) => i3 & 1 && v2 == value))
            result.push(this.data[i2], value);
        }
      }
      return result;
    }
    /**
    Configure the parser. Returns a new parser instance that has the
    given settings modified. Settings not provided in `config` are
    kept from the original parser.
    */
    configure(config) {
      let copy = Object.assign(Object.create(LRParser.prototype), this);
      if (config.props)
        copy.nodeSet = this.nodeSet.extend(...config.props);
      if (config.top) {
        let info = this.topRules[config.top];
        if (!info)
          throw new RangeError(`Invalid top rule name ${config.top}`);
        copy.top = info;
      }
      if (config.tokenizers)
        copy.tokenizers = this.tokenizers.map((t2) => {
          let found = config.tokenizers.find((r2) => r2.from == t2);
          return found ? found.to : t2;
        });
      if (config.specializers) {
        copy.specializers = this.specializers.slice();
        copy.specializerSpecs = this.specializerSpecs.map((s2, i2) => {
          let found = config.specializers.find((r2) => r2.from == s2.external);
          if (!found)
            return s2;
          let spec = Object.assign(Object.assign({}, s2), { external: found.to });
          copy.specializers[i2] = getSpecializer(spec);
          return spec;
        });
      }
      if (config.contextTracker)
        copy.context = config.contextTracker;
      if (config.dialect)
        copy.dialect = this.parseDialect(config.dialect);
      if (config.strict != null)
        copy.strict = config.strict;
      if (config.wrap)
        copy.wrappers = copy.wrappers.concat(config.wrap);
      if (config.bufferLength != null)
        copy.bufferLength = config.bufferLength;
      return copy;
    }
    /**
    Tells you whether any [parse wrappers](#lr.ParserConfig.wrap)
    are registered for this parser.
    */
    hasWrappers() {
      return this.wrappers.length > 0;
    }
    /**
    Returns the name associated with a given term. This will only
    work for all terms when the parser was generated with the
    `--names` option. By default, only the names of tagged terms are
    stored.
    */
    getName(term) {
      return this.termNames ? this.termNames[term] : String(term <= this.maxNode && this.nodeSet.types[term].name || term);
    }
    /**
    The eof term id is always allocated directly after the node
    types. @internal
    */
    get eofTerm() {
      return this.maxNode + 1;
    }
    /**
    The type of top node produced by the parser.
    */
    get topNode() {
      return this.nodeSet.types[this.top[1]];
    }
    /**
    @internal
    */
    dynamicPrecedence(term) {
      let prec2 = this.dynamicPrecedences;
      return prec2 == null ? 0 : prec2[term] || 0;
    }
    /**
    @internal
    */
    parseDialect(dialect) {
      let values = Object.keys(this.dialects), flags = values.map(() => false);
      if (dialect)
        for (let part of dialect.split(" ")) {
          let id = values.indexOf(part);
          if (id >= 0)
            flags[id] = true;
        }
      let disabled = null;
      for (let i2 = 0; i2 < values.length; i2++)
        if (!flags[i2]) {
          for (let j2 = this.dialects[values[i2]], id; (id = this.data[j2++]) != 65535; )
            (disabled || (disabled = new Uint8Array(this.maxTerm + 1)))[id] = 1;
        }
      return new Dialect(dialect, flags, disabled);
    }
    /**
    Used by the output of the parser generator. Not available to
    user code. @hide
    */
    static deserialize(spec) {
      return new LRParser(spec);
    }
  }
  function pair(data, off) {
    return data[off] | data[off + 1] << 16;
  }
  function findFinished(stacks) {
    let best = null;
    for (let stack of stacks) {
      let stopped = stack.p.stoppedAt;
      if ((stack.pos == stack.p.stream.end || stopped != null && stack.pos > stopped) && stack.p.parser.stateFlag(
        stack.state,
        2
        /* StateFlag.Accepting */
      ) && (!best || best.score < stack.score))
        best = stack;
    }
    return best;
  }
  function getSpecializer(spec) {
    if (spec.external) {
      let mask = spec.extend ? 1 : 0;
      return (value, stack) => spec.external(value, stack) << 1 | mask;
    }
    return spec.get;
  }
  let nextTagID = 0;
  class Tag {
    /**
    @internal
    */
    constructor(set, base2, modified) {
      this.set = set;
      this.base = base2;
      this.modified = modified;
      this.id = nextTagID++;
    }
    /**
    Define a new tag. If `parent` is given, the tag is treated as a
    sub-tag of that parent, and
    [highlighters](#highlight.tagHighlighter) that don't mention
    this tag will try to fall back to the parent tag (or grandparent
    tag, etc).
    */
    static define(parent) {
      if (parent === null || parent === void 0 ? void 0 : parent.base)
        throw new Error("Can not derive from a modified tag");
      let tag = new Tag([], null, []);
      tag.set.push(tag);
      if (parent)
        for (let t2 of parent.set)
          tag.set.push(t2);
      return tag;
    }
    /**
    Define a tag _modifier_, which is a function that, given a tag,
    will return a tag that is a subtag of the original. Applying the
    same modifier to a twice tag will return the same value (`m1(t1)
    == m1(t1)`) and applying multiple modifiers will, regardless or
    order, produce the same tag (`m1(m2(t1)) == m2(m1(t1))`).
    
    When multiple modifiers are applied to a given base tag, each
    smaller set of modifiers is registered as a parent, so that for
    example `m1(m2(m3(t1)))` is a subtype of `m1(m2(t1))`,
    `m1(m3(t1)`, and so on.
    */
    static defineModifier() {
      let mod = new Modifier();
      return (tag) => {
        if (tag.modified.indexOf(mod) > -1)
          return tag;
        return Modifier.get(tag.base || tag, tag.modified.concat(mod).sort((a2, b2) => a2.id - b2.id));
      };
    }
  }
  let nextModifierID = 0;
  class Modifier {
    constructor() {
      this.instances = [];
      this.id = nextModifierID++;
    }
    static get(base2, mods) {
      if (!mods.length)
        return base2;
      let exists = mods[0].instances.find((t2) => t2.base == base2 && sameArray$1(mods, t2.modified));
      if (exists)
        return exists;
      let set = [], tag = new Tag(set, base2, mods);
      for (let m2 of mods)
        m2.instances.push(tag);
      let configs = powerSet(mods);
      for (let parent of base2.set)
        if (!parent.modified.length)
          for (let config of configs)
            set.push(Modifier.get(parent, config));
      return tag;
    }
  }
  function sameArray$1(a2, b2) {
    return a2.length == b2.length && a2.every((x2, i2) => x2 == b2[i2]);
  }
  function powerSet(array) {
    let sets = [[]];
    for (let i2 = 0; i2 < array.length; i2++) {
      for (let j2 = 0, e2 = sets.length; j2 < e2; j2++) {
        sets.push(sets[j2].concat(array[i2]));
      }
    }
    return sets.sort((a2, b2) => b2.length - a2.length);
  }
  function styleTags(spec) {
    let byName = /* @__PURE__ */ Object.create(null);
    for (let prop in spec) {
      let tags2 = spec[prop];
      if (!Array.isArray(tags2))
        tags2 = [tags2];
      for (let part of prop.split(" "))
        if (part) {
          let pieces = [], mode = 2, rest = part;
          for (let pos = 0; ; ) {
            if (rest == "..." && pos > 0 && pos + 3 == part.length) {
              mode = 1;
              break;
            }
            let m2 = /^"(?:[^"\\]|\\.)*?"|[^\/!]+/.exec(rest);
            if (!m2)
              throw new RangeError("Invalid path: " + part);
            pieces.push(m2[0] == "*" ? "" : m2[0][0] == '"' ? JSON.parse(m2[0]) : m2[0]);
            pos += m2[0].length;
            if (pos == part.length)
              break;
            let next = part[pos++];
            if (pos == part.length && next == "!") {
              mode = 0;
              break;
            }
            if (next != "/")
              throw new RangeError("Invalid path: " + part);
            rest = part.slice(pos);
          }
          let last = pieces.length - 1, inner = pieces[last];
          if (!inner)
            throw new RangeError("Invalid path: " + part);
          let rule = new Rule(tags2, mode, last > 0 ? pieces.slice(0, last) : null);
          byName[inner] = rule.sort(byName[inner]);
        }
    }
    return ruleNodeProp.add(byName);
  }
  const ruleNodeProp = new NodeProp();
  class Rule {
    constructor(tags2, mode, context, next) {
      this.tags = tags2;
      this.mode = mode;
      this.context = context;
      this.next = next;
    }
    get opaque() {
      return this.mode == 0;
    }
    get inherit() {
      return this.mode == 1;
    }
    sort(other) {
      if (!other || other.depth < this.depth) {
        this.next = other;
        return this;
      }
      other.next = this.sort(other.next);
      return other;
    }
    get depth() {
      return this.context ? this.context.length : 0;
    }
  }
  Rule.empty = new Rule([], 2, null);
  function tagHighlighter(tags2, options) {
    let map = /* @__PURE__ */ Object.create(null);
    for (let style of tags2) {
      if (!Array.isArray(style.tag))
        map[style.tag.id] = style.class;
      else
        for (let tag of style.tag)
          map[tag.id] = style.class;
    }
    let { scope, all = null } = options || {};
    return {
      style: (tags3) => {
        let cls = all;
        for (let tag of tags3) {
          for (let sub of tag.set) {
            let tagClass = map[sub.id];
            if (tagClass) {
              cls = cls ? cls + " " + tagClass : tagClass;
              break;
            }
          }
        }
        return cls;
      },
      scope
    };
  }
  function highlightTags(highlighters, tags2) {
    let result = null;
    for (let highlighter of highlighters) {
      let value = highlighter.style(tags2);
      if (value)
        result = result ? result + " " + value : value;
    }
    return result;
  }
  function highlightTree(tree, highlighter, putStyle, from = 0, to = tree.length) {
    let builder = new HighlightBuilder(from, Array.isArray(highlighter) ? highlighter : [highlighter], putStyle);
    builder.highlightRange(tree.cursor(), from, to, "", builder.highlighters);
    builder.flush(to);
  }
  class HighlightBuilder {
    constructor(at, highlighters, span) {
      this.at = at;
      this.highlighters = highlighters;
      this.span = span;
      this.class = "";
    }
    startSpan(at, cls) {
      if (cls != this.class) {
        this.flush(at);
        if (at > this.at)
          this.at = at;
        this.class = cls;
      }
    }
    flush(to) {
      if (to > this.at && this.class)
        this.span(this.at, to, this.class);
    }
    highlightRange(cursor, from, to, inheritedClass, highlighters) {
      let { type, from: start, to: end } = cursor;
      if (start >= to || end <= from)
        return;
      if (type.isTop)
        highlighters = this.highlighters.filter((h2) => !h2.scope || h2.scope(type));
      let cls = inheritedClass;
      let rule = getStyleTags(cursor) || Rule.empty;
      let tagCls = highlightTags(highlighters, rule.tags);
      if (tagCls) {
        if (cls)
          cls += " ";
        cls += tagCls;
        if (rule.mode == 1)
          inheritedClass += (inheritedClass ? " " : "") + tagCls;
      }
      this.startSpan(Math.max(from, start), cls);
      if (rule.opaque)
        return;
      let mounted = cursor.tree && cursor.tree.prop(NodeProp.mounted);
      if (mounted && mounted.overlay) {
        let inner = cursor.node.enter(mounted.overlay[0].from + start, 1);
        let innerHighlighters = this.highlighters.filter((h2) => !h2.scope || h2.scope(mounted.tree.type));
        let hasChild2 = cursor.firstChild();
        for (let i2 = 0, pos = start; ; i2++) {
          let next = i2 < mounted.overlay.length ? mounted.overlay[i2] : null;
          let nextPos = next ? next.from + start : end;
          let rangeFrom = Math.max(from, pos), rangeTo = Math.min(to, nextPos);
          if (rangeFrom < rangeTo && hasChild2) {
            while (cursor.from < rangeTo) {
              this.highlightRange(cursor, rangeFrom, rangeTo, inheritedClass, highlighters);
              this.startSpan(Math.min(rangeTo, cursor.to), cls);
              if (cursor.to >= nextPos || !cursor.nextSibling())
                break;
            }
          }
          if (!next || nextPos > to)
            break;
          pos = next.to + start;
          if (pos > from) {
            this.highlightRange(inner.cursor(), Math.max(from, next.from + start), Math.min(to, pos), "", innerHighlighters);
            this.startSpan(Math.min(to, pos), cls);
          }
        }
        if (hasChild2)
          cursor.parent();
      } else if (cursor.firstChild()) {
        if (mounted)
          inheritedClass = "";
        do {
          if (cursor.to <= from)
            continue;
          if (cursor.from >= to)
            break;
          this.highlightRange(cursor, from, to, inheritedClass, highlighters);
          this.startSpan(Math.min(to, cursor.to), cls);
        } while (cursor.nextSibling());
        cursor.parent();
      }
    }
  }
  function getStyleTags(node) {
    let rule = node.type.prop(ruleNodeProp);
    while (rule && rule.context && !node.matchContext(rule.context))
      rule = rule.next;
    return rule || null;
  }
  const t$4 = Tag.define;
  const comment = t$4(), name = t$4(), typeName = t$4(name), propertyName = t$4(name), literal = t$4(), string = t$4(literal), number = t$4(literal), content = t$4(), heading = t$4(content), keyword = t$4(), operator = t$4(), punctuation = t$4(), bracket = t$4(punctuation), meta = t$4();
  const tags = {
    /**
    A comment.
    */
    comment,
    /**
    A line [comment](#highlight.tags.comment).
    */
    lineComment: t$4(comment),
    /**
    A block [comment](#highlight.tags.comment).
    */
    blockComment: t$4(comment),
    /**
    A documentation [comment](#highlight.tags.comment).
    */
    docComment: t$4(comment),
    /**
    Any kind of identifier.
    */
    name,
    /**
    The [name](#highlight.tags.name) of a variable.
    */
    variableName: t$4(name),
    /**
    A type [name](#highlight.tags.name).
    */
    typeName,
    /**
    A tag name (subtag of [`typeName`](#highlight.tags.typeName)).
    */
    tagName: t$4(typeName),
    /**
    A property or field [name](#highlight.tags.name).
    */
    propertyName,
    /**
    An attribute name (subtag of [`propertyName`](#highlight.tags.propertyName)).
    */
    attributeName: t$4(propertyName),
    /**
    The [name](#highlight.tags.name) of a class.
    */
    className: t$4(name),
    /**
    A label [name](#highlight.tags.name).
    */
    labelName: t$4(name),
    /**
    A namespace [name](#highlight.tags.name).
    */
    namespace: t$4(name),
    /**
    The [name](#highlight.tags.name) of a macro.
    */
    macroName: t$4(name),
    /**
    A literal value.
    */
    literal,
    /**
    A string [literal](#highlight.tags.literal).
    */
    string,
    /**
    A documentation [string](#highlight.tags.string).
    */
    docString: t$4(string),
    /**
    A character literal (subtag of [string](#highlight.tags.string)).
    */
    character: t$4(string),
    /**
    An attribute value (subtag of [string](#highlight.tags.string)).
    */
    attributeValue: t$4(string),
    /**
    A number [literal](#highlight.tags.literal).
    */
    number,
    /**
    An integer [number](#highlight.tags.number) literal.
    */
    integer: t$4(number),
    /**
    A floating-point [number](#highlight.tags.number) literal.
    */
    float: t$4(number),
    /**
    A boolean [literal](#highlight.tags.literal).
    */
    bool: t$4(literal),
    /**
    Regular expression [literal](#highlight.tags.literal).
    */
    regexp: t$4(literal),
    /**
    An escape [literal](#highlight.tags.literal), for example a
    backslash escape in a string.
    */
    escape: t$4(literal),
    /**
    A color [literal](#highlight.tags.literal).
    */
    color: t$4(literal),
    /**
    A URL [literal](#highlight.tags.literal).
    */
    url: t$4(literal),
    /**
    A language keyword.
    */
    keyword,
    /**
    The [keyword](#highlight.tags.keyword) for the self or this
    object.
    */
    self: t$4(keyword),
    /**
    The [keyword](#highlight.tags.keyword) for null.
    */
    null: t$4(keyword),
    /**
    A [keyword](#highlight.tags.keyword) denoting some atomic value.
    */
    atom: t$4(keyword),
    /**
    A [keyword](#highlight.tags.keyword) that represents a unit.
    */
    unit: t$4(keyword),
    /**
    A modifier [keyword](#highlight.tags.keyword).
    */
    modifier: t$4(keyword),
    /**
    A [keyword](#highlight.tags.keyword) that acts as an operator.
    */
    operatorKeyword: t$4(keyword),
    /**
    A control-flow related [keyword](#highlight.tags.keyword).
    */
    controlKeyword: t$4(keyword),
    /**
    A [keyword](#highlight.tags.keyword) that defines something.
    */
    definitionKeyword: t$4(keyword),
    /**
    A [keyword](#highlight.tags.keyword) related to defining or
    interfacing with modules.
    */
    moduleKeyword: t$4(keyword),
    /**
    An operator.
    */
    operator,
    /**
    An [operator](#highlight.tags.operator) that dereferences something.
    */
    derefOperator: t$4(operator),
    /**
    Arithmetic-related [operator](#highlight.tags.operator).
    */
    arithmeticOperator: t$4(operator),
    /**
    Logical [operator](#highlight.tags.operator).
    */
    logicOperator: t$4(operator),
    /**
    Bit [operator](#highlight.tags.operator).
    */
    bitwiseOperator: t$4(operator),
    /**
    Comparison [operator](#highlight.tags.operator).
    */
    compareOperator: t$4(operator),
    /**
    [Operator](#highlight.tags.operator) that updates its operand.
    */
    updateOperator: t$4(operator),
    /**
    [Operator](#highlight.tags.operator) that defines something.
    */
    definitionOperator: t$4(operator),
    /**
    Type-related [operator](#highlight.tags.operator).
    */
    typeOperator: t$4(operator),
    /**
    Control-flow [operator](#highlight.tags.operator).
    */
    controlOperator: t$4(operator),
    /**
    Program or markup punctuation.
    */
    punctuation,
    /**
    [Punctuation](#highlight.tags.punctuation) that separates
    things.
    */
    separator: t$4(punctuation),
    /**
    Bracket-style [punctuation](#highlight.tags.punctuation).
    */
    bracket,
    /**
    Angle [brackets](#highlight.tags.bracket) (usually `<` and `>`
    tokens).
    */
    angleBracket: t$4(bracket),
    /**
    Square [brackets](#highlight.tags.bracket) (usually `[` and `]`
    tokens).
    */
    squareBracket: t$4(bracket),
    /**
    Parentheses (usually `(` and `)` tokens). Subtag of
    [bracket](#highlight.tags.bracket).
    */
    paren: t$4(bracket),
    /**
    Braces (usually `{` and `}` tokens). Subtag of
    [bracket](#highlight.tags.bracket).
    */
    brace: t$4(bracket),
    /**
    Content, for example plain text in XML or markup documents.
    */
    content,
    /**
    [Content](#highlight.tags.content) that represents a heading.
    */
    heading,
    /**
    A level 1 [heading](#highlight.tags.heading).
    */
    heading1: t$4(heading),
    /**
    A level 2 [heading](#highlight.tags.heading).
    */
    heading2: t$4(heading),
    /**
    A level 3 [heading](#highlight.tags.heading).
    */
    heading3: t$4(heading),
    /**
    A level 4 [heading](#highlight.tags.heading).
    */
    heading4: t$4(heading),
    /**
    A level 5 [heading](#highlight.tags.heading).
    */
    heading5: t$4(heading),
    /**
    A level 6 [heading](#highlight.tags.heading).
    */
    heading6: t$4(heading),
    /**
    A prose separator (such as a horizontal rule).
    */
    contentSeparator: t$4(content),
    /**
    [Content](#highlight.tags.content) that represents a list.
    */
    list: t$4(content),
    /**
    [Content](#highlight.tags.content) that represents a quote.
    */
    quote: t$4(content),
    /**
    [Content](#highlight.tags.content) that is emphasized.
    */
    emphasis: t$4(content),
    /**
    [Content](#highlight.tags.content) that is styled strong.
    */
    strong: t$4(content),
    /**
    [Content](#highlight.tags.content) that is part of a link.
    */
    link: t$4(content),
    /**
    [Content](#highlight.tags.content) that is styled as code or
    monospace.
    */
    monospace: t$4(content),
    /**
    [Content](#highlight.tags.content) that has a strike-through
    style.
    */
    strikethrough: t$4(content),
    /**
    Inserted text in a change-tracking format.
    */
    inserted: t$4(),
    /**
    Deleted text.
    */
    deleted: t$4(),
    /**
    Changed text.
    */
    changed: t$4(),
    /**
    An invalid or unsyntactic element.
    */
    invalid: t$4(),
    /**
    Metadata or meta-instruction.
    */
    meta,
    /**
    [Metadata](#highlight.tags.meta) that applies to the entire
    document.
    */
    documentMeta: t$4(meta),
    /**
    [Metadata](#highlight.tags.meta) that annotates or adds
    attributes to a given syntactic element.
    */
    annotation: t$4(meta),
    /**
    Processing instruction or preprocessor directive. Subtag of
    [meta](#highlight.tags.meta).
    */
    processingInstruction: t$4(meta),
    /**
    [Modifier](#highlight.Tag^defineModifier) that indicates that a
    given element is being defined. Expected to be used with the
    various [name](#highlight.tags.name) tags.
    */
    definition: Tag.defineModifier(),
    /**
    [Modifier](#highlight.Tag^defineModifier) that indicates that
    something is constant. Mostly expected to be used with
    [variable names](#highlight.tags.variableName).
    */
    constant: Tag.defineModifier(),
    /**
    [Modifier](#highlight.Tag^defineModifier) used to indicate that
    a [variable](#highlight.tags.variableName) or [property
    name](#highlight.tags.propertyName) is being called or defined
    as a function.
    */
    function: Tag.defineModifier(),
    /**
    [Modifier](#highlight.Tag^defineModifier) that can be applied to
    [names](#highlight.tags.name) to indicate that they belong to
    the language's standard environment.
    */
    standard: Tag.defineModifier(),
    /**
    [Modifier](#highlight.Tag^defineModifier) that indicates a given
    [names](#highlight.tags.name) is local to some scope.
    */
    local: Tag.defineModifier(),
    /**
    A generic variant [modifier](#highlight.Tag^defineModifier) that
    can be used to tag language-specific alternative variants of
    some common tag. It is recommended for themes to define special
    forms of at least the [string](#highlight.tags.string) and
    [variable name](#highlight.tags.variableName) tags, since those
    come up a lot.
    */
    special: Tag.defineModifier()
  };
  tagHighlighter([
    { tag: tags.link, class: "tok-link" },
    { tag: tags.heading, class: "tok-heading" },
    { tag: tags.emphasis, class: "tok-emphasis" },
    { tag: tags.strong, class: "tok-strong" },
    { tag: tags.keyword, class: "tok-keyword" },
    { tag: tags.atom, class: "tok-atom" },
    { tag: tags.bool, class: "tok-bool" },
    { tag: tags.url, class: "tok-url" },
    { tag: tags.labelName, class: "tok-labelName" },
    { tag: tags.inserted, class: "tok-inserted" },
    { tag: tags.deleted, class: "tok-deleted" },
    { tag: tags.literal, class: "tok-literal" },
    { tag: tags.string, class: "tok-string" },
    { tag: tags.number, class: "tok-number" },
    { tag: [tags.regexp, tags.escape, tags.special(tags.string)], class: "tok-string2" },
    { tag: tags.variableName, class: "tok-variableName" },
    { tag: tags.local(tags.variableName), class: "tok-variableName tok-local" },
    { tag: tags.definition(tags.variableName), class: "tok-variableName tok-definition" },
    { tag: tags.special(tags.variableName), class: "tok-variableName2" },
    { tag: tags.definition(tags.propertyName), class: "tok-propertyName tok-definition" },
    { tag: tags.typeName, class: "tok-typeName" },
    { tag: tags.namespace, class: "tok-namespace" },
    { tag: tags.className, class: "tok-className" },
    { tag: tags.macroName, class: "tok-macroName" },
    { tag: tags.propertyName, class: "tok-propertyName" },
    { tag: tags.operator, class: "tok-operator" },
    { tag: tags.comment, class: "tok-comment" },
    { tag: tags.meta, class: "tok-meta" },
    { tag: tags.invalid, class: "tok-invalid" },
    { tag: tags.punctuation, class: "tok-punctuation" }
  ]);
  const closureParamDelim = 1, tpOpen = 2, tpClose = 3, RawString = 4, Float = 5;
  const _b = 98, _e = 101, _f = 102, _r = 114, _E = 69, Zero = 48, Dot = 46, Plus = 43, Minus = 45, Hash = 35, Quote = 34, Pipe = 124, LessThan = 60, GreaterThan = 62;
  function isNum(ch) {
    return ch >= 48 && ch <= 57;
  }
  function isNum_(ch) {
    return isNum(ch) || ch == 95;
  }
  const literalTokens = new ExternalTokenizer((input, stack) => {
    if (isNum(input.next)) {
      let isFloat = false;
      do {
        input.advance();
      } while (isNum_(input.next));
      if (input.next == Dot) {
        isFloat = true;
        input.advance();
        if (isNum(input.next)) {
          do {
            input.advance();
          } while (isNum_(input.next));
        } else if (input.next == Dot || input.next > 127 || /\w/.test(String.fromCharCode(input.next))) {
          return;
        }
      }
      if (input.next == _e || input.next == _E) {
        isFloat = true;
        input.advance();
        if (input.next == Plus || input.next == Minus)
          input.advance();
        if (!isNum_(input.next))
          return;
        do {
          input.advance();
        } while (isNum_(input.next));
      }
      if (input.next == _f) {
        let after = input.peek(1);
        if (after == Zero + 3 && input.peek(2) == Zero + 2 || after == Zero + 6 && input.peek(2) == Zero + 4) {
          input.advance(3);
          isFloat = true;
        } else {
          return;
        }
      }
      if (isFloat)
        input.acceptToken(Float);
    } else if (input.next == _b || input.next == _r) {
      if (input.next == _b)
        input.advance();
      if (input.next != _r)
        return;
      input.advance();
      let count = 0;
      while (input.next == Hash) {
        count++;
        input.advance();
      }
      if (input.next != Quote)
        return;
      input.advance();
      content:
        for (; ; ) {
          if (input.next < 0)
            return;
          let isQuote = input.next == Quote;
          input.advance();
          if (isQuote) {
            for (let i2 = 0; i2 < count; i2++) {
              if (input.next != Hash)
                continue content;
              input.advance();
            }
            input.acceptToken(RawString);
            return;
          }
        }
    }
  });
  const closureParam = new ExternalTokenizer((input) => {
    if (input.next == Pipe)
      input.acceptToken(closureParamDelim, 1);
  });
  const tpDelim = new ExternalTokenizer((input) => {
    if (input.next == LessThan)
      input.acceptToken(tpOpen, 1);
    else if (input.next == GreaterThan)
      input.acceptToken(tpClose, 1);
  });
  const rustHighlighting = styleTags({
    "const macro_rules struct union enum type fn impl trait let static": tags.definitionKeyword,
    "mod use crate": tags.moduleKeyword,
    "pub unsafe async mut extern default move": tags.modifier,
    "for if else loop while match continue break return await": tags.controlKeyword,
    "as in ref": tags.operatorKeyword,
    "where _ crate super dyn": tags.keyword,
    "self": tags.self,
    String: tags.string,
    Char: tags.character,
    RawString: tags.special(tags.string),
    Boolean: tags.bool,
    Identifier: tags.variableName,
    "CallExpression/Identifier": tags.function(tags.variableName),
    BoundIdentifier: tags.definition(tags.variableName),
    "FunctionItem/BoundIdentifier": tags.function(tags.definition(tags.variableName)),
    LoopLabel: tags.labelName,
    FieldIdentifier: tags.propertyName,
    "CallExpression/FieldExpression/FieldIdentifier": tags.function(tags.propertyName),
    Lifetime: tags.special(tags.variableName),
    ScopeIdentifier: tags.namespace,
    TypeIdentifier: tags.typeName,
    "MacroInvocation/Identifier MacroInvocation/ScopedIdentifier/Identifier": tags.macroName,
    "MacroInvocation/TypeIdentifier MacroInvocation/ScopedIdentifier/TypeIdentifier": tags.macroName,
    '"!"': tags.macroName,
    UpdateOp: tags.updateOperator,
    LineComment: tags.lineComment,
    BlockComment: tags.blockComment,
    Integer: tags.integer,
    Float: tags.float,
    ArithOp: tags.arithmeticOperator,
    LogicOp: tags.logicOperator,
    BitOp: tags.bitwiseOperator,
    CompareOp: tags.compareOperator,
    "=": tags.definitionOperator,
    ".. ... => ->": tags.punctuation,
    "( )": tags.paren,
    "[ ]": tags.squareBracket,
    "{ }": tags.brace,
    ". DerefOp": tags.derefOperator,
    "&": tags.operator,
    ", ; ::": tags.separator,
    "Attribute/...": tags.meta
  });
  const spec_identifier = { __proto__: null, self: 28, super: 32, crate: 34, impl: 46, true: 72, false: 72, pub: 88, in: 92, const: 96, unsafe: 104, async: 108, move: 110, if: 114, let: 118, ref: 142, mut: 144, _: 198, else: 200, match: 204, as: 248, return: 252, await: 262, break: 270, continue: 276, while: 312, loop: 316, for: 320, macro_rules: 327, mod: 334, extern: 342, struct: 346, where: 364, union: 379, enum: 382, type: 390, default: 395, fn: 396, trait: 412, use: 420, static: 438, dyn: 476 };
  const parser = LRParser.deserialize({
    version: 14,
    states: "$2xQ]Q_OOP$wOWOOO&sQWO'#CnO)WQWO'#I`OOQP'#I`'#I`OOQQ'#Ie'#IeO)hO`O'#C}OOQR'#Ih'#IhO)sQWO'#IuOOQO'#Hk'#HkO)xQWO'#DpOOQR'#Iw'#IwO)xQWO'#DpO*ZQWO'#DpOOQO'#Iv'#IvO,SQWO'#J`O,ZQWO'#EiOOQV'#Hp'#HpO,cQYO'#F{OOQV'#El'#ElOOQV'#Em'#EmOOQV'#En'#EnO.YQ_O'#EkO0_Q_O'#EoO2gQWOOO4QQ_O'#FPO7hQWO'#J`OOQV'#FY'#FYO7{Q_O'#F^O:WQ_O'#FaOOQO'#F`'#F`O=sQ_O'#FcO=}Q_O'#FbO@VQWO'#FgOOQO'#J`'#J`OOQV'#Io'#IoOA]Q_O'#InOEPQWO'#InOOQV'#Fw'#FwOF[QWO'#JuOFcQWO'#F|OOQO'#IO'#IOOGrQWO'#GhOOQV'#Im'#ImOOQV'#Il'#IlOOQV'#Hj'#HjQGyQ_OOOKeQ_O'#DUOKlQYO'#CqOOQP'#I_'#I_OOQV'#Hg'#HgQ]Q_OOOLuQWO'#I`ONsQYO'#DXO!!eQWO'#JuO!!lQWO'#JuO!!vQ_O'#DfO!%]Q_O'#E}O!(sQ_O'#FWO!,ZQWO'#FZO!.^QXO'#FbO!.cQ_O'#EeO!!vQ_O'#FmO!0uQWO'#FoO!0zQWO'#FoO!1PQ^O'#FqO!1WQWO'#JuO!1_QWO'#FtO!1dQWO'#FxO!2WQWO'#JjO!2_QWO'#GOO!2_QWO'#G`O!2_QWO'#GbO!2_QWO'#GsOOQO'#Ju'#JuO!2dQWO'#GhO!2lQYO'#GpO!2_QWO'#GqO!3uQ^O'#GtO!3|QWO'#GuO!4hQWO'#HOP!4sOpO'#CcPOOO)CC})CC}OOOO'#Hi'#HiO!5OO`O,59iOOQV,59i,59iO!5ZQYO,5?aOOQO-E;i-E;iOOQO,5:[,5:[OOQP,59Z,59ZO)xQWO,5:[O)xQWO,5:[O!5oQWO,5?kO!5zQYO,5;qO!6PQYO,5;TO!6hQWO,59QO!7kQXO'#CnO!7xQXO'#I`O!9SQWO'#CoO,^QWO'#EiOOQV-E;n-E;nO!9eQWO'#FsOOQV,5<g,5<gO!9SQWO'#CoO!9jQWO'#CoO!9oQWO'#I`O! yQWO'#JuO!9yQWO'#J`O!:aQWO,5;VOOQO'#In'#InO!0zQWO'#DaO!<aQWO'#DcO!<iQWO,5;ZO.YQ_O,5;ZOOQO,5;[,5;[OOQV'#Er'#ErOOQV'#Es'#EsOOQV'#Et'#EtOOQV'#Eu'#EuOOQV'#Ev'#EvOOQV'#Ew'#EwOOQV'#Ex'#ExOOQV'#Ey'#EyO.YQ_O,5;]O.YQ_O,5;]O.YQ_O,5;]O.YQ_O,5;]O.YQ_O,5;]O.YQ_O,5;]O.YQ_O,5;]O.YQ_O,5;]O.YQ_O,5;]O.YQ_O,5;fO!=PQ_O,5;kO!@gQ_O'#FROOQO,5;l,5;lO!BrQWO,5;pO.YQ_O,5;wOKlQYO,5;gO!D_QWO,5;kO!EOQWO,5;xOOQO,5;x,5;xO!E]QWO,5;xO!EbQ_O,5;xO!GmQWO'#CfO!GrQWO,5<QO!G|Q_O,5<QOOQO,5;{,5;{O!JjQXO'#CnO!K{QXO'#I`OOQS'#Dk'#DkOOQP'#Ir'#IrO!LuQ[O'#IrO!L}QXO'#DjO!M{QWO'#DnO!M{QWO'#DnO!N^QWO'#DnOOQP'#It'#ItO!NcQXO'#ItO# ^Q^O'#DoO# hQWO'#DrO# pQ^O'#DzO# zQ^O'#D|O#!RQWO'#EPO#!^QXO'#FdOOQP'#ES'#ESOOQP'#Iq'#IqO#!lQXO'#JfOOQP'#Je'#JeO#!tQXO,5;}O#!yQXO'#I`O!1PQ^O'#DyO!1PQ^O'#FdO##sQWO,5;|OOQO,5;|,5;|OKlQYO,5;|O#$ZQWO'#FhOOQO,5<R,5<ROOQV,5=l,5=lO#&`QYO'#FzOOQV,5<h,5<hO#&gQWO,5<hO#&nQWO,5=SO!1WQWO,59rO!1dQWO,5<dO#&uQWO,5=iO!2_QWO,5<jO!2_QWO,5<zO!2_QWO,5<|O!2_QWO,5=QO#&|QWO,5=]O#'TQWO,5=SO!2_QWO,5=]O!3|QWO,5=aO#']QWO,5=jOOQO-E;|-E;|O#'hQWO'#JjOOQV-E;h-E;hO#(PQWO'#HRO#(WQ_O,59pOOQV,59p,59pO#(_QWO,59pO#(dQ_O,59pO#)SQZO'#CuO#+[QZO'#CvOOQV'#C|'#C|O#-wQWO'#HTO#.OQYO'#IdOOQO'#Hh'#HhO#.WQWO'#CwO#.WQWO'#CwO#.iQWO'#CwOOQR'#Ic'#IcO#.nQZO'#IbO#1TQYO'#HTO#1qQYO'#H[O#2}QYO'#H_OKlQYO'#H`OOQR'#Hb'#HbO#4ZQWO'#HeO#4`QYO,59]OOQR'#Ib'#IbO#5PQZO'#CtO#7[QYO'#HUO#7aQWO'#HTO#7fQYO'#CrO#8VQWO'#H]O#7fQYO'#HcOOQV-E;e-E;eO#8_QWO,59sOOQV,59{,59{O#8mQYO,5=[OOQV,59},59}O!0zQWO,59}O#;aQWO'#IpOOQO'#Ip'#IpO!1PQ^O'#DhO!0zQWO,5:QO#;hQWO,5;iO#<OQWO,5;rO#<fQ_O,5;rOOQO,5;u,5;uO#@PQ_O,5;|O#BXQWO,5;PO!0zQWO,5<XO#B`QWO,5<ZOOQV,5<Z,5<ZO#BkQWO,5<]O!1PQ^O'#EOOOQQ'#D_'#D_O#BsQWO,59rO#BxQWO,5<`O#B}QWO,5<dOOQO,5@U,5@UO#CVQWO,5=iOOQQ'#Cv'#CvO#C[QYO,5<jO#CmQYO,5<zO#CxQYO,5<|O#DTQYO,5=_O#DcQYO,5=SO#E{QYO'#GQO#FYQYO,5=[O#FmQWO,5=[O#F{QYO,5=[O#HUQYO,5=]O#HdQWO,5=`O!1PQ^O,5=`O#HrQWO'#CnO#ITQWO'#I`OOQO'#Jy'#JyO#IfQWO'#IQO#IkQWO'#GwOOQO'#Jz'#JzO#JSQWO'#GzOOQO'#G|'#G|OOQO'#Jx'#JxO#IkQWO'#GwO#JZQWO'#GxO#J`QWO,5=aO#JeQWO,5=jO!1dQWO,5=jO#'`QWO,5=jPOOO'#Hf'#HfP#JjOpO,58}POOO,58},58}OOOO-E;g-E;gOOQV1G/T1G/TO#JuQWO1G4{O#JzQ^O'#CyPOQQ'#Cx'#CxOOQO1G/v1G/vOOQP1G.u1G.uO)xQWO1G/vO#NTQ!fO'#ETO#N[Q!fO'#EaO#NcQ!fO'#EbO$ kQWO1G1yO$!_Q_O1G1yOOQP1G5V1G5VOOQO1G1]1G1]O$&RQWO1G0oO$&WQWO'#CiO!7xQXO'#I`O!6PQYO1G.lO!5oQWO,5<_O!9SQWO,59ZO!9SQWO,59ZO!5oQWO,5?kO$&iQWO1G0uO$(vQWO1G0wO$*nQWO1G0wO$+UQWO1G0wO$-YQWO1G0wO$-aQWO1G0wO$/bQWO1G0wO$/iQWO1G0wO$1jQWO1G0wO$1qQWO1G0wO$3YQWO1G1QO$5ZQWO1G1VO$5zQ_O'#JcO$8SQWO'#JcOOQO'#Jb'#JbO$8^QWO,5;mOOQO'#Dw'#DwOOQO1G1[1G1[OOQO1G1Y1G1YO$8cQWO1G1cOOQO1G1R1G1RO$8jQ_O'#HrO$:xQWO,5@OO.YQ_O1G1dOOQO1G1d1G1dO$;QQWO1G1dO$;_QWO1G1dO$;dQWO1G1eOOQO1G1l1G1lO$;lQWO1G1lOOQP,5?^,5?^O$;vQ^O,5:kO$<aQXO,5:YO!M{QWO,5:YO!M{QWO,5:YO!1PQ^O,5:gO$=bQWO'#IyOOQO'#Ix'#IxO$=pQWO,5:ZO# ^Q^O,5:ZO$=uQWO'#DsOOQP,5:^,5:^O$>WQWO,5:fOOQP,5:h,5:hO!1PQ^O,5:hO!1PQ^O,5:mO$>]QYO,5<OO$>gQ_O'#HsO$>tQXO,5@QOOQV1G1i1G1iOOQP,5:e,5:eO$>|QXO,5<OO$?[QWO1G1hO$?dQWO'#CnO$?oQWO'#FiOOQO'#Fi'#FiO$?wQWO'#FjO.YQ_O'#FkOOQO'#Ji'#JiO$?|QWO'#JhOOQO'#Jg'#JgO$@UQWO,5<SOOQQ'#Hv'#HvO$@ZQYO,5<fOOQV,5<f,5<fO$@bQYO,5<fOOQV1G2S1G2SO$@iQWO1G2nO$@qQWO1G/^O$@vQWO1G2OO#CVQWO1G3TO$AOQYO1G2UO#CmQYO1G2fO#CxQYO1G2hO$AaQYO1G2lO!2_QWO1G2wO#DcQYO1G2nO#HUQYO1G2wO$AiQWO1G2{O$AnQWO1G3UO!1dQWO1G3UO$AsQWO1G3UOOQV1G/[1G/[O$A{QWO1G/[O$BQQ_O1G/[O#7aQWO,5=oO$BXQYO,5?OO$BmQWO,5?OO$BrQZO'#IeOOQO-E;f-E;fOOQR,59c,59cO#.WQWO,59cO#.WQWO,59cOOQR,5=n,5=nO$E_QYO'#HVO$FwQZO,5=oO!5oQWO,5={O$IZQWO,5=oO$IbQZO,5=vO$KqQYO,5=vO$>]QYO,5=vO$LRQWO'#KRO$L^QWO,5=xOOQR,5=y,5=yO$LcQWO,5=zO$>]QYO,5>PO$>]QYO,5>POOQO1G.w1G.wO$>]QYO1G.wO$LnQYO,5=pO$LvQZO,59^OOQR,59^,59^O$>]QYO,5=wO% YQZO,5=}OOQR,5=},5=}O%#lQWO1G/_O!6PQYO1G/_O#FYQYO1G2vO%#qQWO1G2vO%$PQYO1G2vOOQV1G/i1G/iO%%YQWO,5:SO%%bQ_O1G/lO%*kQWO1G1^O%+RQWO1G1hOOQO1G1h1G1hO$>]QYO1G1hO%+iQ^O'#EgOOQV1G0k1G0kOOQV1G1s1G1sO!!vQ_O1G1sO!0zQWO1G1uO!1PQ^O1G1wO!.cQ_O1G1wOOQP,5:j,5:jO$>]QYO1G/^OOQO'#Cn'#CnO%+vQWO1G1zOOQV1G2O1G2OO%,OQWO'#CnO%,WQWO1G3TO%,]QWO1G3TO%,bQYO'#GQO%,sQWO'#G]O%-UQYO'#G_O%.hQYO'#GXOOQV1G2U1G2UO%/wQWO1G2UO%/|QWO1G2UO$ARQWO1G2UOOQV1G2f1G2fO%/wQWO1G2fO#CpQWO1G2fO%0UQWO'#GdOOQV1G2h1G2hO%0gQWO1G2hO#C{QWO1G2hO%0lQYO'#GSO$>]QYO1G2lO$AdQWO1G2lOOQV1G2y1G2yO%1xQWO1G2yO%3hQ^O'#GkO%3rQWO1G2nO#DfQWO1G2nO%4QQYO,5<lO%4[QYO,5<lO%4jQYO,5<lO%5XQYO,5<lOOQQ,5<l,5<lO!1WQWO'#JuO%5dQYO,5<lO%5lQWO1G2vOOQV1G2v1G2vO%5tQWO1G2vO$>]QYO1G2vOOQV1G2w1G2wO%5tQWO1G2wO%5yQWO1G2wO#HXQWO1G2wOOQV1G2z1G2zO.YQ_O1G2zO$>]QYO1G2zO%6RQWO1G2zOOQO,5>l,5>lOOQO-E<O-E<OOOQO,5=c,5=cOOQO,5=e,5=eOOQO,5=g,5=gOOQO,5=h,5=hO%6aQWO'#J|OOQO'#J{'#J{O%6iQWO,5=fO%6nQWO,5=cO!1dQWO,5=dOOQV1G2{1G2{O$>]QYO1G3UPOOO-E;d-E;dPOOO1G.i1G.iOOQO7+*g7+*gO%7VQYO'#IcO%7nQYO'#IfO%7yQYO'#IfO%8RQYO'#IfO%8^QYO,59eOOQO7+%b7+%bOOQP7+$a7+$aO%8cQ!fO'#JTOOQS'#EX'#EXOOQS'#EY'#EYOOQS'#EZ'#EZOOQS'#JT'#JTO%;UQWO'#EWOOQS'#E`'#E`OOQS'#JR'#JROOQS'#Hn'#HnO%;ZQ!fO,5:oOOQV,5:o,5:oOOQV'#JQ'#JQO%;bQ!fO,5:{OOQV,5:{,5:{O%;iQ!fO,5:|OOQV,5:|,5:|OOQV7+'e7+'eOOQV7+&Z7+&ZO%;pQ!fO,59TOOQO,59T,59TO%>YQWO7+$WO%>_QWO1G1yOOQV1G1y1G1yO!9SQWO1G.uO%>dQWO,5?}O%>nQ_O'#HqO%@|QWO,5?}OOQO1G1X1G1XOOQO7+&}7+&}O%AUQWO,5>^OOQO-E;p-E;pO%AcQWO7+'OO.YQ_O7+'OOOQO7+'O7+'OOOQO7+'P7+'PO%AjQWO7+'POOQO7+'W7+'WOOQP1G0V1G0VO%ArQXO1G/tO!M{QWO1G/tO%BsQXO1G0RO%CkQ^O'#HlO%C{QWO,5?eOOQP1G/u1G/uO%DWQWO1G/uO%D]QWO'#D_OOQO'#Dt'#DtO%DhQWO'#DtO%DmQWO'#I{OOQO'#Iz'#IzO%DuQWO,5:_O%DzQWO'#DtO%EPQWO'#DtOOQP1G0Q1G0QOOQP1G0S1G0SOOQP1G0X1G0XO%EXQXO1G1jO%EdQXO'#FeOOQP,5>_,5>_O!1PQ^O'#FeOOQP-E;q-E;qO$>]QYO1G1jOOQO7+'S7+'SOOQO,5<T,5<TO%ErQWO,5<UO.YQ_O,5<UO%EwQWO,5<VO%FRQWO'#HtO%FdQWO,5@SOOQO1G1n1G1nOOQQ-E;t-E;tOOQV1G2Q1G2QO%FlQYO1G2QO#DcQYO7+(YO$>]QYO7+$xOOQV7+'j7+'jO%FsQWO7+(oO%FxQWO7+(oOOQV7+'p7+'pO%/wQWO7+'pO%F}QWO7+'pO%GVQWO7+'pOOQV7+(Q7+(QO%/wQWO7+(QO#CpQWO7+(QOOQV7+(S7+(SO%0gQWO7+(SO#C{QWO7+(SO$>]QYO7+(WO%GeQWO7+(WO#HUQYO7+(cO%GjQWO7+(YO#DfQWO7+(YOOQV7+(c7+(cO%5tQWO7+(cO%5yQWO7+(cO#HXQWO7+(cOOQV7+(g7+(gO$>]QYO7+(pO%GxQWO7+(pO!1dQWO7+(pOOQV7+$v7+$vO%G}QWO7+$vO%HSQZO1G3ZO%JfQWO1G4jOOQO1G4j1G4jOOQR1G.}1G.}O#.WQWO1G.}O%JkQWO'#KQOOQO'#HW'#HWO%J|QWO'#HXO%KXQWO'#KQOOQO'#KP'#KPO%KaQWO,5=qO%KfQYO'#H[O%LrQWO'#GmO%L}QYO'#CtO%MXQWO'#GmO$>]QYO1G3ZOOQR1G3g1G3gO#7aQWO1G3ZO%M^QZO1G3bO$>]QYO1G3bO& mQYO'#IVO& }QWO,5@mOOQR1G3d1G3dOOQR1G3f1G3fO.YQ_O1G3fOOQR1G3k1G3kO&!VQYO7+$cO&!_QYO'#KOOOQQ'#J}'#J}O&!gQYO1G3[O&!lQZO1G3cOOQQ7+$y7+$yO&${QWO7+$yO&%QQWO7+(bOOQV7+(b7+(bO%5tQWO7+(bO$>]QYO7+(bO#FYQYO7+(bO&%YQWO7+(bO!.cQ_O1G/nO&%hQWO7+%WO$?[QWO7+'SO&%pQWO'#EhO&%{Q^O'#EhOOQU'#Ho'#HoO&%{Q^O,5;ROOQV,5;R,5;RO&&VQWO,5;RO&&[Q^O,5;RO!0zQWO7+'_OOQV7+'a7+'aO&&iQWO7+'cO&&qQWO7+'cO&&xQWO7+$xO&'TQ!fO7+'fO&'[Q!fO7+'fOOQV7+(o7+(oO!1dQWO7+(oO&'cQYO,5<lO&'nQYO,5<lO!1dQWO'#GWO&'|QWO'#JpO&([QWO'#G^O!BxQWO'#G^O&(aQWO'#JpOOQO'#Jo'#JoO&(iQWO,5<wOOQO'#DX'#DXO&(nQYO'#JrO&)}QWO'#JrO$>]QYO'#JrOOQO'#Jq'#JqO&*YQWO,5<yO&*_QWO'#GZO#D^QWO'#G[O&*gQWO'#G[O&*oQWO'#JmOOQO'#Jl'#JlO&*zQYO'#GTOOQO,5<s,5<sO&+PQWO7+'pO&+UQWO'#JtO&+dQWO'#GeO#BxQWO'#GeO&+uQWO'#JtOOQO'#Js'#JsO&+}QWO,5=OO$>]QYO'#GUO&,SQYO'#JkOOQQ,5<n,5<nO&,kQWO7+(WOOQV7+(e7+(eO&.TQ^O'#D|O&._QWO'#GlO&.gQ^O'#JwOOQO'#Gn'#GnO&.nQWO'#JwOOQO'#Jv'#JvO&.vQWO,5=VO&.{QWO'#I`O&/]Q^O'#GmO&/dQWO'#IqO&/rQWO'#GmOOQV7+(Y7+(YO&/zQWO7+(YO$>]QYO7+(YO&0SQYO'#HxO&0hQYO1G2WOOQQ1G2W1G2WOOQQ,5<m,5<mO$>]QYO,5<qO&0pQWO,5<rO&0uQWO7+(bO&1QQWO7+(fO&1XQWO7+(fOOQV7+(f7+(fO.YQ_O7+(fO$>]QYO7+(fO&1dQWO'#IRO&1nQWO,5@hOOQO1G3Q1G3QOOQO1G2}1G2}OOQO1G3P1G3POOQO1G3R1G3ROOQO1G3S1G3SOOQO1G3O1G3OO&1vQWO7+(pO$>]QYO,59fO&2RQ^O'#ISO&2xQYO,5?QOOQR1G/P1G/PO&3QQ!bO,5:pO&3VQ!fO,5:rOOQS-E;l-E;lOOQV1G0Z1G0ZOOQV1G0g1G0gOOQV1G0h1G0hO&3^QWO'#JTOOQO1G.o1G.oOOQV<<Gr<<GrO&3iQWO1G5iO$5zQ_O,5>]O&3qQWO,5>]OOQO-E;o-E;oOOQO<<Jj<<JjO&3{QWO<<JjOOQO<<Jk<<JkO&4SQXO7+%`O&5TQWO,5>WOOQO-E;j-E;jOOQP7+%a7+%aO!1PQ^O,5:`O&5cQWO'#HmO&5wQWO,5?gOOQP1G/y1G/yOOQO,5:`,5:`O&6PQWO,5:`O%DzQWO,5:`O$>]QYO,5<PO&6UQXO,5<PO&6dQXO7+'UO.YQ_O1G1pO&6oQWO1G1pOOQO,5>`,5>`OOQO-E;r-E;rOOQV7+'l7+'lO&6yQWO<<KtO#DfQWO<<KtO&7XQWO<<HdOOQV<<LZ<<LZO!1dQWO<<LZOOQV<<K[<<K[O&7dQWO<<K[O%/wQWO<<K[O&7iQWO<<K[OOQV<<Kl<<KlO%/wQWO<<KlOOQV<<Kn<<KnO%0gQWO<<KnO&7qQWO<<KrO$>]QYO<<KrOOQV<<K}<<K}O%5tQWO<<K}O%5yQWO<<K}O#HXQWO<<K}OOQV<<Kt<<KtO&7yQWO<<KtO$>]QYO<<KtO&8RQWO<<L[O$>]QYO<<L[O&8^QWO<<L[OOQV<<Hb<<HbO$>]QYO7+(uOOQO7+*U7+*UOOQR7+$i7+$iO&8cQWO,5@lOOQO'#Gm'#GmO&8kQWO'#GmO&8vQYO'#IUO&8cQWO,5@lOOQR1G3]1G3]O&:cQYO,5=vO&;rQYO,5=XO&;|QWO,5=XOOQO,5=X,5=XOOQR7+(u7+(uO&<RQZO7+(uO&>eQZO7+(|O&@tQWO,5>qOOQO-E<T-E<TO&APQWO7+)QOOQO<<G}<<G}O&AWQYO'#ITO&AcQYO,5@jOOQQ7+(v7+(vOOQQ<<He<<HeO$>]QYO<<K|OOQV<<K|<<K|O&0uQWO<<K|O&AkQWO<<K|O%5tQWO<<K|O&AsQWO7+%YOOQV<<Hr<<HrOOQO<<Jn<<JnO.YQ_O,5;SO&AzQWO,5;SO.YQ_O'#EjO&BPQWO,5;SOOQU-E;m-E;mO&B[QWO1G0mOOQV1G0m1G0mO&%{Q^O1G0mOOQV<<Jy<<JyO!.cQ_O<<J}OOQV<<J}<<J}OOQV<<Hd<<HdO.YQ_O<<HdO&BaQWO'#FvO&BfQWO<<KQO&BnQ!fO<<KQO&BuQWO<<KQO&BzQWO<<KQO&CSQ!fO<<KQOOQV<<KQ<<KQO&CZQWO<<LZO&C`QWO,5@[O$>]QYO,5<xO&ChQWO,5<xO&CmQWO'#H{O&C`QWO,5@[OOQV1G2c1G2cO&DRQWO,5@^O$>]QYO,5@^O&D^QYO'#H|O&EsQWO,5@^OOQO1G2e1G2eO%,nQWO,5<uOOQO,5<v,5<vO&E{QYO'#HzO&G_QWO,5@XO%,bQYO,5=pO$>]QYO,5<oO&GjQWO,5@`O.YQ_O,5=PO&GrQWO,5=PO&G}QWO,5=PO&H`QWO'#H}O&GjQWO,5@`OOQV1G2j1G2jO&HtQYO,5<pO%0lQYO,5>PO&I]QYO,5@VOOQV<<Kr<<KrO&ItQWO,5=XO&KfQ^O,5:hO&KmQWO,5=XO$>]QYO,5=WO&KuQWO,5@cO&K}QWO,5@cO&MvQ^O'#IPO&KuQWO,5@cOOQO1G2q1G2qO&NTQWO,5=WO&N]QWO<<KtO&NkQYO,5>oO&NvQYO,5>dO' UQYO,5>dOOQQ,5>d,5>dOOQQ-E;v-E;vOOQQ7+'r7+'rO' aQYO1G2]O$>]QYO1G2^OOQV<<LQ<<LQO.YQ_O<<LQO' lQWO<<LQO' sQWO<<LQOOQO,5>m,5>mOOQO-E<P-E<POOQV<<L[<<L[O.YQ_O<<L[O'!OQYO1G/QO'!ZQYO,5>nOOQQ,5>n,5>nO'!fQYO,5>nOOQQ-E<Q-E<QOOQS1G0[1G0[O'$tQ!fO1G0^O'%RQ!fO1G0^O'%YQWO1G3wOOQOAN@UAN@UO'%dQWO1G/zOOQO,5>X,5>XOOQO-E;k-E;kO!1PQ^O1G/zOOQO1G/z1G/zO'%oQWO1G/zO'%tQXO1G1kO$>]QYO1G1kO'&PQWO7+'[OOQVANA`ANA`O'&ZQWOANA`O$>]QYOANA`O'&cQWOANA`OOQVAN>OAN>OO.YQ_OAN>OO'&qQWOANAuOOQVAN@vAN@vO'&vQWOAN@vOOQVANAWANAWOOQVANAYANAYOOQVANA^ANA^O'&{QWOANA^OOQVANAiANAiO%5tQWOANAiO%5yQWOANAiO''TQWOANA`OOQVANAvANAvO.YQ_OANAvO''cQWOANAvO$>]QYOANAvOOQR<<La<<LaO''nQWO1G6WO%JkQWO,5>pOOQO'#HY'#HYO''vQWO'#HZOOQO,5>p,5>pOOQO-E<S-E<SO'(RQYO1G2sO'(]QWO1G2sOOQO1G2s1G2sO$>]QYO<<LaOOQR<<Ll<<LlOOQQ,5>o,5>oOOQQ-E<R-E<RO&0uQWOANAhOOQVANAhANAhO%5tQWOANAhO$>]QYOANAhO'(bQWO1G1rO')UQ^O1G0nO.YQ_O1G0nO'*zQWO,5;UO'+RQWO1G0nP'+WQWO'#ERP&%{Q^O'#HpOOQV7+&X7+&XO'+cQWO7+&XO&&qQWOAN@iO'+hQWOAN>OO!5oQWO,5<bOOQS,5>a,5>aO'+oQWOAN@lO'+tQWOAN@lOOQS-E;s-E;sOOQVAN@lAN@lO'+|QWOAN@lOOQVANAuANAuO',UQWO1G5vO',^QWO1G2dO$>]QYO1G2dO&'|QWO,5>gOOQO,5>g,5>gOOQO-E;y-E;yO',iQWO1G5xO',qQWO1G5xO&(nQYO,5>hO',|QWO,5>hO$>]QYO,5>hOOQO-E;z-E;zO'-XQWO'#JnOOQO1G2a1G2aOOQO,5>f,5>fOOQO-E;x-E;xO&'cQYO,5<lO'-gQYO1G2ZO'.RQWO1G5zO'.ZQWO1G2kO.YQ_O1G2kO'.eQWO1G2kO&+UQWO,5>iOOQO,5>i,5>iOOQO-E;{-E;{OOQQ,5>c,5>cOOQQ-E;u-E;uO'.pQWO1G2sO'/QQWO1G2rO'/]QWO1G5}O'/eQ^O,5>kOOQO'#Go'#GoOOQO,5>k,5>kO'/lQWO,5>kOOQO-E;}-E;}O$>]QYO1G2rO'/zQYO7+'xO'0VQWOANAlOOQVANAlANAlO.YQ_OANAlO'0^QWOANAvOOQS7+%x7+%xO'0eQWO7+%xO'0pQ!fO7+%xO'0}QWO7+%fO!1PQ^O7+%fO'1YQXO7+'VOOQVG26zG26zO'1eQWOG26zO'1sQWOG26zO$>]QYOG26zO'1{QWOG23jOOQVG27aG27aOOQVG26bG26bOOQVG26xG26xOOQVG27TG27TO%5tQWOG27TO'2SQWOG27bOOQVG27bG27bO.YQ_OG27bO'2ZQWOG27bOOQO1G4[1G4[OOQO7+(_7+(_OOQRANA{ANA{OOQVG27SG27SO%5tQWOG27SO&0uQWOG27SO'2fQ^O7+&YO'4PQWO7+'^O'4sQ^O7+&YO.YQ_O7+&YP.YQ_O,5;SP'6PQWO,5;SP'6UQWO,5;SOOQV<<Is<<IsOOQVG26TG26TOOQVG23jG23jOOQO1G1|1G1|OOQVG26WG26WO'6aQWOG26WP&B}QWO'#HuO'6fQWO7+(OOOQO1G4R1G4RO'6qQWO7++dO'6yQWO1G4SO$>]QYO1G4SO%,nQWO'#HyO'7UQWO,5@YO'7dQWO7+(VO.YQ_O7+(VOOQO1G4T1G4TOOQO1G4V1G4VO'7nQWO1G4VO'7|QWO7+(^OOQVG27WG27WO'8XQWOG27WOOQS<<Id<<IdO'8`QWO<<IdO'8kQWO<<IQOOQVLD,fLD,fO'8vQWOLD,fO'9OQWOLD,fOOQVLD)ULD)UOOQVLD,oLD,oOOQVLD,|LD,|O'9^QWOLD,|O.YQ_OLD,|OOQVLD,nLD,nO%5tQWOLD,nO'9eQ^O<<ItO';OQWO<<JxO';rQ^O<<ItP'=OQWO1G0nP'=oQ^O1G0nP.YQ_O1G0nP'?bQWO1G0nOOQVLD+rLD+rO'?gQWO7+)nOOQO,5>e,5>eOOQO-E;w-E;wO'?rQWO<<KqOOQVLD,rLD,rOOQSAN?OAN?OOOQV!$(!Q!$(!QO'?|QWO!$(!QOOQV!$(!h!$(!hO'@UQWO!$(!hOOQV!$(!Y!$(!YO'@]Q^OAN?`POQU7+&Y7+&YP'AvQWO7+&YP'BgQ^O7+&YP.YQ_O7+&YOOQV!)9El!)9ElOOQV!)9FS!)9FSPOQU<<It<<ItP'DYQWO<<ItP'DyQ^O<<ItPOQUAN?`AN?`O'FlQWO'#CnO'FsQXO'#CnO'GlQWO'#I`O'IRQXO'#I`O'IxQWO'#DpO'IxQWO'#DpO!.cQ_O'#EkO'JZQ_O'#EoO'JbQ_O'#FPO'MfQ_O'#FbO'MmQXO'#I`O'NdQ_O'#E}O( gQ_O'#FWO'IxQWO,5:[O'IxQWO,5:[O!.cQ_O,5;ZO!.cQ_O,5;]O!.cQ_O,5;]O!.cQ_O,5;]O!.cQ_O,5;]O!.cQ_O,5;]O!.cQ_O,5;]O!.cQ_O,5;]O!.cQ_O,5;]O!.cQ_O,5;]O!.cQ_O,5;fO(!jQ_O,5;kO(%nQWO,5;kO(&OQWO,5;|O(&VQYO'#CuO(&bQYO'#CvO(&mQWO'#CwO(&mQWO'#CwO('OQYO'#CtO('ZQWO,5;iO('bQWO,5;rO('iQ_O,5;rO((oQ_O,5;|O'IxQWO1G/vO((vQWO1G0uO(*eQWO1G0wO(*oQWO1G0wO(,dQWO1G0wO(,kQWO1G0wO(.]QWO1G0wO(.dQWO1G0wO(0UQWO1G0wO(0]QWO1G0wO(0dQWO1G1QO(0tQWO1G1VO(1UQYO'#IeO(&mQWO,59cO(&mQWO,59cO(1aQWO1G1^O(1hQWO1G1hO(&mQWO1G.}O(1oQWO'#DpO!.^QXO'#FbO(1tQWO,5;ZO(1{QWO'#Cw",
    stateData: "(2_~O&|OSUOS&}PQ~OPoOQ!QOSVOTVOZeO[lO^RO_RO`ROa!UOd[Og!nOsVOtVOuVOw!POyvO|!VO}mO!Q!dO!U!WO!W!XO!X!^O!Z!YO!]!pO!liO!qgO!tiO#Y!_O#r!ZO#{![O$O!]O$b!`O$d!bO$f!cO$i!eO$m!fO$q!gO$s!hO%T!iO%V!jO%Z!kO%]!lO%^!mO%f!oO%j!qO%s!rO'Q`O'TQO'ZkO'^UO'gcO'qiO(QdO~O&}!sO~OZbX[bXdbXdlXobXwjX}bX!lbX!qbX!tbX#ObX#PbX#pbX'gbX'qbX'rbX'xbX'ybX'zbX'{bX'|bX'}bX(ObX(PbX(QbX(RbX(TbX~OybXXbX!ebX!PbXvbX#RbX~P$|OZ'SX['SXd'SXd'XXo'SXw'kXy'SX}'SX!l'SX!q'SX!t'SX#O'SX#P'SX#p'SX'g'SX'q'SX'r'SX'x'SX'y'SX'z'SX'{'SX'|'SX'}'SX(O'SX(P'SX(Q'SX(R'SX(T'SXv'SX~OX'SX!e'SX!P'SX#R'SX~P'ZOr!uO']!wO'_!uO~Od!xO~O^RO_RO`ROaRO'TQO~Od!}O~Od#PO[(SXo(SXy(SX}(SX!l(SX!q(SX!t(SX#O(SX#P(SX#p(SX'g(SX'q(SX'r(SX'x(SX'y(SX'z(SX'{(SX'|(SX'}(SX(O(SX(P(SX(Q(SX(R(SX(T(SXv(SX~OZ#OO~P*`OZ#RO[#QO~OQ!QO^#TO_#TO`#TOa#]Od#ZOg!nOyvO|!VO!Q!dO!U#^O!W!lO!]!pO$i!eO$m!fO$q!gO$s!hO%T!iO%V!jO%Z!kO%]!lO%^!mO%f!oO%j!qO%s!rO'Q#VO'T#SO~OPoOQ!QOSVOTVOZeO[lOd[OsVOtVOuVOw!PO}mO!U#bO!W#cO!X!^O!Z!YO!liO!qgO!tiO#Y!_O#r!ZO#{![O$O!]O$b!`O$d!bO$f!cO'ZkO'^UO'gcO'qiO(QdO~P)xOPoOQ!QOSVOTVOZeO[lOd[OsVOtVOuVOw!PO}mO!U#bO!W#cO!X!^O!Z!YO!j#eO!liO!qgO!tiO#Y!_O#r!ZO#{![O$O!]O$b!`O$d!bO$f!cO'ZkO'^UO'gcO'qiO(QdO~P)xO[#}Oo#xO}#zO!l#yO!q#jO!t#yO#O#xO#P#uO#p$OO'g#gO'q#yO'r#lO'x#hO'y#iO'z#iO'{#kO'|#nO'}#mO(O#|O(P#gO(Q#hO(R#fO(T#hO~OPoOQ!QOSVOTVOZeOd[OsVOtVOuVOw!PO!U#bO!W#cO!X!^O!Z!YO#Y!_O#r!ZO#{![O$O!]O$b!`O$d!bO$f!cO'ZkO'^UO[#sXo#sXy#sX}#sX!l#sX!q#sX!t#sX#O#sX#P#sX#p#sX'g#sX'q#sX'r#sX'x#sX'y#sX'z#sX'{#sX'|#sX'}#sX(O#sX(P#sX(Q#sX(R#sX(T#sXX#sX!e#sX!P#sXv#sX#R#sX~P)xOX(SX!e(SX!P(SXw(SX#R(SX~P*`OPoOQ!QOSVOTVOX$ROZeO[lOd[OsVOtVOuVOw!PO}mO!U#bO!W#cO!X!^O!Z!YO!liO!qgO!tiO#Y!_O#r!ZO#{![O$O!]O$b!`O$d!bO$f!cO'Q$UO'ZkO'^UO'gcO'qiO(QdO~P)xOPoOQ!QOSVOTVOZeO[lOd[OsVOtVOuVOw!PO}mO!P$XO!U#bO!W#cO!X!^O!Z!YO!liO!qgO!tiO#Y!_O#r!ZO#{![O$O!]O$b!`O$d!bO$f!cO'Q$UO'ZkO'^UO'gcO'qiO(QdO~P)xOQ!QOSVOTVO[$gO^$pO_$ZO`9yOa9yOd$aOsVOtVOuVO}$eO!i$qO!l$lO!q$hO#V$lO'T$YO'^UO'g$[O~O!j$rOP(XP~P<cOPoOQ!QOSVOTVOZeO[lOd[OsVOtVOuVOw!PO}mO!U#bO!W#cO!X!^O!Z!YO!liO!qgO!tiO#Q$uO#Y!_O#r!ZO#{![O$O!]O$b!`O$d!bO$f!cO'ZkO'^UO'gcO'qiO(QdO~P)xOw$vO~Oo'bX#O'bX#P'bX#p'bX'r'bX'x'bX'y'bX'z'bX'{'bX'|'bX'}'bX(O'bX(P'bX(R'bX(T'bX~OP%tXQ%tXS%tXT%tXZ%tX[%tX^%tX_%tX`%tXa%tXd%tXg%tXs%tXt%tXu%tXw%tXy%tX|%tX}%tX!Q%tX!U%tX!W%tX!X%tX!Z%tX!]%tX!l%tX!q%tX!t%tX#Y%tX#r%tX#{%tX$O%tX$b%tX$d%tX$f%tX$i%tX$m%tX$q%tX$s%tX%T%tX%V%tX%Z%tX%]%tX%^%tX%f%tX%j%tX%s%tX&z%tX'Q%tX'T%tX'Z%tX'^%tX'g%tX'q%tX(Q%tXv%tX~P@[Oy$xO['bX}'bX!l'bX!q'bX!t'bX'g'bX'q'bX(Q'bXv'bX~P@[Ow$yO!Q(iX!U(iX!W(iX$q(iX%](iX%^(iX~Oy$zO~PEsO!Q$}O!U%UO!W!lO$m%OO$q%PO$s%QO%T%RO%V%SO%Z%TO%]!lO%^%VO%f%WO%j%XO%s%YO~O!Q!lO!U!lO!W!lO$q%[O%]!lO~O%^%VO~PGaOPoOQ!QOSVOTVOZeO[lO^RO_RO`ROa!UOd[Og!nOsVOtVOuVOw!POyvO|!VO}mO!Q!dO!U!WO!W!XO!X!^O!Z!YO!]!pO!liO!qgO!tiO#Y!_O#r!ZO#{![O$O!]O$b!`O$d!bO$f!cO$i!eO$m!fO$q!gO$s!hO%T!iO%V!jO%Z!kO%]!lO%^!mO%f!oO%j!qO%s!rO'Q#VO'TQO'ZkO'^UO'gcO'qiO(QdO~Ov%`O~P]OQ!QOZ%rO[%qO^%vO_%cO`TOaTOd%jOg%yO}%pO!q%oO$f%wO%^%xO&W%{O'T%dO'Z%eO(Q%zO~PGaO!Q{X!U{X!W{X$m{X$q{X$s{X%T{X%V{X%Z{X%]{X%^{X%f{X%j{X%s{X~P'ZO!Q{X!U{X!W{X$m{X$q{X$s{X%T{X%V{X%Z{X%]{X%^{X%f{X%j{X%s{X~O}%}O'T{XQ{XZ{X[{X^{X_{X`{Xa{Xd{Xg{X!q{X$f{X&W{X'Z{X(Q{X~PMuOg&PO%f%WO!Q(iX!U(iX!W(iX$q(iX%](iX%^(iX~Ow!PO~P! yOw!PO!X&RO~PEvOPoOQ!QOSVOTVOZeO[lO^9qO_9qO`9qOa9qOd9tOsVOtVOuVOw!PO}mO!U#bO!W#cO!X:zO!Z!YO!]&UO!l9wO!q9vO!t9wO#Y!_O#r9zO#{9{O$O!]O$b!`O$d!bO$f!cO'T9oO'ZkO'^UO'gcO'q9wO(QdO~OPoOQ!QOSVOTVOZeO[lOd[OsVOtVOuVOw!PO}mO!U#bO!W#cO!X!^O!Z!YO!liO!qgO!tiO#Y!_O#r!ZO#{![O$O!]O$b!`O$d!bO$f!cO'ZkO'^UO'gcO'qiO(QdOo#qXy#qX#O#qX#P#qX#p#qX'r#qX'x#qX'y#qX'z#qX'{#qX'|#qX'}#qX(O#qX(P#qX(R#qX(T#qXX#qX!e#qX!P#qXv#qX#R#qX~P)xOPoOQ!QOSVOTVOZeO[lOd[OsVOtVOuVOw!PO}mO!U#bO!W#cO!X!^O!Z!YO!liO!qgO!tiO#Y!_O#r!ZO#{![O$O!]O$b!`O$d!bO$f!cO'ZkO'^UO'gcO'qiO(QdOo#zXy#zX#O#zX#P#zX#p#zX'r#zX'x#zX'y#zX'z#zX'{#zX'|#zX'}#zX(O#zX(P#zX(R#zX(T#zXX#zX!e#zX!P#zXv#zX#R#zX~P)xO'ZkO[#}Xo#}Xy#}X}#}X!l#}X!q#}X!t#}X#O#}X#P#}X#p#}X'g#}X'q#}X'r#}X'x#}X'y#}X'z#}X'{#}X'|#}X'}#}X(O#}X(P#}X(Q#}X(R#}X(T#}XX#}X!e#}X!P#}Xv#}Xw#}X#R#}X~OPoO~OPoOQ!QOSVOTVOZeO[lO^9qO_9qO`9qOa9qOd9tOsVOtVOuVOw!PO}mO!U#bO!W#cO!X:zO!Z!YO!l9wO!q9vO!t9wO#Y!_O#r9zO#{9{O$O!]O$b!`O$d!bO$f!cO'T9oO'ZkO'^UO'gcO'q9wO(QdO~O!S&_O~Ow!PO~O!j&bO~P<cO'T&cO~PEvOZ&eO~O'T&cO~O'^UOw(^Xy(^X!Q(^X!U(^X!W(^X$q(^X%](^X%^(^X~Oa&hO~P!1iO'T&iO~O_&nO'T&cO~OQ&oOZ&pO[%qO^%vO_%cO`TOaTOd%jOg%yO}%pO!q%oO$f%wO%^%xO&W%{O'T%dO'Z%eO(Q%zO~PGaO!j&uO~P<cO^&wO_&wO`&wOa&wOd'POw&|O'T&vO(Q&}O~O!i'UO!j'TO'T&cO~O&}!sO'O'VO'P'XO~Or!uO']'ZO'_!uO~OQ']O^'ia_'ia`'iaa'ia'T'ia~O['cOw'dO}'bO~OQ']O~OQ!QO^#TO_#TO`#TOa'kOd#ZO'T#SO~O['lO~OZbXdlXXbXobXPbX!SbX!ebX'rbX!PbX!ObXybX!ZbX#RbXvbX~O[bXwbX}bX~P!6mOZ'SXd'XXX'SX['SXo'SXw'SX}'SX#p'SXP'SX!S'SX!e'SX'r'SX!P'SX!O'SXy'SX!Z'SX#R'SXv'SX~O^#TO_#TO`#TOa'kO'T#SO~OZ'mO~Od'oO~OZ'SXd'XX~PMuOZ'pOX(SX!e(SX!P(SXw(SX#R(SX~P*`O[#}O}#zO(O#|O(R#fOo#_ay#_a!l#_a!q#_a!t#_a#O#_a#P#_a#p#_a'g#_a'q#_a'r#_a'x#_a'y#_a'z#_a'{#_a'|#_a'}#_a(P#_a(Q#_a(T#_aX#_a!e#_a!P#_av#_aw#_a#R#_a~Ow!PO!X&RO~Oy#caX#ca!e#ca!P#cav#ca#R#ca~P2gOPoOQ!QOSVOTVOZeOd[OsVOtVOuVOw!PO!U#bO!W#cO!X!^O!Z!YO#Y!_O#r!ZO#{![O$O!]O$b!`O$d!bO$f!cO'ZkO'^UO[#sao#say#sa}#sa!l#sa!q#sa!t#sa#O#sa#P#sa#p#sa'g#sa'q#sa'r#sa'x#sa'y#sa'z#sa'{#sa'|#sa'}#sa(O#sa(P#sa(Q#sa(R#sa(T#saX#sa!e#sa!P#sav#sa#R#sa~P)xOPoOQ!QOSVOTVOZeO[lOd[OsVOtVOuVOw!PO}mO!U#bO!W#cO!X!^O!Z!YO!liO!qgO!tiO#Y!_O#r!ZO#{![O$O!]O$b!`O$d!bO$f!cO'Q#VO'ZkO'^UO'gcO'qiO(QdO!P(UP~P)xOu(SO#w(TO'T(RO~O[#}O}#zO!q#jO'g#gO'r#lO'x#hO'y#iO'z#iO'{#kO'|#nO'}#mO(O#|O(P#gO(Q#hO(R#fO(T#hO!l#sa!t#sa#p#sa'q#sa~Oo#xO#O#xO#P#uOy#saX#sa!e#sa!P#sav#sa#R#sa~P!B}Oy(YO!e(WOX(WX~P2gOX(ZO~OPoOQ!QOSVOTVOX(ZOZeO[lOd[OsVOtVOuVOw!PO}mO!U#bO!W#cO!X!^O!Z!YO!liO!qgO!tiO#Y!_O#r!ZO#{![O$O!]O$b!`O$d!bO$f!cO'Q$UO'ZkO'^UO'gcO'qiO(QdO~P)xOZ#RO~O!P(_O!e(WO~P2gOPoOQ!QOSVOTVOZeO[lOd[OsVOtVOuVOw!PO}mO!U#bO!W#cO!X!^O!Z!YO!liO!qgO!tiO#Y!_O#r!ZO#{![O$O!]O$b!`O$d!bO$f!cO'Q$UO'ZkO'^UO'gcO'qiO(QdO~P)xOZbXdlXwjX}jX!tbX'qbX~OP!RX!S!RX!e!RX'p!RX'r!RX!O!RXo!RXy!RX!P!RXX!RX!Z!RX#R!RXv!RX~P!JUOZ'SXd'XXw'kX}'kX!t'SX'q'SX~OP!`X!S!`X!e!`X'r!`X!O!`Xo!`Xy!`X!P!`XX!`X!Z!`X#R!`Xv!`X~P!KgOT(aOu(aO~O!t(bO'q(bOP!^X!S!^X!e!^X'r!^X!O!^Xo!^Xy!^X!P!^XX!^X!Z!^X#R!^Xv!^X~O^9rO_9rO`9yOa9yO'T9pO~Od(eO~O'p(fOP'hX!S'hX!e'hX'r'hX!O'hXo'hXy'hX!P'hXX'hX!Z'hX#R'hXv'hX~O!j&bO!P'lP~P<cOw(kO}(jO~O!j&bOX'lP~P<cO!j(oO~P<cOZ'pO!t(bO'q(bO~O!S(qO'r(pOP$WX!e$WX~O!e(rOP(YX~OP(tO~OP!aX!S!aX!e!aX'r!aX!O!aXo!aXy!aX!P!aXX!aX!Z!aX#R!aXv!aX~P!KgOy$UaX$Ua!e$Ua!P$Uav$Ua#R$Ua~P2gO!l(|O'Q#VO'T(xOv(ZP~OQ!QO^#TO_#TO`#TOa#]Od#ZOg!nOyvO|!VO!Q!dO!U#^O!W!lO!]!pO$i!eO$m!fO$q!gO$s!hO%T!iO%V!jO%Z!kO%]!lO%^!mO%f!oO%j!qO%s!rO'Q`O'T#SO~Ov)TO~P#$iOy)VO~PEsO%^)WO~PGaOa)ZO~P!1iO%f)`O~PEvO_)aO'T&cO~O!i)fO!j)eO'T&cO~O'^UO!Q(^X!U(^X!W(^X$q(^X%](^X%^(^X~Ov%uX~P2gOv)gO~PGyOv)gO~Ov)gO~P]OQiXQ'XXZiXd'XX}iX#piX(PiX~ORiXwiX$fiX$|iX[iXoiXyiX!liX!qiX!tiX#OiX#PiX'giX'qiX'riX'xiX'yiX'ziX'{iX'|iX'}iX(OiX(QiX(RiX(TiX!PiX!eiXXiXPiXviX!SiX#RiX~P#(kOQjXQlXRjXZjXdlX}jX#pjX(PjXwjX$fjX$|jX[jXojXyjX!ljX!qjX!tjX#OjX#PjX'gjX'qjX'rjX'xjX'yjX'zjX'{jX'|jX'}jX(OjX(QjX(RjX(TjX!PjX!ejXXjX!SjXPjXvjX#RjX~O%^)jO~PGaOQ']Od)kO~O^)mO_)mO`)mOa)mO'T%dO~Od)qO~OQ']OZ)uO})sOR'UX#p'UX(P'UXw'UX$f'UX$|'UX['UXo'UXy'UX!l'UX!q'UX!t'UX#O'UX#P'UX'g'UX'q'UX'r'UX'x'UX'y'UX'z'UX'{'UX'|'UX'}'UX(O'UX(Q'UX(R'UX(T'UX!P'UX!e'UXX'UXP'UXv'UX!S'UX#R'UX~OQ!QO^:bO_:^O`TOaTOd:aO%^)jO'T:_O~PGaOQ!QOZ%rO[%qO^%vO_%cO`TOaTOd%jOg%yO}%pO!j)yO!q%oO$f%wO%^%xO&W%{O'T%dO'Z%eO(Q%zO~PGaOQ!QOZ%rO[%qO^%vO_%cO`TOaTOd%jOg%yO}%pO!P)|O!q%oO$f%wO%^%xO&W%{O'T%dO'Z%eO(Q%zO~PGaO(P*OO~OR*QO#p*RO(P*PO~OQhXQ'XXZhXd'XX}hX(PhX~ORhX#phXwhX$fhX$|hX[hXohXyhX!lhX!qhX!thX#OhX#PhX'ghX'qhX'rhX'xhX'yhX'zhX'{hX'|hX'}hX(OhX(QhX(RhX(ThX!PhX!ehXXhXPhXvhX!ShX#RhX~P#4kOQ*SO~O})sO~OQ!QO^%vO_%cO`TOaTOd%jO$f%wO%^%xO'T%dO~PGaO!Q*VO!j*VO~O^*YO`*YOa*YO!O*ZO~OQ&oOZ*[O[%qO^%vO_%cO`TOaTOd%jOg%yO}%pO!q%oO$f%wO%^%xO&W%{O'T%dO'Z%eO(Q%zO~PGaO[#}Oo:YO}#zO!l:ZO!q#jO!t:ZO#O:YO#P:VO#p$OO'g#gO'q:ZO'r#lO'x#hO'y#iO'z#iO'{#kO'|#nO'}#mO(O#|O(P#gO(Q#hO(R#fO(T#hO~Ow'dX~P#9vOy#qaX#qa!e#qa!P#qav#qa#R#qa~P2gOy#zaX#za!e#za!P#zav#za#R#za~P2gOPoOQ!QOSVOTVOZeO[lOd[OsVOtVOuVOw!PO}mO!S&_O!U#bO!W#cO!X!^O!Z!YO!liO!qgO!tiO#Y!_O#r!ZO#{![O$O!]O$b!`O$d!bO$f!cO'ZkO'^UO'gcO'qiO(QdOo#zay#za#O#za#P#za#p#za'r#za'x#za'y#za'z#za'{#za'|#za'}#za(O#za(P#za(R#za(T#zaX#za!e#za!P#zav#za#R#za~P)xOPoOQ!QOSVOTVOZeO[lOd[OsVOtVOuVOw!PO}mO!U#bO!W#cO!X!^O!Z!YO!liO!qgO!tiO#Q*eO#Y!_O#r!ZO#{![O$O!]O$b!`O$d!bO$f!cO'ZkO'^UO'gcO'qiO(QdO~P)xOw*fO~P#9vO$b*iO$d*jO$f*kO~O!O*lO'r(pO~O!S*nO~O'T*oO~Ow$yOy*qO~O'T*rO~OQ*uOw*vOy*yO}*wO$|*xO~OQ*uOw*vO$|*xO~OQ*uOw+QO$|*xO~OQ*uOo+VOy+XO!S+UO~OQ*uO}+ZO~OQ!QOZ%rO[%qO^%vO`TOaTOd%jOg%yO}%pO!U!lO!W!lO!q%oO$f%wO$q%[O%]!lO%^%xO&W%{O'T%dO'Z%eO(Q%zO~OR+bO_+^O!Q+cO~P#DkO_%cO!Q!lOw&UX$|&UX(P&UX~P#DkOw$yO$f+hO$|*xO(P*PO~OQ!QOZ*[O[%qO^%vO_%cO`TOaTOd%jOg%yO}%pO!q%oO$f%wO%^%xO&W%{O'T%dO'Z%eO(Q%zO~PGaOQ*uOw$yO!S+UO$|*xO~Oo+nOy+mO!S+oO'r(pO~OdlXy!RX#pbXv!RX!e!RX~Od'XXy(mX#p'SXv(mX!e(mX~Od+qO~O^#TO_#TO`#TOa'kOw&|O'T&vO(Q+vO~Ov(oP~P!3|O#p+{O~Oy+|O~O!S+}O~O&}!sO'O'VO'P,PO~Od,QO~OSVOTVO_%cOsVOtVOuVOw!PO!Q!lO'^UO~P#DkOS,^OT,^OZ,^O['cO_,YOd,^Oo,^Os,^Ou,^Ow'dOy,^O}'bO!S,^O!e,^O!l,^O!q,[O!t,^O!y,^O#O,^O#P,^O#Q,^O#R,^O'Q,^O'Z%eO'^UO'g,ZO'r,[O'v,_O'x,ZO'y,[O'z,[O'{,[O'|,]O'},]O(O,^O(P,`O(Q,`O(R,aO~O!P,dO~P#KkOX,gO~P#KkOv,iO~P#KkOo'tX#O'tX#P'tX#p'tX'r'tX'x'tX'y'tX'z'tX'{'tX'|'tX'}'tX(O'tX(P'tX(R'tX(T'tX~Oy,jO['tX}'tX!l'tX!q'tX!t'tX'g'tX'q'tX(Q'tXv'tX~P#NjOP$giQ$giS$giT$giZ$gi[$gi^$gi_$gi`$gia$gid$gig$gis$git$giu$giw$giy$gi|$gi}$gi!Q$gi!U$gi!W$gi!X$gi!Z$gi!]$gi!l$gi!q$gi!t$gi#Y$gi#r$gi#{$gi$O$gi$b$gi$d$gi$f$gi$i$gi$m$gi$q$gi$s$gi%T$gi%V$gi%Z$gi%]$gi%^$gi%f$gi%j$gi%s$gi&z$gi'Q$gi'T$gi'Z$gi'^$gi'g$gi'q$gi(Q$giv$gi~P#NjOX,kO~O['cOo,lOw'dO}'bOX]X~Oy#ciX#ci!e#ci!P#civ#ci#R#ci~P2gO[#}O}#zO'x#hO(O#|O(Q#hO(R#fO(T#hOo#eiy#ei!l#ei!q#ei!t#ei#O#ei#P#ei#p#ei'q#ei'r#ei'y#ei'z#ei'{#ei'|#ei'}#eiX#ei!e#ei!P#eiv#ei#R#ei~O'g#ei(P#ei~P$'PO[#}O}#zO(O#|O(R#fOo#eiy#ei!l#ei!q#ei!t#ei#O#ei#P#ei#p#ei'q#ei'r#ei'y#ei'z#ei'{#ei'|#ei'}#eiX#ei!e#ei!P#eiv#ei#R#ei~O'g#ei'x#ei(P#ei(Q#ei(T#eiw#ei~P$)QO'g#gO(P#gO~P$'PO[#}O}#zO'g#gO'x#hO'y#iO'z#iO(O#|O(P#gO(Q#hO(R#fO(T#hOo#eiy#ei!l#ei!t#ei#O#ei#P#ei#p#ei'q#ei'r#ei'{#ei'|#ei'}#eiX#ei!e#ei!P#eiv#ei#R#ei~O!q#ei~P$+`O!q#jO~P$+`O[#}O}#zO!q#jO'g#gO'x#hO'y#iO'z#iO'{#kO(O#|O(P#gO(Q#hO(R#fO(T#hOo#eiy#ei!l#ei!t#ei#O#ei#P#ei#p#ei'q#ei'|#ei'}#eiX#ei!e#ei!P#eiv#ei#R#ei~O'r#ei~P$-hO'r#lO~P$-hO[#}O}#zO!q#jO#P#uO'g#gO'r#lO'x#hO'y#iO'z#iO'{#kO(O#|O(P#gO(Q#hO(R#fO(T#hOo#eiy#ei!l#ei!t#ei#O#ei#p#ei'q#ei'|#eiX#ei!e#ei!P#eiv#ei#R#ei~O'}#ei~P$/pO'}#mO~P$/pO[#}O}#zO!q#jO'g#gO'r#lO'x#hO'y#iO'z#iO'{#kO'|#nO'}#mO(O#|O(P#gO(Q#hO(R#fO(T#hO!l#ni!t#ni#p#ni'q#ni~Oo#xO#O#xO#P#uOy#niX#ni!e#ni!P#niv#ni#R#ni~P$1xO[#}O}#zO!q#jO'g#gO'r#lO'x#hO'y#iO'z#iO'{#kO'|#nO'}#mO(O#|O(P#gO(Q#hO(R#fO(T#hO!l#si!t#si#p#si'q#si~Oo#xO#O#xO#P#uOy#siX#si!e#si!P#siv#si#R#si~P$3yOPoOQ!QOSVOTVOZeO[lOd[OsVOtVOuVOw!PO}mO!U#bO!W#cO!X!^O!Z!YO!liO!qgO!tiO#Y!_O#r!ZO#{![O$O!]O$b!`O$d!bO$f!cO'Q#VO'ZkO'^UO'gcO'qiO(QdO~P)xO!e,sO!P(VX~P2gO!P,uO~OX,vO~P2gOPoOQ!QOSVOTVOZeO[lOd[OsVOtVOuVOw!PO}mO!U#bO!W#cO!X!^O!Z!YO!liO!qgO!tiO#Y!_O#r!ZO#{![O$O!]O$b!`O$d!bO$f!cO'ZkO'^UO'gcO'qiO(QdOX&fX!e&fX!P&fX~P)xO!e(WOX(Wa~Oy,zO!e(WOX(WX~P2gOX,{O~O!P,|O!e(WO~O!P-OO!e(WO~P2gOSVOTVOsVOtVOuVO'^UO'g$[O~P!6POP!baZca!S!ba!e!ba!tca'qca'r!ba!O!bao!bay!ba!P!baX!ba!Z!ba#R!bav!ba~O!e-TO'r(pO!P'mXX'mX~O!P-VO~O!i-`O!j-_O!l-[O'T-XOv'nP~OX-aO~O_%cO!Q!lO~P#DkO!j-gOP&gX!e&gX~P<cO!e(rOP(Ya~O!S-iO'r(pOP$Wa!e$Wa~Ow!PO(P*PO~OvbX!S!kX!ebX~O'Q#VO'T(xO~O!S-mO~O!e-oOv([X~Ov-qO~Ov-sO~P,cOv-sO~P#$iO_-uO'T&cO~O!S-vO~Ow$yOy-wO~OQ*uOw*vOy-zO}*wO$|*xO~OQ*uOo.UO~Oy._O~O!S.`O~O!j.bO'T&cO~Ov.cO~Ov.cO~PGyOQ']O^'Wa_'Wa`'Waa'Wa'T'Wa~Od.gO~OQ'XXQ'kXR'kXZ'kXd'XX}'kX#p'kX(P'kXw'kX$f'kX$|'kX['kXo'kXy'kX!l'kX!q'kX!t'kX#O'kX#P'kX'g'kX'q'kX'r'kX'x'kX'y'kX'z'kX'{'kX'|'kX'}'kX(O'kX(Q'kX(R'kX(T'kX!P'kX!e'kXX'kXP'kXv'kX!S'kX#R'kX~OQ!QOZ%rO[%qO^.rO_%cO`TOaTOd%jOg%yO}%pO!j.sO!q.pO!t.kO#V.mO$f%wO%^%xO&W%{O'Q#VO'T%dO'Z%eO(Q%zO!P(sP~PGaO#Q.tOR%wa#p%wa(P%waw%wa$f%wa$|%wa[%wao%way%wa}%wa!l%wa!q%wa!t%wa#O%wa#P%wa'g%wa'q%wa'r%wa'x%wa'y%wa'z%wa'{%wa'|%wa'}%wa(O%wa(Q%wa(R%wa(T%wa!P%wa!e%waX%waP%wav%wa!S%wa#R%wa~O%^.vO~PGaO(P*POR&Oa#p&Oaw&Oa$f&Oa$|&Oa[&Oao&Oay&Oa}&Oa!l&Oa!q&Oa!t&Oa#O&Oa#P&Oa'g&Oa'q&Oa'r&Oa'x&Oa'y&Oa'z&Oa'{&Oa'|&Oa'}&Oa(O&Oa(Q&Oa(R&Oa(T&Oa!P&Oa!e&OaX&OaP&Oav&Oa!S&Oa#R&Oa~O_%cO!Q!lO!j.xO(P*OO~P#DkO!e.yO(P*PO!P(uX~O!P.{O~OX.|Oy.}O(P*PO~O'Z%eOR(qP~OQ']O})sORfa#pfa(Pfawfa$ffa$|fa[faofayfa!lfa!qfa!tfa#Ofa#Pfa'gfa'qfa'rfa'xfa'yfa'zfa'{fa'|fa'}fa(Ofa(Qfa(Rfa(Tfa!Pfa!efaXfaPfavfa!Sfa#Rfa~OQ']O})sOR&Va#p&Va(P&Vaw&Va$f&Va$|&Va[&Vao&Vay&Va!l&Va!q&Va!t&Va#O&Va#P&Va'g&Va'q&Va'r&Va'x&Va'y&Va'z&Va'{&Va'|&Va'}&Va(O&Va(Q&Va(R&Va(T&Va!P&Va!e&VaX&VaP&Vav&Va!S&Va#R&Va~O!P/UO~Ow$yO$f/ZO$|*xO(P*PO~OQ!QOZ/[O[%qO^%vO_%cO`TOaTOd%jOg%yO}%pO!q%oO$f%wO%^%xO&W%{O'T%dO'Z%eO(Q%zO~PGaOo/^O'r(pO~O#W/_OP!YiQ!YiS!YiT!YiZ!Yi[!Yi^!Yi_!Yi`!Yia!Yid!Yig!Yio!Yis!Yit!Yiu!Yiw!Yiy!Yi|!Yi}!Yi!Q!Yi!U!Yi!W!Yi!X!Yi!Z!Yi!]!Yi!l!Yi!q!Yi!t!Yi#O!Yi#P!Yi#Y!Yi#p!Yi#r!Yi#{!Yi$O!Yi$b!Yi$d!Yi$f!Yi$i!Yi$m!Yi$q!Yi$s!Yi%T!Yi%V!Yi%Z!Yi%]!Yi%^!Yi%f!Yi%j!Yi%s!Yi&z!Yi'Q!Yi'T!Yi'Z!Yi'^!Yi'g!Yi'q!Yi'r!Yi'x!Yi'y!Yi'z!Yi'{!Yi'|!Yi'}!Yi(O!Yi(P!Yi(Q!Yi(R!Yi(T!YiX!Yi!e!Yi!P!Yiv!Yi!i!Yi!j!Yi#V!Yi#R!Yi~Oy#ziX#zi!e#zi!P#ziv#zi#R#zi~P2gOy$UiX$Ui!e$Ui!P$Uiv$Ui#R$Ui~P2gOv/eO!j&bO'Q`O~P<cOw/nO}/mO~Oy!RX#pbX~Oy/oO~O#p/pO~OR+bO_+dO!Q/sO'T&iO'Z%eO~Oa/zO|!VO'Q#VO'T(ROv(cP~OQ!QOZ%rO[%qO^%vO_%cO`TOa/zOd%jOg%yO|!VO}%pO!q%oO$f%wO%^%xO&W%{O'Q#VO'T%dO'Z%eO(Q%zO!P(eP~PGaOQ!QOZ%rO[%qO^%vO_%cO`TOaTOd%jOg%yO}%pO!q%oO$f0VO%^%xO&W%{O'T%dO'Z%eO(Q%zOw(`Py(`P~PGaOw*vO~Oy-zO$|*xO~Oa/zO|!VO'Q#VO'T*oOv(gP~Ow+QO~OQ!QOZ%rO[%qO^%vO_%cO`TOaTOd%jOg%yO}%pO!q%oO$f0VO%^%xO&W%{O'T%dO'Z%eO(Q%zO(R0`O~PGaOy0dO~OQ!QOSVOTVO[$gO^0lO_$ZO`9yOa9yOd$aOsVOtVOuVO}$eO!i$qO!j0mO!l$lO!q0eO!t0hO'Q#VO'T$YO'Z%eO'^UO'g$[O~O#V0nO!P(jP~P%1}Ow!POy0pO#Q0rO$|*xO~OR0uO!e0sO~P#(kOR0uO!S+UO!e0sO(P*OO~OR0uOo0wO!S+UO!e0sOQ'VXZ'VX}'VX#p'VX(P'VX~OR0uOo0wO!e0sO~OR0uO!e0sO~O$f/ZO(P*PO~Ow$yO~Ow$yO$|*xO~Oo0}Oy0|O!S1OO'r(pO~O!e1POv(pX~Ov1RO~O^#TO_#TO`#TOa'kOw&|O'T&vO(Q1VO~Oo1YOQ'VXR'VXZ'VX}'VX!e'VX(P'VX~O!e1ZO(P*POR'YX~O!e1ZOR'YX~O!e1ZO(P*OOR'YX~OR1]O~O!S1^OS'wXT'wXZ'wX['wX_'wXd'wXo'wXs'wXu'wXw'wXy'wX}'wX!P'wX!e'wX!l'wX!q'wX!t'wX!y'wX#O'wX#P'wX#Q'wX#R'wX'Q'wX'Z'wX'^'wX'g'wX'r'wX'v'wX'x'wX'y'wX'z'wX'{'wX'|'wX'}'wX(O'wX(P'wX(Q'wX(R'wXX'wXv'wX~O}1_O~O!P1aO~P#KkOX1bO~P#KkOv1cO~P#KkOS,^OT,^OZ,^O['cO_1dOd,^Oo,^Os,^Ou,^Ow'dOy,^O}'bO!S,^O!e,^O!l,^O!q,[O!t,^O!y,^O#O,^O#P,^O#Q,^O#R,^O'Q,^O'Z%eO'^UO'g,ZO'r,[O'v,_O'x,ZO'y,[O'z,[O'{,[O'|,]O'},]O(O,^O(P,`O(Q,`O(R,aO~OX1fO~Oy,jO~O!e,sO!P(Va~P2gOPoOQ!QOSVOTVOZeO[lOd[OsVOtVOuVOw!PO}mO!U#bO!W#cO!X!^O!Z!YO!liO!qgO!tiO#Y!_O#r!ZO#{![O$O!]O$b!`O$d!bO$f!cO'Q#VO'ZkO'^UO'gcO'qiO(QdO!P&eX!e&eX~P)xO!e,sO!P(Va~OX&fa!e&fa!P&fa~P2gOX1kO~P2gO!P1mO!e(WO~OP!biZci!S!bi!e!bi!tci'qci'r!bi!O!bio!biy!bi!P!biX!bi!Z!bi#R!biv!bi~O'r(pOP!oi!S!oi!e!oi!O!oio!oiy!oi!P!oiX!oi!Z!oi#R!oiv!oi~O!j&bO!P&`X!e&`XX&`X~P<cO!e-TO!P'maX'ma~O!P1qO~Ov!RX!S!kX!e!RX~O!S1rO~O!e1sOv'oX~Ov1uO~O'T-XO~O!j1xO'T-XO~O(P*POP$Wi!e$Wi~O!S1yO'r(pOP$XX!e$XX~O!S1|O~Ov$_a!e$_a~P2gO!l(|O'Q#VO'T(xOv&hX!e&hX~O!e-oOv([a~Ov2QO~P,cOy2UO~O#p2VO~Oy2WO$|*xO~Ow*vOy2WO}*wO$|*xO~Oo2aO~Ow!POy2fO#Q2hO$|*xO~O!S2jO~Ov2lO~O#Q2mOR%wi#p%wi(P%wiw%wi$f%wi$|%wi[%wio%wiy%wi}%wi!l%wi!q%wi!t%wi#O%wi#P%wi'g%wi'q%wi'r%wi'x%wi'y%wi'z%wi'{%wi'|%wi'}%wi(O%wi(Q%wi(R%wi(T%wi!P%wi!e%wiX%wiP%wiv%wi!S%wi#R%wi~Od2nO~O^2qO!j.sO!q2rO'Q#VO'Z%eO~O(P*PO!P%{X!e%{X~O!e2sO!P(tX~O!P2uO~OQ!QOZ%rO[%qO^2wO_%cO`TOaTOd%jOg%yO}%pO!j2xO!q%oO$f%wO%^%xO&W%{O'T%dO'Z%eO(Q%zO~PGaO^2yO!j2xO(P*OO~O!P%aX!e%aX~P#4kO^2yO~O(P*POR&Oi#p&Oiw&Oi$f&Oi$|&Oi[&Oio&Oiy&Oi}&Oi!l&Oi!q&Oi!t&Oi#O&Oi#P&Oi'g&Oi'q&Oi'r&Oi'x&Oi'y&Oi'z&Oi'{&Oi'|&Oi'}&Oi(O&Oi(Q&Oi(R&Oi(T&Oi!P&Oi!e&OiX&OiP&Oiv&Oi!S&Oi#R&Oi~O_%cO!Q!lO!P&yX!e&yX~P#DkO!e.yO!P(ua~OR3QO(P*PO~O!e3ROR(rX~OR3TO~O(P*POR&Pi#p&Piw&Pi$f&Pi$|&Pi[&Pio&Piy&Pi}&Pi!l&Pi!q&Pi!t&Pi#O&Pi#P&Pi'g&Pi'q&Pi'r&Pi'x&Pi'y&Pi'z&Pi'{&Pi'|&Pi'}&Pi(O&Pi(Q&Pi(R&Pi(T&Pi!P&Pi!e&PiX&PiP&Piv&Pi!S&Pi#R&Pi~O!P3UO~O$f3VO(P*PO~Ow$yO$f3VO$|*xO(P*PO~Ow!PO!Z!YO~O!Z3aO#R3_O'r(pO~O!j&bO'Q#VO~P<cOv3eO~Ov3eO!j&bO'Q`O~P<cO!O3hO'r(pO~Ow!PO~P#9vOo3kOy3jO(P*PO~O!P3oO~P%;pOv3rO~P%;pOR0uO!S+UO!e0sO~OR0uOo0wO!S+UO!e0sO~Oa/zO|!VO'Q#VO'T(RO~O!S3uO~O!e3wOv(dX~Ov3yO~OQ!QOZ%rO[%qO^%vO_%cO`TOa/zOd%jOg%yO|!VO}%pO!q%oO$f%wO%^%xO&W%{O'Q#VO'T%dO'Z%eO(Q%zO~PGaO!e3|O(P*PO!P(fX~O!P4OO~O!S4PO(P*OO~O!S+UO(P*PO~O!e4ROw(aXy(aX~OQ4TO~Oy2WO~Oa/zO|!VO'Q#VO'T*oO~Oo4WOw*vO}*wOv%XX!e%XX~O!e4ZOv(hX~Ov4]O~O(P4_Oy(_Xw(_X$|(_XR(_Xo(_X!e(_X~Oy4aO(P*PO~OQ!QOSVOTVO[$gO^4bO_$ZO`9yOa9yOd$aOsVOtVOuVO}$eO!i$qO!l$lO!q$hO#V$lO'T$YO'^UO'g$[O~O!j4cO'Z%eO~P&,sO!S4eO'r(pO~O#V4gO~P%1}O!e4hO!P(kX~O!P4jO~O!P%aX!S!aX!e%aX'r!aX~P!KgO!j&bO~P&,sO!e4hO!P(kX!S'eX'r'eX~O^2yO!j2xO~Ow!POy2fO~O_4pO!Q/sO'T&iO'Z%eOR&lX!e&lX~OR4rO!e0sO~O!S4tO~Ow$yO$|*xO(P*PO~Oy4uO~P2gOo4vOy4uO(P*PO~Ov&uX!e&uX~P!3|O!e1POv(pa~Oo4|Oy4{O(P*PO~OSVOTVO_%cOsVOtVOuVOw!PO!Q!lO'^UOR&vX!e&vX~P#DkO!e1ZOR'Ya~O!y5SO~O!P5TO~P#KkO!S1^OX'wX#R'wX~O!e,sO!P(Vi~O!P&ea!e&ea~P2gOX5WO~P2gOP!bqZcq!S!bq!e!bq!tcq'qcq'r!bq!O!bqo!bqy!bq!P!bqX!bq!Z!bq#R!bqv!bq~O'r(pO!P&`a!e&`aX&`a~O!i-`O!j-_O!l5YO'T-XOv&aX!e&aX~O!e1sOv'oa~O!S5[O~O!S5`O'r(pOP$Xa!e$Xa~O(P*POP$Wq!e$Wq~Ov$^i!e$^i~P2gOw!POy5bO#Q5dO$|*xO~Oo5gOy5fO(P*PO~Oy5iO~Oy5iO$|*xO~Oy5mO(P*PO~Ow!POy5bO~Oo5tOy5sO(P*PO~O!S5vO~O!e2sO!P(ta~O^2yO!j2xO'Z%eO~OQ!QOZ%rO[%qO^.rO_%cO`TOaTOd%jOg%yO}%pO!j.sO!q.pO!t5zO#V5|O$f%wO%^%xO&W%{O'Q#VO'T%dO'Z%eO(Q%zO!P&xX!e&xX~PGaOQ!QOZ%rO[%qO^6OO_%cO`TOaTOd%jOg%yO}%pO!j6PO!q%oO$f%wO%^%xO&W%{O'T%dO'Z%eO(P*OO(Q%zO~PGaO!P%aa!e%aa~P#4kO^6QO~O#Q6ROR%wq#p%wq(P%wqw%wq$f%wq$|%wq[%wqo%wqy%wq}%wq!l%wq!q%wq!t%wq#O%wq#P%wq'g%wq'q%wq'r%wq'x%wq'y%wq'z%wq'{%wq'|%wq'}%wq(O%wq(Q%wq(R%wq(T%wq!P%wq!e%wqX%wqP%wqv%wq!S%wq#R%wq~O(P*POR&Oq#p&Oqw&Oq$f&Oq$|&Oq[&Oqo&Oqy&Oq}&Oq!l&Oq!q&Oq!t&Oq#O&Oq#P&Oq'g&Oq'q&Oq'r&Oq'x&Oq'y&Oq'z&Oq'{&Oq'|&Oq'}&Oq(O&Oq(Q&Oq(R&Oq(T&Oq!P&Oq!e&OqX&OqP&Oqv&Oq!S&Oq#R&Oq~O(P*PO!P&ya!e&ya~OX6SO~P2gO'Z%eOR&wX!e&wX~O!e3ROR(ra~O$f6YO(P*PO~Ow![q~P#9vO#R6]O~O!Z3aO#R6]O'r(pO~Ov6bO~O#R6fO~Oy6gO!P6hO~O!P6hO~P%;pOy6kO~Ov6kOy6gO~Ov6kO~P%;pOy6mO~O!e3wOv(da~O!S6pO~Oa/zO|!VO'Q#VO'T(ROv&oX!e&oX~O!e3|O(P*PO!P(fa~OQ!QOZ%rO[%qO^%vO_%cO`TOa/zOd%jOg%yO|!VO}%pO!q%oO$f%wO%^%xO&W%{O'Q#VO'T%dO'Z%eO(Q%zO!P&pX!e&pX~PGaO!e3|O!P(fa~OQ!QOZ%rO[%qO^%vO_%cO`TOaTOd%jOg%yO}%pO!q%oO$f0VO%^%xO&W%{O'T%dO'Z%eO(Q%zOw&nX!e&nXy&nX~PGaO!e4ROw(aay(aa~O!e4ZOv(ha~Oo7SOv%Xa!e%Xa~Oo7SOw*vO}*wOv%Xa!e%Xa~Oa/zO|!VO'Q#VO'T*oOv&qX!e&qX~O(P*POy$xaw$xa$|$xaR$xao$xa!e$xa~O(P4_Oy(_aw(_a$|(_aR(_ao(_a!e(_a~O!P%aa!S!aX!e%aa'r!aX~P!KgOQ!QOSVOTVO[$gO_$ZO`9yOa9yOd$aOsVOtVOuVO}$eO!i$qO!j&bO!l$lO!q$hO#V$lO'T$YO'^UO'g$[O~O^7ZO~P&JUO^6QO!j6PO~O!e4hO!P(ka~O!e4hO!P(ka!S'eX'r'eX~OQ!QOSVOTVO[$gO^0lO_$ZO`9yOa9yOd$aOsVOtVOuVO}$eO!i$qO!j0mO!l$lO!q0eO!t7_O'Q#VO'T$YO'Z%eO'^UO'g$[O~O#V7aO!P&sX!e&sX~P&L]O!S7cO'r(pO~Ow!POy5bO$|*xO(P*PO~O!S+UOR&la!e&la~Oo0wO!S+UOR&la!e&la~Oo0wOR&la!e&la~O(P*POR$yi!e$yi~Oy7fO~P2gOo7gOy7fO(P*PO~O(P*PORni!eni~O(P*POR&va!e&va~O(P*OOR&va!e&va~OS,^OT,^OZ,^O_,^Od,^Oo,^Os,^Ou,^Oy,^O!S,^O!e,^O!l,^O!q,[O!t,^O!y,^O#O,^O#P,^O#Q,^O#R,^O'Q,^O'Z%eO'^UO'g,ZO'r,[O'x,ZO'y,[O'z,[O'{,[O'|,]O'},]O(O,^O~O(P7iO(Q7iO(R7iO~P'!qO!P7kO~P#KkO!P&ei!e&ei~P2gO'r(pOv!hi!e!hi~O!S7mO~O(P*POP$Xi!e$Xi~Ov$^q!e$^q~P2gOw!POy7oO~Ow!POy7oO#Q7rO$|*xO~Oy7tO~Oy7uO~Oy7vO(P*PO~Ow!POy7oO$|*xO(P*PO~Oo7{Oy7zO(P*PO~O!e2sO!P(ti~O(P*PO!P%}X!e%}X~O!P%ai!e%ai~P#4kO^8OO~O!e8TO['bXv$`i}'bX!l'bX!q'bX!t'bX'g'bX'q'bX(Q'bX~P@[OQ#[iS#[iT#[i[#[i^#[i_#[i`#[ia#[id#[is#[it#[iu#[iv$`i}#[i!i#[i!j#[i!l#[i!q#[i!t'bX#V#[i'Q#[i'T#[i'^#[i'g#[i'q'bX(Q'bX~P@[O#R#^a~P2gO#R8WO~O!Z3aO#R8XO'r(pO~Ov8[O~Oy8^O~P2gOy8`O~Oy6gO!P8aO~Ov8`Oy6gO~O!e3wOv(di~O(P*POv%Qi!e%Qi~O!e3|O!P(fi~O!e3|O(P*PO!P(fi~O(P*PO!P&pa!e&pa~O(P8hOw(bX!e(bXy(bX~O(P*PO!S$wiy$wiw$wi$|$wiR$wio$wi!e$wi~O!e4ZOv(hi~Ov%Xi!e%Xi~P2gOo8kOv%Xi!e%Xi~O!P%ai!S!aX!e%ai'r!aX~P!KgO(P*PO!P%`i!e%`i~O!e4hO!P(ki~O#V8nO~P&L]O!P&sa!S'eX!e&sa'r'eX~O(P*POR$zq!e$zq~Oy8pO~P2gOy7zO~P2gO(P8rO(Q8rO(R8rO~O(P8rO(Q8rO(R8rO~P'!qO'r(pOv!hq!e!hq~O(P*POP$Xq!e$Xq~Ow!POy8uO$|*xO(P*PO~Ow!POy8uO~Oy8xO~P2gOy8zO~P2gOo8|Oy8zO(P*PO~OQ#[qS#[qT#[q[#[q^#[q_#[q`#[qa#[qd#[qs#[qt#[qu#[qv$`q}#[q!i#[q!j#[q!l#[q!q#[q#V#[q'Q#[q'T#[q'^#[q'g#[q~O!e9PO['bXv$`q}'bX!l'bX!q'bX!t'bX'g'bX'q'bX(Q'bX~P@[Oo'bX!t'bX#O'bX#P'bX#p'bX'q'bX'r'bX'x'bX'y'bX'z'bX'{'bX'|'bX'}'bX(O'bX(P'bX(Q'bX(R'bX(T'bX~P'2fO#R9UO~O!Z3aO#R9UO'r(pO~Oy9WO~O(P*POv%Qq!e%Qq~O!e3|O!P(fq~O(P*PO!P&pi!e&pi~O(P8hOw(ba!e(bay(ba~Ov%Xq!e%Xq~P2gO!P&si!S'eX!e&si'r'eX~O(P*PO!P%`q!e%`q~Oy9]O~P2gO(P9^O(Q9^O(R9^O~O'r(pOv!hy!e!hy~Ow!POy9_O~Ow!POy9_O$|*xO(P*PO~Oy9aO~P2gOQ#[yS#[yT#[y[#[y^#[y_#[y`#[ya#[yd#[ys#[yt#[yu#[yv$`y}#[y!i#[y!j#[y!l#[y!q#[y#V#[y'Q#[y'T#[y'^#[y'g#[y~O!e9dO['bXv$`y}'bX!l'bX!q'bX!t'bX'g'bX'q'bX(Q'bX~P@[Oo'bX!t'bX#O'bX#P'bX#p'bX'q'bX'r'bX'x'bX'y'bX'z'bX'{'bX'|'bX'}'bX(O'bX(P'bX(Q'bX(R'bX(T'bX~P'9eO!e9eO['bX}'bX!l'bX!q'bX!t'bX'g'bX'q'bX(Q'bX~P@[OQ#[iS#[iT#[i[#[i^#[i_#[i`#[ia#[id#[is#[it#[iu#[i}#[i!i#[i!j#[i!l#[i!q#[i!t'bX#V#[i'Q#[i'T#[i'^#[i'g#[i'q'bX(Q'bX~P@[O#R9hO~O(P*PO!P&pq!e&pq~Ov%Xy!e%Xy~P2gOw!POy9iO~Oy9jO~P2gOQ#[!RS#[!RT#[!R[#[!R^#[!R_#[!R`#[!Ra#[!Rd#[!Rs#[!Rt#[!Ru#[!Rv$`!R}#[!R!i#[!R!j#[!R!l#[!R!q#[!R#V#[!R'Q#[!R'T#[!R'^#[!R'g#[!R~O!e9kO['bX}'bX!l'bX!q'bX!t'bX'g'bX'q'bX(Q'bX~P@[OQ#[qS#[qT#[q[#[q^#[q_#[q`#[qa#[qd#[qs#[qt#[qu#[q}#[q!i#[q!j#[q!l#[q!q#[q!t'bX#V#[q'Q#[q'T#[q'^#[q'g#[q'q'bX(Q'bX~P@[O!e9nO['bX}'bX!l'bX!q'bX!t'bX'g'bX'q'bX(Q'bX~P@[OQ#[yS#[yT#[y[#[y^#[y_#[y`#[ya#[yd#[ys#[yt#[yu#[y}#[y!i#[y!j#[y!l#[y!q#[y!t'bX#V#[y'Q#[y'T#[y'^#[y'g#[y'q'bX(Q'bX~P@[OwbX~P$|OwjX}jX!tbX'qbX~P!6mOZ'SXd'XXo'SXw'kX!t'SX'q'SX'r'SX~O['SXd'SXw'SX}'SX!l'SX!q'SX#O'SX#P'SX#p'SX'g'SX'x'SX'y'SX'z'SX'{'SX'|'SX'}'SX(O'SX(P'SX(Q'SX(R'SX(T'SX~P'GTOP'SX}'kX!S'SX!e'SX!O'SXy'SX!P'SXX'SX!Z'SX#R'SXv'SX~P'GTO^9qO_9qO`9qOa9qO'T9oO~O!j:OO~P!.cOPoOQ!QOSVOTVOZeOd9tOsVOtVOuVO!U#bO!W#cO!X:zO!Z!YO#Y!_O#r9zO#{9{O$O!]O$b!`O$d!bO$f!cO'ZkO'^UO[#sXo#sXw#sX}#sX!l#sX!q#sX!t#sX#O#sX#P#sX#p#sX'g#sX'q#sX'r#sX'x#sX'y#sX'z#sX'{#sX'|#sX'}#sX(O#sX(P#sX(Q#sX(R#sX(T#sX~P'IxO#Q$uO~P!.cO}'kXP'SX!S'SX!e'SX!O'SXy'SX!P'SXX'SX!Z'SX#R'SXv'SX~P'GTOo#qX#O#qX#P#qX#p#qX'r#qX'x#qX'y#qX'z#qX'{#qX'|#qX'}#qX(O#qX(P#qX(R#qX(T#qX~P!.cOo#zX#O#zX#P#zX#p#zX'r#zX'x#zX'y#zX'z#zX'{#zX'|#zX'}#zX(O#zX(P#zX(R#zX(T#zX~P!.cOPoOQ!QOSVOTVOZeOd9tOsVOtVOuVO!U#bO!W#cO!X:zO!Z!YO#Y!_O#r9zO#{9{O$O!]O$b!`O$d!bO$f!cO'ZkO'^UO[#sao#saw#sa}#sa!l#sa!q#sa!t#sa#O#sa#P#sa#p#sa'g#sa'q#sa'r#sa'x#sa'y#sa'z#sa'{#sa'|#sa'}#sa(O#sa(P#sa(Q#sa(R#sa(T#sa~P'IxOo:YO#O:YO#P:VOw#sa~P!B}Ow$Ua~P#9vOQ'XXd'XX}iX~OQlXdlX}jX~O^:sO_:sO`:sOa:sO'T:_O~OQ'XXd'XX}hX~Ow#qa~P#9vOw#za~P#9vO!S&_Oo#za#O#za#P#za#p#za'r#za'x#za'y#za'z#za'{#za'|#za'}#za(O#za(P#za(R#za(T#za~P!.cO#Q*eO~P!.cOw#ci~P#9vO[#}O}#zO'x#hO(O#|O(Q#hO(R#fO(T#hOo#eiw#ei!l#ei!q#ei!t#ei#O#ei#P#ei#p#ei'q#ei'r#ei'y#ei'z#ei'{#ei'|#ei'}#ei~O'g#ei(P#ei~P((}O'g#gO(P#gO~P((}O[#}O}#zO'g#gO'x#hO'y#iO'z#iO(O#|O(P#gO(Q#hO(R#fO(T#hOo#eiw#ei!l#ei!t#ei#O#ei#P#ei#p#ei'q#ei'r#ei'{#ei'|#ei'}#ei~O!q#ei~P(*yO!q#jO~P(*yO[#}O}#zO!q#jO'g#gO'x#hO'y#iO'z#iO'{#kO(O#|O(P#gO(Q#hO(R#fO(T#hOo#eiw#ei!l#ei!t#ei#O#ei#P#ei#p#ei'q#ei'|#ei'}#ei~O'r#ei~P(,rO'r#lO~P(,rO[#}O}#zO!q#jO#P:VO'g#gO'r#lO'x#hO'y#iO'z#iO'{#kO(O#|O(P#gO(Q#hO(R#fO(T#hOo#eiw#ei!l#ei!t#ei#O#ei#p#ei'q#ei'|#ei~O'}#ei~P(.kO'}#mO~P(.kOo:YO#O:YO#P:VOw#ni~P$1xOo:YO#O:YO#P:VOw#si~P$3yOQ'XXd'XX}'kX~Ow#zi~P#9vOw$Ui~P#9vOd9}O~Ow#ca~P#9vOd:uO~OU'x_'v'P'O'^s!y'^'T'Z~",
    goto: "$Ku(vPPPPPPP(wPP)OPP)^PPPP)d-hP0f5aP7R7R8v7R>wD_DpPDvHQPPPPPPK`P! P! _PPPPP!!VP!$oP!$oPP!&oP!(rP!(w!)n!*f!*f!*f!(w!+]P!(w!.Q!.TPP!.ZP!(w!(w!(w!(wP!(w!(wP!(w!(w!.y!/dP!/dJ}J}J}PPPP!/d!.y!/sPP!$oP!0^!0a!0g!1h!1t!3t!3t!5r!7t!1t!1t!9p!;_!=O!>k!@U!Am!CS!De!1t!1tP!1tP!1t!1t!Et!1tP!Ge!1t!1tP!Ie!1tP!1t!7t!7t!1t!7t!1t!Kl!Mt!Mw!7t!1t!Mz!M}!M}!M}!NR!$oP!$oP!$oP! P! PP!N]! P! PP!Ni# }! PP! PP#!^##c##k#$Z#$_#$e#$e#$mP#&s#&s#&y#'o#'{! PP! PP#(]#(l! PP! PPP#(x#)W#)d#)|#)^! P! PP! P! P! PP#*S#*S#*Y#*`#*S#*S! P! PP#*m#*v#+Q#+Q#,x#.l#.x#.x#.{#.{5a5a5a5a5a5a5a5aP5a#/O#/U#/p#1{#2R#2b#6^#6d#6j#6|#7W#8w#9R#9b#9h#9n#9x#:S#:Y#:g#:m#:s#:}#;]#;g#=u#>R#>`#>f#>n#>u#?PPPPPPPP#?V#BaP#F^#Jx#Ls#Nr$&^P$&aPPP$)_$)h$)z$/U$1d$1m$3fP!(w$4`$7r$:i$>T$>^$>c$>fPPP$>i$A`$A|P$BaPPPPPPPPPP$BvP$EU$EX$E[$Eb$Ee$Eh$Ek$En$Et$HO$HR$HU$HX$H[$H_$Hb$He$Hh$Hk$Hn$Jt$Jw$Jz#*S$KW$K^$Ka$Kd$Kh$Kl$Ko$KrQ!tPT'V!s'Wi!SOlm!P!T$T$W$y%b)U*f/gQ'i#QR,n'l(OSOY[bfgilmop!O!P!T!Y!Z![!_!`!c!p!q!|!}#Q#U#Z#e#o#p#q#r#s#t#u#v#w#x#y#z#}$T$W$`$a$e$g$h$q$r$y%X%_%b&U&Y&[&b&u&z&|'P'a'l'n'o'}(W(Y(b(d(e(f(j(o(p(r(|)S)U)i*Z*f*i*k*l+Z+n+z,q,s,z-R-T-g-m-t.}/^/b/d/g0e0g0m0}1P1h1r1|3_3a3f3h3k4W4c4h4v4|5[5g5t6]6a7S7^7g7m7{8W8X8k8|9U9h9s9t9u9v9w9x9z9{9|9}:O:P:Q:R:S:T:U:V:W:X:Y:Z:e:f:gS(z$v-oQ*p&eQ*t&hQ-k(yQ-y)ZW0Z+Q0Y4Z7UR4Y0[&w!RObfgilmop!O!P!T!Y!Z![!_!`!c!p#Q#e#o#p#q#r#s#t#u#v#w#x#y#z#}$T$W$e$g$h$q$r$y%_%b&U&Y&[&b&u'l'}(W(Y(b(f(j(o(p(r(|)S)U)i*Z*f*i*k*l+Z+n,s,z-T-g-m-t.}/^/b/d/g0e0g0m0}1h1r1|3_3a3f3h3k4W4c4h4v4|5[5g5t6]6a7S7^7g7m7{8W8X8k8|9U9h9u9v9w9x9z9{:O:P:Q:R:S:T:U:V:W:X:Y:Z:e:f#r]Ofgilmp!O!P!T!Z![#e#o#p#q#r#s#t#u#v#w#x#y#z#}$T$W%_%b&Y&['}(W(Y(|)i+n,s,z-m.}0}1h1|3_3a3k4W4v4|5g5t6]7S7g7{8W8X8k8|9U9hb#[b#Q$y'l(b)S)U*Z-t!h$bo!c!p$e$g$h$q$r&U&b&u(f(j(o(p(r*f*k+Z-T-g/b/d/g0e0g0m1r3f4c4h5[6a7^7m$b%k!Q!n$O$u%o%p%q%y%{&P&o&p&r'](q)s)x)y*O*P*R*V*[*^*e*n*w*x+U+V+h+o+}-i-v.U.`.p.t.x.y/Z/[/{/}0`0r0w1O1Y1Z1y2a2h2j2m2s2v3V3u3{3|4R4U4_4e4t5`5d5v6R6Y6p6v6x7c7r8g!W:y!Y!_!`*i*l/^3h9u9v9w9x9z9{:O:P:Q:R:S:T:U:V:W:X:Y:Z:e:fR:|%n$_%u!Q!n$O$u%o%p%q&P&o&p&r'](q)s)x)y*O*P*R*V*[*^*e*n*w*x+U+V+h+o+}-i-v.U.`.p.t.x.y/Z/[/{/}0`0r0w1O1Y1Z1y2a2h2j2m2s2v3V3u3{3|4R4U4_4e4t5`5d5v6R6Y6p6v6x7c7r8g$e%l!Q!n$O$u%n%o%p%q%y%{&P&o&p&r'](q)s)x)y*O*P*R*V*[*^*e*n*w*x+U+V+h+o+}-i-v.U.`.p.t.x.y/Z/[/{/}0`0r0w1O1Y1Z1y2a2h2j2m2s2v3V3u3{3|4R4U4_4e4t5`5d5v6R6Y6p6v6x7c7r8g'hZOY[fgilmop!O!P!T!Y!Z![!_!`!c!p!|!}#e#o#p#q#r#s#t#u#v#w#x#y#z#}$T$W$`$a$e$g$h$q$r%_%b%i%j&U&Y&[&b&u'a'}(W(Y(d(e(f(j(o(p(r(|)i)p)q*f*i*k*l+Z+n,s,z-R-T-g-m.i.}/^/b/d/g0e0g0m0}1h1r1|3_3a3f3h3k4W4c4h4v4|5[5g5t6]6a7S7^7g7m7{8W8X8k8|9U9h9s9t9u9v9w9x9z9{9|9}:O:P:Q:R:S:T:U:V:W:X:Y:Z:`:a:e:f:g:t:u:x$^%l!Q!n$O$u%n%o%p%q%y%{&P&p&r(q)s)x)y*O*P*R*V*[*^*e*n*w*x+U+V+h+o+}-i-v.U.`.p.t.x.y/Z/[/{/}0`0r0w1O1Y1y2a2h2j2m2s2v3V3u3{3|4R4U4_4e4t5`5d5v6R6Y6p6v6x7c7r8gQ&j!hQ&k!iQ&l!jQ&m!kQ&s!oQ)[%QQ)]%RQ)^%SQ)_%TQ)b%WQ+`&oS,R']1ZQ.W)`S/r*u4TR4n0s+yTOY[bfgilmop!O!P!Q!T!Y!Z![!_!`!c!n!p!q!|!}#Q#U#Z#e#o#p#q#r#s#t#u#v#w#x#y#z#}$O$T$W$`$a$e$g$h$q$r$u$y%X%_%b%i%j%n%o%p%q%y%{&P&U&Y&[&b&o&p&r&u&z&|'P']'a'l'n'o'}(W(Y(b(d(e(f(j(o(p(q(r(|)S)U)i)p)q)s)x)y*O*P*R*V*Z*[*^*e*f*i*k*l*n*w*x+U+V+Z+h+n+o+z+},q,s,z-R-T-g-i-m-t-v.U.`.i.p.t.x.y.}/Z/[/^/b/d/g/{/}0`0e0g0m0r0w0}1O1P1Y1Z1h1r1y1|2a2h2j2m2s2v3V3_3a3f3h3k3u3{3|4R4U4W4_4c4e4h4t4v4|5[5`5d5g5t5v6R6Y6]6a6p6v6x7S7^7c7g7m7r7{8W8X8g8k8|9U9h9s9t9u9v9w9x9z9{9|9}:O:P:Q:R:S:T:U:V:W:X:Y:Z:`:a:e:f:g:t:u:xQ'[!xQ'h#PQ)l%gU)r%m*T*WR.f)kQ,T']R5P1Z#t%s!Q!n$O$u%p%q&P&p&r(q)x)y*O*R*V*[*^*e*n*w+V+h+o+}-i-v.U.`.t.x.y/Z/[/{/}0`0r0w1O1Y1y2a2h2j2m2v3V3u3{3|4U4e4t5`5d5v6R6Y6p6v6x7c7r8gQ)x%oQ+_&oQ,U']n,^'b'c'd,c,f,h,l/m/n1_3n3q5T5U7kS.q)s2sQ/O*PQ/Q*SQ/q*uS0Q*x4RQ0a+U[0o+Z.j0g4h5y7^Q2v.pS4d0e2rQ4m0sQ5Q1ZQ6T3RQ6z4PQ7O4TQ7X4_R9Y8h&jVOfgilmop!O!P!T!Y!Z![!_!`!c!p#e#o#p#q#r#s#t#u#v#w#x#y#z#}$T$W$e$g$h$q$r%_%b&U&Y&[&b&u']'}(W(Y(b(f(j(o(p(r(|)i*f*i*k*l+Z+n,s,z-T-g-m.}/^/b/d/g0e0g0m0}1Z1h1r1|3_3a3f3h3k4W4c4h4v4|5[5g5t6]6a7S7^7g7m7{8W8X8k8|9U9h9u9v9w9x9z9{:O:P:Q:R:S:T:U:V:W:X:Y:Z:e:fU&g!g%P%[o,^'b'c'd,c,f,h,l/m/n1_3n3q5T5U7k$nsOfgilm!O!P!T!Y!Z![!_!`#e#o#p#q#r#s#t#u#v#w#x#y#z#}$T$W%_%b&Y'}(W(Y(|)i*i*l+n,s,z-m.}/^0}1h1|3_3a3h3k4W4v4|5g5t6]7S7g7{8W8X8k8|9U9h9u9v9z9{:O:P:Q:R:S:T:U:V:W:X:Y:eS$tp9xS&O!W#bS&Q!X#cQ&`!bQ*_&RQ*a&VS*d&[:fQ*h&^Q,T']Q-j(wQ/i*jQ0p+[S2f.X0qQ3]/_Q3^/`Q3g/hQ3i/kQ5P1ZU5b2R2g4lU7o5c5e5rQ8]6dS8u7p7qS9_8v8wR9i9`i{Ob!O!P!T$y%_%b)S)U)i-thxOb!O!P!T$y%_%b)S)U)i-tW/v*v/t3w6qQ/}*wW0[+Q0Y4Z7UQ3{/{Q6x3|R8g6v!h$do!c!p$e$g$h$q$r&U&b&u(f(j(o(p(r*f*k+Z-T-g/b/d/g0e0g0m1r3f4c4h5[6a7^7mQ&d!dQ&f!fQ&n!mW&x!q%X&|1PQ'S!rQ)X$}Q)Y%OQ)a%VU)d%Y'T'UQ*s&hS+s&z'PS-Y(k1sQ-u)WQ-x)ZS.a)e)fS0x+c/sQ1S+zQ1W+{S1v-_-`Q2k.bQ3s/pQ5]1xR5h2V${sOfgilmp!O!P!T!Y!Z![!_!`#e#o#p#q#r#s#t#u#v#w#x#y#z#}$T$W%_%b&Y&['}(W(Y(|)i*i*l+n,s,z-m.}/^0}1h1|3_3a3h3k4W4v4|5g5t6]7S7g7{8W8X8k8|9U9h9u9v9w9x9z9{:O:P:Q:R:S:T:U:V:W:X:Y:Z:e:f$zsOfgilmp!O!P!T!Y!Z![!_!`#e#o#p#q#r#s#t#u#v#w#x#y#z#}$T$W%_%b&Y&['}(W(Y(|)i*i*l+n,s,z-m.}/^0}1h1|3_3a3h3k4W4v4|5g5t6]7S7g7{8W8X8k8|9U9h9u9v9w9x9z9{:O:P:Q:R:S:T:U:V:W:X:Y:Z:e:fR3]/_V&T!Y!`*i!i$lo!c!p$e$g$h$q$r&U&b&u(f(j(o(p(r*f*k+Z-T-g/b/d/g0e0g0m1r3f4c4h5[6a7^7m!k$^o!c!p$e$g$h$q$r&U&b&u(b(f(j(o(p(r*f*k+Z-T-g/b/d/g0e0g0m1r3f4c4h5[6a7^7m!i$co!c!p$e$g$h$q$r&U&b&u(f(j(o(p(r*f*k+Z-T-g/b/d/g0e0g0m1r3f4c4h5[6a7^7m&e^Ofgilmop!O!P!T!Y!Z![!_!`!c!p#e#o#p#q#r#s#t#u#v#w#x#y#z#}$T$W$e$g$h$q$r%_%b&U&Y&[&b&u'}(W(Y(f(j(o(p(r(|)i*f*i*k*l+Z+n,s,z-T-g-m.}/^/b/d/g0e0g0m0}1h1r1|3_3a3f3h3k4W4c4h4v4|5[5g5t6]6a7S7^7g7m7{8W8X8k8|9U9h9u9v9w9x9z9{:O:P:Q:R:S:T:U:V:W:X:Y:Z:e:fR(l$fQ-[(kR5Y1sQ(S#|S({$v-oS-Z(k1sQ-l(yW/u*v/t3w6qS1w-_-`Q3v/vR5^1xQ'e#Or,e'b'c'd'j'p)u,c,f,h,l/m/n1_3n3q5U6fR,o'mk,a'b'c'd,c,f,h,l/m/n1_3n3q5UQ'f#Or,e'b'c'd'j'p)u,c,f,h,l/m/n1_3n3q5U6fR,p'mR*g&]X/c*f/d/g3f!}aOb!O!P!T#z$v$y%_%b'}(y)S)U)i)s*f*v*w+Q+Z,s-o-t.j/b/d/g/t/{0Y0g1h2s3f3w3|4Z4h5y6a6q6v7U7^Q3`/aQ6_3bQ8Y6`R9V8Z${rOfgilmp!O!P!T!Y!Z![!_!`#e#o#p#q#r#s#t#u#v#w#x#y#z#}$T$W%_%b&Y&['}(W(Y(|)i*i*l+n,s,z-m.}/^0}1h1|3_3a3h3k4W4v4|5g5t6]7S7g7{8W8X8k8|9U9h9u9v9w9x9z9{:O:P:Q:R:S:T:U:V:W:X:Y:Z:e:f#nfOfglmp!O!P!T!Z![#e#o#p#q#r#s#t#u#v#w#x#z#}$T$W%_%b&Y&['}(W(Y(|)i+n,s,z-m.}0}1h1|3_3a3k4W4v4|5g5t6]7S7g7{8W8X8k8|9U9h!T9u!Y!_!`*i*l/^3h9u9v9x9z9{:O:P:Q:R:S:T:U:V:W:X:Y:e:f#rfOfgilmp!O!P!T!Z![#e#o#p#q#r#s#t#u#v#w#x#y#z#}$T$W%_%b&Y&['}(W(Y(|)i+n,s,z-m.}0}1h1|3_3a3k4W4v4|5g5t6]7S7g7{8W8X8k8|9U9h!X9u!Y!_!`*i*l/^3h9u9v9w9x9z9{:O:P:Q:R:S:T:U:V:W:X:Y:Z:e:f$srOfglmp!O!P!T!Y!Z![!_!`#e#o#p#q#r#s#t#u#v#w#x#z#}$T$W%_%b&Y&['}(W(Y(|)i*i*l+n,s,z-m.}/^0}1h1|3_3a3h3k4W4v4|5g5t6]7S7g7{8W8X8k8|9U9h9u9v9x9z9{:O:P:Q:R:S:T:U:V:W:X:Y:e:f#U#oh#d$P$Q$V$s%^&W&X'q't'u'v'w'x'y'z'{'|(O(U([(`*b*c,r,w,y-n0z1i1l1}3P4w5V5a6^6e7R7e7h7s7y8j8q8{9[9b}:P&S&]/k3[6d:[:]:c:d:h:j:k:l:m:n:o:p:q:r:v:w:{#W#ph#d$P$Q$V$s%^&W&X'q'r't'u'v'w'x'y'z'{'|(O(U([(`*b*c,r,w,y-n0z1i1l1}3P4w5V5a6^6e7R7e7h7s7y8j8q8{9[9b!P:Q&S&]/k3[6d:[:]:c:d:h:i:j:k:l:m:n:o:p:q:r:v:w:{#S#qh#d$P$Q$V$s%^&W&X'q'u'v'w'x'y'z'{'|(O(U([(`*b*c,r,w,y-n0z1i1l1}3P4w5V5a6^6e7R7e7h7s7y8j8q8{9[9b{:R&S&]/k3[6d:[:]:c:d:h:k:l:m:n:o:p:q:r:v:w:{#Q#rh#d$P$Q$V$s%^&W&X'q'v'w'x'y'z'{'|(O(U([(`*b*c,r,w,y-n0z1i1l1}3P4w5V5a6^6e7R7e7h7s7y8j8q8{9[9by:S&S&]/k3[6d:[:]:c:d:h:l:m:n:o:p:q:r:v:w:{#O#sh#d$P$Q$V$s%^&W&X'q'w'x'y'z'{'|(O(U([(`*b*c,r,w,y-n0z1i1l1}3P4w5V5a6^6e7R7e7h7s7y8j8q8{9[9bw:T&S&]/k3[6d:[:]:c:d:h:m:n:o:p:q:r:v:w:{!|#th#d$P$Q$V$s%^&W&X'q'x'y'z'{'|(O(U([(`*b*c,r,w,y-n0z1i1l1}3P4w5V5a6^6e7R7e7h7s7y8j8q8{9[9bu:U&S&]/k3[6d:[:]:c:d:h:n:o:p:q:r:v:w:{!x#vh#d$P$Q$V$s%^&W&X'q'z'{'|(O(U([(`*b*c,r,w,y-n0z1i1l1}3P4w5V5a6^6e7R7e7h7s7y8j8q8{9[9bq:W&S&]/k3[6d:[:]:c:d:h:p:q:r:v:w:{!v#wh#d$P$Q$V$s%^&W&X'q'{'|(O(U([(`*b*c,r,w,y-n0z1i1l1}3P4w5V5a6^6e7R7e7h7s7y8j8q8{9[9bo:X&S&]/k3[6d:[:]:c:d:h:q:r:v:w:{$]#{h#`#d$P$Q$V$s%^&S&W&X&]'q'r's't'u'v'w'x'y'z'{'|(O(U([(`*b*c,r,w,y-n/k0z1i1l1}3P3[4w5V5a6^6d6e7R7e7h7s7y8j8q8{9[9b:[:]:c:d:h:i:j:k:l:m:n:o:p:q:r:v:w:{${jOfgilmp!O!P!T!Y!Z![!_!`#e#o#p#q#r#s#t#u#v#w#x#y#z#}$T$W%_%b&Y&['}(W(Y(|)i*i*l+n,s,z-m.}/^0}1h1|3_3a3h3k4W4v4|5g5t6]7S7g7{8W8X8k8|9U9h9u9v9w9x9z9{:O:P:Q:R:S:T:U:V:W:X:Y:Z:e:f$v!aOfgilmp!O!P!T!Y!Z!_!`#e#o#p#q#r#s#t#u#v#w#x#y#z#}$T$W%_%b&Y&['}(W(Y(|)i*i*l+n,s,z-m.}/^0}1h1|3_3a3h3k4W4v4|5g5t6]7S7g7{8W8X8k8|9U9h9u9v9w9x9z:O:P:Q:R:S:T:U:V:W:X:Y:Z:e:fQ&Y![Q&Z!]R:e9{#rpOfgilmp!O!P!T!Z![#e#o#p#q#r#s#t#u#v#w#x#y#z#}$T$W%_%b&Y&['}(W(Y(|)i+n,s,z-m.}0}1h1|3_3a3k4W4v4|5g5t6]7S7g7{8W8X8k8|9U9hQ&[!^!W9x!Y!_!`*i*l/^3h9u9v9w9x9z9{:O:P:Q:R:S:T:U:V:W:X:Y:Z:e:fR:f:zR$moR-f(rR$wqT(}$v-oQ/f*fS3d/d/gR6c3fQ3m/mQ3p/nQ6i3nR6l3qQ$zwQ)V${Q*q&fQ+f&qQ+i&sQ-w)YW.Z)b+j+k+lS/X*]+gW2b.W.[.].^U3W/Y/]0yU5o2c2d2eS6W3X3ZS7w5p5qS8Q6V6XQ8y7xS8}8R8SR9c9O^|O!O!P!T%_%b)iX)R$y)S)U-tQ&r!nQ*^&PQ*|&jQ+P&kQ+T&lQ+W&mQ+]&nQ+l&sQ-})[Q.Q)]Q.T)^Q.V)_Q.Y)aQ.^)bQ2S-uQ2e.WR4U0VU+a&o*u4TR4o0sQ+Y&mQ+k&sS.])b+l^0v+_+`/q/r4m4n7OS2d.W.^S4Q0R0SR5q2eS0R*x4RQ0a+UR7X4_U+d&o*u4TR4p0sQ*z&jQ+O&kQ+S&lQ+g&qQ+j&sS-{)[*|S.P)]+PS.S)^+TU.[)b+k+lQ/Y*]Q0X*{Q0q+[Q2X-|Q2Y-}Q2].QQ2_.TU2c.W.].^Q2g.XS3Z/]0yS5c2R4lQ5j2ZS5p2d2eQ6X3XS7q5e5rQ7x5qQ8R6VQ8v7pQ9O8SR9`8wQ0T*xR6|4RQ*y&jQ*}&kU-z)[*z*|U.O)]+O+PS2W-{-}S2[.P.QQ4X0ZQ5i2YQ5k2]R7T4YQ/w*vQ3t/tQ6r3wR8d6qQ*{&jS-|)[*|Q2Z-}Q4X0ZR7T4YQ+R&lU.R)^+S+TS2^.S.TR5l2_Q0]+QQ4V0YQ7V4ZR8l7UQ+[&nS.X)a+]S2R-u.YR5e2SQ0i+ZQ4f0gQ7`4hR8m7^Q.m)sQ0i+ZQ2p.jQ4f0gQ5|2sQ7`4hQ7}5yR8m7^Q0i+ZR4f0gX'O!q%X&|1PX&{!q%X&|1PW'O!q%X&|1PS+u&z'PR1U+z_|O!O!P!T%_%b)iQ%a!PS)h%_%bR.d)i$^%u!Q!n$O$u%o%p%q&P&o&p&r'](q)s)x)y*O*P*R*V*[*^*e*n*w*x+U+V+h+o+}-i-v.U.`.p.t.x.y/Z/[/{/}0`0r0w1O1Y1Z1y2a2h2j2m2s2v3V3u3{3|4R4U4_4e4t5`5d5v6R6Y6p6v6x7c7r8gQ*U%yR*X%{$c%n!Q!n$O$u%o%p%q%y%{&P&o&p&r'](q)s)x)y*O*P*R*V*[*^*e*n*w*x+U+V+h+o+}-i-v.U.`.p.t.x.y/Z/[/{/}0`0r0w1O1Y1Z1y2a2h2j2m2s2v3V3u3{3|4R4U4_4e4t5`5d5v6R6Y6p6v6x7c7r8gW)t%m%x*T*WQ.e)jR2{.vR.m)sR5|2sQ'W!sR,O'WQ!TOQ$TlQ$WmQ%b!P[%|!T$T$W%b)U/gQ)U$yR/g*f$b%i!Q!n$O$u%o%p%q%y%{&P&o&p&r'](q)s)x)y*O*P*R*V*[*^*e*n*w*x+U+V+h+o+}-i-v.U.`.p.t.x.y/Z/[/{/}0`0r0w1O1Y1Z1y2a2h2j2m2s2v3V3u3{3|4R4U4_4e4t5`5d5v6R6Y6p6v6x7c7r8g[)n%i)p.i:`:t:xQ)p%jQ.i)qQ:`%nQ:t:aR:x:uQ!vUR'Y!vS!OO!TU%]!O%_)iQ%_!PR)i%b#rYOfgilmp!O!P!T!Z![#e#o#p#q#r#s#t#u#v#w#x#y#z#}$T$W%_%b&Y&['}(W(Y(|)i+n,s,z-m.}0}1h1|3_3a3k4W4v4|5g5t6]7S7g7{8W8X8k8|9U9hh!yY!|#U$`'a'n(d,q-R9s9|:gQ!|[b#Ub#Q$y'l(b)S)U*Z-t!h$`o!c!p$e$g$h$q$r&U&b&u(f(j(o(p(r*f*k+Z-T-g/b/d/g0e0g0m1r3f4c4h5[6a7^7mQ'a!}Q'n#ZQ(d$aQ,q'oQ-R(e!W9s!Y!_!`*i*l/^3h9u9v9w9x9z9{:O:P:Q:R:S:T:U:V:W:X:Y:Z:e:fQ9|9tR:g9}Q-U(gR1p-UQ1t-[R5Z1tQ,c'bQ,f'cQ,h'dW1`,c,f,h5UR5U1_Q/d*fS3c/d3fR3f/gfbO!O!P!T$y%_%b)S)U)i-tp#Wb'}(y.j/b/t/{0Y0g1h5y6a6q6v7U7^Q'}#zS(y$v-oQ.j)sW/b*f/d/g3fQ/t*vQ/{*wQ0Y+QQ0g+ZQ1h,sQ5y2sQ6q3wQ6v3|Q7U4ZR7^4hQ,t(OQ1g,rT1j,t1gS(X$Q([Q(^$VU,x(X(^,}R,}(`Q(s$mR-h(sQ-p)OR2P-pQ3n/mQ3q/nT6j3n3qQ)S$yS-r)S-tR-t)UQ4`0aR7Y4``0t+^+_+`+a+d/q/r7OR4q0tQ8i6zR9Z8iQ4S0TR6}4SQ3x/wQ6n3tT6s3x6nQ3}/|Q6t3zU6y3}6t8eR8e6uQ4[0]Q7Q4VT7W4[7QhzOb!O!P!T$y%_%b)S)U)i-tQ$|xW%Zz$|%f)v$b%f!Q!n$O$u%o%p%q%y%{&P&o&p&r'](q)s)x)y*O*P*R*V*[*^*e*n*w*x+U+V+h+o+}-i-v.U.`.p.t.x.y/Z/[/{/}0`0r0w1O1Y1Z1y2a2h2j2m2s2v3V3u3{3|4R4U4_4e4t5`5d5v6R6Y6p6v6x7c7r8gR)v%nS4i0i0nS7]4f4gT7b4i7]W&z!q%X&|1PS+r&z+zR+z'PQ1Q+wR4z1QU1[,S,T,UR5R1[S3S/Q7OR6U3SQ2t.mQ5x2pT5}2t5xQ.z)zR3O.z^_O!O!P!T%_%b)iY#Xb$y)S)U-t$l#_fgilmp!Y!Z![!_!`#e#o#p#q#r#s#t#u#v#w#x#y#z#}$T$W&Y&['}(W(Y(|*i*l+n,s,z-m.}/^0}1h1|3_3a3h3k4W4v4|5g5t6]7S7g7{8W8X8k8|9U9h9u9v9w9x9z9{:O:P:Q:R:S:T:U:V:W:X:Y:Z:e:f!h$io!c!p$e$g$h$q$r&U&b&u(f(j(o(p(r*f*k+Z-T-g/b/d/g0e0g0m1r3f4c4h5[6a7^7mS'j#Q'lQ-P(bR/V*Z&v!RObfgilmop!O!P!T!Y!Z![!_!`!c!p#Q#e#o#p#q#r#s#t#u#v#w#x#y#z#}$T$W$e$g$h$q$r$y%_%b&U&Y&[&b&u'l'}(W(Y(b(f(j(o(p(r(|)S)U)i*Z*f*i*k*l+Z+n,s,z-T-g-m-t.}/^/b/d/g0e0g0m0}1h1r1|3_3a3f3h3k4W4c4h4v4|5[5g5t6]6a7S7^7g7m7{8W8X8k8|9U9h9u9v9w9x9z9{:O:P:Q:R:S:T:U:V:W:X:Y:Z:e:f[!{Y[#U#Z9s9tW&{!q%X&|1P['`!|!}'n'o9|9}S(c$`$aS+t&z'PU,X'a,q:gS-Q(d(eQ1T+zR1n-RS%t!Q&oQ&q!nQ(V$OQ(w$uS)w%o.pQ)z%pQ)}%qS*]&P&rQ+e&pQ,S']Q-d(qQ.l)sU.w)x)y2vS/O*O*PQ/P*RQ/T*VQ/W*[Q/]*^Q/`*eQ/l*nQ/|*wS0S*x4RQ0a+UQ0c+VQ0y+hQ0{+oQ1X+}Q1{-iQ2T-vQ2`.UQ2i.`Q2z.tQ2|.xQ2}.yQ3X/ZQ3Y/[S3z/{/}Q4^0`Q4l0rQ4s0wQ4x1OQ4}1YQ5O1ZQ5_1yQ5n2aQ5r2hQ5u2jQ5w2mQ5{2sQ6V3VQ6o3uQ6u3{Q6w3|Q7P4UQ7X4_Q7[4eQ7d4tQ7n5`Q7p5dQ7|5vQ8P6RQ8S6YQ8c6pS8f6v6xQ8o7cQ8w7rR9X8g$^%m!Q!n$O$u%o%p%q&P&o&p&r'](q)s)x)y*O*P*R*V*[*^*e*n*w*x+U+V+h+o+}-i-v.U.`.p.t.x.y/Z/[/{/}0`0r0w1O1Y1Z1y2a2h2j2m2s2v3V3u3{3|4R4U4_4e4t5`5d5v6R6Y6p6v6x7c7r8gQ)j%nQ*T%yR*W%{$y%h!Q!n$O$u%i%j%n%o%p%q%y%{&P&o&p&r'](q)p)q)s)x)y*O*P*R*V*[*^*e*n*w*x+U+V+h+o+}-i-v.U.`.i.p.t.x.y/Z/[/{/}0`0r0w1O1Y1Z1y2a2h2j2m2s2v3V3u3{3|4R4U4_4e4t5`5d5v6R6Y6p6v6x7c7r8g:`:a:t:u:x'pWOY[bfgilmop!O!P!T!Y!Z![!_!`!c!p!|!}#Q#U#Z#e#o#p#q#r#s#t#u#v#w#x#y#z#}$T$W$`$a$e$g$h$q$r$y%_%b&U&Y&[&b&u'a'l'n'o'}(W(Y(b(d(e(f(j(o(p(r(|)S)U)i*Z*f*i*k*l+Z+n,q,s,z-R-T-g-m-t.}/^/b/d/g0e0g0m0}1h1r1|3_3a3f3h3k4W4c4h4v4|5[5g5t6]6a7S7^7g7m7{8W8X8k8|9U9h9s9t9u9v9w9x9z9{9|9}:O:P:Q:R:S:T:U:V:W:X:Y:Z:e:f:g$x%g!Q!n$O$u%i%j%n%o%p%q%y%{&P&o&p&r'](q)p)q)s)x)y*O*P*R*V*[*^*e*n*w*x+U+V+h+o+}-i-v.U.`.i.p.t.x.y/Z/[/{/}0`0r0w1O1Y1Z1y2a2h2j2m2s2v3V3u3{3|4R4U4_4e4t5`5d5v6R6Y6p6v6x7c7r8g:`:a:t:u:x_&y!q%X&z&|'P+z1PR,V']$zrOfgilmp!O!P!T!Y!Z![!_!`#e#o#p#q#r#s#t#u#v#w#x#y#z#}$T$W%_%b&Y&['}(W(Y(|)i*i*l+n,s,z-m.}/^0}1h1|3_3a3h3k4W4v4|5g5t6]7S7g7{8W8X8k8|9U9h9u9v9w9x9z9{:O:P:Q:R:S:T:U:V:W:X:Y:Z:e:f!j$]o!c!p$e$g$h$q$r&U&b&u(b(f(j(o(p(r*f*k+Z-T-g/b/d/g0e0g0m1r3f4c4h5[6a7^7mQ,T']R5P1Z_}O!O!P!T%_%b)i^|O!O!P!T%_%b)iQ#YbX)R$y)S)U-tbhO!O!T3_6]8W8X9U9hS#`f9uQ#dgQ$PiQ$QlQ$VmQ$spW%^!P%_%b)iU&S!Y!`*iQ&W!ZQ&X![Q&]!_Q'q#eQ'r#oS's#p:QQ't#qQ'u#rQ'v#sQ'w#tQ'x#uQ'y#vQ'z#wQ'{#xQ'|#yQ(O#zQ(U#}Q([$TQ(`$WQ*b&YQ*c&[Q,r'}Q,w(WQ,y(YQ-n(|Q/k*lQ0z+nQ1i,sQ1l,zQ1}-mQ3P.}Q3[/^Q4w0}Q5V1hQ5a1|Q6^3aQ6d3hQ6e3kQ7R4WQ7e4vQ7h4|Q7s5gQ7y5tQ8j7SQ8q7gQ8{7{Q9[8kQ9b8|Q:[9wQ:]9xQ:c9zQ:d9{Q:h:OQ:i:PQ:j:RQ:k:SQ:l:TQ:m:UQ:n:VQ:o:WQ:p:XQ:q:YQ:r:ZQ:v:eQ:w:fR:{9v^tO!O!P!T%_%b)i$`#afgilmp!Y!Z![!_!`#e#o#p#q#r#s#t#u#v#w#x#y#z#}$T$W&Y&['}(W(Y(|*i*l+n,s,z-m.}/^0}1h1|3a3h3k4W4v4|5g5t7S7g7{8k8|9u9v9w9x9z9{:O:P:Q:R:S:T:U:V:W:X:Y:Z:e:fQ6[3_Q8V6]Q9R8WQ9T8XQ9g9UR9m9hQ&V!YQ&^!`R/h*iQ$joQ&a!cQ&t!pU(g$e$g(jS(n$h0eQ(u$qQ(v$rQ*`&UQ*m&bQ+p&uQ-S(fS-b(o4cQ-c(pQ-e(rW/a*f/d/g3fQ/j*kW0f+Z0g4h7^Q1o-TQ1z-gQ3b/bQ4k0mQ5X1rQ7l5[Q8Z6aR8t7m!h$_o!c!p$e$g$h$q$r&U&b&u(f(j(o(p(r*f*k+Z-T-g/b/d/g0e0g0m1r3f4c4h5[6a7^7mR-P(b'qXOY[bfgilmop!O!P!T!Y!Z![!_!`!c!p!|!}#Q#U#Z#e#o#p#q#r#s#t#u#v#w#x#y#z#}$T$W$`$a$e$g$h$q$r$y%_%b&U&Y&[&b&u'a'l'n'o'}(W(Y(b(d(e(f(j(o(p(r(|)S)U)i*Z*f*i*k*l+Z+n,q,s,z-R-T-g-m-t.}/^/b/d/g0e0g0m0}1h1r1|3_3a3f3h3k4W4c4h4v4|5[5g5t6]6a7S7^7g7m7{8W8X8k8|9U9h9s9t9u9v9w9x9z9{9|9}:O:P:Q:R:S:T:U:V:W:X:Y:Z:e:f:g$zqOfgilmp!O!P!T!Y!Z![!_!`#e#o#p#q#r#s#t#u#v#w#x#y#z#}$T$W%_%b&Y&['}(W(Y(|)i*i*l+n,s,z-m.}/^0}1h1|3_3a3h3k4W4v4|5g5t6]7S7g7{8W8X8k8|9U9h9u9v9w9x9z9{:O:P:Q:R:S:T:U:V:W:X:Y:Z:e:f!i$fo!c!p$e$g$h$q$r&U&b&u(f(j(o(p(r*f*k+Z-T-g/b/d/g0e0g0m1r3f4c4h5[6a7^7m&d^Ofgilmop!O!P!T!Y!Z![!_!`!c!p#e#o#p#q#r#s#t#u#v#w#x#y#z#}$T$W$e$g$h$q$r%_%b&U&Y&[&b&u'}(W(Y(f(j(o(p(r(|)i*f*i*k*l+Z+n,s,z-T-g-m.}/^/b/d/g0e0g0m0}1h1r1|3_3a3f3h3k4W4c4h4v4|5[5g5t6]6a7S7^7g7m7{8W8X8k8|9U9h9u9v9w9x9z9{:O:P:Q:R:S:T:U:V:W:X:Y:Z:e:f[!zY[$`$a9s9t['_!|!}(d(e9|9}W)o%i%j:`:aU,W'a-R:gW.h)p)q:t:uT2o.i:xQ(i$eQ(m$gR-W(jV(h$e$g(jR-^(kR-](k$znOfgilmp!O!P!T!Y!Z![!_!`#e#o#p#q#r#s#t#u#v#w#x#y#z#}$T$W%_%b&Y&['}(W(Y(|)i*i*l+n,s,z-m.}/^0}1h1|3_3a3h3k4W4v4|5g5t6]7S7g7{8W8X8k8|9U9h9u9v9w9x9z9{:O:P:Q:R:S:T:U:V:W:X:Y:Z:e:f!i$ko!c!p$e$g$h$q$r&U&b&u(f(j(o(p(r*f*k+Z-T-g/b/d/g0e0g0m1r3f4c4h5[6a7^7mS'g#O'pj,a'b'c'd,c,f,h,l/m/n1_3n3q5UQ,m'jQ.u)uR8_6f`,b'b'c'd,c,f,h1_5UQ1e,lX3l/m/n3n3qj,a'b'c'd,c,f,h,l/m/n1_3n3q5UQ7j5TR8s7k^uO!O!P!T%_%b)i$`#afgilmp!Y!Z![!_!`#e#o#p#q#r#s#t#u#v#w#x#y#z#}$T$W&Y&['}(W(Y(|*i*l+n,s,z-m.}/^0}1h1|3a3h3k4W4v4|5g5t7S7g7{8k8|9u9v9w9x9z9{:O:P:Q:R:S:T:U:V:W:X:Y:Z:e:fQ6Z3_Q8U6]Q9Q8WQ9S8XQ9f9UR9l9hR(Q#zR(P#zQ$SlR(]$TR$ooR$noR)Q$vR)P$vQ)O$vR2O-ohwOb!O!P!T$y%_%b)S)U)i-t$l!lz!Q!n$O$u$|%f%n%o%p%q%y%{&P&o&p&r'](q)s)v)x)y*O*P*R*V*[*^*e*n*w*x+U+V+h+o+}-i-v.U.`.p.t.x.y/Z/[/{/}0`0r0w1O1Y1Z1y2a2h2j2m2s2v3V3u3{3|4R4U4_4e4t5`5d5v6R6Y6p6v6x7c7r8gR${xR0b+UR0W*xR0U*xR6{4PR/y*vR/x*vR0P*wR0O*wR0_+QR0^+Q%XyObxz!O!P!Q!T!n$O$u$y$|%_%b%f%n%o%p%q%y%{&P&o&p&r'](q)S)U)i)s)v)x)y*O*P*R*V*[*^*e*n*w*x+U+V+h+o+}-i-t-v.U.`.p.t.x.y/Z/[/{/}0`0r0w1O1Y1Z1y2a2h2j2m2s2v3V3u3{3|4R4U4_4e4t5`5d5v6R6Y6p6v6x7c7r8gR0k+ZR0j+ZQ'R!qQ)c%XQ+w&|R4y1PX'Q!q%X&|1PR+y&|R+x&|T/S*S4TT/R*S4TR.o)sR.n)sR){%p",
    nodeNames: "⚠ | < > RawString Float LineComment BlockComment SourceFile ] InnerAttribute ! [ MetaItem self Metavariable super crate Identifier ScopedIdentifier :: QualifiedScope AbstractType impl SelfType MetaType TypeIdentifier ScopedTypeIdentifier ScopeIdentifier TypeArgList TypeBinding = Lifetime String Escape Char Boolean Integer } { Block ; ConstItem Vis pub ( in ) const BoundIdentifier : UnsafeBlock unsafe AsyncBlock async move IfExpression if LetDeclaration let LiteralPattern ArithOp MetaPattern SelfPattern ScopedIdentifier TuplePattern ScopedTypeIdentifier , StructPattern FieldPatternList FieldPattern ref mut FieldIdentifier .. RefPattern SlicePattern CapturedPattern ReferencePattern & MutPattern RangePattern ... OrPattern MacroPattern ParenthesizedTokens TokenBinding Identifier TokenRepetition ArithOp BitOp LogicOp UpdateOp CompareOp -> => ArithOp BracketedTokens BracedTokens _ else MatchExpression match MatchBlock MatchArm Attribute Guard UnaryExpression ArithOp DerefOp LogicOp ReferenceExpression TryExpression BinaryExpression ArithOp ArithOp BitOp BitOp BitOp BitOp LogicOp LogicOp AssignmentExpression TypeCastExpression as ReturnExpression return RangeExpression CallExpression ArgList AwaitExpression await FieldExpression GenericFunction BreakExpression break LoopLabel ContinueExpression continue IndexExpression ArrayExpression TupleExpression MacroInvocation UnitExpression ClosureExpression ParamList Parameter Parameter ParenthesizedExpression StructExpression FieldInitializerList ShorthandFieldInitializer FieldInitializer BaseFieldInitializer MatchArm WhileExpression while LoopExpression loop ForExpression for MacroInvocation MacroDefinition macro_rules MacroRule EmptyStatement ModItem mod DeclarationList AttributeItem ForeignModItem extern StructItem struct TypeParamList ConstrainedTypeParameter TraitBounds HigherRankedTraitBound RemovedTraitBound OptionalTypeParameter ConstParameter WhereClause where LifetimeClause TypeBoundClause FieldDeclarationList FieldDeclaration OrderedFieldDeclarationList UnionItem union EnumItem enum EnumVariantList EnumVariant TypeItem type FunctionItem default fn ParamList Parameter SelfParameter VariadicParameter VariadicParameter ImplItem TraitItem trait AssociatedType LetDeclaration UseDeclaration use ScopedIdentifier UseAsClause ScopedIdentifier UseList ScopedUseList UseWildcard ExternCrateDeclaration StaticItem static ExpressionStatement ExpressionStatement GenericType FunctionType ForLifetimes ParamList VariadicParameter Parameter VariadicParameter Parameter ReferenceType PointerType TupleType UnitType ArrayType MacroInvocation EmptyType DynamicType dyn BoundedType",
    maxTerm: 359,
    nodeProps: [
      ["isolate", -4, 4, 6, 7, 33, ""],
      ["group", -42, 4, 5, 14, 15, 16, 17, 18, 19, 33, 35, 36, 37, 40, 51, 53, 56, 101, 107, 111, 112, 113, 122, 123, 125, 127, 128, 130, 132, 133, 134, 137, 139, 140, 141, 142, 143, 144, 148, 149, 155, 157, 159, "Expression", -16, 22, 24, 25, 26, 27, 222, 223, 230, 231, 232, 233, 234, 235, 236, 237, 239, "Type", -20, 42, 161, 162, 165, 166, 169, 170, 172, 188, 190, 194, 196, 204, 205, 207, 208, 209, 217, 218, 220, "Statement", -17, 49, 60, 62, 63, 64, 65, 68, 74, 75, 76, 77, 78, 80, 81, 83, 84, 99, "Pattern"],
      ["openedBy", 9, "[", 38, "{", 47, "("],
      ["closedBy", 12, "]", 39, "}", 45, ")"]
    ],
    propSources: [rustHighlighting],
    skippedNodes: [0, 6, 7, 240],
    repeatNodeCount: 32,
    tokenData: "$%h_R!XOX$nXY5gYZ6iZ]$n]^5g^p$npq5gqr7Xrs9cst:Rtu;Tuv>vvwAQwxCbxy!+Tyz!,Vz{!-X{|!/_|}!0g}!O!1i!O!P!3v!P!Q!8[!Q!R!Bw!R![!Dr![!]#+q!]!^#-{!^!_#.}!_!`#1b!`!a#3o!a!b#6S!b!c#7U!c!}#8W!}#O#:T#O#P#;V#P#Q#Cb#Q#R#Dd#R#S#8W#S#T$n#T#U#8W#U#V#El#V#f#8W#f#g#Ic#g#o#8W#o#p$ S#p#q$!U#q#r$$f#r${$n${$|#8W$|4w$n4w5b#8W5b5i$n5i6S#8W6S;'S$n;'S;=`4s<%lO$nU$u]'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$nU%uV'_Q'OSOz&[z{&v{!P&[!P!Q'x!Q;'S&[;'S;=`*s<%lO&[S&aV'OSOz&[z{&v{!P&[!P!Q'x!Q;'S&[;'S;=`*s<%lO&[S&yVOz'`z{&v{!P'`!P!Q*y!Q;'S'`;'S;=`*m<%lO'`S'cVOz&[z{&v{!P&[!P!Q'x!Q;'S&[;'S;=`*s<%lO&[S'{UOz'`{!P'`!P!Q(_!Q;'S'`;'S;=`*m<%lO'`S(bUOz(t{!P(t!P!Q(_!Q;'S(t;'S;=`*a<%lO(tS(wVOz)^z{)z{!P)^!P!Q(_!Q;'S)^;'S;=`*g<%lO)^S)eV'PS'OSOz)^z{)z{!P)^!P!Q(_!Q;'S)^;'S;=`*g<%lO)^S)}UOz(tz{)z{!P(t!Q;'S(t;'S;=`*a<%lO(tS*dP;=`<%l(tS*jP;=`<%l)^S*pP;=`<%l'`S*vP;=`<%l&[S+OO'PSU+T]'_QOY+|YZ-xZr+|rs'`sz+|z{+O{!P+|!P!Q4y!Q#O+|#O#P'`#P;'S+|;'S;=`4m<%lO+|U,R]'_QOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$nU-P]'_QOY+|YZ-xZr+|rs'`sz+|z{.d{!P+|!P!Q/Z!Q#O+|#O#P'`#P;'S+|;'S;=`4m<%lO+|U-}V'_QOz&[z{&v{!P&[!P!Q'x!Q;'S&[;'S;=`*s<%lO&[Q.iV'_QOY.dYZ/OZr.ds#O.d#P;'S.d;'S;=`/T<%lO.dQ/TO'_QQ/WP;=`<%l.dU/`]'_QOY0XYZ3uZr0Xrs(tsz0Xz{.d{!P0X!P!Q/Z!Q#O0X#O#P(t#P;'S0X;'S;=`4a<%lO0XU0^]'_QOY1VYZ2XZr1Vrs)^sz1Vz{2w{!P1V!P!Q/Z!Q#O1V#O#P)^#P;'S1V;'S;=`4g<%lO1VU1`]'_Q'PS'OSOY1VYZ2XZr1Vrs)^sz1Vz{2w{!P1V!P!Q/Z!Q#O1V#O#P)^#P;'S1V;'S;=`4g<%lO1VU2bV'_Q'PS'OSOz)^z{)z{!P)^!P!Q(_!Q;'S)^;'S;=`*g<%lO)^U2|]'_QOY0XYZ3uZr0Xrs(tsz0Xz{2w{!P0X!P!Q.d!Q#O0X#O#P(t#P;'S0X;'S;=`4a<%lO0XU3zV'_QOz)^z{)z{!P)^!P!Q(_!Q;'S)^;'S;=`*g<%lO)^U4dP;=`<%l0XU4jP;=`<%l1VU4pP;=`<%l+|U4vP;=`<%l$nU5QV'_Q'PSOY.dYZ/OZr.ds#O.d#P;'S.d;'S;=`/T<%lO.d_5p]'_Q&|X'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_6rV'_Q&|X'OSOz&[z{&v{!P&[!P!Q'x!Q;'S&[;'S;=`*s<%lO&[_7b_ZX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q!_$n!_!`8a!`#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_8j]#PX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_9lV']Q'OS'^XOz&[z{&v{!P&[!P!Q'x!Q;'S&[;'S;=`*s<%lO&[_:[]'QX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_;^i'_Q'vW'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q!c$n!c!}<{!}#O$n#O#P&[#P#R$n#R#S<{#S#T$n#T#o<{#o${$n${$|<{$|4w$n4w5b<{5b5i$n5i6S<{6S;'S$n;'S;=`4s<%lO$n_=Uj'_Q_X'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q![<{![!c$n!c!}<{!}#O$n#O#P&[#P#R$n#R#S<{#S#T$n#T#o<{#o${$n${$|<{$|4w$n4w5b<{5b5i$n5i6S<{6S;'S$n;'S;=`4s<%lO$n_?P_(TP'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q!_$n!_!`@O!`#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_@X]#OX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_AZa!qX'_Q'OSOY$nYZ%nZr$nrs&[sv$nvwB`wz$nz{+O{!P$n!P!Q,z!Q!_$n!_!`@O!`#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_Bi]'}X'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_Cik'_Q'OSOYE^YZGfZrE^rsHvswE^wxFdxzE^z{Ih{!PE^!P!QKl!Q!cE^!c!}Lp!}#OE^#O#P!!l#P#RE^#R#SLp#S#TE^#T#oLp#o${E^${$|Lp$|4wE^4w5bLp5b5iE^5i6SLp6S;'SE^;'S;=`!*}<%lOE^_Ee_'_Q'OSOY$nYZ%nZr$nrs&[sw$nwxFdxz$nz{+O{!P$n!P!Q,z!Q#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_Fm]'_Q'OSsXOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_GmX'_Q'OSOw&[wxHYxz&[z{&v{!P&[!P!Q'x!Q;'S&[;'S;=`*s<%lO&[]HaV'OSsXOz&[z{&v{!P&[!P!Q'x!Q;'S&[;'S;=`*s<%lO&[]H{X'OSOw&[wxHYxz&[z{&v{!P&[!P!Q'x!Q;'S&[;'S;=`*s<%lO&[_Im_'_QOY+|YZ-xZr+|rs'`sw+|wxJlxz+|z{+O{!P+|!P!Q4y!Q#O+|#O#P'`#P;'S+|;'S;=`4m<%lO+|_Js]'_QsXOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_Kq_'_QOY+|YZ-xZr+|rs'`sw+|wxJlxz+|z{.d{!P+|!P!Q/Z!Q#O+|#O#P'`#P;'S+|;'S;=`4m<%lO+|_Lyl'_Q'OS'ZXOY$nYZ%nZr$nrs&[sw$nwxFdxz$nz{+O{!P$n!P!Q,z!Q![Nq![!c$n!c!}Nq!}#O$n#O#P&[#P#R$n#R#SNq#S#T$n#T#oNq#o${$n${$|Nq$|4w$n4w5bNq5b5i$n5i6SNq6S;'S$n;'S;=`4s<%lO$n_Nzj'_Q'OS'ZXOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q![Nq![!c$n!c!}Nq!}#O$n#O#P&[#P#R$n#R#SNq#S#T$n#T#oNq#o${$n${$|Nq$|4w$n4w5bNq5b5i$n5i6SNq6S;'S$n;'S;=`4s<%lO$n]!!qZ'OSOzHvz{!#d{!PHv!P!Q!$n!Q#iHv#i#j!%Z#j#lHv#l#m!'V#m;'SHv;'S;=`!*w<%lOHv]!#gXOw'`wx!$Sxz'`z{&v{!P'`!P!Q*y!Q;'S'`;'S;=`*m<%lO'`]!$XVsXOz&[z{&v{!P&[!P!Q'x!Q;'S&[;'S;=`*s<%lO&[]!$qWOw'`wx!$Sxz'`{!P'`!P!Q(_!Q;'S'`;'S;=`*m<%lO'`]!%`^'OSOz&[z{&v{!P&[!P!Q'x!Q![!&[![!c&[!c!i!&[!i#T&[#T#Z!&[#Z#o&[#o#p!({#p;'S&[;'S;=`*s<%lO&[]!&a['OSOz&[z{&v{!P&[!P!Q'x!Q![!'V![!c&[!c!i!'V!i#T&[#T#Z!'V#Z;'S&[;'S;=`*s<%lO&[]!'[['OSOz&[z{&v{!P&[!P!Q'x!Q![!(Q![!c&[!c!i!(Q!i#T&[#T#Z!(Q#Z;'S&[;'S;=`*s<%lO&[]!(V['OSOz&[z{&v{!P&[!P!Q'x!Q![Hv![!c&[!c!iHv!i#T&[#T#ZHv#Z;'S&[;'S;=`*s<%lO&[]!)Q['OSOz&[z{&v{!P&[!P!Q'x!Q![!)v![!c&[!c!i!)v!i#T&[#T#Z!)v#Z;'S&[;'S;=`*s<%lO&[]!){^'OSOz&[z{&v{!P&[!P!Q'x!Q![!)v![!c&[!c!i!)v!i#T&[#T#Z!)v#Z#q&[#q#rHv#r;'S&[;'S;=`*s<%lO&[]!*zP;=`<%lHv_!+QP;=`<%lE^_!+^]}X'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_!,`]!PX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_!-`_(QX'_QOY+|YZ-xZr+|rs'`sz+|z{+O{!P+|!P!Q4y!Q!_+|!_!`!._!`#O+|#O#P'`#P;'S+|;'S;=`4m<%lO+|_!.f]#OX'_QOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_!/h_(PX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q!_$n!_!`@O!`#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_!0p]!eX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_!1r`'gX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q!_$n!_!`@O!`!a!2t!a#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_!2}]#QX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_!4P^(OX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!O$n!O!P!4{!P!Q,z!Q#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_!5U`!lX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!O$n!O!P!6W!P!Q,z!Q!_$n!_!`!7Y!`#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_!6a]!tX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$nV!7c]'qP'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_!8c_'_Q'xXOY+|YZ-xZr+|rs'`sz+|z{!9b{!P+|!P!Q!:O!Q!_+|!_!`!._!`#O+|#O#P'`#P;'S+|;'S;=`4m<%lO+|_!9iV&}]'_QOY.dYZ/OZr.ds#O.d#P;'S.d;'S;=`/T<%lO.d_!:V]'_QUXOY!;OYZ3uZr!;Ors!>jsz!;Oz{!Aq{!P!;O!P!Q!:O!Q#O!;O#O#P!>j#P;'S!;O;'S;=`!Bk<%lO!;O_!;V]'_QUXOY!<OYZ2XZr!<Ors!=Ssz!<Oz{!@q{!P!<O!P!Q!:O!Q#O!<O#O#P!=S#P;'S!<O;'S;=`!Bq<%lO!<O_!<Z]'_QUX'PS'OSOY!<OYZ2XZr!<Ors!=Ssz!<Oz{!@q{!P!<O!P!Q!:O!Q#O!<O#O#P!=S#P;'S!<O;'S;=`!Bq<%lO!<O]!=]XUX'PS'OSOY!=SYZ)^Zz!=Sz{!=x{!P!=S!P!Q!?[!Q;'S!=S;'S;=`!@k<%lO!=S]!=}XUXOY!>jYZ(tZz!>jz{!=x{!P!>j!P!Q!?|!Q;'S!>j;'S;=`!@e<%lO!>j]!>oXUXOY!=SYZ)^Zz!=Sz{!=x{!P!=S!P!Q!?[!Q;'S!=S;'S;=`!@k<%lO!=S]!?aXUXOY!>jYZ(tZz!>jz{!?|{!P!>j!P!Q!?[!Q;'S!>j;'S;=`!@e<%lO!>jX!@RSUXOY!?|Z;'S!?|;'S;=`!@_<%lO!?|X!@bP;=`<%l!?|]!@hP;=`<%l!>j]!@nP;=`<%l!=S_!@x]'_QUXOY!;OYZ3uZr!;Ors!>jsz!;Oz{!@q{!P!;O!P!Q!Aq!Q#O!;O#O#P!>j#P;'S!;O;'S;=`!Bk<%lO!;OZ!AxX'_QUXOY!AqYZ/OZr!Aqrs!?|s#O!Aq#O#P!?|#P;'S!Aq;'S;=`!Be<%lO!AqZ!BhP;=`<%l!Aq_!BnP;=`<%l!;O_!BtP;=`<%l!<O_!CQjuX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q![!Dr![#O$n#O#P&[#P#R$n#R#S!Dr#S#U$n#U#V#!}#V#]$n#]#^!FZ#^#c$n#c#d#%u#d#i$n#i#j!FZ#j#l$n#l#m#(g#m;'S$n;'S;=`4s<%lO$n_!D{duX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q![!Dr![#O$n#O#P&[#P#R$n#R#S!Dr#S#]$n#]#^!FZ#^#i$n#i#j!FZ#j;'S$n;'S;=`4s<%lO$n_!Fbg'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q!R$n!R!S!Gy!S!T$n!T!U!K_!U!W$n!W!X!Le!X!Y$n!Y!Z!J]!Z#O$n#O#P&[#P#g$n#g#h!Mk#h;'S$n;'S;=`4s<%lO$n_!HQa'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q!S$n!S!T!IV!T!W$n!W!X!J]!X#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_!I^_'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q!Y$n!Y!Z!J]!Z#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_!Jf]uX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_!Kf_'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q!S$n!S!T!J]!T#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_!Ll_'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q!U$n!U!V!J]!V#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_!Mr_'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q#O$n#O#P&[#P#]$n#]#^!Nq#^;'S$n;'S;=`4s<%lO$n_!Nx_'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q#O$n#O#P&[#P#n$n#n#o# w#o;'S$n;'S;=`4s<%lO$n_#!O_'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q#O$n#O#P&[#P#X$n#X#Y!J]#Y;'S$n;'S;=`4s<%lO$n_##Ua'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q!R#$Z!R!S#$Z!S#O$n#O#P&[#P#R$n#R#S#$Z#S;'S$n;'S;=`4s<%lO$n_#$deuX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q!R#$Z!R!S#$Z!S#O$n#O#P&[#P#R$n#R#S#$Z#S#]$n#]#^!FZ#^#i$n#i#j!FZ#j;'S$n;'S;=`4s<%lO$n_#%|`'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q!Y#'O!Y#O$n#O#P&[#P#R$n#R#S#'O#S;'S$n;'S;=`4s<%lO$n_#'XduX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q!Y#'O!Y#O$n#O#P&[#P#R$n#R#S#'O#S#]$n#]#^!FZ#^#i$n#i#j!FZ#j;'S$n;'S;=`4s<%lO$n_#(nd'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q![#)|![!c$n!c!i#)|!i#O$n#O#P&[#P#R$n#R#S#)|#S#T$n#T#Z#)|#Z;'S$n;'S;=`4s<%lO$n_#*VhuX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q![#)|![!c$n!c!i#)|!i#O$n#O#P&[#P#R$n#R#S#)|#S#T$n#T#Z#)|#Z#]$n#]#^!FZ#^#i$n#i#j!FZ#j;'S$n;'S;=`4s<%lO$n_#+z_!SX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q![$n![!]#,y!]#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_#-S]dX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_#.U]yX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_#/W`#PX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q!^$n!^!_#0Y!_!`8a!`#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_#0c_'yX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q!_$n!_!`@O!`#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_#1k`oX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q!_$n!_!`8a!`!a#2m!a#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_#2v]#RX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_#3x`#PX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q!_$n!_!`8a!`!a#4z!a#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_#5T_'zX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q!_$n!_!`@O!`#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_#6]](RX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$nV#7_]'pP'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_#8cj'_Q'OS!yW'TPOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q![#8W![!c$n!c!}#8W!}#O$n#O#P&[#P#R$n#R#S#8W#S#T$n#T#o#8W#o${$n${$|#8W$|4w$n4w5b#8W5b5i$n5i6S#8W6S;'S$n;'S;=`4s<%lO$n_#:^][X'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$nU#;[Z'OSOz#;}z{#<k{!P#;}!P!Q#=V!Q#i#;}#i#j#=n#j#l#;}#l#m#?j#m;'S#;};'S;=`#C[<%lO#;}U#<UVrQ'OSOz&[z{&v{!P&[!P!Q'x!Q;'S&[;'S;=`*s<%lO&[U#<pVrQOz'`z{&v{!P'`!P!Q*y!Q;'S'`;'S;=`*m<%lO'`U#=[UrQOz'`{!P'`!P!Q(_!Q;'S'`;'S;=`*m<%lO'`U#=s^'OSOz&[z{&v{!P&[!P!Q'x!Q![#>o![!c&[!c!i#>o!i#T&[#T#Z#>o#Z#o&[#o#p#A`#p;'S&[;'S;=`*s<%lO&[U#>t['OSOz&[z{&v{!P&[!P!Q'x!Q![#?j![!c&[!c!i#?j!i#T&[#T#Z#?j#Z;'S&[;'S;=`*s<%lO&[U#?o['OSOz&[z{&v{!P&[!P!Q'x!Q![#@e![!c&[!c!i#@e!i#T&[#T#Z#@e#Z;'S&[;'S;=`*s<%lO&[U#@j['OSOz&[z{&v{!P&[!P!Q'x!Q![#;}![!c&[!c!i#;}!i#T&[#T#Z#;}#Z;'S&[;'S;=`*s<%lO&[U#Ae['OSOz&[z{&v{!P&[!P!Q'x!Q![#BZ![!c&[!c!i#BZ!i#T&[#T#Z#BZ#Z;'S&[;'S;=`*s<%lO&[U#B`^'OSOz&[z{&v{!P&[!P!Q'x!Q![#BZ![!c&[!c!i#BZ!i#T&[#T#Z#BZ#Z#q&[#q#r#;}#r;'S&[;'S;=`*s<%lO&[U#C_P;=`<%l#;}_#Ck]XX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_#Dm_'{X'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q!_$n!_!`@O!`#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_#Ewl'_Q'OS!yW'TPOY$nYZ%nZr$nrs#Gosw$nwx#H]xz$nz{+O{!P$n!P!Q,z!Q![#8W![!c$n!c!}#8W!}#O$n#O#P&[#P#R$n#R#S#8W#S#T$n#T#o#8W#o${$n${$|#8W$|4w$n4w5b#8W5b5i$n5i6S#8W6S;'S$n;'S;=`4s<%lO$n]#GvV'OS'^XOz&[z{&v{!P&[!P!Q'x!Q;'S&[;'S;=`*s<%lO&[_#Hd_'_Q'OSOYE^YZGfZrE^rsHvswE^wxFdxzE^z{Ih{!PE^!P!QKl!Q#OE^#O#P!!l#P;'SE^;'S;=`!*}<%lOE^_#Ink'_Q'OS!yW'TPOY$nYZ%nZr$nrs&[st#Kctz$nz{+O{!P$n!P!Q,z!Q![#8W![!c$n!c!}#8W!}#O$n#O#P&[#P#R$n#R#S#8W#S#T$n#T#o#8W#o${$n${$|#8W$|4w$n4w5b#8W5b5i$n5i6S#8W6S;'S$n;'S;=`4s<%lO$nV#Kji'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q!c$n!c!}#MX!}#O$n#O#P&[#P#R$n#R#S#MX#S#T$n#T#o#MX#o${$n${$|#MX$|4w$n4w5b#MX5b5i$n5i6S#MX6S;'S$n;'S;=`4s<%lO$nV#Mbj'_Q'OS'TPOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q![#MX![!c$n!c!}#MX!}#O$n#O#P&[#P#R$n#R#S#MX#S#T$n#T#o#MX#o${$n${$|#MX$|4w$n4w5b#MX5b5i$n5i6S#MX6S;'S$n;'S;=`4s<%lO$n_$ ]]wX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_$!_a'rX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q!_$n!_!`@O!`#O$n#O#P&[#P#p$n#p#q$#d#q;'S$n;'S;=`4s<%lO$n_$#m]'|X'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n_$$o]vX'_Q'OSOY$nYZ%nZr$nrs&[sz$nz{+O{!P$n!P!Q,z!Q#O$n#O#P&[#P;'S$n;'S;=`4s<%lO$n",
    tokenizers: [closureParam, tpDelim, literalTokens, 0, 1, 2, 3],
    topRules: { "SourceFile": [0, 8] },
    specialized: [{ term: 281, get: (value) => spec_identifier[value] || -1 }],
    tokenPrec: 15596
  });
  class Text {
    /**
    Get the line description around the given position.
    */
    lineAt(pos) {
      if (pos < 0 || pos > this.length)
        throw new RangeError(`Invalid position ${pos} in document of length ${this.length}`);
      return this.lineInner(pos, false, 1, 0);
    }
    /**
    Get the description for the given (1-based) line number.
    */
    line(n2) {
      if (n2 < 1 || n2 > this.lines)
        throw new RangeError(`Invalid line number ${n2} in ${this.lines}-line document`);
      return this.lineInner(n2, true, 1, 0);
    }
    /**
    Replace a range of the text with the given content.
    */
    replace(from, to, text) {
      [from, to] = clip(this, from, to);
      let parts = [];
      this.decompose(
        0,
        from,
        parts,
        2
        /* Open.To */
      );
      if (text.length)
        text.decompose(
          0,
          text.length,
          parts,
          1 | 2
          /* Open.To */
        );
      this.decompose(
        to,
        this.length,
        parts,
        1
        /* Open.From */
      );
      return TextNode.from(parts, this.length - (to - from) + text.length);
    }
    /**
    Append another document to this one.
    */
    append(other) {
      return this.replace(this.length, this.length, other);
    }
    /**
    Retrieve the text between the given points.
    */
    slice(from, to = this.length) {
      [from, to] = clip(this, from, to);
      let parts = [];
      this.decompose(from, to, parts, 0);
      return TextNode.from(parts, to - from);
    }
    /**
    Test whether this text is equal to another instance.
    */
    eq(other) {
      if (other == this)
        return true;
      if (other.length != this.length || other.lines != this.lines)
        return false;
      let start = this.scanIdentical(other, 1), end = this.length - this.scanIdentical(other, -1);
      let a2 = new RawTextCursor(this), b2 = new RawTextCursor(other);
      for (let skip = start, pos = start; ; ) {
        a2.next(skip);
        b2.next(skip);
        skip = 0;
        if (a2.lineBreak != b2.lineBreak || a2.done != b2.done || a2.value != b2.value)
          return false;
        pos += a2.value.length;
        if (a2.done || pos >= end)
          return true;
      }
    }
    /**
    Iterate over the text. When `dir` is `-1`, iteration happens
    from end to start. This will return lines and the breaks between
    them as separate strings.
    */
    iter(dir = 1) {
      return new RawTextCursor(this, dir);
    }
    /**
    Iterate over a range of the text. When `from` > `to`, the
    iterator will run in reverse.
    */
    iterRange(from, to = this.length) {
      return new PartialTextCursor(this, from, to);
    }
    /**
    Return a cursor that iterates over the given range of lines,
    _without_ returning the line breaks between, and yielding empty
    strings for empty lines.
    
    When `from` and `to` are given, they should be 1-based line numbers.
    */
    iterLines(from, to) {
      let inner;
      if (from == null) {
        inner = this.iter();
      } else {
        if (to == null)
          to = this.lines + 1;
        let start = this.line(from).from;
        inner = this.iterRange(start, Math.max(start, to == this.lines + 1 ? this.length : to <= 1 ? 0 : this.line(to - 1).to));
      }
      return new LineCursor(inner);
    }
    /**
    Return the document as a string, using newline characters to
    separate lines.
    */
    toString() {
      return this.sliceString(0);
    }
    /**
    Convert the document to an array of lines (which can be
    deserialized again via [`Text.of`](https://codemirror.net/6/docs/ref/#state.Text^of)).
    */
    toJSON() {
      let lines = [];
      this.flatten(lines);
      return lines;
    }
    /**
    @internal
    */
    constructor() {
    }
    /**
    Create a `Text` instance for the given array of lines.
    */
    static of(text) {
      if (text.length == 0)
        throw new RangeError("A document must have at least one line");
      if (text.length == 1 && !text[0])
        return Text.empty;
      return text.length <= 32 ? new TextLeaf(text) : TextNode.from(TextLeaf.split(text, []));
    }
  }
  class TextLeaf extends Text {
    constructor(text, length = textLength(text)) {
      super();
      this.text = text;
      this.length = length;
    }
    get lines() {
      return this.text.length;
    }
    get children() {
      return null;
    }
    lineInner(target, isLine, line, offset) {
      for (let i2 = 0; ; i2++) {
        let string2 = this.text[i2], end = offset + string2.length;
        if ((isLine ? line : end) >= target)
          return new Line(offset, end, line, string2);
        offset = end + 1;
        line++;
      }
    }
    decompose(from, to, target, open) {
      let text = from <= 0 && to >= this.length ? this : new TextLeaf(sliceText(this.text, from, to), Math.min(to, this.length) - Math.max(0, from));
      if (open & 1) {
        let prev = target.pop();
        let joined = appendText(text.text, prev.text.slice(), 0, text.length);
        if (joined.length <= 32) {
          target.push(new TextLeaf(joined, prev.length + text.length));
        } else {
          let mid = joined.length >> 1;
          target.push(new TextLeaf(joined.slice(0, mid)), new TextLeaf(joined.slice(mid)));
        }
      } else {
        target.push(text);
      }
    }
    replace(from, to, text) {
      if (!(text instanceof TextLeaf))
        return super.replace(from, to, text);
      [from, to] = clip(this, from, to);
      let lines = appendText(this.text, appendText(text.text, sliceText(this.text, 0, from)), to);
      let newLen = this.length + text.length - (to - from);
      if (lines.length <= 32)
        return new TextLeaf(lines, newLen);
      return TextNode.from(TextLeaf.split(lines, []), newLen);
    }
    sliceString(from, to = this.length, lineSep = "\n") {
      [from, to] = clip(this, from, to);
      let result = "";
      for (let pos = 0, i2 = 0; pos <= to && i2 < this.text.length; i2++) {
        let line = this.text[i2], end = pos + line.length;
        if (pos > from && i2)
          result += lineSep;
        if (from < end && to > pos)
          result += line.slice(Math.max(0, from - pos), to - pos);
        pos = end + 1;
      }
      return result;
    }
    flatten(target) {
      for (let line of this.text)
        target.push(line);
    }
    scanIdentical() {
      return 0;
    }
    static split(text, target) {
      let part = [], len = -1;
      for (let line of text) {
        part.push(line);
        len += line.length + 1;
        if (part.length == 32) {
          target.push(new TextLeaf(part, len));
          part = [];
          len = -1;
        }
      }
      if (len > -1)
        target.push(new TextLeaf(part, len));
      return target;
    }
  }
  class TextNode extends Text {
    constructor(children, length) {
      super();
      this.children = children;
      this.length = length;
      this.lines = 0;
      for (let child of children)
        this.lines += child.lines;
    }
    lineInner(target, isLine, line, offset) {
      for (let i2 = 0; ; i2++) {
        let child = this.children[i2], end = offset + child.length, endLine = line + child.lines - 1;
        if ((isLine ? endLine : end) >= target)
          return child.lineInner(target, isLine, line, offset);
        offset = end + 1;
        line = endLine + 1;
      }
    }
    decompose(from, to, target, open) {
      for (let i2 = 0, pos = 0; pos <= to && i2 < this.children.length; i2++) {
        let child = this.children[i2], end = pos + child.length;
        if (from <= end && to >= pos) {
          let childOpen = open & ((pos <= from ? 1 : 0) | (end >= to ? 2 : 0));
          if (pos >= from && end <= to && !childOpen)
            target.push(child);
          else
            child.decompose(from - pos, to - pos, target, childOpen);
        }
        pos = end + 1;
      }
    }
    replace(from, to, text) {
      [from, to] = clip(this, from, to);
      if (text.lines < this.lines)
        for (let i2 = 0, pos = 0; i2 < this.children.length; i2++) {
          let child = this.children[i2], end = pos + child.length;
          if (from >= pos && to <= end) {
            let updated = child.replace(from - pos, to - pos, text);
            let totalLines = this.lines - child.lines + updated.lines;
            if (updated.lines < totalLines >> 5 - 1 && updated.lines > totalLines >> 5 + 1) {
              let copy = this.children.slice();
              copy[i2] = updated;
              return new TextNode(copy, this.length - (to - from) + text.length);
            }
            return super.replace(pos, end, updated);
          }
          pos = end + 1;
        }
      return super.replace(from, to, text);
    }
    sliceString(from, to = this.length, lineSep = "\n") {
      [from, to] = clip(this, from, to);
      let result = "";
      for (let i2 = 0, pos = 0; i2 < this.children.length && pos <= to; i2++) {
        let child = this.children[i2], end = pos + child.length;
        if (pos > from && i2)
          result += lineSep;
        if (from < end && to > pos)
          result += child.sliceString(from - pos, to - pos, lineSep);
        pos = end + 1;
      }
      return result;
    }
    flatten(target) {
      for (let child of this.children)
        child.flatten(target);
    }
    scanIdentical(other, dir) {
      if (!(other instanceof TextNode))
        return 0;
      let length = 0;
      let [iA, iB, eA, eB] = dir > 0 ? [0, 0, this.children.length, other.children.length] : [this.children.length - 1, other.children.length - 1, -1, -1];
      for (; ; iA += dir, iB += dir) {
        if (iA == eA || iB == eB)
          return length;
        let chA = this.children[iA], chB = other.children[iB];
        if (chA != chB)
          return length + chA.scanIdentical(chB, dir);
        length += chA.length + 1;
      }
    }
    static from(children, length = children.reduce((l2, ch) => l2 + ch.length + 1, -1)) {
      let lines = 0;
      for (let ch of children)
        lines += ch.lines;
      if (lines < 32) {
        let flat = [];
        for (let ch of children)
          ch.flatten(flat);
        return new TextLeaf(flat, length);
      }
      let chunk = Math.max(
        32,
        lines >> 5
        /* Tree.BranchShift */
      ), maxChunk = chunk << 1, minChunk = chunk >> 1;
      let chunked = [], currentLines = 0, currentLen = -1, currentChunk = [];
      function add(child) {
        let last;
        if (child.lines > maxChunk && child instanceof TextNode) {
          for (let node of child.children)
            add(node);
        } else if (child.lines > minChunk && (currentLines > minChunk || !currentLines)) {
          flush();
          chunked.push(child);
        } else if (child instanceof TextLeaf && currentLines && (last = currentChunk[currentChunk.length - 1]) instanceof TextLeaf && child.lines + last.lines <= 32) {
          currentLines += child.lines;
          currentLen += child.length + 1;
          currentChunk[currentChunk.length - 1] = new TextLeaf(last.text.concat(child.text), last.length + 1 + child.length);
        } else {
          if (currentLines + child.lines > chunk)
            flush();
          currentLines += child.lines;
          currentLen += child.length + 1;
          currentChunk.push(child);
        }
      }
      function flush() {
        if (currentLines == 0)
          return;
        chunked.push(currentChunk.length == 1 ? currentChunk[0] : TextNode.from(currentChunk, currentLen));
        currentLen = -1;
        currentLines = currentChunk.length = 0;
      }
      for (let child of children)
        add(child);
      flush();
      return chunked.length == 1 ? chunked[0] : new TextNode(chunked, length);
    }
  }
  Text.empty = /* @__PURE__ */ new TextLeaf([""], 0);
  function textLength(text) {
    let length = -1;
    for (let line of text)
      length += line.length + 1;
    return length;
  }
  function appendText(text, target, from = 0, to = 1e9) {
    for (let pos = 0, i2 = 0, first = true; i2 < text.length && pos <= to; i2++) {
      let line = text[i2], end = pos + line.length;
      if (end >= from) {
        if (end > to)
          line = line.slice(0, to - pos);
        if (pos < from)
          line = line.slice(from - pos);
        if (first) {
          target[target.length - 1] += line;
          first = false;
        } else
          target.push(line);
      }
      pos = end + 1;
    }
    return target;
  }
  function sliceText(text, from, to) {
    return appendText(text, [""], from, to);
  }
  class RawTextCursor {
    constructor(text, dir = 1) {
      this.dir = dir;
      this.done = false;
      this.lineBreak = false;
      this.value = "";
      this.nodes = [text];
      this.offsets = [dir > 0 ? 1 : (text instanceof TextLeaf ? text.text.length : text.children.length) << 1];
    }
    nextInner(skip, dir) {
      this.done = this.lineBreak = false;
      for (; ; ) {
        let last = this.nodes.length - 1;
        let top2 = this.nodes[last], offsetValue = this.offsets[last], offset = offsetValue >> 1;
        let size = top2 instanceof TextLeaf ? top2.text.length : top2.children.length;
        if (offset == (dir > 0 ? size : 0)) {
          if (last == 0) {
            this.done = true;
            this.value = "";
            return this;
          }
          if (dir > 0)
            this.offsets[last - 1]++;
          this.nodes.pop();
          this.offsets.pop();
        } else if ((offsetValue & 1) == (dir > 0 ? 0 : 1)) {
          this.offsets[last] += dir;
          if (skip == 0) {
            this.lineBreak = true;
            this.value = "\n";
            return this;
          }
          skip--;
        } else if (top2 instanceof TextLeaf) {
          let next = top2.text[offset + (dir < 0 ? -1 : 0)];
          this.offsets[last] += dir;
          if (next.length > Math.max(0, skip)) {
            this.value = skip == 0 ? next : dir > 0 ? next.slice(skip) : next.slice(0, next.length - skip);
            return this;
          }
          skip -= next.length;
        } else {
          let next = top2.children[offset + (dir < 0 ? -1 : 0)];
          if (skip > next.length) {
            skip -= next.length;
            this.offsets[last] += dir;
          } else {
            if (dir < 0)
              this.offsets[last]--;
            this.nodes.push(next);
            this.offsets.push(dir > 0 ? 1 : (next instanceof TextLeaf ? next.text.length : next.children.length) << 1);
          }
        }
      }
    }
    next(skip = 0) {
      if (skip < 0) {
        this.nextInner(-skip, -this.dir);
        skip = this.value.length;
      }
      return this.nextInner(skip, this.dir);
    }
  }
  class PartialTextCursor {
    constructor(text, start, end) {
      this.value = "";
      this.done = false;
      this.cursor = new RawTextCursor(text, start > end ? -1 : 1);
      this.pos = start > end ? text.length : 0;
      this.from = Math.min(start, end);
      this.to = Math.max(start, end);
    }
    nextInner(skip, dir) {
      if (dir < 0 ? this.pos <= this.from : this.pos >= this.to) {
        this.value = "";
        this.done = true;
        return this;
      }
      skip += Math.max(0, dir < 0 ? this.pos - this.to : this.from - this.pos);
      let limit = dir < 0 ? this.pos - this.from : this.to - this.pos;
      if (skip > limit)
        skip = limit;
      limit -= skip;
      let { value } = this.cursor.next(skip);
      this.pos += (value.length + skip) * dir;
      this.value = value.length <= limit ? value : dir < 0 ? value.slice(value.length - limit) : value.slice(0, limit);
      this.done = !this.value;
      return this;
    }
    next(skip = 0) {
      if (skip < 0)
        skip = Math.max(skip, this.from - this.pos);
      else if (skip > 0)
        skip = Math.min(skip, this.to - this.pos);
      return this.nextInner(skip, this.cursor.dir);
    }
    get lineBreak() {
      return this.cursor.lineBreak && this.value != "";
    }
  }
  class LineCursor {
    constructor(inner) {
      this.inner = inner;
      this.afterBreak = true;
      this.value = "";
      this.done = false;
    }
    next(skip = 0) {
      let { done, lineBreak, value } = this.inner.next(skip);
      if (done && this.afterBreak) {
        this.value = "";
        this.afterBreak = false;
      } else if (done) {
        this.done = true;
        this.value = "";
      } else if (lineBreak) {
        if (this.afterBreak) {
          this.value = "";
        } else {
          this.afterBreak = true;
          this.next();
        }
      } else {
        this.value = value;
        this.afterBreak = false;
      }
      return this;
    }
    get lineBreak() {
      return false;
    }
  }
  if (typeof Symbol != "undefined") {
    Text.prototype[Symbol.iterator] = function() {
      return this.iter();
    };
    RawTextCursor.prototype[Symbol.iterator] = PartialTextCursor.prototype[Symbol.iterator] = LineCursor.prototype[Symbol.iterator] = function() {
      return this;
    };
  }
  class Line {
    /**
    @internal
    */
    constructor(from, to, number2, text) {
      this.from = from;
      this.to = to;
      this.number = number2;
      this.text = text;
    }
    /**
    The length of the line (not including any line break after it).
    */
    get length() {
      return this.to - this.from;
    }
  }
  function clip(text, from, to) {
    from = Math.max(0, Math.min(text.length, from));
    return [from, Math.max(from, Math.min(text.length, to))];
  }
  let extend = /* @__PURE__ */ "lc,34,7n,7,7b,19,,,,2,,2,,,20,b,1c,l,g,,2t,7,2,6,2,2,,4,z,,u,r,2j,b,1m,9,9,,o,4,,9,,3,,5,17,3,3b,f,,w,1j,,,,4,8,4,,3,7,a,2,t,,1m,,,,2,4,8,,9,,a,2,q,,2,2,1l,,4,2,4,2,2,3,3,,u,2,3,,b,2,1l,,4,5,,2,4,,k,2,m,6,,,1m,,,2,,4,8,,7,3,a,2,u,,1n,,,,c,,9,,14,,3,,1l,3,5,3,,4,7,2,b,2,t,,1m,,2,,2,,3,,5,2,7,2,b,2,s,2,1l,2,,,2,4,8,,9,,a,2,t,,20,,4,,2,3,,,8,,29,,2,7,c,8,2q,,2,9,b,6,22,2,r,,,,,,1j,e,,5,,2,5,b,,10,9,,2u,4,,6,,2,2,2,p,2,4,3,g,4,d,,2,2,6,,f,,jj,3,qa,3,t,3,t,2,u,2,1s,2,,7,8,,2,b,9,,19,3,3b,2,y,,3a,3,4,2,9,,6,3,63,2,2,,1m,,,7,,,,,2,8,6,a,2,,1c,h,1r,4,1c,7,,,5,,14,9,c,2,w,4,2,2,,3,1k,,,2,3,,,3,1m,8,2,2,48,3,,d,,7,4,,6,,3,2,5i,1m,,5,ek,,5f,x,2da,3,3x,,2o,w,fe,6,2x,2,n9w,4,,a,w,2,28,2,7k,,3,,4,,p,2,5,,47,2,q,i,d,,12,8,p,b,1a,3,1c,,2,4,2,2,13,,1v,6,2,2,2,2,c,,8,,1b,,1f,,,3,2,2,5,2,,,16,2,8,,6m,,2,,4,,fn4,,kh,g,g,g,a6,2,gt,,6a,,45,5,1ae,3,,2,5,4,14,3,4,,4l,2,fx,4,ar,2,49,b,4w,,1i,f,1k,3,1d,4,2,2,1x,3,10,5,,8,1q,,c,2,1g,9,a,4,2,,2n,3,2,,,2,6,,4g,,3,8,l,2,1l,2,,,,,m,,e,7,3,5,5f,8,2,3,,,n,,29,,2,6,,,2,,,2,,2,6j,,2,4,6,2,,2,r,2,2d,8,2,,,2,2y,,,,2,6,,,2t,3,2,4,,5,77,9,,2,6t,,a,2,,,4,,40,4,2,2,4,,w,a,14,6,2,4,8,,9,6,2,3,1a,d,,2,ba,7,,6,,,2a,m,2,7,,2,,2,3e,6,3,,,2,,7,,,20,2,3,,,,9n,2,f0b,5,1n,7,t4,,1r,4,29,,f5k,2,43q,,,3,4,5,8,8,2,7,u,4,44,3,1iz,1j,4,1e,8,,e,,m,5,,f,11s,7,,h,2,7,,2,,5,79,7,c5,4,15s,7,31,7,240,5,gx7k,2o,3k,6o".split(",").map((s2) => s2 ? parseInt(s2, 36) : 1);
  for (let i2 = 1; i2 < extend.length; i2++)
    extend[i2] += extend[i2 - 1];
  function isExtendingChar(code2) {
    for (let i2 = 1; i2 < extend.length; i2 += 2)
      if (extend[i2] > code2)
        return extend[i2 - 1] <= code2;
    return false;
  }
  function isRegionalIndicator(code2) {
    return code2 >= 127462 && code2 <= 127487;
  }
  const ZWJ = 8205;
  function findClusterBreak(str, pos, forward = true, includeExtending = true) {
    return (forward ? nextClusterBreak : prevClusterBreak)(str, pos, includeExtending);
  }
  function nextClusterBreak(str, pos, includeExtending) {
    if (pos == str.length)
      return pos;
    if (pos && surrogateLow(str.charCodeAt(pos)) && surrogateHigh(str.charCodeAt(pos - 1)))
      pos--;
    let prev = codePointAt(str, pos);
    pos += codePointSize(prev);
    while (pos < str.length) {
      let next = codePointAt(str, pos);
      if (prev == ZWJ || next == ZWJ || includeExtending && isExtendingChar(next)) {
        pos += codePointSize(next);
        prev = next;
      } else if (isRegionalIndicator(next)) {
        let countBefore = 0, i2 = pos - 2;
        while (i2 >= 0 && isRegionalIndicator(codePointAt(str, i2))) {
          countBefore++;
          i2 -= 2;
        }
        if (countBefore % 2 == 0)
          break;
        else
          pos += 2;
      } else {
        break;
      }
    }
    return pos;
  }
  function prevClusterBreak(str, pos, includeExtending) {
    while (pos > 0) {
      let found = nextClusterBreak(str, pos - 2, includeExtending);
      if (found < pos)
        return found;
      pos--;
    }
    return 0;
  }
  function surrogateLow(ch) {
    return ch >= 56320 && ch < 57344;
  }
  function surrogateHigh(ch) {
    return ch >= 55296 && ch < 56320;
  }
  function codePointAt(str, pos) {
    let code0 = str.charCodeAt(pos);
    if (!surrogateHigh(code0) || pos + 1 == str.length)
      return code0;
    let code1 = str.charCodeAt(pos + 1);
    if (!surrogateLow(code1))
      return code0;
    return (code0 - 55296 << 10) + (code1 - 56320) + 65536;
  }
  function codePointSize(code2) {
    return code2 < 65536 ? 1 : 2;
  }
  const DefaultSplit = /\r\n?|\n/;
  var MapMode = /* @__PURE__ */ function(MapMode2) {
    MapMode2[MapMode2["Simple"] = 0] = "Simple";
    MapMode2[MapMode2["TrackDel"] = 1] = "TrackDel";
    MapMode2[MapMode2["TrackBefore"] = 2] = "TrackBefore";
    MapMode2[MapMode2["TrackAfter"] = 3] = "TrackAfter";
    return MapMode2;
  }(MapMode || (MapMode = {}));
  class ChangeDesc {
    // Sections are encoded as pairs of integers. The first is the
    // length in the current document, and the second is -1 for
    // unaffected sections, and the length of the replacement content
    // otherwise. So an insertion would be (0, n>0), a deletion (n>0,
    // 0), and a replacement two positive numbers.
    /**
    @internal
    */
    constructor(sections) {
      this.sections = sections;
    }
    /**
    The length of the document before the change.
    */
    get length() {
      let result = 0;
      for (let i2 = 0; i2 < this.sections.length; i2 += 2)
        result += this.sections[i2];
      return result;
    }
    /**
    The length of the document after the change.
    */
    get newLength() {
      let result = 0;
      for (let i2 = 0; i2 < this.sections.length; i2 += 2) {
        let ins = this.sections[i2 + 1];
        result += ins < 0 ? this.sections[i2] : ins;
      }
      return result;
    }
    /**
    False when there are actual changes in this set.
    */
    get empty() {
      return this.sections.length == 0 || this.sections.length == 2 && this.sections[1] < 0;
    }
    /**
    Iterate over the unchanged parts left by these changes. `posA`
    provides the position of the range in the old document, `posB`
    the new position in the changed document.
    */
    iterGaps(f2) {
      for (let i2 = 0, posA = 0, posB = 0; i2 < this.sections.length; ) {
        let len = this.sections[i2++], ins = this.sections[i2++];
        if (ins < 0) {
          f2(posA, posB, len);
          posB += len;
        } else {
          posB += ins;
        }
        posA += len;
      }
    }
    /**
    Iterate over the ranges changed by these changes. (See
    [`ChangeSet.iterChanges`](https://codemirror.net/6/docs/ref/#state.ChangeSet.iterChanges) for a
    variant that also provides you with the inserted text.)
    `fromA`/`toA` provides the extent of the change in the starting
    document, `fromB`/`toB` the extent of the replacement in the
    changed document.
    
    When `individual` is true, adjacent changes (which are kept
    separate for [position mapping](https://codemirror.net/6/docs/ref/#state.ChangeDesc.mapPos)) are
    reported separately.
    */
    iterChangedRanges(f2, individual = false) {
      iterChanges(this, f2, individual);
    }
    /**
    Get a description of the inverted form of these changes.
    */
    get invertedDesc() {
      let sections = [];
      for (let i2 = 0; i2 < this.sections.length; ) {
        let len = this.sections[i2++], ins = this.sections[i2++];
        if (ins < 0)
          sections.push(len, ins);
        else
          sections.push(ins, len);
      }
      return new ChangeDesc(sections);
    }
    /**
    Compute the combined effect of applying another set of changes
    after this one. The length of the document after this set should
    match the length before `other`.
    */
    composeDesc(other) {
      return this.empty ? other : other.empty ? this : composeSets(this, other);
    }
    /**
    Map this description, which should start with the same document
    as `other`, over another set of changes, so that it can be
    applied after it. When `before` is true, map as if the changes
    in `other` happened before the ones in `this`.
    */
    mapDesc(other, before = false) {
      return other.empty ? this : mapSet(this, other, before);
    }
    mapPos(pos, assoc = -1, mode = MapMode.Simple) {
      let posA = 0, posB = 0;
      for (let i2 = 0; i2 < this.sections.length; ) {
        let len = this.sections[i2++], ins = this.sections[i2++], endA = posA + len;
        if (ins < 0) {
          if (endA > pos)
            return posB + (pos - posA);
          posB += len;
        } else {
          if (mode != MapMode.Simple && endA >= pos && (mode == MapMode.TrackDel && posA < pos && endA > pos || mode == MapMode.TrackBefore && posA < pos || mode == MapMode.TrackAfter && endA > pos))
            return null;
          if (endA > pos || endA == pos && assoc < 0 && !len)
            return pos == posA || assoc < 0 ? posB : posB + ins;
          posB += ins;
        }
        posA = endA;
      }
      if (pos > posA)
        throw new RangeError(`Position ${pos} is out of range for changeset of length ${posA}`);
      return posB;
    }
    /**
    Check whether these changes touch a given range. When one of the
    changes entirely covers the range, the string `"cover"` is
    returned.
    */
    touchesRange(from, to = from) {
      for (let i2 = 0, pos = 0; i2 < this.sections.length && pos <= to; ) {
        let len = this.sections[i2++], ins = this.sections[i2++], end = pos + len;
        if (ins >= 0 && pos <= to && end >= from)
          return pos < from && end > to ? "cover" : true;
        pos = end;
      }
      return false;
    }
    /**
    @internal
    */
    toString() {
      let result = "";
      for (let i2 = 0; i2 < this.sections.length; ) {
        let len = this.sections[i2++], ins = this.sections[i2++];
        result += (result ? " " : "") + len + (ins >= 0 ? ":" + ins : "");
      }
      return result;
    }
    /**
    Serialize this change desc to a JSON-representable value.
    */
    toJSON() {
      return this.sections;
    }
    /**
    Create a change desc from its JSON representation (as produced
    by [`toJSON`](https://codemirror.net/6/docs/ref/#state.ChangeDesc.toJSON).
    */
    static fromJSON(json) {
      if (!Array.isArray(json) || json.length % 2 || json.some((a2) => typeof a2 != "number"))
        throw new RangeError("Invalid JSON representation of ChangeDesc");
      return new ChangeDesc(json);
    }
    /**
    @internal
    */
    static create(sections) {
      return new ChangeDesc(sections);
    }
  }
  class ChangeSet extends ChangeDesc {
    constructor(sections, inserted) {
      super(sections);
      this.inserted = inserted;
    }
    /**
    Apply the changes to a document, returning the modified
    document.
    */
    apply(doc2) {
      if (this.length != doc2.length)
        throw new RangeError("Applying change set to a document with the wrong length");
      iterChanges(this, (fromA, toA, fromB, _toB, text) => doc2 = doc2.replace(fromB, fromB + (toA - fromA), text), false);
      return doc2;
    }
    mapDesc(other, before = false) {
      return mapSet(this, other, before, true);
    }
    /**
    Given the document as it existed _before_ the changes, return a
    change set that represents the inverse of this set, which could
    be used to go from the document created by the changes back to
    the document as it existed before the changes.
    */
    invert(doc2) {
      let sections = this.sections.slice(), inserted = [];
      for (let i2 = 0, pos = 0; i2 < sections.length; i2 += 2) {
        let len = sections[i2], ins = sections[i2 + 1];
        if (ins >= 0) {
          sections[i2] = ins;
          sections[i2 + 1] = len;
          let index = i2 >> 1;
          while (inserted.length < index)
            inserted.push(Text.empty);
          inserted.push(len ? doc2.slice(pos, pos + len) : Text.empty);
        }
        pos += len;
      }
      return new ChangeSet(sections, inserted);
    }
    /**
    Combine two subsequent change sets into a single set. `other`
    must start in the document produced by `this`. If `this` goes
    `docA` → `docB` and `other` represents `docB` → `docC`, the
    returned value will represent the change `docA` → `docC`.
    */
    compose(other) {
      return this.empty ? other : other.empty ? this : composeSets(this, other, true);
    }
    /**
    Given another change set starting in the same document, maps this
    change set over the other, producing a new change set that can be
    applied to the document produced by applying `other`. When
    `before` is `true`, order changes as if `this` comes before
    `other`, otherwise (the default) treat `other` as coming first.
    
    Given two changes `A` and `B`, `A.compose(B.map(A))` and
    `B.compose(A.map(B, true))` will produce the same document. This
    provides a basic form of [operational
    transformation](https://en.wikipedia.org/wiki/Operational_transformation),
    and can be used for collaborative editing.
    */
    map(other, before = false) {
      return other.empty ? this : mapSet(this, other, before, true);
    }
    /**
    Iterate over the changed ranges in the document, calling `f` for
    each, with the range in the original document (`fromA`-`toA`)
    and the range that replaces it in the new document
    (`fromB`-`toB`).
    
    When `individual` is true, adjacent changes are reported
    separately.
    */
    iterChanges(f2, individual = false) {
      iterChanges(this, f2, individual);
    }
    /**
    Get a [change description](https://codemirror.net/6/docs/ref/#state.ChangeDesc) for this change
    set.
    */
    get desc() {
      return ChangeDesc.create(this.sections);
    }
    /**
    @internal
    */
    filter(ranges) {
      let resultSections = [], resultInserted = [], filteredSections = [];
      let iter = new SectionIter(this);
      done:
        for (let i2 = 0, pos = 0; ; ) {
          let next = i2 == ranges.length ? 1e9 : ranges[i2++];
          while (pos < next || pos == next && iter.len == 0) {
            if (iter.done)
              break done;
            let len = Math.min(iter.len, next - pos);
            addSection(filteredSections, len, -1);
            let ins = iter.ins == -1 ? -1 : iter.off == 0 ? iter.ins : 0;
            addSection(resultSections, len, ins);
            if (ins > 0)
              addInsert(resultInserted, resultSections, iter.text);
            iter.forward(len);
            pos += len;
          }
          let end = ranges[i2++];
          while (pos < end) {
            if (iter.done)
              break done;
            let len = Math.min(iter.len, end - pos);
            addSection(resultSections, len, -1);
            addSection(filteredSections, len, iter.ins == -1 ? -1 : iter.off == 0 ? iter.ins : 0);
            iter.forward(len);
            pos += len;
          }
        }
      return {
        changes: new ChangeSet(resultSections, resultInserted),
        filtered: ChangeDesc.create(filteredSections)
      };
    }
    /**
    Serialize this change set to a JSON-representable value.
    */
    toJSON() {
      let parts = [];
      for (let i2 = 0; i2 < this.sections.length; i2 += 2) {
        let len = this.sections[i2], ins = this.sections[i2 + 1];
        if (ins < 0)
          parts.push(len);
        else if (ins == 0)
          parts.push([len]);
        else
          parts.push([len].concat(this.inserted[i2 >> 1].toJSON()));
      }
      return parts;
    }
    /**
    Create a change set for the given changes, for a document of the
    given length, using `lineSep` as line separator.
    */
    static of(changes, length, lineSep) {
      let sections = [], inserted = [], pos = 0;
      let total = null;
      function flush(force = false) {
        if (!force && !sections.length)
          return;
        if (pos < length)
          addSection(sections, length - pos, -1);
        let set = new ChangeSet(sections, inserted);
        total = total ? total.compose(set.map(total)) : set;
        sections = [];
        inserted = [];
        pos = 0;
      }
      function process2(spec) {
        if (Array.isArray(spec)) {
          for (let sub of spec)
            process2(sub);
        } else if (spec instanceof ChangeSet) {
          if (spec.length != length)
            throw new RangeError(`Mismatched change set length (got ${spec.length}, expected ${length})`);
          flush();
          total = total ? total.compose(spec.map(total)) : spec;
        } else {
          let { from, to = from, insert: insert2 } = spec;
          if (from > to || from < 0 || to > length)
            throw new RangeError(`Invalid change range ${from} to ${to} (in doc of length ${length})`);
          let insText = !insert2 ? Text.empty : typeof insert2 == "string" ? Text.of(insert2.split(lineSep || DefaultSplit)) : insert2;
          let insLen = insText.length;
          if (from == to && insLen == 0)
            return;
          if (from < pos)
            flush();
          if (from > pos)
            addSection(sections, from - pos, -1);
          addSection(sections, to - from, insLen);
          addInsert(inserted, sections, insText);
          pos = to;
        }
      }
      process2(changes);
      flush(!total);
      return total;
    }
    /**
    Create an empty changeset of the given length.
    */
    static empty(length) {
      return new ChangeSet(length ? [length, -1] : [], []);
    }
    /**
    Create a changeset from its JSON representation (as produced by
    [`toJSON`](https://codemirror.net/6/docs/ref/#state.ChangeSet.toJSON).
    */
    static fromJSON(json) {
      if (!Array.isArray(json))
        throw new RangeError("Invalid JSON representation of ChangeSet");
      let sections = [], inserted = [];
      for (let i2 = 0; i2 < json.length; i2++) {
        let part = json[i2];
        if (typeof part == "number") {
          sections.push(part, -1);
        } else if (!Array.isArray(part) || typeof part[0] != "number" || part.some((e2, i3) => i3 && typeof e2 != "string")) {
          throw new RangeError("Invalid JSON representation of ChangeSet");
        } else if (part.length == 1) {
          sections.push(part[0], 0);
        } else {
          while (inserted.length < i2)
            inserted.push(Text.empty);
          inserted[i2] = Text.of(part.slice(1));
          sections.push(part[0], inserted[i2].length);
        }
      }
      return new ChangeSet(sections, inserted);
    }
    /**
    @internal
    */
    static createSet(sections, inserted) {
      return new ChangeSet(sections, inserted);
    }
  }
  function addSection(sections, len, ins, forceJoin = false) {
    if (len == 0 && ins <= 0)
      return;
    let last = sections.length - 2;
    if (last >= 0 && ins <= 0 && ins == sections[last + 1])
      sections[last] += len;
    else if (len == 0 && sections[last] == 0)
      sections[last + 1] += ins;
    else if (forceJoin) {
      sections[last] += len;
      sections[last + 1] += ins;
    } else
      sections.push(len, ins);
  }
  function addInsert(values, sections, value) {
    if (value.length == 0)
      return;
    let index = sections.length - 2 >> 1;
    if (index < values.length) {
      values[values.length - 1] = values[values.length - 1].append(value);
    } else {
      while (values.length < index)
        values.push(Text.empty);
      values.push(value);
    }
  }
  function iterChanges(desc, f2, individual) {
    let inserted = desc.inserted;
    for (let posA = 0, posB = 0, i2 = 0; i2 < desc.sections.length; ) {
      let len = desc.sections[i2++], ins = desc.sections[i2++];
      if (ins < 0) {
        posA += len;
        posB += len;
      } else {
        let endA = posA, endB = posB, text = Text.empty;
        for (; ; ) {
          endA += len;
          endB += ins;
          if (ins && inserted)
            text = text.append(inserted[i2 - 2 >> 1]);
          if (individual || i2 == desc.sections.length || desc.sections[i2 + 1] < 0)
            break;
          len = desc.sections[i2++];
          ins = desc.sections[i2++];
        }
        f2(posA, endA, posB, endB, text);
        posA = endA;
        posB = endB;
      }
    }
  }
  function mapSet(setA, setB, before, mkSet = false) {
    let sections = [], insert2 = mkSet ? [] : null;
    let a2 = new SectionIter(setA), b2 = new SectionIter(setB);
    for (let inserted = -1; ; ) {
      if (a2.ins == -1 && b2.ins == -1) {
        let len = Math.min(a2.len, b2.len);
        addSection(sections, len, -1);
        a2.forward(len);
        b2.forward(len);
      } else if (b2.ins >= 0 && (a2.ins < 0 || inserted == a2.i || a2.off == 0 && (b2.len < a2.len || b2.len == a2.len && !before))) {
        let len = b2.len;
        addSection(sections, b2.ins, -1);
        while (len) {
          let piece = Math.min(a2.len, len);
          if (a2.ins >= 0 && inserted < a2.i && a2.len <= piece) {
            addSection(sections, 0, a2.ins);
            if (insert2)
              addInsert(insert2, sections, a2.text);
            inserted = a2.i;
          }
          a2.forward(piece);
          len -= piece;
        }
        b2.next();
      } else if (a2.ins >= 0) {
        let len = 0, left = a2.len;
        while (left) {
          if (b2.ins == -1) {
            let piece = Math.min(left, b2.len);
            len += piece;
            left -= piece;
            b2.forward(piece);
          } else if (b2.ins == 0 && b2.len < left) {
            left -= b2.len;
            b2.next();
          } else {
            break;
          }
        }
        addSection(sections, len, inserted < a2.i ? a2.ins : 0);
        if (insert2 && inserted < a2.i)
          addInsert(insert2, sections, a2.text);
        inserted = a2.i;
        a2.forward(a2.len - left);
      } else if (a2.done && b2.done) {
        return insert2 ? ChangeSet.createSet(sections, insert2) : ChangeDesc.create(sections);
      } else {
        throw new Error("Mismatched change set lengths");
      }
    }
  }
  function composeSets(setA, setB, mkSet = false) {
    let sections = [];
    let insert2 = mkSet ? [] : null;
    let a2 = new SectionIter(setA), b2 = new SectionIter(setB);
    for (let open = false; ; ) {
      if (a2.done && b2.done) {
        return insert2 ? ChangeSet.createSet(sections, insert2) : ChangeDesc.create(sections);
      } else if (a2.ins == 0) {
        addSection(sections, a2.len, 0, open);
        a2.next();
      } else if (b2.len == 0 && !b2.done) {
        addSection(sections, 0, b2.ins, open);
        if (insert2)
          addInsert(insert2, sections, b2.text);
        b2.next();
      } else if (a2.done || b2.done) {
        throw new Error("Mismatched change set lengths");
      } else {
        let len = Math.min(a2.len2, b2.len), sectionLen = sections.length;
        if (a2.ins == -1) {
          let insB = b2.ins == -1 ? -1 : b2.off ? 0 : b2.ins;
          addSection(sections, len, insB, open);
          if (insert2 && insB)
            addInsert(insert2, sections, b2.text);
        } else if (b2.ins == -1) {
          addSection(sections, a2.off ? 0 : a2.len, len, open);
          if (insert2)
            addInsert(insert2, sections, a2.textBit(len));
        } else {
          addSection(sections, a2.off ? 0 : a2.len, b2.off ? 0 : b2.ins, open);
          if (insert2 && !b2.off)
            addInsert(insert2, sections, b2.text);
        }
        open = (a2.ins > len || b2.ins >= 0 && b2.len > len) && (open || sections.length > sectionLen);
        a2.forward2(len);
        b2.forward(len);
      }
    }
  }
  class SectionIter {
    constructor(set) {
      this.set = set;
      this.i = 0;
      this.next();
    }
    next() {
      let { sections } = this.set;
      if (this.i < sections.length) {
        this.len = sections[this.i++];
        this.ins = sections[this.i++];
      } else {
        this.len = 0;
        this.ins = -2;
      }
      this.off = 0;
    }
    get done() {
      return this.ins == -2;
    }
    get len2() {
      return this.ins < 0 ? this.len : this.ins;
    }
    get text() {
      let { inserted } = this.set, index = this.i - 2 >> 1;
      return index >= inserted.length ? Text.empty : inserted[index];
    }
    textBit(len) {
      let { inserted } = this.set, index = this.i - 2 >> 1;
      return index >= inserted.length && !len ? Text.empty : inserted[index].slice(this.off, len == null ? void 0 : this.off + len);
    }
    forward(len) {
      if (len == this.len)
        this.next();
      else {
        this.len -= len;
        this.off += len;
      }
    }
    forward2(len) {
      if (this.ins == -1)
        this.forward(len);
      else if (len == this.ins)
        this.next();
      else {
        this.ins -= len;
        this.off += len;
      }
    }
  }
  class SelectionRange {
    constructor(from, to, flags) {
      this.from = from;
      this.to = to;
      this.flags = flags;
    }
    /**
    The anchor of the range—the side that doesn't move when you
    extend it.
    */
    get anchor() {
      return this.flags & 32 ? this.to : this.from;
    }
    /**
    The head of the range, which is moved when the range is
    [extended](https://codemirror.net/6/docs/ref/#state.SelectionRange.extend).
    */
    get head() {
      return this.flags & 32 ? this.from : this.to;
    }
    /**
    True when `anchor` and `head` are at the same position.
    */
    get empty() {
      return this.from == this.to;
    }
    /**
    If this is a cursor that is explicitly associated with the
    character on one of its sides, this returns the side. -1 means
    the character before its position, 1 the character after, and 0
    means no association.
    */
    get assoc() {
      return this.flags & 8 ? -1 : this.flags & 16 ? 1 : 0;
    }
    /**
    The bidirectional text level associated with this cursor, if
    any.
    */
    get bidiLevel() {
      let level = this.flags & 7;
      return level == 7 ? null : level;
    }
    /**
    The goal column (stored vertical offset) associated with a
    cursor. This is used to preserve the vertical position when
    [moving](https://codemirror.net/6/docs/ref/#view.EditorView.moveVertically) across
    lines of different length.
    */
    get goalColumn() {
      let value = this.flags >> 6;
      return value == 16777215 ? void 0 : value;
    }
    /**
    Map this range through a change, producing a valid range in the
    updated document.
    */
    map(change, assoc = -1) {
      let from, to;
      if (this.empty) {
        from = to = change.mapPos(this.from, assoc);
      } else {
        from = change.mapPos(this.from, 1);
        to = change.mapPos(this.to, -1);
      }
      return from == this.from && to == this.to ? this : new SelectionRange(from, to, this.flags);
    }
    /**
    Extend this range to cover at least `from` to `to`.
    */
    extend(from, to = from) {
      if (from <= this.anchor && to >= this.anchor)
        return EditorSelection.range(from, to);
      let head = Math.abs(from - this.anchor) > Math.abs(to - this.anchor) ? from : to;
      return EditorSelection.range(this.anchor, head);
    }
    /**
    Compare this range to another range.
    */
    eq(other, includeAssoc = false) {
      return this.anchor == other.anchor && this.head == other.head && (!includeAssoc || !this.empty || this.assoc == other.assoc);
    }
    /**
    Return a JSON-serializable object representing the range.
    */
    toJSON() {
      return { anchor: this.anchor, head: this.head };
    }
    /**
    Convert a JSON representation of a range to a `SelectionRange`
    instance.
    */
    static fromJSON(json) {
      if (!json || typeof json.anchor != "number" || typeof json.head != "number")
        throw new RangeError("Invalid JSON representation for SelectionRange");
      return EditorSelection.range(json.anchor, json.head);
    }
    /**
    @internal
    */
    static create(from, to, flags) {
      return new SelectionRange(from, to, flags);
    }
  }
  class EditorSelection {
    constructor(ranges, mainIndex) {
      this.ranges = ranges;
      this.mainIndex = mainIndex;
    }
    /**
    Map a selection through a change. Used to adjust the selection
    position for changes.
    */
    map(change, assoc = -1) {
      if (change.empty)
        return this;
      return EditorSelection.create(this.ranges.map((r2) => r2.map(change, assoc)), this.mainIndex);
    }
    /**
    Compare this selection to another selection. By default, ranges
    are compared only by position. When `includeAssoc` is true,
    cursor ranges must also have the same
    [`assoc`](https://codemirror.net/6/docs/ref/#state.SelectionRange.assoc) value.
    */
    eq(other, includeAssoc = false) {
      if (this.ranges.length != other.ranges.length || this.mainIndex != other.mainIndex)
        return false;
      for (let i2 = 0; i2 < this.ranges.length; i2++)
        if (!this.ranges[i2].eq(other.ranges[i2], includeAssoc))
          return false;
      return true;
    }
    /**
    Get the primary selection range. Usually, you should make sure
    your code applies to _all_ ranges, by using methods like
    [`changeByRange`](https://codemirror.net/6/docs/ref/#state.EditorState.changeByRange).
    */
    get main() {
      return this.ranges[this.mainIndex];
    }
    /**
    Make sure the selection only has one range. Returns a selection
    holding only the main range from this selection.
    */
    asSingle() {
      return this.ranges.length == 1 ? this : new EditorSelection([this.main], 0);
    }
    /**
    Extend this selection with an extra range.
    */
    addRange(range, main = true) {
      return EditorSelection.create([range].concat(this.ranges), main ? 0 : this.mainIndex + 1);
    }
    /**
    Replace a given range with another range, and then normalize the
    selection to merge and sort ranges if necessary.
    */
    replaceRange(range, which = this.mainIndex) {
      let ranges = this.ranges.slice();
      ranges[which] = range;
      return EditorSelection.create(ranges, this.mainIndex);
    }
    /**
    Convert this selection to an object that can be serialized to
    JSON.
    */
    toJSON() {
      return { ranges: this.ranges.map((r2) => r2.toJSON()), main: this.mainIndex };
    }
    /**
    Create a selection from a JSON representation.
    */
    static fromJSON(json) {
      if (!json || !Array.isArray(json.ranges) || typeof json.main != "number" || json.main >= json.ranges.length)
        throw new RangeError("Invalid JSON representation for EditorSelection");
      return new EditorSelection(json.ranges.map((r2) => SelectionRange.fromJSON(r2)), json.main);
    }
    /**
    Create a selection holding a single range.
    */
    static single(anchor, head = anchor) {
      return new EditorSelection([EditorSelection.range(anchor, head)], 0);
    }
    /**
    Sort and merge the given set of ranges, creating a valid
    selection.
    */
    static create(ranges, mainIndex = 0) {
      if (ranges.length == 0)
        throw new RangeError("A selection needs at least one range");
      for (let pos = 0, i2 = 0; i2 < ranges.length; i2++) {
        let range = ranges[i2];
        if (range.empty ? range.from <= pos : range.from < pos)
          return EditorSelection.normalized(ranges.slice(), mainIndex);
        pos = range.to;
      }
      return new EditorSelection(ranges, mainIndex);
    }
    /**
    Create a cursor selection range at the given position. You can
    safely ignore the optional arguments in most situations.
    */
    static cursor(pos, assoc = 0, bidiLevel, goalColumn) {
      return SelectionRange.create(pos, pos, (assoc == 0 ? 0 : assoc < 0 ? 8 : 16) | (bidiLevel == null ? 7 : Math.min(6, bidiLevel)) | (goalColumn !== null && goalColumn !== void 0 ? goalColumn : 16777215) << 6);
    }
    /**
    Create a selection range.
    */
    static range(anchor, head, goalColumn, bidiLevel) {
      let flags = (goalColumn !== null && goalColumn !== void 0 ? goalColumn : 16777215) << 6 | (bidiLevel == null ? 7 : Math.min(6, bidiLevel));
      return head < anchor ? SelectionRange.create(head, anchor, 32 | 16 | flags) : SelectionRange.create(anchor, head, (head > anchor ? 8 : 0) | flags);
    }
    /**
    @internal
    */
    static normalized(ranges, mainIndex = 0) {
      let main = ranges[mainIndex];
      ranges.sort((a2, b2) => a2.from - b2.from);
      mainIndex = ranges.indexOf(main);
      for (let i2 = 1; i2 < ranges.length; i2++) {
        let range = ranges[i2], prev = ranges[i2 - 1];
        if (range.empty ? range.from <= prev.to : range.from < prev.to) {
          let from = prev.from, to = Math.max(range.to, prev.to);
          if (i2 <= mainIndex)
            mainIndex--;
          ranges.splice(--i2, 2, range.anchor > range.head ? EditorSelection.range(to, from) : EditorSelection.range(from, to));
        }
      }
      return new EditorSelection(ranges, mainIndex);
    }
  }
  function checkSelection(selection, docLength) {
    for (let range of selection.ranges)
      if (range.to > docLength)
        throw new RangeError("Selection points outside of document");
  }
  let nextID = 0;
  class Facet {
    constructor(combine, compareInput, compare2, isStatic, enables) {
      this.combine = combine;
      this.compareInput = compareInput;
      this.compare = compare2;
      this.isStatic = isStatic;
      this.id = nextID++;
      this.default = combine([]);
      this.extensions = typeof enables == "function" ? enables(this) : enables;
    }
    /**
    Returns a facet reader for this facet, which can be used to
    [read](https://codemirror.net/6/docs/ref/#state.EditorState.facet) it but not to define values for it.
    */
    get reader() {
      return this;
    }
    /**
    Define a new facet.
    */
    static define(config = {}) {
      return new Facet(config.combine || ((a2) => a2), config.compareInput || ((a2, b2) => a2 === b2), config.compare || (!config.combine ? sameArray : (a2, b2) => a2 === b2), !!config.static, config.enables);
    }
    /**
    Returns an extension that adds the given value to this facet.
    */
    of(value) {
      return new FacetProvider([], this, 0, value);
    }
    /**
    Create an extension that computes a value for the facet from a
    state. You must take care to declare the parts of the state that
    this value depends on, since your function is only called again
    for a new state when one of those parts changed.
    
    In cases where your value depends only on a single field, you'll
    want to use the [`from`](https://codemirror.net/6/docs/ref/#state.Facet.from) method instead.
    */
    compute(deps, get) {
      if (this.isStatic)
        throw new Error("Can't compute a static facet");
      return new FacetProvider(deps, this, 1, get);
    }
    /**
    Create an extension that computes zero or more values for this
    facet from a state.
    */
    computeN(deps, get) {
      if (this.isStatic)
        throw new Error("Can't compute a static facet");
      return new FacetProvider(deps, this, 2, get);
    }
    from(field, get) {
      if (!get)
        get = (x2) => x2;
      return this.compute([field], (state) => get(state.field(field)));
    }
  }
  function sameArray(a2, b2) {
    return a2 == b2 || a2.length == b2.length && a2.every((e2, i2) => e2 === b2[i2]);
  }
  class FacetProvider {
    constructor(dependencies, facet, type, value) {
      this.dependencies = dependencies;
      this.facet = facet;
      this.type = type;
      this.value = value;
      this.id = nextID++;
    }
    dynamicSlot(addresses) {
      var _a3;
      let getter = this.value;
      let compare2 = this.facet.compareInput;
      let id = this.id, idx = addresses[id] >> 1, multi = this.type == 2;
      let depDoc = false, depSel = false, depAddrs = [];
      for (let dep of this.dependencies) {
        if (dep == "doc")
          depDoc = true;
        else if (dep == "selection")
          depSel = true;
        else if ((((_a3 = addresses[dep.id]) !== null && _a3 !== void 0 ? _a3 : 1) & 1) == 0)
          depAddrs.push(addresses[dep.id]);
      }
      return {
        create(state) {
          state.values[idx] = getter(state);
          return 1;
        },
        update(state, tr) {
          if (depDoc && tr.docChanged || depSel && (tr.docChanged || tr.selection) || ensureAll(state, depAddrs)) {
            let newVal = getter(state);
            if (multi ? !compareArray(newVal, state.values[idx], compare2) : !compare2(newVal, state.values[idx])) {
              state.values[idx] = newVal;
              return 1;
            }
          }
          return 0;
        },
        reconfigure: (state, oldState) => {
          let newVal, oldAddr = oldState.config.address[id];
          if (oldAddr != null) {
            let oldVal = getAddr(oldState, oldAddr);
            if (this.dependencies.every((dep) => {
              return dep instanceof Facet ? oldState.facet(dep) === state.facet(dep) : dep instanceof StateField ? oldState.field(dep, false) == state.field(dep, false) : true;
            }) || (multi ? compareArray(newVal = getter(state), oldVal, compare2) : compare2(newVal = getter(state), oldVal))) {
              state.values[idx] = oldVal;
              return 0;
            }
          } else {
            newVal = getter(state);
          }
          state.values[idx] = newVal;
          return 1;
        }
      };
    }
  }
  function compareArray(a2, b2, compare2) {
    if (a2.length != b2.length)
      return false;
    for (let i2 = 0; i2 < a2.length; i2++)
      if (!compare2(a2[i2], b2[i2]))
        return false;
    return true;
  }
  function ensureAll(state, addrs) {
    let changed = false;
    for (let addr of addrs)
      if (ensureAddr(state, addr) & 1)
        changed = true;
    return changed;
  }
  function dynamicFacetSlot(addresses, facet, providers) {
    let providerAddrs = providers.map((p2) => addresses[p2.id]);
    let providerTypes = providers.map((p2) => p2.type);
    let dynamic = providerAddrs.filter((p2) => !(p2 & 1));
    let idx = addresses[facet.id] >> 1;
    function get(state) {
      let values = [];
      for (let i2 = 0; i2 < providerAddrs.length; i2++) {
        let value = getAddr(state, providerAddrs[i2]);
        if (providerTypes[i2] == 2)
          for (let val of value)
            values.push(val);
        else
          values.push(value);
      }
      return facet.combine(values);
    }
    return {
      create(state) {
        for (let addr of providerAddrs)
          ensureAddr(state, addr);
        state.values[idx] = get(state);
        return 1;
      },
      update(state, tr) {
        if (!ensureAll(state, dynamic))
          return 0;
        let value = get(state);
        if (facet.compare(value, state.values[idx]))
          return 0;
        state.values[idx] = value;
        return 1;
      },
      reconfigure(state, oldState) {
        let depChanged = ensureAll(state, providerAddrs);
        let oldProviders = oldState.config.facets[facet.id], oldValue = oldState.facet(facet);
        if (oldProviders && !depChanged && sameArray(providers, oldProviders)) {
          state.values[idx] = oldValue;
          return 0;
        }
        let value = get(state);
        if (facet.compare(value, oldValue)) {
          state.values[idx] = oldValue;
          return 0;
        }
        state.values[idx] = value;
        return 1;
      }
    };
  }
  const initField = /* @__PURE__ */ Facet.define({ static: true });
  class StateField {
    constructor(id, createF, updateF, compareF, spec) {
      this.id = id;
      this.createF = createF;
      this.updateF = updateF;
      this.compareF = compareF;
      this.spec = spec;
      this.provides = void 0;
    }
    /**
    Define a state field.
    */
    static define(config) {
      let field = new StateField(nextID++, config.create, config.update, config.compare || ((a2, b2) => a2 === b2), config);
      if (config.provide)
        field.provides = config.provide(field);
      return field;
    }
    create(state) {
      let init = state.facet(initField).find((i2) => i2.field == this);
      return ((init === null || init === void 0 ? void 0 : init.create) || this.createF)(state);
    }
    /**
    @internal
    */
    slot(addresses) {
      let idx = addresses[this.id] >> 1;
      return {
        create: (state) => {
          state.values[idx] = this.create(state);
          return 1;
        },
        update: (state, tr) => {
          let oldVal = state.values[idx];
          let value = this.updateF(oldVal, tr);
          if (this.compareF(oldVal, value))
            return 0;
          state.values[idx] = value;
          return 1;
        },
        reconfigure: (state, oldState) => {
          if (oldState.config.address[this.id] != null) {
            state.values[idx] = oldState.field(this);
            return 0;
          }
          state.values[idx] = this.create(state);
          return 1;
        }
      };
    }
    /**
    Returns an extension that enables this field and overrides the
    way it is initialized. Can be useful when you need to provide a
    non-default starting value for the field.
    */
    init(create) {
      return [this, initField.of({ field: this, create })];
    }
    /**
    State field instances can be used as
    [`Extension`](https://codemirror.net/6/docs/ref/#state.Extension) values to enable the field in a
    given state.
    */
    get extension() {
      return this;
    }
  }
  const Prec_ = { lowest: 4, low: 3, default: 2, high: 1, highest: 0 };
  function prec(value) {
    return (ext) => new PrecExtension(ext, value);
  }
  const Prec = {
    /**
    The highest precedence level, for extensions that should end up
    near the start of the precedence ordering.
    */
    highest: /* @__PURE__ */ prec(Prec_.highest),
    /**
    A higher-than-default precedence, for extensions that should
    come before those with default precedence.
    */
    high: /* @__PURE__ */ prec(Prec_.high),
    /**
    The default precedence, which is also used for extensions
    without an explicit precedence.
    */
    default: /* @__PURE__ */ prec(Prec_.default),
    /**
    A lower-than-default precedence.
    */
    low: /* @__PURE__ */ prec(Prec_.low),
    /**
    The lowest precedence level. Meant for things that should end up
    near the end of the extension order.
    */
    lowest: /* @__PURE__ */ prec(Prec_.lowest)
  };
  class PrecExtension {
    constructor(inner, prec2) {
      this.inner = inner;
      this.prec = prec2;
    }
  }
  class Compartment {
    /**
    Create an instance of this compartment to add to your [state
    configuration](https://codemirror.net/6/docs/ref/#state.EditorStateConfig.extensions).
    */
    of(ext) {
      return new CompartmentInstance(this, ext);
    }
    /**
    Create an [effect](https://codemirror.net/6/docs/ref/#state.TransactionSpec.effects) that
    reconfigures this compartment.
    */
    reconfigure(content2) {
      return Compartment.reconfigure.of({ compartment: this, extension: content2 });
    }
    /**
    Get the current content of the compartment in the state, or
    `undefined` if it isn't present.
    */
    get(state) {
      return state.config.compartments.get(this);
    }
  }
  class CompartmentInstance {
    constructor(compartment, inner) {
      this.compartment = compartment;
      this.inner = inner;
    }
  }
  class Configuration {
    constructor(base2, compartments, dynamicSlots, address, staticValues, facets) {
      this.base = base2;
      this.compartments = compartments;
      this.dynamicSlots = dynamicSlots;
      this.address = address;
      this.staticValues = staticValues;
      this.facets = facets;
      this.statusTemplate = [];
      while (this.statusTemplate.length < dynamicSlots.length)
        this.statusTemplate.push(
          0
          /* SlotStatus.Unresolved */
        );
    }
    staticFacet(facet) {
      let addr = this.address[facet.id];
      return addr == null ? facet.default : this.staticValues[addr >> 1];
    }
    static resolve(base2, compartments, oldState) {
      let fields = [];
      let facets = /* @__PURE__ */ Object.create(null);
      let newCompartments = /* @__PURE__ */ new Map();
      for (let ext of flatten(base2, compartments, newCompartments)) {
        if (ext instanceof StateField)
          fields.push(ext);
        else
          (facets[ext.facet.id] || (facets[ext.facet.id] = [])).push(ext);
      }
      let address = /* @__PURE__ */ Object.create(null);
      let staticValues = [];
      let dynamicSlots = [];
      for (let field of fields) {
        address[field.id] = dynamicSlots.length << 1;
        dynamicSlots.push((a2) => field.slot(a2));
      }
      let oldFacets = oldState === null || oldState === void 0 ? void 0 : oldState.config.facets;
      for (let id in facets) {
        let providers = facets[id], facet = providers[0].facet;
        let oldProviders = oldFacets && oldFacets[id] || [];
        if (providers.every(
          (p2) => p2.type == 0
          /* Provider.Static */
        )) {
          address[facet.id] = staticValues.length << 1 | 1;
          if (sameArray(oldProviders, providers)) {
            staticValues.push(oldState.facet(facet));
          } else {
            let value = facet.combine(providers.map((p2) => p2.value));
            staticValues.push(oldState && facet.compare(value, oldState.facet(facet)) ? oldState.facet(facet) : value);
          }
        } else {
          for (let p2 of providers) {
            if (p2.type == 0) {
              address[p2.id] = staticValues.length << 1 | 1;
              staticValues.push(p2.value);
            } else {
              address[p2.id] = dynamicSlots.length << 1;
              dynamicSlots.push((a2) => p2.dynamicSlot(a2));
            }
          }
          address[facet.id] = dynamicSlots.length << 1;
          dynamicSlots.push((a2) => dynamicFacetSlot(a2, facet, providers));
        }
      }
      let dynamic = dynamicSlots.map((f2) => f2(address));
      return new Configuration(base2, newCompartments, dynamic, address, staticValues, facets);
    }
  }
  function flatten(extension, compartments, newCompartments) {
    let result = [[], [], [], [], []];
    let seen = /* @__PURE__ */ new Map();
    function inner(ext, prec2) {
      let known = seen.get(ext);
      if (known != null) {
        if (known <= prec2)
          return;
        let found = result[known].indexOf(ext);
        if (found > -1)
          result[known].splice(found, 1);
        if (ext instanceof CompartmentInstance)
          newCompartments.delete(ext.compartment);
      }
      seen.set(ext, prec2);
      if (Array.isArray(ext)) {
        for (let e2 of ext)
          inner(e2, prec2);
      } else if (ext instanceof CompartmentInstance) {
        if (newCompartments.has(ext.compartment))
          throw new RangeError(`Duplicate use of compartment in extensions`);
        let content2 = compartments.get(ext.compartment) || ext.inner;
        newCompartments.set(ext.compartment, content2);
        inner(content2, prec2);
      } else if (ext instanceof PrecExtension) {
        inner(ext.inner, ext.prec);
      } else if (ext instanceof StateField) {
        result[prec2].push(ext);
        if (ext.provides)
          inner(ext.provides, prec2);
      } else if (ext instanceof FacetProvider) {
        result[prec2].push(ext);
        if (ext.facet.extensions)
          inner(ext.facet.extensions, Prec_.default);
      } else {
        let content2 = ext.extension;
        if (!content2)
          throw new Error(`Unrecognized extension value in extension set (${ext}). This sometimes happens because multiple instances of @codemirror/state are loaded, breaking instanceof checks.`);
        inner(content2, prec2);
      }
    }
    inner(extension, Prec_.default);
    return result.reduce((a2, b2) => a2.concat(b2));
  }
  function ensureAddr(state, addr) {
    if (addr & 1)
      return 2;
    let idx = addr >> 1;
    let status = state.status[idx];
    if (status == 4)
      throw new Error("Cyclic dependency between fields and/or facets");
    if (status & 2)
      return status;
    state.status[idx] = 4;
    let changed = state.computeSlot(state, state.config.dynamicSlots[idx]);
    return state.status[idx] = 2 | changed;
  }
  function getAddr(state, addr) {
    return addr & 1 ? state.config.staticValues[addr >> 1] : state.values[addr >> 1];
  }
  const languageData = /* @__PURE__ */ Facet.define();
  const allowMultipleSelections = /* @__PURE__ */ Facet.define({
    combine: (values) => values.some((v2) => v2),
    static: true
  });
  const lineSeparator = /* @__PURE__ */ Facet.define({
    combine: (values) => values.length ? values[0] : void 0,
    static: true
  });
  const changeFilter = /* @__PURE__ */ Facet.define();
  const transactionFilter = /* @__PURE__ */ Facet.define();
  const transactionExtender = /* @__PURE__ */ Facet.define();
  const readOnly = /* @__PURE__ */ Facet.define({
    combine: (values) => values.length ? values[0] : false
  });
  class Annotation {
    /**
    @internal
    */
    constructor(type, value) {
      this.type = type;
      this.value = value;
    }
    /**
    Define a new type of annotation.
    */
    static define() {
      return new AnnotationType();
    }
  }
  class AnnotationType {
    /**
    Create an instance of this annotation.
    */
    of(value) {
      return new Annotation(this, value);
    }
  }
  class StateEffectType {
    /**
    @internal
    */
    constructor(map) {
      this.map = map;
    }
    /**
    Create a [state effect](https://codemirror.net/6/docs/ref/#state.StateEffect) instance of this
    type.
    */
    of(value) {
      return new StateEffect(this, value);
    }
  }
  class StateEffect {
    /**
    @internal
    */
    constructor(type, value) {
      this.type = type;
      this.value = value;
    }
    /**
    Map this effect through a position mapping. Will return
    `undefined` when that ends up deleting the effect.
    */
    map(mapping) {
      let mapped = this.type.map(this.value, mapping);
      return mapped === void 0 ? void 0 : mapped == this.value ? this : new StateEffect(this.type, mapped);
    }
    /**
    Tells you whether this effect object is of a given
    [type](https://codemirror.net/6/docs/ref/#state.StateEffectType).
    */
    is(type) {
      return this.type == type;
    }
    /**
    Define a new effect type. The type parameter indicates the type
    of values that his effect holds. It should be a type that
    doesn't include `undefined`, since that is used in
    [mapping](https://codemirror.net/6/docs/ref/#state.StateEffect.map) to indicate that an effect is
    removed.
    */
    static define(spec = {}) {
      return new StateEffectType(spec.map || ((v2) => v2));
    }
    /**
    Map an array of effects through a change set.
    */
    static mapEffects(effects, mapping) {
      if (!effects.length)
        return effects;
      let result = [];
      for (let effect of effects) {
        let mapped = effect.map(mapping);
        if (mapped)
          result.push(mapped);
      }
      return result;
    }
  }
  StateEffect.reconfigure = /* @__PURE__ */ StateEffect.define();
  StateEffect.appendConfig = /* @__PURE__ */ StateEffect.define();
  class Transaction {
    constructor(startState, changes, selection, effects, annotations, scrollIntoView2) {
      this.startState = startState;
      this.changes = changes;
      this.selection = selection;
      this.effects = effects;
      this.annotations = annotations;
      this.scrollIntoView = scrollIntoView2;
      this._doc = null;
      this._state = null;
      if (selection)
        checkSelection(selection, changes.newLength);
      if (!annotations.some((a2) => a2.type == Transaction.time))
        this.annotations = annotations.concat(Transaction.time.of(Date.now()));
    }
    /**
    @internal
    */
    static create(startState, changes, selection, effects, annotations, scrollIntoView2) {
      return new Transaction(startState, changes, selection, effects, annotations, scrollIntoView2);
    }
    /**
    The new document produced by the transaction. Contrary to
    [`.state`](https://codemirror.net/6/docs/ref/#state.Transaction.state)`.doc`, accessing this won't
    force the entire new state to be computed right away, so it is
    recommended that [transaction
    filters](https://codemirror.net/6/docs/ref/#state.EditorState^transactionFilter) use this getter
    when they need to look at the new document.
    */
    get newDoc() {
      return this._doc || (this._doc = this.changes.apply(this.startState.doc));
    }
    /**
    The new selection produced by the transaction. If
    [`this.selection`](https://codemirror.net/6/docs/ref/#state.Transaction.selection) is undefined,
    this will [map](https://codemirror.net/6/docs/ref/#state.EditorSelection.map) the start state's
    current selection through the changes made by the transaction.
    */
    get newSelection() {
      return this.selection || this.startState.selection.map(this.changes);
    }
    /**
    The new state created by the transaction. Computed on demand
    (but retained for subsequent access), so it is recommended not to
    access it in [transaction
    filters](https://codemirror.net/6/docs/ref/#state.EditorState^transactionFilter) when possible.
    */
    get state() {
      if (!this._state)
        this.startState.applyTransaction(this);
      return this._state;
    }
    /**
    Get the value of the given annotation type, if any.
    */
    annotation(type) {
      for (let ann of this.annotations)
        if (ann.type == type)
          return ann.value;
      return void 0;
    }
    /**
    Indicates whether the transaction changed the document.
    */
    get docChanged() {
      return !this.changes.empty;
    }
    /**
    Indicates whether this transaction reconfigures the state
    (through a [configuration compartment](https://codemirror.net/6/docs/ref/#state.Compartment) or
    with a top-level configuration
    [effect](https://codemirror.net/6/docs/ref/#state.StateEffect^reconfigure).
    */
    get reconfigured() {
      return this.startState.config != this.state.config;
    }
    /**
    Returns true if the transaction has a [user
    event](https://codemirror.net/6/docs/ref/#state.Transaction^userEvent) annotation that is equal to
    or more specific than `event`. For example, if the transaction
    has `"select.pointer"` as user event, `"select"` and
    `"select.pointer"` will match it.
    */
    isUserEvent(event) {
      let e2 = this.annotation(Transaction.userEvent);
      return !!(e2 && (e2 == event || e2.length > event.length && e2.slice(0, event.length) == event && e2[event.length] == "."));
    }
  }
  Transaction.time = /* @__PURE__ */ Annotation.define();
  Transaction.userEvent = /* @__PURE__ */ Annotation.define();
  Transaction.addToHistory = /* @__PURE__ */ Annotation.define();
  Transaction.remote = /* @__PURE__ */ Annotation.define();
  function joinRanges(a2, b2) {
    let result = [];
    for (let iA = 0, iB = 0; ; ) {
      let from, to;
      if (iA < a2.length && (iB == b2.length || b2[iB] >= a2[iA])) {
        from = a2[iA++];
        to = a2[iA++];
      } else if (iB < b2.length) {
        from = b2[iB++];
        to = b2[iB++];
      } else
        return result;
      if (!result.length || result[result.length - 1] < from)
        result.push(from, to);
      else if (result[result.length - 1] < to)
        result[result.length - 1] = to;
    }
  }
  function mergeTransaction(a2, b2, sequential) {
    var _a3;
    let mapForA, mapForB, changes;
    if (sequential) {
      mapForA = b2.changes;
      mapForB = ChangeSet.empty(b2.changes.length);
      changes = a2.changes.compose(b2.changes);
    } else {
      mapForA = b2.changes.map(a2.changes);
      mapForB = a2.changes.mapDesc(b2.changes, true);
      changes = a2.changes.compose(mapForA);
    }
    return {
      changes,
      selection: b2.selection ? b2.selection.map(mapForB) : (_a3 = a2.selection) === null || _a3 === void 0 ? void 0 : _a3.map(mapForA),
      effects: StateEffect.mapEffects(a2.effects, mapForA).concat(StateEffect.mapEffects(b2.effects, mapForB)),
      annotations: a2.annotations.length ? a2.annotations.concat(b2.annotations) : b2.annotations,
      scrollIntoView: a2.scrollIntoView || b2.scrollIntoView
    };
  }
  function resolveTransactionInner(state, spec, docSize) {
    let sel = spec.selection, annotations = asArray(spec.annotations);
    if (spec.userEvent)
      annotations = annotations.concat(Transaction.userEvent.of(spec.userEvent));
    return {
      changes: spec.changes instanceof ChangeSet ? spec.changes : ChangeSet.of(spec.changes || [], docSize, state.facet(lineSeparator)),
      selection: sel && (sel instanceof EditorSelection ? sel : EditorSelection.single(sel.anchor, sel.head)),
      effects: asArray(spec.effects),
      annotations,
      scrollIntoView: !!spec.scrollIntoView
    };
  }
  function resolveTransaction(state, specs, filter) {
    let s2 = resolveTransactionInner(state, specs.length ? specs[0] : {}, state.doc.length);
    if (specs.length && specs[0].filter === false)
      filter = false;
    for (let i2 = 1; i2 < specs.length; i2++) {
      if (specs[i2].filter === false)
        filter = false;
      let seq = !!specs[i2].sequential;
      s2 = mergeTransaction(s2, resolveTransactionInner(state, specs[i2], seq ? s2.changes.newLength : state.doc.length), seq);
    }
    let tr = Transaction.create(state, s2.changes, s2.selection, s2.effects, s2.annotations, s2.scrollIntoView);
    return extendTransaction(filter ? filterTransaction(tr) : tr);
  }
  function filterTransaction(tr) {
    let state = tr.startState;
    let result = true;
    for (let filter of state.facet(changeFilter)) {
      let value = filter(tr);
      if (value === false) {
        result = false;
        break;
      }
      if (Array.isArray(value))
        result = result === true ? value : joinRanges(result, value);
    }
    if (result !== true) {
      let changes, back;
      if (result === false) {
        back = tr.changes.invertedDesc;
        changes = ChangeSet.empty(state.doc.length);
      } else {
        let filtered = tr.changes.filter(result);
        changes = filtered.changes;
        back = filtered.filtered.mapDesc(filtered.changes).invertedDesc;
      }
      tr = Transaction.create(state, changes, tr.selection && tr.selection.map(back), StateEffect.mapEffects(tr.effects, back), tr.annotations, tr.scrollIntoView);
    }
    let filters = state.facet(transactionFilter);
    for (let i2 = filters.length - 1; i2 >= 0; i2--) {
      let filtered = filters[i2](tr);
      if (filtered instanceof Transaction)
        tr = filtered;
      else if (Array.isArray(filtered) && filtered.length == 1 && filtered[0] instanceof Transaction)
        tr = filtered[0];
      else
        tr = resolveTransaction(state, asArray(filtered), false);
    }
    return tr;
  }
  function extendTransaction(tr) {
    let state = tr.startState, extenders = state.facet(transactionExtender), spec = tr;
    for (let i2 = extenders.length - 1; i2 >= 0; i2--) {
      let extension = extenders[i2](tr);
      if (extension && Object.keys(extension).length)
        spec = mergeTransaction(spec, resolveTransactionInner(state, extension, tr.changes.newLength), true);
    }
    return spec == tr ? tr : Transaction.create(state, tr.changes, tr.selection, spec.effects, spec.annotations, spec.scrollIntoView);
  }
  const none$1 = [];
  function asArray(value) {
    return value == null ? none$1 : Array.isArray(value) ? value : [value];
  }
  var CharCategory = /* @__PURE__ */ function(CharCategory2) {
    CharCategory2[CharCategory2["Word"] = 0] = "Word";
    CharCategory2[CharCategory2["Space"] = 1] = "Space";
    CharCategory2[CharCategory2["Other"] = 2] = "Other";
    return CharCategory2;
  }(CharCategory || (CharCategory = {}));
  const nonASCIISingleCaseWordChar = /[\u00df\u0587\u0590-\u05f4\u0600-\u06ff\u3040-\u309f\u30a0-\u30ff\u3400-\u4db5\u4e00-\u9fcc\uac00-\ud7af]/;
  let wordChar;
  try {
    wordChar = /* @__PURE__ */ new RegExp("[\\p{Alphabetic}\\p{Number}_]", "u");
  } catch (_2) {
  }
  function hasWordChar(str) {
    if (wordChar)
      return wordChar.test(str);
    for (let i2 = 0; i2 < str.length; i2++) {
      let ch = str[i2];
      if (/\w/.test(ch) || ch > "" && (ch.toUpperCase() != ch.toLowerCase() || nonASCIISingleCaseWordChar.test(ch)))
        return true;
    }
    return false;
  }
  function makeCategorizer(wordChars) {
    return (char) => {
      if (!/\S/.test(char))
        return CharCategory.Space;
      if (hasWordChar(char))
        return CharCategory.Word;
      for (let i2 = 0; i2 < wordChars.length; i2++)
        if (char.indexOf(wordChars[i2]) > -1)
          return CharCategory.Word;
      return CharCategory.Other;
    };
  }
  class EditorState {
    constructor(config, doc2, selection, values, computeSlot, tr) {
      this.config = config;
      this.doc = doc2;
      this.selection = selection;
      this.values = values;
      this.status = config.statusTemplate.slice();
      this.computeSlot = computeSlot;
      if (tr)
        tr._state = this;
      for (let i2 = 0; i2 < this.config.dynamicSlots.length; i2++)
        ensureAddr(this, i2 << 1);
      this.computeSlot = null;
    }
    field(field, require = true) {
      let addr = this.config.address[field.id];
      if (addr == null) {
        if (require)
          throw new RangeError("Field is not present in this state");
        return void 0;
      }
      ensureAddr(this, addr);
      return getAddr(this, addr);
    }
    /**
    Create a [transaction](https://codemirror.net/6/docs/ref/#state.Transaction) that updates this
    state. Any number of [transaction specs](https://codemirror.net/6/docs/ref/#state.TransactionSpec)
    can be passed. Unless
    [`sequential`](https://codemirror.net/6/docs/ref/#state.TransactionSpec.sequential) is set, the
    [changes](https://codemirror.net/6/docs/ref/#state.TransactionSpec.changes) (if any) of each spec
    are assumed to start in the _current_ document (not the document
    produced by previous specs), and its
    [selection](https://codemirror.net/6/docs/ref/#state.TransactionSpec.selection) and
    [effects](https://codemirror.net/6/docs/ref/#state.TransactionSpec.effects) are assumed to refer
    to the document created by its _own_ changes. The resulting
    transaction contains the combined effect of all the different
    specs. For [selection](https://codemirror.net/6/docs/ref/#state.TransactionSpec.selection), later
    specs take precedence over earlier ones.
    */
    update(...specs) {
      return resolveTransaction(this, specs, true);
    }
    /**
    @internal
    */
    applyTransaction(tr) {
      let conf = this.config, { base: base2, compartments } = conf;
      for (let effect of tr.effects) {
        if (effect.is(Compartment.reconfigure)) {
          if (conf) {
            compartments = /* @__PURE__ */ new Map();
            conf.compartments.forEach((val, key) => compartments.set(key, val));
            conf = null;
          }
          compartments.set(effect.value.compartment, effect.value.extension);
        } else if (effect.is(StateEffect.reconfigure)) {
          conf = null;
          base2 = effect.value;
        } else if (effect.is(StateEffect.appendConfig)) {
          conf = null;
          base2 = asArray(base2).concat(effect.value);
        }
      }
      let startValues;
      if (!conf) {
        conf = Configuration.resolve(base2, compartments, this);
        let intermediateState = new EditorState(conf, this.doc, this.selection, conf.dynamicSlots.map(() => null), (state, slot) => slot.reconfigure(state, this), null);
        startValues = intermediateState.values;
      } else {
        startValues = tr.startState.values.slice();
      }
      let selection = tr.startState.facet(allowMultipleSelections) ? tr.newSelection : tr.newSelection.asSingle();
      new EditorState(conf, tr.newDoc, selection, startValues, (state, slot) => slot.update(state, tr), tr);
    }
    /**
    Create a [transaction spec](https://codemirror.net/6/docs/ref/#state.TransactionSpec) that
    replaces every selection range with the given content.
    */
    replaceSelection(text) {
      if (typeof text == "string")
        text = this.toText(text);
      return this.changeByRange((range) => ({
        changes: { from: range.from, to: range.to, insert: text },
        range: EditorSelection.cursor(range.from + text.length)
      }));
    }
    /**
    Create a set of changes and a new selection by running the given
    function for each range in the active selection. The function
    can return an optional set of changes (in the coordinate space
    of the start document), plus an updated range (in the coordinate
    space of the document produced by the call's own changes). This
    method will merge all the changes and ranges into a single
    changeset and selection, and return it as a [transaction
    spec](https://codemirror.net/6/docs/ref/#state.TransactionSpec), which can be passed to
    [`update`](https://codemirror.net/6/docs/ref/#state.EditorState.update).
    */
    changeByRange(f2) {
      let sel = this.selection;
      let result1 = f2(sel.ranges[0]);
      let changes = this.changes(result1.changes), ranges = [result1.range];
      let effects = asArray(result1.effects);
      for (let i2 = 1; i2 < sel.ranges.length; i2++) {
        let result = f2(sel.ranges[i2]);
        let newChanges = this.changes(result.changes), newMapped = newChanges.map(changes);
        for (let j2 = 0; j2 < i2; j2++)
          ranges[j2] = ranges[j2].map(newMapped);
        let mapBy = changes.mapDesc(newChanges, true);
        ranges.push(result.range.map(mapBy));
        changes = changes.compose(newMapped);
        effects = StateEffect.mapEffects(effects, newMapped).concat(StateEffect.mapEffects(asArray(result.effects), mapBy));
      }
      return {
        changes,
        selection: EditorSelection.create(ranges, sel.mainIndex),
        effects
      };
    }
    /**
    Create a [change set](https://codemirror.net/6/docs/ref/#state.ChangeSet) from the given change
    description, taking the state's document length and line
    separator into account.
    */
    changes(spec = []) {
      if (spec instanceof ChangeSet)
        return spec;
      return ChangeSet.of(spec, this.doc.length, this.facet(EditorState.lineSeparator));
    }
    /**
    Using the state's [line
    separator](https://codemirror.net/6/docs/ref/#state.EditorState^lineSeparator), create a
    [`Text`](https://codemirror.net/6/docs/ref/#state.Text) instance from the given string.
    */
    toText(string2) {
      return Text.of(string2.split(this.facet(EditorState.lineSeparator) || DefaultSplit));
    }
    /**
    Return the given range of the document as a string.
    */
    sliceDoc(from = 0, to = this.doc.length) {
      return this.doc.sliceString(from, to, this.lineBreak);
    }
    /**
    Get the value of a state [facet](https://codemirror.net/6/docs/ref/#state.Facet).
    */
    facet(facet) {
      let addr = this.config.address[facet.id];
      if (addr == null)
        return facet.default;
      ensureAddr(this, addr);
      return getAddr(this, addr);
    }
    /**
    Convert this state to a JSON-serializable object. When custom
    fields should be serialized, you can pass them in as an object
    mapping property names (in the resulting object, which should
    not use `doc` or `selection`) to fields.
    */
    toJSON(fields) {
      let result = {
        doc: this.sliceDoc(),
        selection: this.selection.toJSON()
      };
      if (fields)
        for (let prop in fields) {
          let value = fields[prop];
          if (value instanceof StateField && this.config.address[value.id] != null)
            result[prop] = value.spec.toJSON(this.field(fields[prop]), this);
        }
      return result;
    }
    /**
    Deserialize a state from its JSON representation. When custom
    fields should be deserialized, pass the same object you passed
    to [`toJSON`](https://codemirror.net/6/docs/ref/#state.EditorState.toJSON) when serializing as
    third argument.
    */
    static fromJSON(json, config = {}, fields) {
      if (!json || typeof json.doc != "string")
        throw new RangeError("Invalid JSON representation for EditorState");
      let fieldInit = [];
      if (fields)
        for (let prop in fields) {
          if (Object.prototype.hasOwnProperty.call(json, prop)) {
            let field = fields[prop], value = json[prop];
            fieldInit.push(field.init((state) => field.spec.fromJSON(value, state)));
          }
        }
      return EditorState.create({
        doc: json.doc,
        selection: EditorSelection.fromJSON(json.selection),
        extensions: config.extensions ? fieldInit.concat([config.extensions]) : fieldInit
      });
    }
    /**
    Create a new state. You'll usually only need this when
    initializing an editor—updated states are created by applying
    transactions.
    */
    static create(config = {}) {
      let configuration = Configuration.resolve(config.extensions || [], /* @__PURE__ */ new Map());
      let doc2 = config.doc instanceof Text ? config.doc : Text.of((config.doc || "").split(configuration.staticFacet(EditorState.lineSeparator) || DefaultSplit));
      let selection = !config.selection ? EditorSelection.single(0) : config.selection instanceof EditorSelection ? config.selection : EditorSelection.single(config.selection.anchor, config.selection.head);
      checkSelection(selection, doc2.length);
      if (!configuration.staticFacet(allowMultipleSelections))
        selection = selection.asSingle();
      return new EditorState(configuration, doc2, selection, configuration.dynamicSlots.map(() => null), (state, slot) => slot.create(state), null);
    }
    /**
    The size (in columns) of a tab in the document, determined by
    the [`tabSize`](https://codemirror.net/6/docs/ref/#state.EditorState^tabSize) facet.
    */
    get tabSize() {
      return this.facet(EditorState.tabSize);
    }
    /**
    Get the proper [line-break](https://codemirror.net/6/docs/ref/#state.EditorState^lineSeparator)
    string for this state.
    */
    get lineBreak() {
      return this.facet(EditorState.lineSeparator) || "\n";
    }
    /**
    Returns true when the editor is
    [configured](https://codemirror.net/6/docs/ref/#state.EditorState^readOnly) to be read-only.
    */
    get readOnly() {
      return this.facet(readOnly);
    }
    /**
    Look up a translation for the given phrase (via the
    [`phrases`](https://codemirror.net/6/docs/ref/#state.EditorState^phrases) facet), or return the
    original string if no translation is found.
    
    If additional arguments are passed, they will be inserted in
    place of markers like `$1` (for the first value) and `$2`, etc.
    A single `$` is equivalent to `$1`, and `$$` will produce a
    literal dollar sign.
    */
    phrase(phrase, ...insert2) {
      for (let map of this.facet(EditorState.phrases))
        if (Object.prototype.hasOwnProperty.call(map, phrase)) {
          phrase = map[phrase];
          break;
        }
      if (insert2.length)
        phrase = phrase.replace(/\$(\$|\d*)/g, (m2, i2) => {
          if (i2 == "$")
            return "$";
          let n2 = +(i2 || 1);
          return !n2 || n2 > insert2.length ? m2 : insert2[n2 - 1];
        });
      return phrase;
    }
    /**
    Find the values for a given language data field, provided by the
    the [`languageData`](https://codemirror.net/6/docs/ref/#state.EditorState^languageData) facet.
    
    Examples of language data fields are...
    
    - [`"commentTokens"`](https://codemirror.net/6/docs/ref/#commands.CommentTokens) for specifying
      comment syntax.
    - [`"autocomplete"`](https://codemirror.net/6/docs/ref/#autocomplete.autocompletion^config.override)
      for providing language-specific completion sources.
    - [`"wordChars"`](https://codemirror.net/6/docs/ref/#state.EditorState.charCategorizer) for adding
      characters that should be considered part of words in this
      language.
    - [`"closeBrackets"`](https://codemirror.net/6/docs/ref/#autocomplete.CloseBracketConfig) controls
      bracket closing behavior.
    */
    languageDataAt(name2, pos, side = -1) {
      let values = [];
      for (let provider of this.facet(languageData)) {
        for (let result of provider(this, pos, side)) {
          if (Object.prototype.hasOwnProperty.call(result, name2))
            values.push(result[name2]);
        }
      }
      return values;
    }
    /**
    Return a function that can categorize strings (expected to
    represent a single [grapheme cluster](https://codemirror.net/6/docs/ref/#state.findClusterBreak))
    into one of:
    
     - Word (contains an alphanumeric character or a character
       explicitly listed in the local language's `"wordChars"`
       language data, which should be a string)
     - Space (contains only whitespace)
     - Other (anything else)
    */
    charCategorizer(at) {
      return makeCategorizer(this.languageDataAt("wordChars", at).join(""));
    }
    /**
    Find the word at the given position, meaning the range
    containing all [word](https://codemirror.net/6/docs/ref/#state.CharCategory.Word) characters
    around it. If no word characters are adjacent to the position,
    this returns null.
    */
    wordAt(pos) {
      let { text, from, length } = this.doc.lineAt(pos);
      let cat = this.charCategorizer(pos);
      let start = pos - from, end = pos - from;
      while (start > 0) {
        let prev = findClusterBreak(text, start, false);
        if (cat(text.slice(prev, start)) != CharCategory.Word)
          break;
        start = prev;
      }
      while (end < length) {
        let next = findClusterBreak(text, end);
        if (cat(text.slice(end, next)) != CharCategory.Word)
          break;
        end = next;
      }
      return start == end ? null : EditorSelection.range(start + from, end + from);
    }
  }
  EditorState.allowMultipleSelections = allowMultipleSelections;
  EditorState.tabSize = /* @__PURE__ */ Facet.define({
    combine: (values) => values.length ? values[0] : 4
  });
  EditorState.lineSeparator = lineSeparator;
  EditorState.readOnly = readOnly;
  EditorState.phrases = /* @__PURE__ */ Facet.define({
    compare(a2, b2) {
      let kA = Object.keys(a2), kB = Object.keys(b2);
      return kA.length == kB.length && kA.every((k2) => a2[k2] == b2[k2]);
    }
  });
  EditorState.languageData = languageData;
  EditorState.changeFilter = changeFilter;
  EditorState.transactionFilter = transactionFilter;
  EditorState.transactionExtender = transactionExtender;
  Compartment.reconfigure = /* @__PURE__ */ StateEffect.define();
  function combineConfig(configs, defaults, combine = {}) {
    let result = {};
    for (let config of configs)
      for (let key of Object.keys(config)) {
        let value = config[key], current = result[key];
        if (current === void 0)
          result[key] = value;
        else if (current === value || value === void 0)
          ;
        else if (Object.hasOwnProperty.call(combine, key))
          result[key] = combine[key](current, value);
        else
          throw new Error("Config merge conflict for field " + key);
      }
    for (let key in defaults)
      if (result[key] === void 0)
        result[key] = defaults[key];
    return result;
  }
  class RangeValue {
    /**
    Compare this value with another value. Used when comparing
    rangesets. The default implementation compares by identity.
    Unless you are only creating a fixed number of unique instances
    of your value type, it is a good idea to implement this
    properly.
    */
    eq(other) {
      return this == other;
    }
    /**
    Create a [range](https://codemirror.net/6/docs/ref/#state.Range) with this value.
    */
    range(from, to = from) {
      return Range.create(from, to, this);
    }
  }
  RangeValue.prototype.startSide = RangeValue.prototype.endSide = 0;
  RangeValue.prototype.point = false;
  RangeValue.prototype.mapMode = MapMode.TrackDel;
  class Range {
    constructor(from, to, value) {
      this.from = from;
      this.to = to;
      this.value = value;
    }
    /**
    @internal
    */
    static create(from, to, value) {
      return new Range(from, to, value);
    }
  }
  function cmpRange(a2, b2) {
    return a2.from - b2.from || a2.value.startSide - b2.value.startSide;
  }
  class Chunk {
    constructor(from, to, value, maxPoint) {
      this.from = from;
      this.to = to;
      this.value = value;
      this.maxPoint = maxPoint;
    }
    get length() {
      return this.to[this.to.length - 1];
    }
    // Find the index of the given position and side. Use the ranges'
    // `from` pos when `end == false`, `to` when `end == true`.
    findIndex(pos, side, end, startAt = 0) {
      let arr = end ? this.to : this.from;
      for (let lo = startAt, hi = arr.length; ; ) {
        if (lo == hi)
          return lo;
        let mid = lo + hi >> 1;
        let diff = arr[mid] - pos || (end ? this.value[mid].endSide : this.value[mid].startSide) - side;
        if (mid == lo)
          return diff >= 0 ? lo : hi;
        if (diff >= 0)
          hi = mid;
        else
          lo = mid + 1;
      }
    }
    between(offset, from, to, f2) {
      for (let i2 = this.findIndex(from, -1e9, true), e2 = this.findIndex(to, 1e9, false, i2); i2 < e2; i2++)
        if (f2(this.from[i2] + offset, this.to[i2] + offset, this.value[i2]) === false)
          return false;
    }
    map(offset, changes) {
      let value = [], from = [], to = [], newPos = -1, maxPoint = -1;
      for (let i2 = 0; i2 < this.value.length; i2++) {
        let val = this.value[i2], curFrom = this.from[i2] + offset, curTo = this.to[i2] + offset, newFrom, newTo;
        if (curFrom == curTo) {
          let mapped = changes.mapPos(curFrom, val.startSide, val.mapMode);
          if (mapped == null)
            continue;
          newFrom = newTo = mapped;
          if (val.startSide != val.endSide) {
            newTo = changes.mapPos(curFrom, val.endSide);
            if (newTo < newFrom)
              continue;
          }
        } else {
          newFrom = changes.mapPos(curFrom, val.startSide);
          newTo = changes.mapPos(curTo, val.endSide);
          if (newFrom > newTo || newFrom == newTo && val.startSide > 0 && val.endSide <= 0)
            continue;
        }
        if ((newTo - newFrom || val.endSide - val.startSide) < 0)
          continue;
        if (newPos < 0)
          newPos = newFrom;
        if (val.point)
          maxPoint = Math.max(maxPoint, newTo - newFrom);
        value.push(val);
        from.push(newFrom - newPos);
        to.push(newTo - newPos);
      }
      return { mapped: value.length ? new Chunk(from, to, value, maxPoint) : null, pos: newPos };
    }
  }
  class RangeSet {
    constructor(chunkPos, chunk, nextLayer, maxPoint) {
      this.chunkPos = chunkPos;
      this.chunk = chunk;
      this.nextLayer = nextLayer;
      this.maxPoint = maxPoint;
    }
    /**
    @internal
    */
    static create(chunkPos, chunk, nextLayer, maxPoint) {
      return new RangeSet(chunkPos, chunk, nextLayer, maxPoint);
    }
    /**
    @internal
    */
    get length() {
      let last = this.chunk.length - 1;
      return last < 0 ? 0 : Math.max(this.chunkEnd(last), this.nextLayer.length);
    }
    /**
    The number of ranges in the set.
    */
    get size() {
      if (this.isEmpty)
        return 0;
      let size = this.nextLayer.size;
      for (let chunk of this.chunk)
        size += chunk.value.length;
      return size;
    }
    /**
    @internal
    */
    chunkEnd(index) {
      return this.chunkPos[index] + this.chunk[index].length;
    }
    /**
    Update the range set, optionally adding new ranges or filtering
    out existing ones.
    
    (Note: The type parameter is just there as a kludge to work
    around TypeScript variance issues that prevented `RangeSet<X>`
    from being a subtype of `RangeSet<Y>` when `X` is a subtype of
    `Y`.)
    */
    update(updateSpec) {
      let { add = [], sort = false, filterFrom = 0, filterTo = this.length } = updateSpec;
      let filter = updateSpec.filter;
      if (add.length == 0 && !filter)
        return this;
      if (sort)
        add = add.slice().sort(cmpRange);
      if (this.isEmpty)
        return add.length ? RangeSet.of(add) : this;
      let cur = new LayerCursor(this, null, -1).goto(0), i2 = 0, spill = [];
      let builder = new RangeSetBuilder();
      while (cur.value || i2 < add.length) {
        if (i2 < add.length && (cur.from - add[i2].from || cur.startSide - add[i2].value.startSide) >= 0) {
          let range = add[i2++];
          if (!builder.addInner(range.from, range.to, range.value))
            spill.push(range);
        } else if (cur.rangeIndex == 1 && cur.chunkIndex < this.chunk.length && (i2 == add.length || this.chunkEnd(cur.chunkIndex) < add[i2].from) && (!filter || filterFrom > this.chunkEnd(cur.chunkIndex) || filterTo < this.chunkPos[cur.chunkIndex]) && builder.addChunk(this.chunkPos[cur.chunkIndex], this.chunk[cur.chunkIndex])) {
          cur.nextChunk();
        } else {
          if (!filter || filterFrom > cur.to || filterTo < cur.from || filter(cur.from, cur.to, cur.value)) {
            if (!builder.addInner(cur.from, cur.to, cur.value))
              spill.push(Range.create(cur.from, cur.to, cur.value));
          }
          cur.next();
        }
      }
      return builder.finishInner(this.nextLayer.isEmpty && !spill.length ? RangeSet.empty : this.nextLayer.update({ add: spill, filter, filterFrom, filterTo }));
    }
    /**
    Map this range set through a set of changes, return the new set.
    */
    map(changes) {
      if (changes.empty || this.isEmpty)
        return this;
      let chunks = [], chunkPos = [], maxPoint = -1;
      for (let i2 = 0; i2 < this.chunk.length; i2++) {
        let start = this.chunkPos[i2], chunk = this.chunk[i2];
        let touch = changes.touchesRange(start, start + chunk.length);
        if (touch === false) {
          maxPoint = Math.max(maxPoint, chunk.maxPoint);
          chunks.push(chunk);
          chunkPos.push(changes.mapPos(start));
        } else if (touch === true) {
          let { mapped, pos } = chunk.map(start, changes);
          if (mapped) {
            maxPoint = Math.max(maxPoint, mapped.maxPoint);
            chunks.push(mapped);
            chunkPos.push(pos);
          }
        }
      }
      let next = this.nextLayer.map(changes);
      return chunks.length == 0 ? next : new RangeSet(chunkPos, chunks, next || RangeSet.empty, maxPoint);
    }
    /**
    Iterate over the ranges that touch the region `from` to `to`,
    calling `f` for each. There is no guarantee that the ranges will
    be reported in any specific order. When the callback returns
    `false`, iteration stops.
    */
    between(from, to, f2) {
      if (this.isEmpty)
        return;
      for (let i2 = 0; i2 < this.chunk.length; i2++) {
        let start = this.chunkPos[i2], chunk = this.chunk[i2];
        if (to >= start && from <= start + chunk.length && chunk.between(start, from - start, to - start, f2) === false)
          return;
      }
      this.nextLayer.between(from, to, f2);
    }
    /**
    Iterate over the ranges in this set, in order, including all
    ranges that end at or after `from`.
    */
    iter(from = 0) {
      return HeapCursor.from([this]).goto(from);
    }
    /**
    @internal
    */
    get isEmpty() {
      return this.nextLayer == this;
    }
    /**
    Iterate over the ranges in a collection of sets, in order,
    starting from `from`.
    */
    static iter(sets, from = 0) {
      return HeapCursor.from(sets).goto(from);
    }
    /**
    Iterate over two groups of sets, calling methods on `comparator`
    to notify it of possible differences.
    */
    static compare(oldSets, newSets, textDiff, comparator, minPointSize = -1) {
      let a2 = oldSets.filter((set) => set.maxPoint > 0 || !set.isEmpty && set.maxPoint >= minPointSize);
      let b2 = newSets.filter((set) => set.maxPoint > 0 || !set.isEmpty && set.maxPoint >= minPointSize);
      let sharedChunks = findSharedChunks(a2, b2, textDiff);
      let sideA = new SpanCursor(a2, sharedChunks, minPointSize);
      let sideB = new SpanCursor(b2, sharedChunks, minPointSize);
      textDiff.iterGaps((fromA, fromB, length) => compare(sideA, fromA, sideB, fromB, length, comparator));
      if (textDiff.empty && textDiff.length == 0)
        compare(sideA, 0, sideB, 0, 0, comparator);
    }
    /**
    Compare the contents of two groups of range sets, returning true
    if they are equivalent in the given range.
    */
    static eq(oldSets, newSets, from = 0, to) {
      if (to == null)
        to = 1e9 - 1;
      let a2 = oldSets.filter((set) => !set.isEmpty && newSets.indexOf(set) < 0);
      let b2 = newSets.filter((set) => !set.isEmpty && oldSets.indexOf(set) < 0);
      if (a2.length != b2.length)
        return false;
      if (!a2.length)
        return true;
      let sharedChunks = findSharedChunks(a2, b2);
      let sideA = new SpanCursor(a2, sharedChunks, 0).goto(from), sideB = new SpanCursor(b2, sharedChunks, 0).goto(from);
      for (; ; ) {
        if (sideA.to != sideB.to || !sameValues(sideA.active, sideB.active) || sideA.point && (!sideB.point || !sideA.point.eq(sideB.point)))
          return false;
        if (sideA.to > to)
          return true;
        sideA.next();
        sideB.next();
      }
    }
    /**
    Iterate over a group of range sets at the same time, notifying
    the iterator about the ranges covering every given piece of
    content. Returns the open count (see
    [`SpanIterator.span`](https://codemirror.net/6/docs/ref/#state.SpanIterator.span)) at the end
    of the iteration.
    */
    static spans(sets, from, to, iterator, minPointSize = -1) {
      let cursor = new SpanCursor(sets, null, minPointSize).goto(from), pos = from;
      let openRanges = cursor.openStart;
      for (; ; ) {
        let curTo = Math.min(cursor.to, to);
        if (cursor.point) {
          let active = cursor.activeForPoint(cursor.to);
          let openCount = cursor.pointFrom < from ? active.length + 1 : Math.min(active.length, openRanges);
          iterator.point(pos, curTo, cursor.point, active, openCount, cursor.pointRank);
          openRanges = Math.min(cursor.openEnd(curTo), active.length);
        } else if (curTo > pos) {
          iterator.span(pos, curTo, cursor.active, openRanges);
          openRanges = cursor.openEnd(curTo);
        }
        if (cursor.to > to)
          return openRanges + (cursor.point && cursor.to > to ? 1 : 0);
        pos = cursor.to;
        cursor.next();
      }
    }
    /**
    Create a range set for the given range or array of ranges. By
    default, this expects the ranges to be _sorted_ (by start
    position and, if two start at the same position,
    `value.startSide`). You can pass `true` as second argument to
    cause the method to sort them.
    */
    static of(ranges, sort = false) {
      let build = new RangeSetBuilder();
      for (let range of ranges instanceof Range ? [ranges] : sort ? lazySort(ranges) : ranges)
        build.add(range.from, range.to, range.value);
      return build.finish();
    }
    /**
    Join an array of range sets into a single set.
    */
    static join(sets) {
      if (!sets.length)
        return RangeSet.empty;
      let result = sets[sets.length - 1];
      for (let i2 = sets.length - 2; i2 >= 0; i2--) {
        for (let layer2 = sets[i2]; layer2 != RangeSet.empty; layer2 = layer2.nextLayer)
          result = new RangeSet(layer2.chunkPos, layer2.chunk, result, Math.max(layer2.maxPoint, result.maxPoint));
      }
      return result;
    }
  }
  RangeSet.empty = /* @__PURE__ */ new RangeSet([], [], null, -1);
  function lazySort(ranges) {
    if (ranges.length > 1)
      for (let prev = ranges[0], i2 = 1; i2 < ranges.length; i2++) {
        let cur = ranges[i2];
        if (cmpRange(prev, cur) > 0)
          return ranges.slice().sort(cmpRange);
        prev = cur;
      }
    return ranges;
  }
  RangeSet.empty.nextLayer = RangeSet.empty;
  class RangeSetBuilder {
    finishChunk(newArrays) {
      this.chunks.push(new Chunk(this.from, this.to, this.value, this.maxPoint));
      this.chunkPos.push(this.chunkStart);
      this.chunkStart = -1;
      this.setMaxPoint = Math.max(this.setMaxPoint, this.maxPoint);
      this.maxPoint = -1;
      if (newArrays) {
        this.from = [];
        this.to = [];
        this.value = [];
      }
    }
    /**
    Create an empty builder.
    */
    constructor() {
      this.chunks = [];
      this.chunkPos = [];
      this.chunkStart = -1;
      this.last = null;
      this.lastFrom = -1e9;
      this.lastTo = -1e9;
      this.from = [];
      this.to = [];
      this.value = [];
      this.maxPoint = -1;
      this.setMaxPoint = -1;
      this.nextLayer = null;
    }
    /**
    Add a range. Ranges should be added in sorted (by `from` and
    `value.startSide`) order.
    */
    add(from, to, value) {
      if (!this.addInner(from, to, value))
        (this.nextLayer || (this.nextLayer = new RangeSetBuilder())).add(from, to, value);
    }
    /**
    @internal
    */
    addInner(from, to, value) {
      let diff = from - this.lastTo || value.startSide - this.last.endSide;
      if (diff <= 0 && (from - this.lastFrom || value.startSide - this.last.startSide) < 0)
        throw new Error("Ranges must be added sorted by `from` position and `startSide`");
      if (diff < 0)
        return false;
      if (this.from.length == 250)
        this.finishChunk(true);
      if (this.chunkStart < 0)
        this.chunkStart = from;
      this.from.push(from - this.chunkStart);
      this.to.push(to - this.chunkStart);
      this.last = value;
      this.lastFrom = from;
      this.lastTo = to;
      this.value.push(value);
      if (value.point)
        this.maxPoint = Math.max(this.maxPoint, to - from);
      return true;
    }
    /**
    @internal
    */
    addChunk(from, chunk) {
      if ((from - this.lastTo || chunk.value[0].startSide - this.last.endSide) < 0)
        return false;
      if (this.from.length)
        this.finishChunk(true);
      this.setMaxPoint = Math.max(this.setMaxPoint, chunk.maxPoint);
      this.chunks.push(chunk);
      this.chunkPos.push(from);
      let last = chunk.value.length - 1;
      this.last = chunk.value[last];
      this.lastFrom = chunk.from[last] + from;
      this.lastTo = chunk.to[last] + from;
      return true;
    }
    /**
    Finish the range set. Returns the new set. The builder can't be
    used anymore after this has been called.
    */
    finish() {
      return this.finishInner(RangeSet.empty);
    }
    /**
    @internal
    */
    finishInner(next) {
      if (this.from.length)
        this.finishChunk(false);
      if (this.chunks.length == 0)
        return next;
      let result = RangeSet.create(this.chunkPos, this.chunks, this.nextLayer ? this.nextLayer.finishInner(next) : next, this.setMaxPoint);
      this.from = null;
      return result;
    }
  }
  function findSharedChunks(a2, b2, textDiff) {
    let inA = /* @__PURE__ */ new Map();
    for (let set of a2)
      for (let i2 = 0; i2 < set.chunk.length; i2++)
        if (set.chunk[i2].maxPoint <= 0)
          inA.set(set.chunk[i2], set.chunkPos[i2]);
    let shared = /* @__PURE__ */ new Set();
    for (let set of b2)
      for (let i2 = 0; i2 < set.chunk.length; i2++) {
        let known = inA.get(set.chunk[i2]);
        if (known != null && (textDiff ? textDiff.mapPos(known) : known) == set.chunkPos[i2] && !(textDiff === null || textDiff === void 0 ? void 0 : textDiff.touchesRange(known, known + set.chunk[i2].length)))
          shared.add(set.chunk[i2]);
      }
    return shared;
  }
  class LayerCursor {
    constructor(layer2, skip, minPoint, rank = 0) {
      this.layer = layer2;
      this.skip = skip;
      this.minPoint = minPoint;
      this.rank = rank;
    }
    get startSide() {
      return this.value ? this.value.startSide : 0;
    }
    get endSide() {
      return this.value ? this.value.endSide : 0;
    }
    goto(pos, side = -1e9) {
      this.chunkIndex = this.rangeIndex = 0;
      this.gotoInner(pos, side, false);
      return this;
    }
    gotoInner(pos, side, forward) {
      while (this.chunkIndex < this.layer.chunk.length) {
        let next = this.layer.chunk[this.chunkIndex];
        if (!(this.skip && this.skip.has(next) || this.layer.chunkEnd(this.chunkIndex) < pos || next.maxPoint < this.minPoint))
          break;
        this.chunkIndex++;
        forward = false;
      }
      if (this.chunkIndex < this.layer.chunk.length) {
        let rangeIndex = this.layer.chunk[this.chunkIndex].findIndex(pos - this.layer.chunkPos[this.chunkIndex], side, true);
        if (!forward || this.rangeIndex < rangeIndex)
          this.setRangeIndex(rangeIndex);
      }
      this.next();
    }
    forward(pos, side) {
      if ((this.to - pos || this.endSide - side) < 0)
        this.gotoInner(pos, side, true);
    }
    next() {
      for (; ; ) {
        if (this.chunkIndex == this.layer.chunk.length) {
          this.from = this.to = 1e9;
          this.value = null;
          break;
        } else {
          let chunkPos = this.layer.chunkPos[this.chunkIndex], chunk = this.layer.chunk[this.chunkIndex];
          let from = chunkPos + chunk.from[this.rangeIndex];
          this.from = from;
          this.to = chunkPos + chunk.to[this.rangeIndex];
          this.value = chunk.value[this.rangeIndex];
          this.setRangeIndex(this.rangeIndex + 1);
          if (this.minPoint < 0 || this.value.point && this.to - this.from >= this.minPoint)
            break;
        }
      }
    }
    setRangeIndex(index) {
      if (index == this.layer.chunk[this.chunkIndex].value.length) {
        this.chunkIndex++;
        if (this.skip) {
          while (this.chunkIndex < this.layer.chunk.length && this.skip.has(this.layer.chunk[this.chunkIndex]))
            this.chunkIndex++;
        }
        this.rangeIndex = 0;
      } else {
        this.rangeIndex = index;
      }
    }
    nextChunk() {
      this.chunkIndex++;
      this.rangeIndex = 0;
      this.next();
    }
    compare(other) {
      return this.from - other.from || this.startSide - other.startSide || this.rank - other.rank || this.to - other.to || this.endSide - other.endSide;
    }
  }
  class HeapCursor {
    constructor(heap) {
      this.heap = heap;
    }
    static from(sets, skip = null, minPoint = -1) {
      let heap = [];
      for (let i2 = 0; i2 < sets.length; i2++) {
        for (let cur = sets[i2]; !cur.isEmpty; cur = cur.nextLayer) {
          if (cur.maxPoint >= minPoint)
            heap.push(new LayerCursor(cur, skip, minPoint, i2));
        }
      }
      return heap.length == 1 ? heap[0] : new HeapCursor(heap);
    }
    get startSide() {
      return this.value ? this.value.startSide : 0;
    }
    goto(pos, side = -1e9) {
      for (let cur of this.heap)
        cur.goto(pos, side);
      for (let i2 = this.heap.length >> 1; i2 >= 0; i2--)
        heapBubble(this.heap, i2);
      this.next();
      return this;
    }
    forward(pos, side) {
      for (let cur of this.heap)
        cur.forward(pos, side);
      for (let i2 = this.heap.length >> 1; i2 >= 0; i2--)
        heapBubble(this.heap, i2);
      if ((this.to - pos || this.value.endSide - side) < 0)
        this.next();
    }
    next() {
      if (this.heap.length == 0) {
        this.from = this.to = 1e9;
        this.value = null;
        this.rank = -1;
      } else {
        let top2 = this.heap[0];
        this.from = top2.from;
        this.to = top2.to;
        this.value = top2.value;
        this.rank = top2.rank;
        if (top2.value)
          top2.next();
        heapBubble(this.heap, 0);
      }
    }
  }
  function heapBubble(heap, index) {
    for (let cur = heap[index]; ; ) {
      let childIndex = (index << 1) + 1;
      if (childIndex >= heap.length)
        break;
      let child = heap[childIndex];
      if (childIndex + 1 < heap.length && child.compare(heap[childIndex + 1]) >= 0) {
        child = heap[childIndex + 1];
        childIndex++;
      }
      if (cur.compare(child) < 0)
        break;
      heap[childIndex] = cur;
      heap[index] = child;
      index = childIndex;
    }
  }
  class SpanCursor {
    constructor(sets, skip, minPoint) {
      this.minPoint = minPoint;
      this.active = [];
      this.activeTo = [];
      this.activeRank = [];
      this.minActive = -1;
      this.point = null;
      this.pointFrom = 0;
      this.pointRank = 0;
      this.to = -1e9;
      this.endSide = 0;
      this.openStart = -1;
      this.cursor = HeapCursor.from(sets, skip, minPoint);
    }
    goto(pos, side = -1e9) {
      this.cursor.goto(pos, side);
      this.active.length = this.activeTo.length = this.activeRank.length = 0;
      this.minActive = -1;
      this.to = pos;
      this.endSide = side;
      this.openStart = -1;
      this.next();
      return this;
    }
    forward(pos, side) {
      while (this.minActive > -1 && (this.activeTo[this.minActive] - pos || this.active[this.minActive].endSide - side) < 0)
        this.removeActive(this.minActive);
      this.cursor.forward(pos, side);
    }
    removeActive(index) {
      remove(this.active, index);
      remove(this.activeTo, index);
      remove(this.activeRank, index);
      this.minActive = findMinIndex(this.active, this.activeTo);
    }
    addActive(trackOpen) {
      let i2 = 0, { value, to, rank } = this.cursor;
      while (i2 < this.activeRank.length && (rank - this.activeRank[i2] || to - this.activeTo[i2]) > 0)
        i2++;
      insert(this.active, i2, value);
      insert(this.activeTo, i2, to);
      insert(this.activeRank, i2, rank);
      if (trackOpen)
        insert(trackOpen, i2, this.cursor.from);
      this.minActive = findMinIndex(this.active, this.activeTo);
    }
    // After calling this, if `this.point` != null, the next range is a
    // point. Otherwise, it's a regular range, covered by `this.active`.
    next() {
      let from = this.to, wasPoint = this.point;
      this.point = null;
      let trackOpen = this.openStart < 0 ? [] : null;
      for (; ; ) {
        let a2 = this.minActive;
        if (a2 > -1 && (this.activeTo[a2] - this.cursor.from || this.active[a2].endSide - this.cursor.startSide) < 0) {
          if (this.activeTo[a2] > from) {
            this.to = this.activeTo[a2];
            this.endSide = this.active[a2].endSide;
            break;
          }
          this.removeActive(a2);
          if (trackOpen)
            remove(trackOpen, a2);
        } else if (!this.cursor.value) {
          this.to = this.endSide = 1e9;
          break;
        } else if (this.cursor.from > from) {
          this.to = this.cursor.from;
          this.endSide = this.cursor.startSide;
          break;
        } else {
          let nextVal = this.cursor.value;
          if (!nextVal.point) {
            this.addActive(trackOpen);
            this.cursor.next();
          } else if (wasPoint && this.cursor.to == this.to && this.cursor.from < this.cursor.to) {
            this.cursor.next();
          } else {
            this.point = nextVal;
            this.pointFrom = this.cursor.from;
            this.pointRank = this.cursor.rank;
            this.to = this.cursor.to;
            this.endSide = nextVal.endSide;
            this.cursor.next();
            this.forward(this.to, this.endSide);
            break;
          }
        }
      }
      if (trackOpen) {
        this.openStart = 0;
        for (let i2 = trackOpen.length - 1; i2 >= 0 && trackOpen[i2] < from; i2--)
          this.openStart++;
      }
    }
    activeForPoint(to) {
      if (!this.active.length)
        return this.active;
      let active = [];
      for (let i2 = this.active.length - 1; i2 >= 0; i2--) {
        if (this.activeRank[i2] < this.pointRank)
          break;
        if (this.activeTo[i2] > to || this.activeTo[i2] == to && this.active[i2].endSide >= this.point.endSide)
          active.push(this.active[i2]);
      }
      return active.reverse();
    }
    openEnd(to) {
      let open = 0;
      for (let i2 = this.activeTo.length - 1; i2 >= 0 && this.activeTo[i2] > to; i2--)
        open++;
      return open;
    }
  }
  function compare(a2, startA, b2, startB, length, comparator) {
    a2.goto(startA);
    b2.goto(startB);
    let endB = startB + length;
    let pos = startB, dPos = startB - startA;
    for (; ; ) {
      let diff = a2.to + dPos - b2.to || a2.endSide - b2.endSide;
      let end = diff < 0 ? a2.to + dPos : b2.to, clipEnd = Math.min(end, endB);
      if (a2.point || b2.point) {
        if (!(a2.point && b2.point && (a2.point == b2.point || a2.point.eq(b2.point)) && sameValues(a2.activeForPoint(a2.to), b2.activeForPoint(b2.to))))
          comparator.comparePoint(pos, clipEnd, a2.point, b2.point);
      } else {
        if (clipEnd > pos && !sameValues(a2.active, b2.active))
          comparator.compareRange(pos, clipEnd, a2.active, b2.active);
      }
      if (end > endB)
        break;
      pos = end;
      if (diff <= 0)
        a2.next();
      if (diff >= 0)
        b2.next();
    }
  }
  function sameValues(a2, b2) {
    if (a2.length != b2.length)
      return false;
    for (let i2 = 0; i2 < a2.length; i2++)
      if (a2[i2] != b2[i2] && !a2[i2].eq(b2[i2]))
        return false;
    return true;
  }
  function remove(array, index) {
    for (let i2 = index, e2 = array.length - 1; i2 < e2; i2++)
      array[i2] = array[i2 + 1];
    array.pop();
  }
  function insert(array, index, value) {
    for (let i2 = array.length - 1; i2 >= index; i2--)
      array[i2 + 1] = array[i2];
    array[index] = value;
  }
  function findMinIndex(value, array) {
    let found = -1, foundPos = 1e9;
    for (let i2 = 0; i2 < array.length; i2++)
      if ((array[i2] - foundPos || value[i2].endSide - value[found].endSide) < 0) {
        found = i2;
        foundPos = array[i2];
      }
    return found;
  }
  function countColumn(string2, tabSize, to = string2.length) {
    let n2 = 0;
    for (let i2 = 0; i2 < to; ) {
      if (string2.charCodeAt(i2) == 9) {
        n2 += tabSize - n2 % tabSize;
        i2++;
      } else {
        n2++;
        i2 = findClusterBreak(string2, i2);
      }
    }
    return n2;
  }
  function findColumn(string2, col, tabSize, strict) {
    for (let i2 = 0, n2 = 0; ; ) {
      if (n2 >= col)
        return i2;
      if (i2 == string2.length)
        break;
      n2 += string2.charCodeAt(i2) == 9 ? tabSize - n2 % tabSize : 1;
      i2 = findClusterBreak(string2, i2);
    }
    return strict === true ? -1 : string2.length;
  }
  const C$1 = "ͼ";
  const COUNT = typeof Symbol == "undefined" ? "__" + C$1 : Symbol.for(C$1);
  const SET = typeof Symbol == "undefined" ? "__styleSet" + Math.floor(Math.random() * 1e8) : Symbol("styleSet");
  const top = typeof globalThis != "undefined" ? globalThis : typeof window != "undefined" ? window : {};
  class StyleModule {
    // :: (Object<Style>, ?{finish: ?(string) → string})
    // Create a style module from the given spec.
    //
    // When `finish` is given, it is called on regular (non-`@`)
    // selectors (after `&` expansion) to compute the final selector.
    constructor(spec, options) {
      this.rules = [];
      let { finish } = options || {};
      function splitSelector(selector) {
        return /^@/.test(selector) ? [selector] : selector.split(/,\s*/);
      }
      function render(selectors, spec2, target, isKeyframes) {
        let local = [], isAt = /^@(\w+)\b/.exec(selectors[0]), keyframes = isAt && isAt[1] == "keyframes";
        if (isAt && spec2 == null)
          return target.push(selectors[0] + ";");
        for (let prop in spec2) {
          let value = spec2[prop];
          if (/&/.test(prop)) {
            render(
              prop.split(/,\s*/).map((part) => selectors.map((sel) => part.replace(/&/, sel))).reduce((a2, b2) => a2.concat(b2)),
              value,
              target
            );
          } else if (value && typeof value == "object") {
            if (!isAt)
              throw new RangeError("The value of a property (" + prop + ") should be a primitive value.");
            render(splitSelector(prop), value, local, keyframes);
          } else if (value != null) {
            local.push(prop.replace(/_.*/, "").replace(/[A-Z]/g, (l2) => "-" + l2.toLowerCase()) + ": " + value + ";");
          }
        }
        if (local.length || keyframes) {
          target.push((finish && !isAt && !isKeyframes ? selectors.map(finish) : selectors).join(", ") + " {" + local.join(" ") + "}");
        }
      }
      for (let prop in spec)
        render(splitSelector(prop), spec[prop], this.rules);
    }
    // :: () → string
    // Returns a string containing the module's CSS rules.
    getRules() {
      return this.rules.join("\n");
    }
    // :: () → string
    // Generate a new unique CSS class name.
    static newName() {
      let id = top[COUNT] || 1;
      top[COUNT] = id + 1;
      return C$1 + id.toString(36);
    }
    // :: (union<Document, ShadowRoot>, union<[StyleModule], StyleModule>, ?{nonce: ?string})
    //
    // Mount the given set of modules in the given DOM root, which ensures
    // that the CSS rules defined by the module are available in that
    // context.
    //
    // Rules are only added to the document once per root.
    //
    // Rule order will follow the order of the modules, so that rules from
    // modules later in the array take precedence of those from earlier
    // modules. If you call this function multiple times for the same root
    // in a way that changes the order of already mounted modules, the old
    // order will be changed.
    //
    // If a Content Security Policy nonce is provided, it is added to
    // the `<style>` tag generated by the library.
    static mount(root, modules, options) {
      let set = root[SET], nonce = options && options.nonce;
      if (!set)
        set = new StyleSet(root, nonce);
      else if (nonce)
        set.setNonce(nonce);
      set.mount(Array.isArray(modules) ? modules : [modules]);
    }
  }
  let adoptedSet = /* @__PURE__ */ new Map();
  class StyleSet {
    constructor(root, nonce) {
      let doc2 = root.ownerDocument || root, win = doc2.defaultView;
      if (!root.head && root.adoptedStyleSheets && win.CSSStyleSheet) {
        let adopted = adoptedSet.get(doc2);
        if (adopted) {
          root.adoptedStyleSheets = [adopted.sheet, ...root.adoptedStyleSheets];
          return root[SET] = adopted;
        }
        this.sheet = new win.CSSStyleSheet();
        root.adoptedStyleSheets = [this.sheet, ...root.adoptedStyleSheets];
        adoptedSet.set(doc2, this);
      } else {
        this.styleTag = doc2.createElement("style");
        if (nonce)
          this.styleTag.setAttribute("nonce", nonce);
        let target = root.head || root;
        target.insertBefore(this.styleTag, target.firstChild);
      }
      this.modules = [];
      root[SET] = this;
    }
    mount(modules) {
      let sheet = this.sheet;
      let pos = 0, j2 = 0;
      for (let i2 = 0; i2 < modules.length; i2++) {
        let mod = modules[i2], index = this.modules.indexOf(mod);
        if (index < j2 && index > -1) {
          this.modules.splice(index, 1);
          j2--;
          index = -1;
        }
        if (index == -1) {
          this.modules.splice(j2++, 0, mod);
          if (sheet)
            for (let k2 = 0; k2 < mod.rules.length; k2++)
              sheet.insertRule(mod.rules[k2], pos++);
        } else {
          while (j2 < index)
            pos += this.modules[j2++].rules.length;
          pos += mod.rules.length;
          j2++;
        }
      }
      if (!sheet) {
        let text = "";
        for (let i2 = 0; i2 < this.modules.length; i2++)
          text += this.modules[i2].getRules() + "\n";
        this.styleTag.textContent = text;
      }
    }
    setNonce(nonce) {
      if (this.styleTag && this.styleTag.getAttribute("nonce") != nonce)
        this.styleTag.setAttribute("nonce", nonce);
    }
  }
  var base = {
    8: "Backspace",
    9: "Tab",
    10: "Enter",
    12: "NumLock",
    13: "Enter",
    16: "Shift",
    17: "Control",
    18: "Alt",
    20: "CapsLock",
    27: "Escape",
    32: " ",
    33: "PageUp",
    34: "PageDown",
    35: "End",
    36: "Home",
    37: "ArrowLeft",
    38: "ArrowUp",
    39: "ArrowRight",
    40: "ArrowDown",
    44: "PrintScreen",
    45: "Insert",
    46: "Delete",
    59: ";",
    61: "=",
    91: "Meta",
    92: "Meta",
    106: "*",
    107: "+",
    108: ",",
    109: "-",
    110: ".",
    111: "/",
    144: "NumLock",
    145: "ScrollLock",
    160: "Shift",
    161: "Shift",
    162: "Control",
    163: "Control",
    164: "Alt",
    165: "Alt",
    173: "-",
    186: ";",
    187: "=",
    188: ",",
    189: "-",
    190: ".",
    191: "/",
    192: "`",
    219: "[",
    220: "\\",
    221: "]",
    222: "'"
  };
  var shift = {
    48: ")",
    49: "!",
    50: "@",
    51: "#",
    52: "$",
    53: "%",
    54: "^",
    55: "&",
    56: "*",
    57: "(",
    59: ":",
    61: "+",
    173: "_",
    186: ":",
    187: "+",
    188: "<",
    189: "_",
    190: ">",
    191: "?",
    192: "~",
    219: "{",
    220: "|",
    221: "}",
    222: '"'
  };
  var mac = typeof navigator != "undefined" && /Mac/.test(navigator.platform);
  var ie$1 = typeof navigator != "undefined" && /MSIE \d|Trident\/(?:[7-9]|\d{2,})\..*rv:(\d+)/.exec(navigator.userAgent);
  for (var i$4 = 0; i$4 < 10; i$4++)
    base[48 + i$4] = base[96 + i$4] = String(i$4);
  for (var i$4 = 1; i$4 <= 24; i$4++)
    base[i$4 + 111] = "F" + i$4;
  for (var i$4 = 65; i$4 <= 90; i$4++) {
    base[i$4] = String.fromCharCode(i$4 + 32);
    shift[i$4] = String.fromCharCode(i$4);
  }
  for (var code in base)
    if (!shift.hasOwnProperty(code))
      shift[code] = base[code];
  function keyName(event) {
    var ignoreKey = mac && event.metaKey && event.shiftKey && !event.ctrlKey && !event.altKey || ie$1 && event.shiftKey && event.key && event.key.length == 1 || event.key == "Unidentified";
    var name2 = !ignoreKey && event.key || (event.shiftKey ? shift : base)[event.keyCode] || event.key || "Unidentified";
    if (name2 == "Esc")
      name2 = "Escape";
    if (name2 == "Del")
      name2 = "Delete";
    if (name2 == "Left")
      name2 = "ArrowLeft";
    if (name2 == "Up")
      name2 = "ArrowUp";
    if (name2 == "Right")
      name2 = "ArrowRight";
    if (name2 == "Down")
      name2 = "ArrowDown";
    return name2;
  }
  function getSelection(root) {
    let target;
    if (root.nodeType == 11) {
      target = root.getSelection ? root : root.ownerDocument;
    } else {
      target = root;
    }
    return target.getSelection();
  }
  function contains(dom, node) {
    return node ? dom == node || dom.contains(node.nodeType != 1 ? node.parentNode : node) : false;
  }
  function deepActiveElement(doc2) {
    let elt = doc2.activeElement;
    while (elt && elt.shadowRoot)
      elt = elt.shadowRoot.activeElement;
    return elt;
  }
  function hasSelection(dom, selection) {
    if (!selection.anchorNode)
      return false;
    try {
      return contains(dom, selection.anchorNode);
    } catch (_2) {
      return false;
    }
  }
  function clientRectsFor(dom) {
    if (dom.nodeType == 3)
      return textRange(dom, 0, dom.nodeValue.length).getClientRects();
    else if (dom.nodeType == 1)
      return dom.getClientRects();
    else
      return [];
  }
  function isEquivalentPosition(node, off, targetNode, targetOff) {
    return targetNode ? scanFor(node, off, targetNode, targetOff, -1) || scanFor(node, off, targetNode, targetOff, 1) : false;
  }
  function domIndex(node) {
    for (var index = 0; ; index++) {
      node = node.previousSibling;
      if (!node)
        return index;
    }
  }
  function scanFor(node, off, targetNode, targetOff, dir) {
    for (; ; ) {
      if (node == targetNode && off == targetOff)
        return true;
      if (off == (dir < 0 ? 0 : maxOffset(node))) {
        if (node.nodeName == "DIV")
          return false;
        let parent = node.parentNode;
        if (!parent || parent.nodeType != 1)
          return false;
        off = domIndex(node) + (dir < 0 ? 0 : 1);
        node = parent;
      } else if (node.nodeType == 1) {
        node = node.childNodes[off + (dir < 0 ? -1 : 0)];
        if (node.nodeType == 1 && node.contentEditable == "false")
          return false;
        off = dir < 0 ? maxOffset(node) : 0;
      } else {
        return false;
      }
    }
  }
  function maxOffset(node) {
    return node.nodeType == 3 ? node.nodeValue.length : node.childNodes.length;
  }
  function flattenRect(rect, left) {
    let x2 = left ? rect.left : rect.right;
    return { left: x2, right: x2, top: rect.top, bottom: rect.bottom };
  }
  function windowRect(win) {
    return {
      left: 0,
      right: win.innerWidth,
      top: 0,
      bottom: win.innerHeight
    };
  }
  function getScale(elt, rect) {
    let scaleX = rect.width / elt.offsetWidth;
    let scaleY = rect.height / elt.offsetHeight;
    if (scaleX > 0.995 && scaleX < 1.005 || !isFinite(scaleX) || Math.abs(rect.width - elt.offsetWidth) < 1)
      scaleX = 1;
    if (scaleY > 0.995 && scaleY < 1.005 || !isFinite(scaleY) || Math.abs(rect.height - elt.offsetHeight) < 1)
      scaleY = 1;
    return { scaleX, scaleY };
  }
  function scrollRectIntoView(dom, rect, side, x2, y2, xMargin, yMargin, ltr) {
    let doc2 = dom.ownerDocument, win = doc2.defaultView || window;
    for (let cur = dom, stop = false; cur && !stop; ) {
      if (cur.nodeType == 1) {
        let bounding, top2 = cur == doc2.body;
        let scaleX = 1, scaleY = 1;
        if (top2) {
          bounding = windowRect(win);
        } else {
          if (/^(fixed|sticky)$/.test(getComputedStyle(cur).position))
            stop = true;
          if (cur.scrollHeight <= cur.clientHeight && cur.scrollWidth <= cur.clientWidth) {
            cur = cur.assignedSlot || cur.parentNode;
            continue;
          }
          let rect2 = cur.getBoundingClientRect();
          ({ scaleX, scaleY } = getScale(cur, rect2));
          bounding = {
            left: rect2.left,
            right: rect2.left + cur.clientWidth * scaleX,
            top: rect2.top,
            bottom: rect2.top + cur.clientHeight * scaleY
          };
        }
        let moveX = 0, moveY = 0;
        if (y2 == "nearest") {
          if (rect.top < bounding.top) {
            moveY = -(bounding.top - rect.top + yMargin);
            if (side > 0 && rect.bottom > bounding.bottom + moveY)
              moveY = rect.bottom - bounding.bottom + moveY + yMargin;
          } else if (rect.bottom > bounding.bottom) {
            moveY = rect.bottom - bounding.bottom + yMargin;
            if (side < 0 && rect.top - moveY < bounding.top)
              moveY = -(bounding.top + moveY - rect.top + yMargin);
          }
        } else {
          let rectHeight = rect.bottom - rect.top, boundingHeight = bounding.bottom - bounding.top;
          let targetTop = y2 == "center" && rectHeight <= boundingHeight ? rect.top + rectHeight / 2 - boundingHeight / 2 : y2 == "start" || y2 == "center" && side < 0 ? rect.top - yMargin : rect.bottom - boundingHeight + yMargin;
          moveY = targetTop - bounding.top;
        }
        if (x2 == "nearest") {
          if (rect.left < bounding.left) {
            moveX = -(bounding.left - rect.left + xMargin);
            if (side > 0 && rect.right > bounding.right + moveX)
              moveX = rect.right - bounding.right + moveX + xMargin;
          } else if (rect.right > bounding.right) {
            moveX = rect.right - bounding.right + xMargin;
            if (side < 0 && rect.left < bounding.left + moveX)
              moveX = -(bounding.left + moveX - rect.left + xMargin);
          }
        } else {
          let targetLeft = x2 == "center" ? rect.left + (rect.right - rect.left) / 2 - (bounding.right - bounding.left) / 2 : x2 == "start" == ltr ? rect.left - xMargin : rect.right - (bounding.right - bounding.left) + xMargin;
          moveX = targetLeft - bounding.left;
        }
        if (moveX || moveY) {
          if (top2) {
            win.scrollBy(moveX, moveY);
          } else {
            let movedX = 0, movedY = 0;
            if (moveY) {
              let start = cur.scrollTop;
              cur.scrollTop += moveY / scaleY;
              movedY = (cur.scrollTop - start) * scaleY;
            }
            if (moveX) {
              let start = cur.scrollLeft;
              cur.scrollLeft += moveX / scaleX;
              movedX = (cur.scrollLeft - start) * scaleX;
            }
            rect = {
              left: rect.left - movedX,
              top: rect.top - movedY,
              right: rect.right - movedX,
              bottom: rect.bottom - movedY
            };
            if (movedX && Math.abs(movedX - moveX) < 1)
              x2 = "nearest";
            if (movedY && Math.abs(movedY - moveY) < 1)
              y2 = "nearest";
          }
        }
        if (top2)
          break;
        cur = cur.assignedSlot || cur.parentNode;
      } else if (cur.nodeType == 11) {
        cur = cur.host;
      } else {
        break;
      }
    }
  }
  function scrollableParent(dom) {
    let doc2 = dom.ownerDocument;
    for (let cur = dom.parentNode; cur; ) {
      if (cur == doc2.body) {
        break;
      } else if (cur.nodeType == 1) {
        if (cur.scrollHeight > cur.clientHeight || cur.scrollWidth > cur.clientWidth)
          return cur;
        cur = cur.assignedSlot || cur.parentNode;
      } else if (cur.nodeType == 11) {
        cur = cur.host;
      } else {
        break;
      }
    }
    return null;
  }
  class DOMSelectionState {
    constructor() {
      this.anchorNode = null;
      this.anchorOffset = 0;
      this.focusNode = null;
      this.focusOffset = 0;
    }
    eq(domSel) {
      return this.anchorNode == domSel.anchorNode && this.anchorOffset == domSel.anchorOffset && this.focusNode == domSel.focusNode && this.focusOffset == domSel.focusOffset;
    }
    setRange(range) {
      let { anchorNode, focusNode } = range;
      this.set(anchorNode, Math.min(range.anchorOffset, anchorNode ? maxOffset(anchorNode) : 0), focusNode, Math.min(range.focusOffset, focusNode ? maxOffset(focusNode) : 0));
    }
    set(anchorNode, anchorOffset, focusNode, focusOffset) {
      this.anchorNode = anchorNode;
      this.anchorOffset = anchorOffset;
      this.focusNode = focusNode;
      this.focusOffset = focusOffset;
    }
  }
  let preventScrollSupported = null;
  function focusPreventScroll(dom) {
    if (dom.setActive)
      return dom.setActive();
    if (preventScrollSupported)
      return dom.focus(preventScrollSupported);
    let stack = [];
    for (let cur = dom; cur; cur = cur.parentNode) {
      stack.push(cur, cur.scrollTop, cur.scrollLeft);
      if (cur == cur.ownerDocument)
        break;
    }
    dom.focus(preventScrollSupported == null ? {
      get preventScroll() {
        preventScrollSupported = { preventScroll: true };
        return true;
      }
    } : void 0);
    if (!preventScrollSupported) {
      preventScrollSupported = false;
      for (let i2 = 0; i2 < stack.length; ) {
        let elt = stack[i2++], top2 = stack[i2++], left = stack[i2++];
        if (elt.scrollTop != top2)
          elt.scrollTop = top2;
        if (elt.scrollLeft != left)
          elt.scrollLeft = left;
      }
    }
  }
  let scratchRange;
  function textRange(node, from, to = from) {
    let range = scratchRange || (scratchRange = document.createRange());
    range.setEnd(node, to);
    range.setStart(node, from);
    return range;
  }
  function dispatchKey(elt, name2, code2) {
    let options = { key: name2, code: name2, keyCode: code2, which: code2, cancelable: true };
    let down = new KeyboardEvent("keydown", options);
    down.synthetic = true;
    elt.dispatchEvent(down);
    let up = new KeyboardEvent("keyup", options);
    up.synthetic = true;
    elt.dispatchEvent(up);
    return down.defaultPrevented || up.defaultPrevented;
  }
  function getRoot(node) {
    while (node) {
      if (node && (node.nodeType == 9 || node.nodeType == 11 && node.host))
        return node;
      node = node.assignedSlot || node.parentNode;
    }
    return null;
  }
  function clearAttributes(node) {
    while (node.attributes.length)
      node.removeAttributeNode(node.attributes[0]);
  }
  function atElementStart(doc2, selection) {
    let node = selection.focusNode, offset = selection.focusOffset;
    if (!node || selection.anchorNode != node || selection.anchorOffset != offset)
      return false;
    offset = Math.min(offset, maxOffset(node));
    for (; ; ) {
      if (offset) {
        if (node.nodeType != 1)
          return false;
        let prev = node.childNodes[offset - 1];
        if (prev.contentEditable == "false")
          offset--;
        else {
          node = prev;
          offset = maxOffset(node);
        }
      } else if (node == doc2) {
        return true;
      } else {
        offset = domIndex(node);
        node = node.parentNode;
      }
    }
  }
  function isScrolledToBottom(elt) {
    return elt.scrollTop > Math.max(1, elt.scrollHeight - elt.clientHeight - 4);
  }
  class DOMPos {
    constructor(node, offset, precise = true) {
      this.node = node;
      this.offset = offset;
      this.precise = precise;
    }
    static before(dom, precise) {
      return new DOMPos(dom.parentNode, domIndex(dom), precise);
    }
    static after(dom, precise) {
      return new DOMPos(dom.parentNode, domIndex(dom) + 1, precise);
    }
  }
  const noChildren = [];
  class ContentView {
    constructor() {
      this.parent = null;
      this.dom = null;
      this.flags = 2;
    }
    get overrideDOMText() {
      return null;
    }
    get posAtStart() {
      return this.parent ? this.parent.posBefore(this) : 0;
    }
    get posAtEnd() {
      return this.posAtStart + this.length;
    }
    posBefore(view) {
      let pos = this.posAtStart;
      for (let child of this.children) {
        if (child == view)
          return pos;
        pos += child.length + child.breakAfter;
      }
      throw new RangeError("Invalid child in posBefore");
    }
    posAfter(view) {
      return this.posBefore(view) + view.length;
    }
    sync(view, track) {
      if (this.flags & 2) {
        let parent = this.dom;
        let prev = null, next;
        for (let child of this.children) {
          if (child.flags & 7) {
            if (!child.dom && (next = prev ? prev.nextSibling : parent.firstChild)) {
              let contentView = ContentView.get(next);
              if (!contentView || !contentView.parent && contentView.canReuseDOM(child))
                child.reuseDOM(next);
            }
            child.sync(view, track);
            child.flags &= ~7;
          }
          next = prev ? prev.nextSibling : parent.firstChild;
          if (track && !track.written && track.node == parent && next != child.dom)
            track.written = true;
          if (child.dom.parentNode == parent) {
            while (next && next != child.dom)
              next = rm$1(next);
          } else {
            parent.insertBefore(child.dom, next);
          }
          prev = child.dom;
        }
        next = prev ? prev.nextSibling : parent.firstChild;
        if (next && track && track.node == parent)
          track.written = true;
        while (next)
          next = rm$1(next);
      } else if (this.flags & 1) {
        for (let child of this.children)
          if (child.flags & 7) {
            child.sync(view, track);
            child.flags &= ~7;
          }
      }
    }
    reuseDOM(_dom) {
    }
    localPosFromDOM(node, offset) {
      let after;
      if (node == this.dom) {
        after = this.dom.childNodes[offset];
      } else {
        let bias = maxOffset(node) == 0 ? 0 : offset == 0 ? -1 : 1;
        for (; ; ) {
          let parent = node.parentNode;
          if (parent == this.dom)
            break;
          if (bias == 0 && parent.firstChild != parent.lastChild) {
            if (node == parent.firstChild)
              bias = -1;
            else
              bias = 1;
          }
          node = parent;
        }
        if (bias < 0)
          after = node;
        else
          after = node.nextSibling;
      }
      if (after == this.dom.firstChild)
        return 0;
      while (after && !ContentView.get(after))
        after = after.nextSibling;
      if (!after)
        return this.length;
      for (let i2 = 0, pos = 0; ; i2++) {
        let child = this.children[i2];
        if (child.dom == after)
          return pos;
        pos += child.length + child.breakAfter;
      }
    }
    domBoundsAround(from, to, offset = 0) {
      let fromI = -1, fromStart = -1, toI = -1, toEnd = -1;
      for (let i2 = 0, pos = offset, prevEnd = offset; i2 < this.children.length; i2++) {
        let child = this.children[i2], end = pos + child.length;
        if (pos < from && end > to)
          return child.domBoundsAround(from, to, pos);
        if (end >= from && fromI == -1) {
          fromI = i2;
          fromStart = pos;
        }
        if (pos > to && child.dom.parentNode == this.dom) {
          toI = i2;
          toEnd = prevEnd;
          break;
        }
        prevEnd = end;
        pos = end + child.breakAfter;
      }
      return {
        from: fromStart,
        to: toEnd < 0 ? offset + this.length : toEnd,
        startDOM: (fromI ? this.children[fromI - 1].dom.nextSibling : null) || this.dom.firstChild,
        endDOM: toI < this.children.length && toI >= 0 ? this.children[toI].dom : null
      };
    }
    markDirty(andParent = false) {
      this.flags |= 2;
      this.markParentsDirty(andParent);
    }
    markParentsDirty(childList) {
      for (let parent = this.parent; parent; parent = parent.parent) {
        if (childList)
          parent.flags |= 2;
        if (parent.flags & 1)
          return;
        parent.flags |= 1;
        childList = false;
      }
    }
    setParent(parent) {
      if (this.parent != parent) {
        this.parent = parent;
        if (this.flags & 7)
          this.markParentsDirty(true);
      }
    }
    setDOM(dom) {
      if (this.dom == dom)
        return;
      if (this.dom)
        this.dom.cmView = null;
      this.dom = dom;
      dom.cmView = this;
    }
    get rootView() {
      for (let v2 = this; ; ) {
        let parent = v2.parent;
        if (!parent)
          return v2;
        v2 = parent;
      }
    }
    replaceChildren(from, to, children = noChildren) {
      this.markDirty();
      for (let i2 = from; i2 < to; i2++) {
        let child = this.children[i2];
        if (child.parent == this && children.indexOf(child) < 0)
          child.destroy();
      }
      this.children.splice(from, to - from, ...children);
      for (let i2 = 0; i2 < children.length; i2++)
        children[i2].setParent(this);
    }
    ignoreMutation(_rec) {
      return false;
    }
    ignoreEvent(_event) {
      return false;
    }
    childCursor(pos = this.length) {
      return new ChildCursor(this.children, pos, this.children.length);
    }
    childPos(pos, bias = 1) {
      return this.childCursor().findPos(pos, bias);
    }
    toString() {
      let name2 = this.constructor.name.replace("View", "");
      return name2 + (this.children.length ? "(" + this.children.join() + ")" : this.length ? "[" + (name2 == "Text" ? this.text : this.length) + "]" : "") + (this.breakAfter ? "#" : "");
    }
    static get(node) {
      return node.cmView;
    }
    get isEditable() {
      return true;
    }
    get isWidget() {
      return false;
    }
    get isHidden() {
      return false;
    }
    merge(from, to, source, hasStart, openStart, openEnd) {
      return false;
    }
    become(other) {
      return false;
    }
    canReuseDOM(other) {
      return other.constructor == this.constructor && !((this.flags | other.flags) & 8);
    }
    // When this is a zero-length view with a side, this should return a
    // number <= 0 to indicate it is before its position, or a
    // number > 0 when after its position.
    getSide() {
      return 0;
    }
    destroy() {
      for (let child of this.children)
        if (child.parent == this)
          child.destroy();
      this.parent = null;
    }
  }
  ContentView.prototype.breakAfter = 0;
  function rm$1(dom) {
    let next = dom.nextSibling;
    dom.parentNode.removeChild(dom);
    return next;
  }
  class ChildCursor {
    constructor(children, pos, i2) {
      this.children = children;
      this.pos = pos;
      this.i = i2;
      this.off = 0;
    }
    findPos(pos, bias = 1) {
      for (; ; ) {
        if (pos > this.pos || pos == this.pos && (bias > 0 || this.i == 0 || this.children[this.i - 1].breakAfter)) {
          this.off = pos - this.pos;
          return this;
        }
        let next = this.children[--this.i];
        this.pos -= next.length + next.breakAfter;
      }
    }
  }
  function replaceRange(parent, fromI, fromOff, toI, toOff, insert2, breakAtStart, openStart, openEnd) {
    let { children } = parent;
    let before = children.length ? children[fromI] : null;
    let last = insert2.length ? insert2[insert2.length - 1] : null;
    let breakAtEnd = last ? last.breakAfter : breakAtStart;
    if (fromI == toI && before && !breakAtStart && !breakAtEnd && insert2.length < 2 && before.merge(fromOff, toOff, insert2.length ? last : null, fromOff == 0, openStart, openEnd))
      return;
    if (toI < children.length) {
      let after = children[toI];
      if (after && (toOff < after.length || after.breakAfter && (last === null || last === void 0 ? void 0 : last.breakAfter))) {
        if (fromI == toI) {
          after = after.split(toOff);
          toOff = 0;
        }
        if (!breakAtEnd && last && after.merge(0, toOff, last, true, 0, openEnd)) {
          insert2[insert2.length - 1] = after;
        } else {
          if (toOff || after.children.length && !after.children[0].length)
            after.merge(0, toOff, null, false, 0, openEnd);
          insert2.push(after);
        }
      } else if (after === null || after === void 0 ? void 0 : after.breakAfter) {
        if (last)
          last.breakAfter = 1;
        else
          breakAtStart = 1;
      }
      toI++;
    }
    if (before) {
      before.breakAfter = breakAtStart;
      if (fromOff > 0) {
        if (!breakAtStart && insert2.length && before.merge(fromOff, before.length, insert2[0], false, openStart, 0)) {
          before.breakAfter = insert2.shift().breakAfter;
        } else if (fromOff < before.length || before.children.length && before.children[before.children.length - 1].length == 0) {
          before.merge(fromOff, before.length, null, false, openStart, 0);
        }
        fromI++;
      }
    }
    while (fromI < toI && insert2.length) {
      if (children[toI - 1].become(insert2[insert2.length - 1])) {
        toI--;
        insert2.pop();
        openEnd = insert2.length ? 0 : openStart;
      } else if (children[fromI].become(insert2[0])) {
        fromI++;
        insert2.shift();
        openStart = insert2.length ? 0 : openEnd;
      } else {
        break;
      }
    }
    if (!insert2.length && fromI && toI < children.length && !children[fromI - 1].breakAfter && children[toI].merge(0, 0, children[fromI - 1], false, openStart, openEnd))
      fromI--;
    if (fromI < toI || insert2.length)
      parent.replaceChildren(fromI, toI, insert2);
  }
  function mergeChildrenInto(parent, from, to, insert2, openStart, openEnd) {
    let cur = parent.childCursor();
    let { i: toI, off: toOff } = cur.findPos(to, 1);
    let { i: fromI, off: fromOff } = cur.findPos(from, -1);
    let dLen = from - to;
    for (let view of insert2)
      dLen += view.length;
    parent.length += dLen;
    replaceRange(parent, fromI, fromOff, toI, toOff, insert2, 0, openStart, openEnd);
  }
  let nav = typeof navigator != "undefined" ? navigator : { userAgent: "", vendor: "", platform: "" };
  let doc = typeof document != "undefined" ? document : { documentElement: { style: {} } };
  const ie_edge = /* @__PURE__ */ /Edge\/(\d+)/.exec(nav.userAgent);
  const ie_upto10 = /* @__PURE__ */ /MSIE \d/.test(nav.userAgent);
  const ie_11up = /* @__PURE__ */ /Trident\/(?:[7-9]|\d{2,})\..*rv:(\d+)/.exec(nav.userAgent);
  const ie = !!(ie_upto10 || ie_11up || ie_edge);
  const gecko = !ie && /* @__PURE__ */ /gecko\/(\d+)/i.test(nav.userAgent);
  const chrome = !ie && /* @__PURE__ */ /Chrome\/(\d+)/.exec(nav.userAgent);
  const webkit = "webkitFontSmoothing" in doc.documentElement.style;
  const safari = !ie && /* @__PURE__ */ /Apple Computer/.test(nav.vendor);
  const ios = safari && (/* @__PURE__ */ /Mobile\/\w+/.test(nav.userAgent) || nav.maxTouchPoints > 2);
  var browser = {
    mac: ios || /* @__PURE__ */ /Mac/.test(nav.platform),
    windows: /* @__PURE__ */ /Win/.test(nav.platform),
    linux: /* @__PURE__ */ /Linux|X11/.test(nav.platform),
    ie,
    ie_version: ie_upto10 ? doc.documentMode || 6 : ie_11up ? +ie_11up[1] : ie_edge ? +ie_edge[1] : 0,
    gecko,
    gecko_version: gecko ? +(/* @__PURE__ */ /Firefox\/(\d+)/.exec(nav.userAgent) || [0, 0])[1] : 0,
    chrome: !!chrome,
    chrome_version: chrome ? +chrome[1] : 0,
    ios,
    android: /* @__PURE__ */ /Android\b/.test(nav.userAgent),
    webkit,
    safari,
    webkit_version: webkit ? +(/* @__PURE__ */ /\bAppleWebKit\/(\d+)/.exec(navigator.userAgent) || [0, 0])[1] : 0,
    tabSize: doc.documentElement.style.tabSize != null ? "tab-size" : "-moz-tab-size"
  };
  const MaxJoinLen = 256;
  class TextView extends ContentView {
    constructor(text) {
      super();
      this.text = text;
    }
    get length() {
      return this.text.length;
    }
    createDOM(textDOM) {
      this.setDOM(textDOM || document.createTextNode(this.text));
    }
    sync(view, track) {
      if (!this.dom)
        this.createDOM();
      if (this.dom.nodeValue != this.text) {
        if (track && track.node == this.dom)
          track.written = true;
        this.dom.nodeValue = this.text;
      }
    }
    reuseDOM(dom) {
      if (dom.nodeType == 3)
        this.createDOM(dom);
    }
    merge(from, to, source) {
      if (this.flags & 8 || source && (!(source instanceof TextView) || this.length - (to - from) + source.length > MaxJoinLen || source.flags & 8))
        return false;
      this.text = this.text.slice(0, from) + (source ? source.text : "") + this.text.slice(to);
      this.markDirty();
      return true;
    }
    split(from) {
      let result = new TextView(this.text.slice(from));
      this.text = this.text.slice(0, from);
      this.markDirty();
      result.flags |= this.flags & 8;
      return result;
    }
    localPosFromDOM(node, offset) {
      return node == this.dom ? offset : offset ? this.text.length : 0;
    }
    domAtPos(pos) {
      return new DOMPos(this.dom, pos);
    }
    domBoundsAround(_from, _to, offset) {
      return { from: offset, to: offset + this.length, startDOM: this.dom, endDOM: this.dom.nextSibling };
    }
    coordsAt(pos, side) {
      return textCoords(this.dom, pos, side);
    }
  }
  class MarkView extends ContentView {
    constructor(mark, children = [], length = 0) {
      super();
      this.mark = mark;
      this.children = children;
      this.length = length;
      for (let ch of children)
        ch.setParent(this);
    }
    setAttrs(dom) {
      clearAttributes(dom);
      if (this.mark.class)
        dom.className = this.mark.class;
      if (this.mark.attrs)
        for (let name2 in this.mark.attrs)
          dom.setAttribute(name2, this.mark.attrs[name2]);
      return dom;
    }
    canReuseDOM(other) {
      return super.canReuseDOM(other) && !((this.flags | other.flags) & 8);
    }
    reuseDOM(node) {
      if (node.nodeName == this.mark.tagName.toUpperCase()) {
        this.setDOM(node);
        this.flags |= 4 | 2;
      }
    }
    sync(view, track) {
      if (!this.dom)
        this.setDOM(this.setAttrs(document.createElement(this.mark.tagName)));
      else if (this.flags & 4)
        this.setAttrs(this.dom);
      super.sync(view, track);
    }
    merge(from, to, source, _hasStart, openStart, openEnd) {
      if (source && (!(source instanceof MarkView && source.mark.eq(this.mark)) || from && openStart <= 0 || to < this.length && openEnd <= 0))
        return false;
      mergeChildrenInto(this, from, to, source ? source.children.slice() : [], openStart - 1, openEnd - 1);
      this.markDirty();
      return true;
    }
    split(from) {
      let result = [], off = 0, detachFrom = -1, i2 = 0;
      for (let elt of this.children) {
        let end = off + elt.length;
        if (end > from)
          result.push(off < from ? elt.split(from - off) : elt);
        if (detachFrom < 0 && off >= from)
          detachFrom = i2;
        off = end;
        i2++;
      }
      let length = this.length - from;
      this.length = from;
      if (detachFrom > -1) {
        this.children.length = detachFrom;
        this.markDirty();
      }
      return new MarkView(this.mark, result, length);
    }
    domAtPos(pos) {
      return inlineDOMAtPos(this, pos);
    }
    coordsAt(pos, side) {
      return coordsInChildren(this, pos, side);
    }
  }
  function textCoords(text, pos, side) {
    let length = text.nodeValue.length;
    if (pos > length)
      pos = length;
    let from = pos, to = pos, flatten2 = 0;
    if (pos == 0 && side < 0 || pos == length && side >= 0) {
      if (!(browser.chrome || browser.gecko)) {
        if (pos) {
          from--;
          flatten2 = 1;
        } else if (to < length) {
          to++;
          flatten2 = -1;
        }
      }
    } else {
      if (side < 0)
        from--;
      else if (to < length)
        to++;
    }
    let rects = textRange(text, from, to).getClientRects();
    if (!rects.length)
      return null;
    let rect = rects[(flatten2 ? flatten2 < 0 : side >= 0) ? 0 : rects.length - 1];
    if (browser.safari && !flatten2 && rect.width == 0)
      rect = Array.prototype.find.call(rects, (r2) => r2.width) || rect;
    return flatten2 ? flattenRect(rect, flatten2 < 0) : rect || null;
  }
  class WidgetView extends ContentView {
    static create(widget, length, side) {
      return new WidgetView(widget, length, side);
    }
    constructor(widget, length, side) {
      super();
      this.widget = widget;
      this.length = length;
      this.side = side;
      this.prevWidget = null;
    }
    split(from) {
      let result = WidgetView.create(this.widget, this.length - from, this.side);
      this.length -= from;
      return result;
    }
    sync(view) {
      if (!this.dom || !this.widget.updateDOM(this.dom, view)) {
        if (this.dom && this.prevWidget)
          this.prevWidget.destroy(this.dom);
        this.prevWidget = null;
        this.setDOM(this.widget.toDOM(view));
        if (!this.widget.editable)
          this.dom.contentEditable = "false";
      }
    }
    getSide() {
      return this.side;
    }
    merge(from, to, source, hasStart, openStart, openEnd) {
      if (source && (!(source instanceof WidgetView) || !this.widget.compare(source.widget) || from > 0 && openStart <= 0 || to < this.length && openEnd <= 0))
        return false;
      this.length = from + (source ? source.length : 0) + (this.length - to);
      return true;
    }
    become(other) {
      if (other instanceof WidgetView && other.side == this.side && this.widget.constructor == other.widget.constructor) {
        if (!this.widget.compare(other.widget))
          this.markDirty(true);
        if (this.dom && !this.prevWidget)
          this.prevWidget = this.widget;
        this.widget = other.widget;
        this.length = other.length;
        return true;
      }
      return false;
    }
    ignoreMutation() {
      return true;
    }
    ignoreEvent(event) {
      return this.widget.ignoreEvent(event);
    }
    get overrideDOMText() {
      if (this.length == 0)
        return Text.empty;
      let top2 = this;
      while (top2.parent)
        top2 = top2.parent;
      let { view } = top2, text = view && view.state.doc, start = this.posAtStart;
      return text ? text.slice(start, start + this.length) : Text.empty;
    }
    domAtPos(pos) {
      return (this.length ? pos == 0 : this.side > 0) ? DOMPos.before(this.dom) : DOMPos.after(this.dom, pos == this.length);
    }
    domBoundsAround() {
      return null;
    }
    coordsAt(pos, side) {
      let custom = this.widget.coordsAt(this.dom, pos, side);
      if (custom)
        return custom;
      let rects = this.dom.getClientRects(), rect = null;
      if (!rects.length)
        return null;
      let fromBack = this.side ? this.side < 0 : pos > 0;
      for (let i2 = fromBack ? rects.length - 1 : 0; ; i2 += fromBack ? -1 : 1) {
        rect = rects[i2];
        if (pos > 0 ? i2 == 0 : i2 == rects.length - 1 || rect.top < rect.bottom)
          break;
      }
      return flattenRect(rect, !fromBack);
    }
    get isEditable() {
      return false;
    }
    get isWidget() {
      return true;
    }
    get isHidden() {
      return this.widget.isHidden;
    }
    destroy() {
      super.destroy();
      if (this.dom)
        this.widget.destroy(this.dom);
    }
  }
  class WidgetBufferView extends ContentView {
    constructor(side) {
      super();
      this.side = side;
    }
    get length() {
      return 0;
    }
    merge() {
      return false;
    }
    become(other) {
      return other instanceof WidgetBufferView && other.side == this.side;
    }
    split() {
      return new WidgetBufferView(this.side);
    }
    sync() {
      if (!this.dom) {
        let dom = document.createElement("img");
        dom.className = "cm-widgetBuffer";
        dom.setAttribute("aria-hidden", "true");
        this.setDOM(dom);
      }
    }
    getSide() {
      return this.side;
    }
    domAtPos(pos) {
      return this.side > 0 ? DOMPos.before(this.dom) : DOMPos.after(this.dom);
    }
    localPosFromDOM() {
      return 0;
    }
    domBoundsAround() {
      return null;
    }
    coordsAt(pos) {
      return this.dom.getBoundingClientRect();
    }
    get overrideDOMText() {
      return Text.empty;
    }
    get isHidden() {
      return true;
    }
  }
  TextView.prototype.children = WidgetView.prototype.children = WidgetBufferView.prototype.children = noChildren;
  function inlineDOMAtPos(parent, pos) {
    let dom = parent.dom, { children } = parent, i2 = 0;
    for (let off = 0; i2 < children.length; i2++) {
      let child = children[i2], end = off + child.length;
      if (end == off && child.getSide() <= 0)
        continue;
      if (pos > off && pos < end && child.dom.parentNode == dom)
        return child.domAtPos(pos - off);
      if (pos <= off)
        break;
      off = end;
    }
    for (let j2 = i2; j2 > 0; j2--) {
      let prev = children[j2 - 1];
      if (prev.dom.parentNode == dom)
        return prev.domAtPos(prev.length);
    }
    for (let j2 = i2; j2 < children.length; j2++) {
      let next = children[j2];
      if (next.dom.parentNode == dom)
        return next.domAtPos(0);
    }
    return new DOMPos(dom, 0);
  }
  function joinInlineInto(parent, view, open) {
    let last, { children } = parent;
    if (open > 0 && view instanceof MarkView && children.length && (last = children[children.length - 1]) instanceof MarkView && last.mark.eq(view.mark)) {
      joinInlineInto(last, view.children[0], open - 1);
    } else {
      children.push(view);
      view.setParent(parent);
    }
    parent.length += view.length;
  }
  function coordsInChildren(view, pos, side) {
    let before = null, beforePos = -1, after = null, afterPos = -1;
    function scan(view2, pos2) {
      for (let i2 = 0, off = 0; i2 < view2.children.length && off <= pos2; i2++) {
        let child = view2.children[i2], end = off + child.length;
        if (end >= pos2) {
          if (child.children.length) {
            scan(child, pos2 - off);
          } else if ((!after || after.isHidden && side > 0) && (end > pos2 || off == end && child.getSide() > 0)) {
            after = child;
            afterPos = pos2 - off;
          } else if (off < pos2 || off == end && child.getSide() < 0 && !child.isHidden) {
            before = child;
            beforePos = pos2 - off;
          }
        }
        off = end;
      }
    }
    scan(view, pos);
    let target = (side < 0 ? before : after) || before || after;
    if (target)
      return target.coordsAt(Math.max(0, target == before ? beforePos : afterPos), side);
    return fallbackRect(view);
  }
  function fallbackRect(view) {
    let last = view.dom.lastChild;
    if (!last)
      return view.dom.getBoundingClientRect();
    let rects = clientRectsFor(last);
    return rects[rects.length - 1] || null;
  }
  function combineAttrs(source, target) {
    for (let name2 in source) {
      if (name2 == "class" && target.class)
        target.class += " " + source.class;
      else if (name2 == "style" && target.style)
        target.style += ";" + source.style;
      else
        target[name2] = source[name2];
    }
    return target;
  }
  const noAttrs = /* @__PURE__ */ Object.create(null);
  function attrsEq(a2, b2, ignore) {
    if (a2 == b2)
      return true;
    if (!a2)
      a2 = noAttrs;
    if (!b2)
      b2 = noAttrs;
    let keysA = Object.keys(a2), keysB = Object.keys(b2);
    if (keysA.length - (ignore && keysA.indexOf(ignore) > -1 ? 1 : 0) != keysB.length - (ignore && keysB.indexOf(ignore) > -1 ? 1 : 0))
      return false;
    for (let key of keysA) {
      if (key != ignore && (keysB.indexOf(key) == -1 || a2[key] !== b2[key]))
        return false;
    }
    return true;
  }
  function updateAttrs(dom, prev, attrs) {
    let changed = false;
    if (prev) {
      for (let name2 in prev)
        if (!(attrs && name2 in attrs)) {
          changed = true;
          if (name2 == "style")
            dom.style.cssText = "";
          else
            dom.removeAttribute(name2);
        }
    }
    if (attrs) {
      for (let name2 in attrs)
        if (!(prev && prev[name2] == attrs[name2])) {
          changed = true;
          if (name2 == "style")
            dom.style.cssText = attrs[name2];
          else
            dom.setAttribute(name2, attrs[name2]);
        }
    }
    return changed;
  }
  function getAttrs(dom) {
    let attrs = /* @__PURE__ */ Object.create(null);
    for (let i2 = 0; i2 < dom.attributes.length; i2++) {
      let attr = dom.attributes[i2];
      attrs[attr.name] = attr.value;
    }
    return attrs;
  }
  class LineView extends ContentView {
    constructor() {
      super(...arguments);
      this.children = [];
      this.length = 0;
      this.prevAttrs = void 0;
      this.attrs = null;
      this.breakAfter = 0;
    }
    // Consumes source
    merge(from, to, source, hasStart, openStart, openEnd) {
      if (source) {
        if (!(source instanceof LineView))
          return false;
        if (!this.dom)
          source.transferDOM(this);
      }
      if (hasStart)
        this.setDeco(source ? source.attrs : null);
      mergeChildrenInto(this, from, to, source ? source.children.slice() : [], openStart, openEnd);
      return true;
    }
    split(at) {
      let end = new LineView();
      end.breakAfter = this.breakAfter;
      if (this.length == 0)
        return end;
      let { i: i2, off } = this.childPos(at);
      if (off) {
        end.append(this.children[i2].split(off), 0);
        this.children[i2].merge(off, this.children[i2].length, null, false, 0, 0);
        i2++;
      }
      for (let j2 = i2; j2 < this.children.length; j2++)
        end.append(this.children[j2], 0);
      while (i2 > 0 && this.children[i2 - 1].length == 0)
        this.children[--i2].destroy();
      this.children.length = i2;
      this.markDirty();
      this.length = at;
      return end;
    }
    transferDOM(other) {
      if (!this.dom)
        return;
      this.markDirty();
      other.setDOM(this.dom);
      other.prevAttrs = this.prevAttrs === void 0 ? this.attrs : this.prevAttrs;
      this.prevAttrs = void 0;
      this.dom = null;
    }
    setDeco(attrs) {
      if (!attrsEq(this.attrs, attrs)) {
        if (this.dom) {
          this.prevAttrs = this.attrs;
          this.markDirty();
        }
        this.attrs = attrs;
      }
    }
    append(child, openStart) {
      joinInlineInto(this, child, openStart);
    }
    // Only called when building a line view in ContentBuilder
    addLineDeco(deco) {
      let attrs = deco.spec.attributes, cls = deco.spec.class;
      if (attrs)
        this.attrs = combineAttrs(attrs, this.attrs || {});
      if (cls)
        this.attrs = combineAttrs({ class: cls }, this.attrs || {});
    }
    domAtPos(pos) {
      return inlineDOMAtPos(this, pos);
    }
    reuseDOM(node) {
      if (node.nodeName == "DIV") {
        this.setDOM(node);
        this.flags |= 4 | 2;
      }
    }
    sync(view, track) {
      var _a3;
      if (!this.dom) {
        this.setDOM(document.createElement("div"));
        this.dom.className = "cm-line";
        this.prevAttrs = this.attrs ? null : void 0;
      } else if (this.flags & 4) {
        clearAttributes(this.dom);
        this.dom.className = "cm-line";
        this.prevAttrs = this.attrs ? null : void 0;
      }
      if (this.prevAttrs !== void 0) {
        updateAttrs(this.dom, this.prevAttrs, this.attrs);
        this.dom.classList.add("cm-line");
        this.prevAttrs = void 0;
      }
      super.sync(view, track);
      let last = this.dom.lastChild;
      while (last && ContentView.get(last) instanceof MarkView)
        last = last.lastChild;
      if (!last || !this.length || last.nodeName != "BR" && ((_a3 = ContentView.get(last)) === null || _a3 === void 0 ? void 0 : _a3.isEditable) == false && (!browser.ios || !this.children.some((ch) => ch instanceof TextView))) {
        let hack = document.createElement("BR");
        hack.cmIgnore = true;
        this.dom.appendChild(hack);
      }
    }
    measureTextSize() {
      if (this.children.length == 0 || this.length > 20)
        return null;
      let totalWidth = 0, textHeight;
      for (let child of this.children) {
        if (!(child instanceof TextView) || /[^ -~]/.test(child.text))
          return null;
        let rects = clientRectsFor(child.dom);
        if (rects.length != 1)
          return null;
        totalWidth += rects[0].width;
        textHeight = rects[0].height;
      }
      return !totalWidth ? null : {
        lineHeight: this.dom.getBoundingClientRect().height,
        charWidth: totalWidth / this.length,
        textHeight
      };
    }
    coordsAt(pos, side) {
      let rect = coordsInChildren(this, pos, side);
      if (!this.children.length && rect && this.parent) {
        let { heightOracle } = this.parent.view.viewState, height = rect.bottom - rect.top;
        if (Math.abs(height - heightOracle.lineHeight) < 2 && heightOracle.textHeight < height) {
          let dist2 = (height - heightOracle.textHeight) / 2;
          return { top: rect.top + dist2, bottom: rect.bottom - dist2, left: rect.left, right: rect.left };
        }
      }
      return rect;
    }
    become(_other) {
      return false;
    }
    covers() {
      return true;
    }
    static find(docView, pos) {
      for (let i2 = 0, off = 0; i2 < docView.children.length; i2++) {
        let block = docView.children[i2], end = off + block.length;
        if (end >= pos) {
          if (block instanceof LineView)
            return block;
          if (end > pos)
            break;
        }
        off = end + block.breakAfter;
      }
      return null;
    }
  }
  class BlockWidgetView extends ContentView {
    constructor(widget, length, deco) {
      super();
      this.widget = widget;
      this.length = length;
      this.deco = deco;
      this.breakAfter = 0;
      this.prevWidget = null;
    }
    merge(from, to, source, _takeDeco, openStart, openEnd) {
      if (source && (!(source instanceof BlockWidgetView) || !this.widget.compare(source.widget) || from > 0 && openStart <= 0 || to < this.length && openEnd <= 0))
        return false;
      this.length = from + (source ? source.length : 0) + (this.length - to);
      return true;
    }
    domAtPos(pos) {
      return pos == 0 ? DOMPos.before(this.dom) : DOMPos.after(this.dom, pos == this.length);
    }
    split(at) {
      let len = this.length - at;
      this.length = at;
      let end = new BlockWidgetView(this.widget, len, this.deco);
      end.breakAfter = this.breakAfter;
      return end;
    }
    get children() {
      return noChildren;
    }
    sync(view) {
      if (!this.dom || !this.widget.updateDOM(this.dom, view)) {
        if (this.dom && this.prevWidget)
          this.prevWidget.destroy(this.dom);
        this.prevWidget = null;
        this.setDOM(this.widget.toDOM(view));
        if (!this.widget.editable)
          this.dom.contentEditable = "false";
      }
    }
    get overrideDOMText() {
      return this.parent ? this.parent.view.state.doc.slice(this.posAtStart, this.posAtEnd) : Text.empty;
    }
    domBoundsAround() {
      return null;
    }
    become(other) {
      if (other instanceof BlockWidgetView && other.widget.constructor == this.widget.constructor) {
        if (!other.widget.compare(this.widget))
          this.markDirty(true);
        if (this.dom && !this.prevWidget)
          this.prevWidget = this.widget;
        this.widget = other.widget;
        this.length = other.length;
        this.deco = other.deco;
        this.breakAfter = other.breakAfter;
        return true;
      }
      return false;
    }
    ignoreMutation() {
      return true;
    }
    ignoreEvent(event) {
      return this.widget.ignoreEvent(event);
    }
    get isEditable() {
      return false;
    }
    get isWidget() {
      return true;
    }
    coordsAt(pos, side) {
      return this.widget.coordsAt(this.dom, pos, side);
    }
    destroy() {
      super.destroy();
      if (this.dom)
        this.widget.destroy(this.dom);
    }
    covers(side) {
      let { startSide, endSide } = this.deco;
      return startSide == endSide ? false : side < 0 ? startSide < 0 : endSide > 0;
    }
  }
  class WidgetType {
    /**
    Compare this instance to another instance of the same type.
    (TypeScript can't express this, but only instances of the same
    specific class will be passed to this method.) This is used to
    avoid redrawing widgets when they are replaced by a new
    decoration of the same type. The default implementation just
    returns `false`, which will cause new instances of the widget to
    always be redrawn.
    */
    eq(widget) {
      return false;
    }
    /**
    Update a DOM element created by a widget of the same type (but
    different, non-`eq` content) to reflect this widget. May return
    true to indicate that it could update, false to indicate it
    couldn't (in which case the widget will be redrawn). The default
    implementation just returns false.
    */
    updateDOM(dom, view) {
      return false;
    }
    /**
    @internal
    */
    compare(other) {
      return this == other || this.constructor == other.constructor && this.eq(other);
    }
    /**
    The estimated height this widget will have, to be used when
    estimating the height of content that hasn't been drawn. May
    return -1 to indicate you don't know. The default implementation
    returns -1.
    */
    get estimatedHeight() {
      return -1;
    }
    /**
    For inline widgets that are displayed inline (as opposed to
    `inline-block`) and introduce line breaks (through `<br>` tags
    or textual newlines), this must indicate the amount of line
    breaks they introduce. Defaults to 0.
    */
    get lineBreaks() {
      return 0;
    }
    /**
    Can be used to configure which kinds of events inside the widget
    should be ignored by the editor. The default is to ignore all
    events.
    */
    ignoreEvent(event) {
      return true;
    }
    /**
    Override the way screen coordinates for positions at/in the
    widget are found. `pos` will be the offset into the widget, and
    `side` the side of the position that is being queried—less than
    zero for before, greater than zero for after, and zero for
    directly at that position.
    */
    coordsAt(dom, pos, side) {
      return null;
    }
    /**
    @internal
    */
    get isHidden() {
      return false;
    }
    /**
    @internal
    */
    get editable() {
      return false;
    }
    /**
    This is called when the an instance of the widget is removed
    from the editor view.
    */
    destroy(dom) {
    }
  }
  var BlockType = /* @__PURE__ */ function(BlockType2) {
    BlockType2[BlockType2["Text"] = 0] = "Text";
    BlockType2[BlockType2["WidgetBefore"] = 1] = "WidgetBefore";
    BlockType2[BlockType2["WidgetAfter"] = 2] = "WidgetAfter";
    BlockType2[BlockType2["WidgetRange"] = 3] = "WidgetRange";
    return BlockType2;
  }(BlockType || (BlockType = {}));
  class Decoration extends RangeValue {
    constructor(startSide, endSide, widget, spec) {
      super();
      this.startSide = startSide;
      this.endSide = endSide;
      this.widget = widget;
      this.spec = spec;
    }
    /**
    @internal
    */
    get heightRelevant() {
      return false;
    }
    /**
    Create a mark decoration, which influences the styling of the
    content in its range. Nested mark decorations will cause nested
    DOM elements to be created. Nesting order is determined by
    precedence of the [facet](https://codemirror.net/6/docs/ref/#view.EditorView^decorations), with
    the higher-precedence decorations creating the inner DOM nodes.
    Such elements are split on line boundaries and on the boundaries
    of lower-precedence decorations.
    */
    static mark(spec) {
      return new MarkDecoration(spec);
    }
    /**
    Create a widget decoration, which displays a DOM element at the
    given position.
    */
    static widget(spec) {
      let side = Math.max(-1e4, Math.min(1e4, spec.side || 0)), block = !!spec.block;
      side += block && !spec.inlineOrder ? side > 0 ? 3e8 : -4e8 : side > 0 ? 1e8 : -1e8;
      return new PointDecoration(spec, side, side, block, spec.widget || null, false);
    }
    /**
    Create a replace decoration which replaces the given range with
    a widget, or simply hides it.
    */
    static replace(spec) {
      let block = !!spec.block, startSide, endSide;
      if (spec.isBlockGap) {
        startSide = -5e8;
        endSide = 4e8;
      } else {
        let { start, end } = getInclusive(spec, block);
        startSide = (start ? block ? -3e8 : -1 : 5e8) - 1;
        endSide = (end ? block ? 2e8 : 1 : -6e8) + 1;
      }
      return new PointDecoration(spec, startSide, endSide, block, spec.widget || null, true);
    }
    /**
    Create a line decoration, which can add DOM attributes to the
    line starting at the given position.
    */
    static line(spec) {
      return new LineDecoration(spec);
    }
    /**
    Build a [`DecorationSet`](https://codemirror.net/6/docs/ref/#view.DecorationSet) from the given
    decorated range or ranges. If the ranges aren't already sorted,
    pass `true` for `sort` to make the library sort them for you.
    */
    static set(of, sort = false) {
      return RangeSet.of(of, sort);
    }
    /**
    @internal
    */
    hasHeight() {
      return this.widget ? this.widget.estimatedHeight > -1 : false;
    }
  }
  Decoration.none = RangeSet.empty;
  class MarkDecoration extends Decoration {
    constructor(spec) {
      let { start, end } = getInclusive(spec);
      super(start ? -1 : 5e8, end ? 1 : -6e8, null, spec);
      this.tagName = spec.tagName || "span";
      this.class = spec.class || "";
      this.attrs = spec.attributes || null;
    }
    eq(other) {
      var _a3, _b2;
      return this == other || other instanceof MarkDecoration && this.tagName == other.tagName && (this.class || ((_a3 = this.attrs) === null || _a3 === void 0 ? void 0 : _a3.class)) == (other.class || ((_b2 = other.attrs) === null || _b2 === void 0 ? void 0 : _b2.class)) && attrsEq(this.attrs, other.attrs, "class");
    }
    range(from, to = from) {
      if (from >= to)
        throw new RangeError("Mark decorations may not be empty");
      return super.range(from, to);
    }
  }
  MarkDecoration.prototype.point = false;
  class LineDecoration extends Decoration {
    constructor(spec) {
      super(-2e8, -2e8, null, spec);
    }
    eq(other) {
      return other instanceof LineDecoration && this.spec.class == other.spec.class && attrsEq(this.spec.attributes, other.spec.attributes);
    }
    range(from, to = from) {
      if (to != from)
        throw new RangeError("Line decoration ranges must be zero-length");
      return super.range(from, to);
    }
  }
  LineDecoration.prototype.mapMode = MapMode.TrackBefore;
  LineDecoration.prototype.point = true;
  class PointDecoration extends Decoration {
    constructor(spec, startSide, endSide, block, widget, isReplace) {
      super(startSide, endSide, widget, spec);
      this.block = block;
      this.isReplace = isReplace;
      this.mapMode = !block ? MapMode.TrackDel : startSide <= 0 ? MapMode.TrackBefore : MapMode.TrackAfter;
    }
    // Only relevant when this.block == true
    get type() {
      return this.startSide != this.endSide ? BlockType.WidgetRange : this.startSide <= 0 ? BlockType.WidgetBefore : BlockType.WidgetAfter;
    }
    get heightRelevant() {
      return this.block || !!this.widget && (this.widget.estimatedHeight >= 5 || this.widget.lineBreaks > 0);
    }
    eq(other) {
      return other instanceof PointDecoration && widgetsEq(this.widget, other.widget) && this.block == other.block && this.startSide == other.startSide && this.endSide == other.endSide;
    }
    range(from, to = from) {
      if (this.isReplace && (from > to || from == to && this.startSide > 0 && this.endSide <= 0))
        throw new RangeError("Invalid range for replacement decoration");
      if (!this.isReplace && to != from)
        throw new RangeError("Widget decorations can only have zero-length ranges");
      return super.range(from, to);
    }
  }
  PointDecoration.prototype.point = true;
  function getInclusive(spec, block = false) {
    let { inclusiveStart: start, inclusiveEnd: end } = spec;
    if (start == null)
      start = spec.inclusive;
    if (end == null)
      end = spec.inclusive;
    return { start: start !== null && start !== void 0 ? start : block, end: end !== null && end !== void 0 ? end : block };
  }
  function widgetsEq(a2, b2) {
    return a2 == b2 || !!(a2 && b2 && a2.compare(b2));
  }
  function addRange(from, to, ranges, margin = 0) {
    let last = ranges.length - 1;
    if (last >= 0 && ranges[last] + margin >= from)
      ranges[last] = Math.max(ranges[last], to);
    else
      ranges.push(from, to);
  }
  class ContentBuilder {
    constructor(doc2, pos, end, disallowBlockEffectsFor) {
      this.doc = doc2;
      this.pos = pos;
      this.end = end;
      this.disallowBlockEffectsFor = disallowBlockEffectsFor;
      this.content = [];
      this.curLine = null;
      this.breakAtStart = 0;
      this.pendingBuffer = 0;
      this.bufferMarks = [];
      this.atCursorPos = true;
      this.openStart = -1;
      this.openEnd = -1;
      this.text = "";
      this.textOff = 0;
      this.cursor = doc2.iter();
      this.skip = pos;
    }
    posCovered() {
      if (this.content.length == 0)
        return !this.breakAtStart && this.doc.lineAt(this.pos).from != this.pos;
      let last = this.content[this.content.length - 1];
      return !(last.breakAfter || last instanceof BlockWidgetView && last.deco.endSide < 0);
    }
    getLine() {
      if (!this.curLine) {
        this.content.push(this.curLine = new LineView());
        this.atCursorPos = true;
      }
      return this.curLine;
    }
    flushBuffer(active = this.bufferMarks) {
      if (this.pendingBuffer) {
        this.curLine.append(wrapMarks(new WidgetBufferView(-1), active), active.length);
        this.pendingBuffer = 0;
      }
    }
    addBlockWidget(view) {
      this.flushBuffer();
      this.curLine = null;
      this.content.push(view);
    }
    finish(openEnd) {
      if (this.pendingBuffer && openEnd <= this.bufferMarks.length)
        this.flushBuffer();
      else
        this.pendingBuffer = 0;
      if (!this.posCovered() && !(openEnd && this.content.length && this.content[this.content.length - 1] instanceof BlockWidgetView))
        this.getLine();
    }
    buildText(length, active, openStart) {
      while (length > 0) {
        if (this.textOff == this.text.length) {
          let { value, lineBreak, done } = this.cursor.next(this.skip);
          this.skip = 0;
          if (done)
            throw new Error("Ran out of text content when drawing inline views");
          if (lineBreak) {
            if (!this.posCovered())
              this.getLine();
            if (this.content.length)
              this.content[this.content.length - 1].breakAfter = 1;
            else
              this.breakAtStart = 1;
            this.flushBuffer();
            this.curLine = null;
            this.atCursorPos = true;
            length--;
            continue;
          } else {
            this.text = value;
            this.textOff = 0;
          }
        }
        let take = Math.min(
          this.text.length - this.textOff,
          length,
          512
          /* T.Chunk */
        );
        this.flushBuffer(active.slice(active.length - openStart));
        this.getLine().append(wrapMarks(new TextView(this.text.slice(this.textOff, this.textOff + take)), active), openStart);
        this.atCursorPos = true;
        this.textOff += take;
        length -= take;
        openStart = 0;
      }
    }
    span(from, to, active, openStart) {
      this.buildText(to - from, active, openStart);
      this.pos = to;
      if (this.openStart < 0)
        this.openStart = openStart;
    }
    point(from, to, deco, active, openStart, index) {
      if (this.disallowBlockEffectsFor[index] && deco instanceof PointDecoration) {
        if (deco.block)
          throw new RangeError("Block decorations may not be specified via plugins");
        if (to > this.doc.lineAt(this.pos).to)
          throw new RangeError("Decorations that replace line breaks may not be specified via plugins");
      }
      let len = to - from;
      if (deco instanceof PointDecoration) {
        if (deco.block) {
          if (deco.startSide > 0 && !this.posCovered())
            this.getLine();
          this.addBlockWidget(new BlockWidgetView(deco.widget || new NullWidget("div"), len, deco));
        } else {
          let view = WidgetView.create(deco.widget || new NullWidget("span"), len, len ? 0 : deco.startSide);
          let cursorBefore = this.atCursorPos && !view.isEditable && openStart <= active.length && (from < to || deco.startSide > 0);
          let cursorAfter = !view.isEditable && (from < to || openStart > active.length || deco.startSide <= 0);
          let line = this.getLine();
          if (this.pendingBuffer == 2 && !cursorBefore && !view.isEditable)
            this.pendingBuffer = 0;
          this.flushBuffer(active);
          if (cursorBefore) {
            line.append(wrapMarks(new WidgetBufferView(1), active), openStart);
            openStart = active.length + Math.max(0, openStart - active.length);
          }
          line.append(wrapMarks(view, active), openStart);
          this.atCursorPos = cursorAfter;
          this.pendingBuffer = !cursorAfter ? 0 : from < to || openStart > active.length ? 1 : 2;
          if (this.pendingBuffer)
            this.bufferMarks = active.slice();
        }
      } else if (this.doc.lineAt(this.pos).from == this.pos) {
        this.getLine().addLineDeco(deco);
      }
      if (len) {
        if (this.textOff + len <= this.text.length) {
          this.textOff += len;
        } else {
          this.skip += len - (this.text.length - this.textOff);
          this.text = "";
          this.textOff = 0;
        }
        this.pos = to;
      }
      if (this.openStart < 0)
        this.openStart = openStart;
    }
    static build(text, from, to, decorations2, dynamicDecorationMap) {
      let builder = new ContentBuilder(text, from, to, dynamicDecorationMap);
      builder.openEnd = RangeSet.spans(decorations2, from, to, builder);
      if (builder.openStart < 0)
        builder.openStart = builder.openEnd;
      builder.finish(builder.openEnd);
      return builder;
    }
  }
  function wrapMarks(view, active) {
    for (let mark of active)
      view = new MarkView(mark, [view], view.length);
    return view;
  }
  class NullWidget extends WidgetType {
    constructor(tag) {
      super();
      this.tag = tag;
    }
    eq(other) {
      return other.tag == this.tag;
    }
    toDOM() {
      return document.createElement(this.tag);
    }
    updateDOM(elt) {
      return elt.nodeName.toLowerCase() == this.tag;
    }
    get isHidden() {
      return true;
    }
  }
  var Direction = /* @__PURE__ */ function(Direction2) {
    Direction2[Direction2["LTR"] = 0] = "LTR";
    Direction2[Direction2["RTL"] = 1] = "RTL";
    return Direction2;
  }(Direction || (Direction = {}));
  const LTR = Direction.LTR, RTL = Direction.RTL;
  function dec(str) {
    let result = [];
    for (let i2 = 0; i2 < str.length; i2++)
      result.push(1 << +str[i2]);
    return result;
  }
  const LowTypes = /* @__PURE__ */ dec("88888888888888888888888888888888888666888888787833333333337888888000000000000000000000000008888880000000000000000000000000088888888888888888888888888888888888887866668888088888663380888308888800000000000000000000000800000000000000000000000000000008");
  const ArabicTypes = /* @__PURE__ */ dec("4444448826627288999999999992222222222222222222222222222222222222222222222229999999999999999999994444444444644222822222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222999999949999999229989999223333333333");
  const Brackets = /* @__PURE__ */ Object.create(null), BracketStack = [];
  for (let p2 of ["()", "[]", "{}"]) {
    let l2 = /* @__PURE__ */ p2.charCodeAt(0), r2 = /* @__PURE__ */ p2.charCodeAt(1);
    Brackets[l2] = r2;
    Brackets[r2] = -l2;
  }
  function charType(ch) {
    return ch <= 247 ? LowTypes[ch] : 1424 <= ch && ch <= 1524 ? 2 : 1536 <= ch && ch <= 1785 ? ArabicTypes[ch - 1536] : 1774 <= ch && ch <= 2220 ? 4 : 8192 <= ch && ch <= 8204 ? 256 : 64336 <= ch && ch <= 65023 ? 4 : 1;
  }
  const BidiRE = /[\u0590-\u05f4\u0600-\u06ff\u0700-\u08ac\ufb50-\ufdff]/;
  class BidiSpan {
    /**
    The direction of this span.
    */
    get dir() {
      return this.level % 2 ? RTL : LTR;
    }
    /**
    @internal
    */
    constructor(from, to, level) {
      this.from = from;
      this.to = to;
      this.level = level;
    }
    /**
    @internal
    */
    side(end, dir) {
      return this.dir == dir == end ? this.to : this.from;
    }
    /**
    @internal
    */
    forward(forward, dir) {
      return forward == (this.dir == dir);
    }
    /**
    @internal
    */
    static find(order, index, level, assoc) {
      let maybe = -1;
      for (let i2 = 0; i2 < order.length; i2++) {
        let span = order[i2];
        if (span.from <= index && span.to >= index) {
          if (span.level == level)
            return i2;
          if (maybe < 0 || (assoc != 0 ? assoc < 0 ? span.from < index : span.to > index : order[maybe].level > span.level))
            maybe = i2;
        }
      }
      if (maybe < 0)
        throw new RangeError("Index out of range");
      return maybe;
    }
  }
  function isolatesEq(a2, b2) {
    if (a2.length != b2.length)
      return false;
    for (let i2 = 0; i2 < a2.length; i2++) {
      let iA = a2[i2], iB = b2[i2];
      if (iA.from != iB.from || iA.to != iB.to || iA.direction != iB.direction || !isolatesEq(iA.inner, iB.inner))
        return false;
    }
    return true;
  }
  const types = [];
  function computeCharTypes(line, rFrom, rTo, isolates, outerType) {
    for (let iI = 0; iI <= isolates.length; iI++) {
      let from = iI ? isolates[iI - 1].to : rFrom, to = iI < isolates.length ? isolates[iI].from : rTo;
      let prevType = iI ? 256 : outerType;
      for (let i2 = from, prev = prevType, prevStrong = prevType; i2 < to; i2++) {
        let type = charType(line.charCodeAt(i2));
        if (type == 512)
          type = prev;
        else if (type == 8 && prevStrong == 4)
          type = 16;
        types[i2] = type == 4 ? 2 : type;
        if (type & 7)
          prevStrong = type;
        prev = type;
      }
      for (let i2 = from, prev = prevType, prevStrong = prevType; i2 < to; i2++) {
        let type = types[i2];
        if (type == 128) {
          if (i2 < to - 1 && prev == types[i2 + 1] && prev & 24)
            type = types[i2] = prev;
          else
            types[i2] = 256;
        } else if (type == 64) {
          let end = i2 + 1;
          while (end < to && types[end] == 64)
            end++;
          let replace = i2 && prev == 8 || end < rTo && types[end] == 8 ? prevStrong == 1 ? 1 : 8 : 256;
          for (let j2 = i2; j2 < end; j2++)
            types[j2] = replace;
          i2 = end - 1;
        } else if (type == 8 && prevStrong == 1) {
          types[i2] = 1;
        }
        prev = type;
        if (type & 7)
          prevStrong = type;
      }
    }
  }
  function processBracketPairs(line, rFrom, rTo, isolates, outerType) {
    let oppositeType = outerType == 1 ? 2 : 1;
    for (let iI = 0, sI = 0, context = 0; iI <= isolates.length; iI++) {
      let from = iI ? isolates[iI - 1].to : rFrom, to = iI < isolates.length ? isolates[iI].from : rTo;
      for (let i2 = from, ch, br, type; i2 < to; i2++) {
        if (br = Brackets[ch = line.charCodeAt(i2)]) {
          if (br < 0) {
            for (let sJ = sI - 3; sJ >= 0; sJ -= 3) {
              if (BracketStack[sJ + 1] == -br) {
                let flags = BracketStack[sJ + 2];
                let type2 = flags & 2 ? outerType : !(flags & 4) ? 0 : flags & 1 ? oppositeType : outerType;
                if (type2)
                  types[i2] = types[BracketStack[sJ]] = type2;
                sI = sJ;
                break;
              }
            }
          } else if (BracketStack.length == 189) {
            break;
          } else {
            BracketStack[sI++] = i2;
            BracketStack[sI++] = ch;
            BracketStack[sI++] = context;
          }
        } else if ((type = types[i2]) == 2 || type == 1) {
          let embed = type == outerType;
          context = embed ? 0 : 1;
          for (let sJ = sI - 3; sJ >= 0; sJ -= 3) {
            let cur = BracketStack[sJ + 2];
            if (cur & 2)
              break;
            if (embed) {
              BracketStack[sJ + 2] |= 2;
            } else {
              if (cur & 4)
                break;
              BracketStack[sJ + 2] |= 4;
            }
          }
        }
      }
    }
  }
  function processNeutrals(rFrom, rTo, isolates, outerType) {
    for (let iI = 0, prev = outerType; iI <= isolates.length; iI++) {
      let from = iI ? isolates[iI - 1].to : rFrom, to = iI < isolates.length ? isolates[iI].from : rTo;
      for (let i2 = from; i2 < to; ) {
        let type = types[i2];
        if (type == 256) {
          let end = i2 + 1;
          for (; ; ) {
            if (end == to) {
              if (iI == isolates.length)
                break;
              end = isolates[iI++].to;
              to = iI < isolates.length ? isolates[iI].from : rTo;
            } else if (types[end] == 256) {
              end++;
            } else {
              break;
            }
          }
          let beforeL = prev == 1;
          let afterL = (end < rTo ? types[end] : outerType) == 1;
          let replace = beforeL == afterL ? beforeL ? 1 : 2 : outerType;
          for (let j2 = end, jI = iI, fromJ = jI ? isolates[jI - 1].to : rFrom; j2 > i2; ) {
            if (j2 == fromJ) {
              j2 = isolates[--jI].from;
              fromJ = jI ? isolates[jI - 1].to : rFrom;
            }
            types[--j2] = replace;
          }
          i2 = end;
        } else {
          prev = type;
          i2++;
        }
      }
    }
  }
  function emitSpans(line, from, to, level, baseLevel, isolates, order) {
    let ourType = level % 2 ? 2 : 1;
    if (level % 2 == baseLevel % 2) {
      for (let iCh = from, iI = 0; iCh < to; ) {
        let sameDir = true, isNum2 = false;
        if (iI == isolates.length || iCh < isolates[iI].from) {
          let next = types[iCh];
          if (next != ourType) {
            sameDir = false;
            isNum2 = next == 16;
          }
        }
        let recurse = !sameDir && ourType == 1 ? [] : null;
        let localLevel = sameDir ? level : level + 1;
        let iScan = iCh;
        run:
          for (; ; ) {
            if (iI < isolates.length && iScan == isolates[iI].from) {
              if (isNum2)
                break run;
              let iso = isolates[iI];
              if (!sameDir)
                for (let upto = iso.to, jI = iI + 1; ; ) {
                  if (upto == to)
                    break run;
                  if (jI < isolates.length && isolates[jI].from == upto)
                    upto = isolates[jI++].to;
                  else if (types[upto] == ourType)
                    break run;
                  else
                    break;
                }
              iI++;
              if (recurse) {
                recurse.push(iso);
              } else {
                if (iso.from > iCh)
                  order.push(new BidiSpan(iCh, iso.from, localLevel));
                let dirSwap = iso.direction == LTR != !(localLevel % 2);
                computeSectionOrder(line, dirSwap ? level + 1 : level, baseLevel, iso.inner, iso.from, iso.to, order);
                iCh = iso.to;
              }
              iScan = iso.to;
            } else if (iScan == to || (sameDir ? types[iScan] != ourType : types[iScan] == ourType)) {
              break;
            } else {
              iScan++;
            }
          }
        if (recurse)
          emitSpans(line, iCh, iScan, level + 1, baseLevel, recurse, order);
        else if (iCh < iScan)
          order.push(new BidiSpan(iCh, iScan, localLevel));
        iCh = iScan;
      }
    } else {
      for (let iCh = to, iI = isolates.length; iCh > from; ) {
        let sameDir = true, isNum2 = false;
        if (!iI || iCh > isolates[iI - 1].to) {
          let next = types[iCh - 1];
          if (next != ourType) {
            sameDir = false;
            isNum2 = next == 16;
          }
        }
        let recurse = !sameDir && ourType == 1 ? [] : null;
        let localLevel = sameDir ? level : level + 1;
        let iScan = iCh;
        run:
          for (; ; ) {
            if (iI && iScan == isolates[iI - 1].to) {
              if (isNum2)
                break run;
              let iso = isolates[--iI];
              if (!sameDir)
                for (let upto = iso.from, jI = iI; ; ) {
                  if (upto == from)
                    break run;
                  if (jI && isolates[jI - 1].to == upto)
                    upto = isolates[--jI].from;
                  else if (types[upto - 1] == ourType)
                    break run;
                  else
                    break;
                }
              if (recurse) {
                recurse.push(iso);
              } else {
                if (iso.to < iCh)
                  order.push(new BidiSpan(iso.to, iCh, localLevel));
                let dirSwap = iso.direction == LTR != !(localLevel % 2);
                computeSectionOrder(line, dirSwap ? level + 1 : level, baseLevel, iso.inner, iso.from, iso.to, order);
                iCh = iso.from;
              }
              iScan = iso.from;
            } else if (iScan == from || (sameDir ? types[iScan - 1] != ourType : types[iScan - 1] == ourType)) {
              break;
            } else {
              iScan--;
            }
          }
        if (recurse)
          emitSpans(line, iScan, iCh, level + 1, baseLevel, recurse, order);
        else if (iScan < iCh)
          order.push(new BidiSpan(iScan, iCh, localLevel));
        iCh = iScan;
      }
    }
  }
  function computeSectionOrder(line, level, baseLevel, isolates, from, to, order) {
    let outerType = level % 2 ? 2 : 1;
    computeCharTypes(line, from, to, isolates, outerType);
    processBracketPairs(line, from, to, isolates, outerType);
    processNeutrals(from, to, isolates, outerType);
    emitSpans(line, from, to, level, baseLevel, isolates, order);
  }
  function computeOrder(line, direction, isolates) {
    if (!line)
      return [new BidiSpan(0, 0, direction == RTL ? 1 : 0)];
    if (direction == LTR && !isolates.length && !BidiRE.test(line))
      return trivialOrder(line.length);
    if (isolates.length)
      while (line.length > types.length)
        types[types.length] = 256;
    let order = [], level = direction == LTR ? 0 : 1;
    computeSectionOrder(line, level, level, isolates, 0, line.length, order);
    return order;
  }
  function trivialOrder(length) {
    return [new BidiSpan(0, length, 0)];
  }
  let movedOver = "";
  function moveVisually(line, order, dir, start, forward) {
    var _a3;
    let startIndex = start.head - line.from;
    let spanI = BidiSpan.find(order, startIndex, (_a3 = start.bidiLevel) !== null && _a3 !== void 0 ? _a3 : -1, start.assoc);
    let span = order[spanI], spanEnd = span.side(forward, dir);
    if (startIndex == spanEnd) {
      let nextI = spanI += forward ? 1 : -1;
      if (nextI < 0 || nextI >= order.length)
        return null;
      span = order[spanI = nextI];
      startIndex = span.side(!forward, dir);
      spanEnd = span.side(forward, dir);
    }
    let nextIndex = findClusterBreak(line.text, startIndex, span.forward(forward, dir));
    if (nextIndex < span.from || nextIndex > span.to)
      nextIndex = spanEnd;
    movedOver = line.text.slice(Math.min(startIndex, nextIndex), Math.max(startIndex, nextIndex));
    let nextSpan = spanI == (forward ? order.length - 1 : 0) ? null : order[spanI + (forward ? 1 : -1)];
    if (nextSpan && nextIndex == spanEnd && nextSpan.level + (forward ? 0 : 1) < span.level)
      return EditorSelection.cursor(nextSpan.side(!forward, dir) + line.from, nextSpan.forward(forward, dir) ? 1 : -1, nextSpan.level);
    return EditorSelection.cursor(nextIndex + line.from, span.forward(forward, dir) ? -1 : 1, span.level);
  }
  function autoDirection(text, from, to) {
    for (let i2 = from; i2 < to; i2++) {
      let type = charType(text.charCodeAt(i2));
      if (type == 1)
        return LTR;
      if (type == 2 || type == 4)
        return RTL;
    }
    return LTR;
  }
  const clickAddsSelectionRange = /* @__PURE__ */ Facet.define();
  const dragMovesSelection$1 = /* @__PURE__ */ Facet.define();
  const mouseSelectionStyle = /* @__PURE__ */ Facet.define();
  const exceptionSink = /* @__PURE__ */ Facet.define();
  const updateListener = /* @__PURE__ */ Facet.define();
  const inputHandler = /* @__PURE__ */ Facet.define();
  const focusChangeEffect = /* @__PURE__ */ Facet.define();
  const perLineTextDirection = /* @__PURE__ */ Facet.define({
    combine: (values) => values.some((x2) => x2)
  });
  const nativeSelectionHidden = /* @__PURE__ */ Facet.define({
    combine: (values) => values.some((x2) => x2)
  });
  class ScrollTarget {
    constructor(range, y2 = "nearest", x2 = "nearest", yMargin = 5, xMargin = 5, isSnapshot = false) {
      this.range = range;
      this.y = y2;
      this.x = x2;
      this.yMargin = yMargin;
      this.xMargin = xMargin;
      this.isSnapshot = isSnapshot;
    }
    map(changes) {
      return changes.empty ? this : new ScrollTarget(this.range.map(changes), this.y, this.x, this.yMargin, this.xMargin, this.isSnapshot);
    }
    clip(state) {
      return this.range.to <= state.doc.length ? this : new ScrollTarget(EditorSelection.cursor(state.doc.length), this.y, this.x, this.yMargin, this.xMargin, this.isSnapshot);
    }
  }
  const scrollIntoView = /* @__PURE__ */ StateEffect.define({ map: (t2, ch) => t2.map(ch) });
  function logException(state, exception, context) {
    let handler = state.facet(exceptionSink);
    if (handler.length)
      handler[0](exception);
    else if (window.onerror)
      window.onerror(String(exception), context, void 0, void 0, exception);
    else if (context)
      console.error(context + ":", exception);
    else
      console.error(exception);
  }
  const editable = /* @__PURE__ */ Facet.define({ combine: (values) => values.length ? values[0] : true });
  let nextPluginID = 0;
  const viewPlugin = /* @__PURE__ */ Facet.define();
  class ViewPlugin {
    constructor(id, create, domEventHandlers, domEventObservers, buildExtensions) {
      this.id = id;
      this.create = create;
      this.domEventHandlers = domEventHandlers;
      this.domEventObservers = domEventObservers;
      this.extension = buildExtensions(this);
    }
    /**
    Define a plugin from a constructor function that creates the
    plugin's value, given an editor view.
    */
    static define(create, spec) {
      const { eventHandlers, eventObservers, provide, decorations: deco } = spec || {};
      return new ViewPlugin(nextPluginID++, create, eventHandlers, eventObservers, (plugin) => {
        let ext = [viewPlugin.of(plugin)];
        if (deco)
          ext.push(decorations.of((view) => {
            let pluginInst = view.plugin(plugin);
            return pluginInst ? deco(pluginInst) : Decoration.none;
          }));
        if (provide)
          ext.push(provide(plugin));
        return ext;
      });
    }
    /**
    Create a plugin for a class whose constructor takes a single
    editor view as argument.
    */
    static fromClass(cls, spec) {
      return ViewPlugin.define((view) => new cls(view), spec);
    }
  }
  class PluginInstance {
    constructor(spec) {
      this.spec = spec;
      this.mustUpdate = null;
      this.value = null;
    }
    update(view) {
      if (!this.value) {
        if (this.spec) {
          try {
            this.value = this.spec.create(view);
          } catch (e2) {
            logException(view.state, e2, "CodeMirror plugin crashed");
            this.deactivate();
          }
        }
      } else if (this.mustUpdate) {
        let update = this.mustUpdate;
        this.mustUpdate = null;
        if (this.value.update) {
          try {
            this.value.update(update);
          } catch (e2) {
            logException(update.state, e2, "CodeMirror plugin crashed");
            if (this.value.destroy)
              try {
                this.value.destroy();
              } catch (_2) {
              }
            this.deactivate();
          }
        }
      }
      return this;
    }
    destroy(view) {
      var _a3;
      if ((_a3 = this.value) === null || _a3 === void 0 ? void 0 : _a3.destroy) {
        try {
          this.value.destroy();
        } catch (e2) {
          logException(view.state, e2, "CodeMirror plugin crashed");
        }
      }
    }
    deactivate() {
      this.spec = this.value = null;
    }
  }
  const editorAttributes = /* @__PURE__ */ Facet.define();
  const contentAttributes = /* @__PURE__ */ Facet.define();
  const decorations = /* @__PURE__ */ Facet.define();
  const outerDecorations = /* @__PURE__ */ Facet.define();
  const atomicRanges = /* @__PURE__ */ Facet.define();
  const bidiIsolatedRanges = /* @__PURE__ */ Facet.define();
  function getIsolatedRanges(view, line) {
    let isolates = view.state.facet(bidiIsolatedRanges);
    if (!isolates.length)
      return isolates;
    let sets = isolates.map((i2) => i2 instanceof Function ? i2(view) : i2);
    let result = [];
    RangeSet.spans(sets, line.from, line.to, {
      point() {
      },
      span(fromDoc, toDoc, active, open) {
        let from = fromDoc - line.from, to = toDoc - line.from;
        let level = result;
        for (let i2 = active.length - 1; i2 >= 0; i2--, open--) {
          let direction = active[i2].spec.bidiIsolate, update;
          if (direction == null)
            direction = autoDirection(line.text, from, to);
          if (open > 0 && level.length && (update = level[level.length - 1]).to == from && update.direction == direction) {
            update.to = to;
            level = update.inner;
          } else {
            let add = { from, to, direction, inner: [] };
            level.push(add);
            level = add.inner;
          }
        }
      }
    });
    return result;
  }
  const scrollMargins = /* @__PURE__ */ Facet.define();
  function getScrollMargins(view) {
    let left = 0, right = 0, top2 = 0, bottom = 0;
    for (let source of view.state.facet(scrollMargins)) {
      let m2 = source(view);
      if (m2) {
        if (m2.left != null)
          left = Math.max(left, m2.left);
        if (m2.right != null)
          right = Math.max(right, m2.right);
        if (m2.top != null)
          top2 = Math.max(top2, m2.top);
        if (m2.bottom != null)
          bottom = Math.max(bottom, m2.bottom);
      }
    }
    return { left, right, top: top2, bottom };
  }
  const styleModule = /* @__PURE__ */ Facet.define();
  class ChangedRange {
    constructor(fromA, toA, fromB, toB) {
      this.fromA = fromA;
      this.toA = toA;
      this.fromB = fromB;
      this.toB = toB;
    }
    join(other) {
      return new ChangedRange(Math.min(this.fromA, other.fromA), Math.max(this.toA, other.toA), Math.min(this.fromB, other.fromB), Math.max(this.toB, other.toB));
    }
    addToSet(set) {
      let i2 = set.length, me = this;
      for (; i2 > 0; i2--) {
        let range = set[i2 - 1];
        if (range.fromA > me.toA)
          continue;
        if (range.toA < me.fromA)
          break;
        me = me.join(range);
        set.splice(i2 - 1, 1);
      }
      set.splice(i2, 0, me);
      return set;
    }
    static extendWithRanges(diff, ranges) {
      if (ranges.length == 0)
        return diff;
      let result = [];
      for (let dI = 0, rI = 0, posA = 0, posB = 0; ; dI++) {
        let next = dI == diff.length ? null : diff[dI], off = posA - posB;
        let end = next ? next.fromB : 1e9;
        while (rI < ranges.length && ranges[rI] < end) {
          let from = ranges[rI], to = ranges[rI + 1];
          let fromB = Math.max(posB, from), toB = Math.min(end, to);
          if (fromB <= toB)
            new ChangedRange(fromB + off, toB + off, fromB, toB).addToSet(result);
          if (to > end)
            break;
          else
            rI += 2;
        }
        if (!next)
          return result;
        new ChangedRange(next.fromA, next.toA, next.fromB, next.toB).addToSet(result);
        posA = next.toA;
        posB = next.toB;
      }
    }
  }
  class ViewUpdate {
    constructor(view, state, transactions) {
      this.view = view;
      this.state = state;
      this.transactions = transactions;
      this.flags = 0;
      this.startState = view.state;
      this.changes = ChangeSet.empty(this.startState.doc.length);
      for (let tr of transactions)
        this.changes = this.changes.compose(tr.changes);
      let changedRanges = [];
      this.changes.iterChangedRanges((fromA, toA, fromB, toB) => changedRanges.push(new ChangedRange(fromA, toA, fromB, toB)));
      this.changedRanges = changedRanges;
    }
    /**
    @internal
    */
    static create(view, state, transactions) {
      return new ViewUpdate(view, state, transactions);
    }
    /**
    Tells you whether the [viewport](https://codemirror.net/6/docs/ref/#view.EditorView.viewport) or
    [visible ranges](https://codemirror.net/6/docs/ref/#view.EditorView.visibleRanges) changed in this
    update.
    */
    get viewportChanged() {
      return (this.flags & 4) > 0;
    }
    /**
    Indicates whether the height of a block element in the editor
    changed in this update.
    */
    get heightChanged() {
      return (this.flags & 2) > 0;
    }
    /**
    Returns true when the document was modified or the size of the
    editor, or elements within the editor, changed.
    */
    get geometryChanged() {
      return this.docChanged || (this.flags & (8 | 2)) > 0;
    }
    /**
    True when this update indicates a focus change.
    */
    get focusChanged() {
      return (this.flags & 1) > 0;
    }
    /**
    Whether the document changed in this update.
    */
    get docChanged() {
      return !this.changes.empty;
    }
    /**
    Whether the selection was explicitly set in this update.
    */
    get selectionSet() {
      return this.transactions.some((tr) => tr.selection);
    }
    /**
    @internal
    */
    get empty() {
      return this.flags == 0 && this.transactions.length == 0;
    }
  }
  class DocView extends ContentView {
    get length() {
      return this.view.state.doc.length;
    }
    constructor(view) {
      super();
      this.view = view;
      this.decorations = [];
      this.dynamicDecorationMap = [];
      this.domChanged = null;
      this.hasComposition = null;
      this.markedForComposition = /* @__PURE__ */ new Set();
      this.minWidth = 0;
      this.minWidthFrom = 0;
      this.minWidthTo = 0;
      this.impreciseAnchor = null;
      this.impreciseHead = null;
      this.forceSelection = false;
      this.lastUpdate = Date.now();
      this.setDOM(view.contentDOM);
      this.children = [new LineView()];
      this.children[0].setParent(this);
      this.updateDeco();
      this.updateInner([new ChangedRange(0, 0, 0, view.state.doc.length)], 0, null);
    }
    // Update the document view to a given state.
    update(update) {
      var _a3;
      let changedRanges = update.changedRanges;
      if (this.minWidth > 0 && changedRanges.length) {
        if (!changedRanges.every(({ fromA, toA }) => toA < this.minWidthFrom || fromA > this.minWidthTo)) {
          this.minWidth = this.minWidthFrom = this.minWidthTo = 0;
        } else {
          this.minWidthFrom = update.changes.mapPos(this.minWidthFrom, 1);
          this.minWidthTo = update.changes.mapPos(this.minWidthTo, 1);
        }
      }
      let readCompositionAt = -1;
      if (this.view.inputState.composing >= 0) {
        if ((_a3 = this.domChanged) === null || _a3 === void 0 ? void 0 : _a3.newSel)
          readCompositionAt = this.domChanged.newSel.head;
        else if (!touchesComposition(update.changes, this.hasComposition) && !update.selectionSet)
          readCompositionAt = update.state.selection.main.head;
      }
      let composition = readCompositionAt > -1 ? findCompositionRange(this.view, update.changes, readCompositionAt) : null;
      this.domChanged = null;
      if (this.hasComposition) {
        this.markedForComposition.clear();
        let { from, to } = this.hasComposition;
        changedRanges = new ChangedRange(from, to, update.changes.mapPos(from, -1), update.changes.mapPos(to, 1)).addToSet(changedRanges.slice());
      }
      this.hasComposition = composition ? { from: composition.range.fromB, to: composition.range.toB } : null;
      if ((browser.ie || browser.chrome) && !composition && update && update.state.doc.lines != update.startState.doc.lines)
        this.forceSelection = true;
      let prevDeco = this.decorations, deco = this.updateDeco();
      let decoDiff = findChangedDeco(prevDeco, deco, update.changes);
      changedRanges = ChangedRange.extendWithRanges(changedRanges, decoDiff);
      if (!(this.flags & 7) && changedRanges.length == 0) {
        return false;
      } else {
        this.updateInner(changedRanges, update.startState.doc.length, composition);
        if (update.transactions.length)
          this.lastUpdate = Date.now();
        return true;
      }
    }
    // Used by update and the constructor do perform the actual DOM
    // update
    updateInner(changes, oldLength, composition) {
      this.view.viewState.mustMeasureContent = true;
      this.updateChildren(changes, oldLength, composition);
      let { observer } = this.view;
      observer.ignore(() => {
        this.dom.style.height = this.view.viewState.contentHeight / this.view.scaleY + "px";
        this.dom.style.flexBasis = this.minWidth ? this.minWidth + "px" : "";
        let track = browser.chrome || browser.ios ? { node: observer.selectionRange.focusNode, written: false } : void 0;
        this.sync(this.view, track);
        this.flags &= ~7;
        if (track && (track.written || observer.selectionRange.focusNode != track.node))
          this.forceSelection = true;
        this.dom.style.height = "";
      });
      this.markedForComposition.forEach(
        (cView) => cView.flags &= ~8
        /* ViewFlag.Composition */
      );
      let gaps = [];
      if (this.view.viewport.from || this.view.viewport.to < this.view.state.doc.length) {
        for (let child of this.children)
          if (child instanceof BlockWidgetView && child.widget instanceof BlockGapWidget)
            gaps.push(child.dom);
      }
      observer.updateGaps(gaps);
    }
    updateChildren(changes, oldLength, composition) {
      let ranges = composition ? composition.range.addToSet(changes.slice()) : changes;
      let cursor = this.childCursor(oldLength);
      for (let i2 = ranges.length - 1; ; i2--) {
        let next = i2 >= 0 ? ranges[i2] : null;
        if (!next)
          break;
        let { fromA, toA, fromB, toB } = next, content2, breakAtStart, openStart, openEnd;
        if (composition && composition.range.fromB < toB && composition.range.toB > fromB) {
          let before = ContentBuilder.build(this.view.state.doc, fromB, composition.range.fromB, this.decorations, this.dynamicDecorationMap);
          let after = ContentBuilder.build(this.view.state.doc, composition.range.toB, toB, this.decorations, this.dynamicDecorationMap);
          breakAtStart = before.breakAtStart;
          openStart = before.openStart;
          openEnd = after.openEnd;
          let compLine = this.compositionView(composition);
          if (after.breakAtStart) {
            compLine.breakAfter = 1;
          } else if (after.content.length && compLine.merge(compLine.length, compLine.length, after.content[0], false, after.openStart, 0)) {
            compLine.breakAfter = after.content[0].breakAfter;
            after.content.shift();
          }
          if (before.content.length && compLine.merge(0, 0, before.content[before.content.length - 1], true, 0, before.openEnd)) {
            before.content.pop();
          }
          content2 = before.content.concat(compLine).concat(after.content);
        } else {
          ({ content: content2, breakAtStart, openStart, openEnd } = ContentBuilder.build(this.view.state.doc, fromB, toB, this.decorations, this.dynamicDecorationMap));
        }
        let { i: toI, off: toOff } = cursor.findPos(toA, 1);
        let { i: fromI, off: fromOff } = cursor.findPos(fromA, -1);
        replaceRange(this, fromI, fromOff, toI, toOff, content2, breakAtStart, openStart, openEnd);
      }
      if (composition)
        this.fixCompositionDOM(composition);
    }
    compositionView(composition) {
      let cur = new TextView(composition.text.nodeValue);
      cur.flags |= 8;
      for (let { deco } of composition.marks)
        cur = new MarkView(deco, [cur], cur.length);
      let line = new LineView();
      line.append(cur, 0);
      return line;
    }
    fixCompositionDOM(composition) {
      let fix = (dom, cView2) => {
        cView2.flags |= 8 | (cView2.children.some(
          (c2) => c2.flags & 7
          /* ViewFlag.Dirty */
        ) ? 1 : 0);
        this.markedForComposition.add(cView2);
        let prev = ContentView.get(dom);
        if (prev && prev != cView2)
          prev.dom = null;
        cView2.setDOM(dom);
      };
      let pos = this.childPos(composition.range.fromB, 1);
      let cView = this.children[pos.i];
      fix(composition.line, cView);
      for (let i2 = composition.marks.length - 1; i2 >= -1; i2--) {
        pos = cView.childPos(pos.off, 1);
        cView = cView.children[pos.i];
        fix(i2 >= 0 ? composition.marks[i2].node : composition.text, cView);
      }
    }
    // Sync the DOM selection to this.state.selection
    updateSelection(mustRead = false, fromPointer = false) {
      if (mustRead || !this.view.observer.selectionRange.focusNode)
        this.view.observer.readSelectionRange();
      let activeElt = this.view.root.activeElement, focused = activeElt == this.dom;
      let selectionNotFocus = !focused && hasSelection(this.dom, this.view.observer.selectionRange) && !(activeElt && this.dom.contains(activeElt));
      if (!(focused || fromPointer || selectionNotFocus))
        return;
      let force = this.forceSelection;
      this.forceSelection = false;
      let main = this.view.state.selection.main;
      let anchor = this.moveToLine(this.domAtPos(main.anchor));
      let head = main.empty ? anchor : this.moveToLine(this.domAtPos(main.head));
      if (browser.gecko && main.empty && !this.hasComposition && betweenUneditable(anchor)) {
        let dummy = document.createTextNode("");
        this.view.observer.ignore(() => anchor.node.insertBefore(dummy, anchor.node.childNodes[anchor.offset] || null));
        anchor = head = new DOMPos(dummy, 0);
        force = true;
      }
      let domSel = this.view.observer.selectionRange;
      if (force || !domSel.focusNode || (!isEquivalentPosition(anchor.node, anchor.offset, domSel.anchorNode, domSel.anchorOffset) || !isEquivalentPosition(head.node, head.offset, domSel.focusNode, domSel.focusOffset)) && !this.suppressWidgetCursorChange(domSel, main)) {
        this.view.observer.ignore(() => {
          if (browser.android && browser.chrome && this.dom.contains(domSel.focusNode) && inUneditable(domSel.focusNode, this.dom)) {
            this.dom.blur();
            this.dom.focus({ preventScroll: true });
          }
          let rawSel = getSelection(this.view.root);
          if (!rawSel)
            ;
          else if (main.empty) {
            if (browser.gecko) {
              let nextTo = nextToUneditable(anchor.node, anchor.offset);
              if (nextTo && nextTo != (1 | 2)) {
                let text = nearbyTextNode(anchor.node, anchor.offset, nextTo == 1 ? 1 : -1);
                if (text)
                  anchor = new DOMPos(text.node, text.offset);
              }
            }
            rawSel.collapse(anchor.node, anchor.offset);
            if (main.bidiLevel != null && rawSel.caretBidiLevel !== void 0)
              rawSel.caretBidiLevel = main.bidiLevel;
          } else if (rawSel.extend) {
            rawSel.collapse(anchor.node, anchor.offset);
            try {
              rawSel.extend(head.node, head.offset);
            } catch (_2) {
            }
          } else {
            let range = document.createRange();
            if (main.anchor > main.head)
              [anchor, head] = [head, anchor];
            range.setEnd(head.node, head.offset);
            range.setStart(anchor.node, anchor.offset);
            rawSel.removeAllRanges();
            rawSel.addRange(range);
          }
          if (selectionNotFocus && this.view.root.activeElement == this.dom) {
            this.dom.blur();
            if (activeElt)
              activeElt.focus();
          }
        });
        this.view.observer.setSelectionRange(anchor, head);
      }
      this.impreciseAnchor = anchor.precise ? null : new DOMPos(domSel.anchorNode, domSel.anchorOffset);
      this.impreciseHead = head.precise ? null : new DOMPos(domSel.focusNode, domSel.focusOffset);
    }
    // If a zero-length widget is inserted next to the cursor during
    // composition, avoid moving it across it and disrupting the
    // composition.
    suppressWidgetCursorChange(sel, cursor) {
      return this.hasComposition && cursor.empty && isEquivalentPosition(sel.focusNode, sel.focusOffset, sel.anchorNode, sel.anchorOffset) && this.posFromDOM(sel.focusNode, sel.focusOffset) == cursor.head;
    }
    enforceCursorAssoc() {
      if (this.hasComposition)
        return;
      let { view } = this, cursor = view.state.selection.main;
      let sel = getSelection(view.root);
      let { anchorNode, anchorOffset } = view.observer.selectionRange;
      if (!sel || !cursor.empty || !cursor.assoc || !sel.modify)
        return;
      let line = LineView.find(this, cursor.head);
      if (!line)
        return;
      let lineStart = line.posAtStart;
      if (cursor.head == lineStart || cursor.head == lineStart + line.length)
        return;
      let before = this.coordsAt(cursor.head, -1), after = this.coordsAt(cursor.head, 1);
      if (!before || !after || before.bottom > after.top)
        return;
      let dom = this.domAtPos(cursor.head + cursor.assoc);
      sel.collapse(dom.node, dom.offset);
      sel.modify("move", cursor.assoc < 0 ? "forward" : "backward", "lineboundary");
      view.observer.readSelectionRange();
      let newRange = view.observer.selectionRange;
      if (view.docView.posFromDOM(newRange.anchorNode, newRange.anchorOffset) != cursor.from)
        sel.collapse(anchorNode, anchorOffset);
    }
    // If a position is in/near a block widget, move it to a nearby text
    // line, since we don't want the cursor inside a block widget.
    moveToLine(pos) {
      let dom = this.dom, newPos;
      if (pos.node != dom)
        return pos;
      for (let i2 = pos.offset; !newPos && i2 < dom.childNodes.length; i2++) {
        let view = ContentView.get(dom.childNodes[i2]);
        if (view instanceof LineView)
          newPos = view.domAtPos(0);
      }
      for (let i2 = pos.offset - 1; !newPos && i2 >= 0; i2--) {
        let view = ContentView.get(dom.childNodes[i2]);
        if (view instanceof LineView)
          newPos = view.domAtPos(view.length);
      }
      return newPos ? new DOMPos(newPos.node, newPos.offset, true) : pos;
    }
    nearest(dom) {
      for (let cur = dom; cur; ) {
        let domView = ContentView.get(cur);
        if (domView && domView.rootView == this)
          return domView;
        cur = cur.parentNode;
      }
      return null;
    }
    posFromDOM(node, offset) {
      let view = this.nearest(node);
      if (!view)
        throw new RangeError("Trying to find position for a DOM position outside of the document");
      return view.localPosFromDOM(node, offset) + view.posAtStart;
    }
    domAtPos(pos) {
      let { i: i2, off } = this.childCursor().findPos(pos, -1);
      for (; i2 < this.children.length - 1; ) {
        let child = this.children[i2];
        if (off < child.length || child instanceof LineView)
          break;
        i2++;
        off = 0;
      }
      return this.children[i2].domAtPos(off);
    }
    coordsAt(pos, side) {
      let best = null, bestPos = 0;
      for (let off = this.length, i2 = this.children.length - 1; i2 >= 0; i2--) {
        let child = this.children[i2], end = off - child.breakAfter, start = end - child.length;
        if (end < pos)
          break;
        if (start <= pos && (start < pos || child.covers(-1)) && (end > pos || child.covers(1)) && (!best || child instanceof LineView && !(best instanceof LineView && side >= 0))) {
          best = child;
          bestPos = start;
        }
        off = start;
      }
      return best ? best.coordsAt(pos - bestPos, side) : null;
    }
    coordsForChar(pos) {
      let { i: i2, off } = this.childPos(pos, 1), child = this.children[i2];
      if (!(child instanceof LineView))
        return null;
      while (child.children.length) {
        let { i: i3, off: childOff } = child.childPos(off, 1);
        for (; ; i3++) {
          if (i3 == child.children.length)
            return null;
          if ((child = child.children[i3]).length)
            break;
        }
        off = childOff;
      }
      if (!(child instanceof TextView))
        return null;
      let end = findClusterBreak(child.text, off);
      if (end == off)
        return null;
      let rects = textRange(child.dom, off, end).getClientRects();
      for (let i3 = 0; i3 < rects.length; i3++) {
        let rect = rects[i3];
        if (i3 == rects.length - 1 || rect.top < rect.bottom && rect.left < rect.right)
          return rect;
      }
      return null;
    }
    measureVisibleLineHeights(viewport) {
      let result = [], { from, to } = viewport;
      let contentWidth = this.view.contentDOM.clientWidth;
      let isWider = contentWidth > Math.max(this.view.scrollDOM.clientWidth, this.minWidth) + 1;
      let widest = -1, ltr = this.view.textDirection == Direction.LTR;
      for (let pos = 0, i2 = 0; i2 < this.children.length; i2++) {
        let child = this.children[i2], end = pos + child.length;
        if (end > to)
          break;
        if (pos >= from) {
          let childRect = child.dom.getBoundingClientRect();
          result.push(childRect.height);
          if (isWider) {
            let last = child.dom.lastChild;
            let rects = last ? clientRectsFor(last) : [];
            if (rects.length) {
              let rect = rects[rects.length - 1];
              let width = ltr ? rect.right - childRect.left : childRect.right - rect.left;
              if (width > widest) {
                widest = width;
                this.minWidth = contentWidth;
                this.minWidthFrom = pos;
                this.minWidthTo = end;
              }
            }
          }
        }
        pos = end + child.breakAfter;
      }
      return result;
    }
    textDirectionAt(pos) {
      let { i: i2 } = this.childPos(pos, 1);
      return getComputedStyle(this.children[i2].dom).direction == "rtl" ? Direction.RTL : Direction.LTR;
    }
    measureTextSize() {
      for (let child of this.children) {
        if (child instanceof LineView) {
          let measure = child.measureTextSize();
          if (measure)
            return measure;
        }
      }
      let dummy = document.createElement("div"), lineHeight, charWidth, textHeight;
      dummy.className = "cm-line";
      dummy.style.width = "99999px";
      dummy.style.position = "absolute";
      dummy.textContent = "abc def ghi jkl mno pqr stu";
      this.view.observer.ignore(() => {
        this.dom.appendChild(dummy);
        let rect = clientRectsFor(dummy.firstChild)[0];
        lineHeight = dummy.getBoundingClientRect().height;
        charWidth = rect ? rect.width / 27 : 7;
        textHeight = rect ? rect.height : lineHeight;
        dummy.remove();
      });
      return { lineHeight, charWidth, textHeight };
    }
    childCursor(pos = this.length) {
      let i2 = this.children.length;
      if (i2)
        pos -= this.children[--i2].length;
      return new ChildCursor(this.children, pos, i2);
    }
    computeBlockGapDeco() {
      let deco = [], vs = this.view.viewState;
      for (let pos = 0, i2 = 0; ; i2++) {
        let next = i2 == vs.viewports.length ? null : vs.viewports[i2];
        let end = next ? next.from - 1 : this.length;
        if (end > pos) {
          let height = (vs.lineBlockAt(end).bottom - vs.lineBlockAt(pos).top) / this.view.scaleY;
          deco.push(Decoration.replace({
            widget: new BlockGapWidget(height),
            block: true,
            inclusive: true,
            isBlockGap: true
          }).range(pos, end));
        }
        if (!next)
          break;
        pos = next.to + 1;
      }
      return Decoration.set(deco);
    }
    updateDeco() {
      let allDeco = this.view.state.facet(decorations).map((d2, i2) => {
        let dynamic = this.dynamicDecorationMap[i2] = typeof d2 == "function";
        return dynamic ? d2(this.view) : d2;
      });
      let dynamicOuter = false, outerDeco = this.view.state.facet(outerDecorations).map((d2, i2) => {
        let dynamic = typeof d2 == "function";
        if (dynamic)
          dynamicOuter = true;
        return dynamic ? d2(this.view) : d2;
      });
      if (outerDeco.length) {
        this.dynamicDecorationMap[allDeco.length] = dynamicOuter;
        allDeco.push(RangeSet.join(outerDeco));
      }
      for (let i2 = allDeco.length; i2 < allDeco.length + 3; i2++)
        this.dynamicDecorationMap[i2] = false;
      return this.decorations = [
        ...allDeco,
        this.computeBlockGapDeco(),
        this.view.viewState.lineGapDeco
      ];
    }
    scrollIntoView(target) {
      if (target.isSnapshot) {
        let ref = this.view.viewState.lineBlockAt(target.range.head);
        this.view.scrollDOM.scrollTop = ref.top - target.yMargin;
        this.view.scrollDOM.scrollLeft = target.xMargin;
        return;
      }
      let { range } = target;
      let rect = this.coordsAt(range.head, range.empty ? range.assoc : range.head > range.anchor ? -1 : 1), other;
      if (!rect)
        return;
      if (!range.empty && (other = this.coordsAt(range.anchor, range.anchor > range.head ? -1 : 1)))
        rect = {
          left: Math.min(rect.left, other.left),
          top: Math.min(rect.top, other.top),
          right: Math.max(rect.right, other.right),
          bottom: Math.max(rect.bottom, other.bottom)
        };
      let margins = getScrollMargins(this.view);
      let targetRect = {
        left: rect.left - margins.left,
        top: rect.top - margins.top,
        right: rect.right + margins.right,
        bottom: rect.bottom + margins.bottom
      };
      let { offsetWidth, offsetHeight } = this.view.scrollDOM;
      scrollRectIntoView(this.view.scrollDOM, targetRect, range.head < range.anchor ? -1 : 1, target.x, target.y, Math.max(Math.min(target.xMargin, offsetWidth), -offsetWidth), Math.max(Math.min(target.yMargin, offsetHeight), -offsetHeight), this.view.textDirection == Direction.LTR);
    }
  }
  function betweenUneditable(pos) {
    return pos.node.nodeType == 1 && pos.node.firstChild && (pos.offset == 0 || pos.node.childNodes[pos.offset - 1].contentEditable == "false") && (pos.offset == pos.node.childNodes.length || pos.node.childNodes[pos.offset].contentEditable == "false");
  }
  class BlockGapWidget extends WidgetType {
    constructor(height) {
      super();
      this.height = height;
    }
    toDOM() {
      let elt = document.createElement("div");
      elt.className = "cm-gap";
      this.updateDOM(elt);
      return elt;
    }
    eq(other) {
      return other.height == this.height;
    }
    updateDOM(elt) {
      elt.style.height = this.height + "px";
      return true;
    }
    get editable() {
      return true;
    }
    get estimatedHeight() {
      return this.height;
    }
  }
  function findCompositionNode(view, headPos) {
    let sel = view.observer.selectionRange;
    let textNode = sel.focusNode && nearbyTextNode(sel.focusNode, sel.focusOffset, 0);
    if (!textNode)
      return null;
    let from = headPos - textNode.offset;
    return { from, to: from + textNode.node.nodeValue.length, node: textNode.node };
  }
  function findCompositionRange(view, changes, headPos) {
    let found = findCompositionNode(view, headPos);
    if (!found)
      return null;
    let { node: textNode, from, to } = found, text = textNode.nodeValue;
    if (/[\n\r]/.test(text))
      return null;
    if (view.state.doc.sliceString(found.from, found.to) != text)
      return null;
    let inv = changes.invertedDesc;
    let range = new ChangedRange(inv.mapPos(from), inv.mapPos(to), from, to);
    let marks = [];
    for (let parent = textNode.parentNode; ; parent = parent.parentNode) {
      let parentView = ContentView.get(parent);
      if (parentView instanceof MarkView)
        marks.push({ node: parent, deco: parentView.mark });
      else if (parentView instanceof LineView || parent.nodeName == "DIV" && parent.parentNode == view.contentDOM)
        return { range, text: textNode, marks, line: parent };
      else if (parent != view.contentDOM)
        marks.push({ node: parent, deco: new MarkDecoration({
          inclusive: true,
          attributes: getAttrs(parent),
          tagName: parent.tagName.toLowerCase()
        }) });
      else
        return null;
    }
  }
  function nearbyTextNode(startNode, startOffset, side) {
    if (side <= 0)
      for (let node = startNode, offset = startOffset; ; ) {
        if (node.nodeType == 3)
          return { node, offset };
        if (node.nodeType == 1 && offset > 0) {
          node = node.childNodes[offset - 1];
          offset = maxOffset(node);
        } else {
          break;
        }
      }
    if (side >= 0)
      for (let node = startNode, offset = startOffset; ; ) {
        if (node.nodeType == 3)
          return { node, offset };
        if (node.nodeType == 1 && offset < node.childNodes.length && side >= 0) {
          node = node.childNodes[offset];
          offset = 0;
        } else {
          break;
        }
      }
    return null;
  }
  function nextToUneditable(node, offset) {
    if (node.nodeType != 1)
      return 0;
    return (offset && node.childNodes[offset - 1].contentEditable == "false" ? 1 : 0) | (offset < node.childNodes.length && node.childNodes[offset].contentEditable == "false" ? 2 : 0);
  }
  let DecorationComparator$1 = class DecorationComparator {
    constructor() {
      this.changes = [];
    }
    compareRange(from, to) {
      addRange(from, to, this.changes);
    }
    comparePoint(from, to) {
      addRange(from, to, this.changes);
    }
  };
  function findChangedDeco(a2, b2, diff) {
    let comp = new DecorationComparator$1();
    RangeSet.compare(a2, b2, diff, comp);
    return comp.changes;
  }
  function inUneditable(node, inside2) {
    for (let cur = node; cur && cur != inside2; cur = cur.assignedSlot || cur.parentNode) {
      if (cur.nodeType == 1 && cur.contentEditable == "false") {
        return true;
      }
    }
    return false;
  }
  function touchesComposition(changes, composition) {
    let touched = false;
    if (composition)
      changes.iterChangedRanges((from, to) => {
        if (from < composition.to && to > composition.from)
          touched = true;
      });
    return touched;
  }
  function groupAt(state, pos, bias = 1) {
    let categorize = state.charCategorizer(pos);
    let line = state.doc.lineAt(pos), linePos = pos - line.from;
    if (line.length == 0)
      return EditorSelection.cursor(pos);
    if (linePos == 0)
      bias = 1;
    else if (linePos == line.length)
      bias = -1;
    let from = linePos, to = linePos;
    if (bias < 0)
      from = findClusterBreak(line.text, linePos, false);
    else
      to = findClusterBreak(line.text, linePos);
    let cat = categorize(line.text.slice(from, to));
    while (from > 0) {
      let prev = findClusterBreak(line.text, from, false);
      if (categorize(line.text.slice(prev, from)) != cat)
        break;
      from = prev;
    }
    while (to < line.length) {
      let next = findClusterBreak(line.text, to);
      if (categorize(line.text.slice(to, next)) != cat)
        break;
      to = next;
    }
    return EditorSelection.range(from + line.from, to + line.from);
  }
  function getdx(x2, rect) {
    return rect.left > x2 ? rect.left - x2 : Math.max(0, x2 - rect.right);
  }
  function getdy(y2, rect) {
    return rect.top > y2 ? rect.top - y2 : Math.max(0, y2 - rect.bottom);
  }
  function yOverlap(a2, b2) {
    return a2.top < b2.bottom - 1 && a2.bottom > b2.top + 1;
  }
  function upTop(rect, top2) {
    return top2 < rect.top ? { top: top2, left: rect.left, right: rect.right, bottom: rect.bottom } : rect;
  }
  function upBot(rect, bottom) {
    return bottom > rect.bottom ? { top: rect.top, left: rect.left, right: rect.right, bottom } : rect;
  }
  function domPosAtCoords(parent, x2, y2) {
    let closest, closestRect, closestX, closestY, closestOverlap = false;
    let above, below, aboveRect, belowRect;
    for (let child = parent.firstChild; child; child = child.nextSibling) {
      let rects = clientRectsFor(child);
      for (let i2 = 0; i2 < rects.length; i2++) {
        let rect = rects[i2];
        if (closestRect && yOverlap(closestRect, rect))
          rect = upTop(upBot(rect, closestRect.bottom), closestRect.top);
        let dx = getdx(x2, rect), dy = getdy(y2, rect);
        if (dx == 0 && dy == 0)
          return child.nodeType == 3 ? domPosInText(child, x2, y2) : domPosAtCoords(child, x2, y2);
        if (!closest || closestY > dy || closestY == dy && closestX > dx) {
          closest = child;
          closestRect = rect;
          closestX = dx;
          closestY = dy;
          let side = dy ? y2 < rect.top ? -1 : 1 : dx ? x2 < rect.left ? -1 : 1 : 0;
          closestOverlap = !side || (side > 0 ? i2 < rects.length - 1 : i2 > 0);
        }
        if (dx == 0) {
          if (y2 > rect.bottom && (!aboveRect || aboveRect.bottom < rect.bottom)) {
            above = child;
            aboveRect = rect;
          } else if (y2 < rect.top && (!belowRect || belowRect.top > rect.top)) {
            below = child;
            belowRect = rect;
          }
        } else if (aboveRect && yOverlap(aboveRect, rect)) {
          aboveRect = upBot(aboveRect, rect.bottom);
        } else if (belowRect && yOverlap(belowRect, rect)) {
          belowRect = upTop(belowRect, rect.top);
        }
      }
    }
    if (aboveRect && aboveRect.bottom >= y2) {
      closest = above;
      closestRect = aboveRect;
    } else if (belowRect && belowRect.top <= y2) {
      closest = below;
      closestRect = belowRect;
    }
    if (!closest)
      return { node: parent, offset: 0 };
    let clipX = Math.max(closestRect.left, Math.min(closestRect.right, x2));
    if (closest.nodeType == 3)
      return domPosInText(closest, clipX, y2);
    if (closestOverlap && closest.contentEditable != "false")
      return domPosAtCoords(closest, clipX, y2);
    let offset = Array.prototype.indexOf.call(parent.childNodes, closest) + (x2 >= (closestRect.left + closestRect.right) / 2 ? 1 : 0);
    return { node: parent, offset };
  }
  function domPosInText(node, x2, y2) {
    let len = node.nodeValue.length;
    let closestOffset = -1, closestDY = 1e9, generalSide = 0;
    for (let i2 = 0; i2 < len; i2++) {
      let rects = textRange(node, i2, i2 + 1).getClientRects();
      for (let j2 = 0; j2 < rects.length; j2++) {
        let rect = rects[j2];
        if (rect.top == rect.bottom)
          continue;
        if (!generalSide)
          generalSide = x2 - rect.left;
        let dy = (rect.top > y2 ? rect.top - y2 : y2 - rect.bottom) - 1;
        if (rect.left - 1 <= x2 && rect.right + 1 >= x2 && dy < closestDY) {
          let right = x2 >= (rect.left + rect.right) / 2, after = right;
          if (browser.chrome || browser.gecko) {
            let rectBefore = textRange(node, i2).getBoundingClientRect();
            if (rectBefore.left == rect.right)
              after = !right;
          }
          if (dy <= 0)
            return { node, offset: i2 + (after ? 1 : 0) };
          closestOffset = i2 + (after ? 1 : 0);
          closestDY = dy;
        }
      }
    }
    return { node, offset: closestOffset > -1 ? closestOffset : generalSide > 0 ? node.nodeValue.length : 0 };
  }
  function posAtCoords(view, coords, precise, bias = -1) {
    var _a3, _b2;
    let content2 = view.contentDOM.getBoundingClientRect(), docTop = content2.top + view.viewState.paddingTop;
    let block, { docHeight } = view.viewState;
    let { x: x2, y: y2 } = coords, yOffset = y2 - docTop;
    if (yOffset < 0)
      return 0;
    if (yOffset > docHeight)
      return view.state.doc.length;
    for (let halfLine = view.viewState.heightOracle.textHeight / 2, bounced = false; ; ) {
      block = view.elementAtHeight(yOffset);
      if (block.type == BlockType.Text)
        break;
      for (; ; ) {
        yOffset = bias > 0 ? block.bottom + halfLine : block.top - halfLine;
        if (yOffset >= 0 && yOffset <= docHeight)
          break;
        if (bounced)
          return precise ? null : 0;
        bounced = true;
        bias = -bias;
      }
    }
    y2 = docTop + yOffset;
    let lineStart = block.from;
    if (lineStart < view.viewport.from)
      return view.viewport.from == 0 ? 0 : precise ? null : posAtCoordsImprecise(view, content2, block, x2, y2);
    if (lineStart > view.viewport.to)
      return view.viewport.to == view.state.doc.length ? view.state.doc.length : precise ? null : posAtCoordsImprecise(view, content2, block, x2, y2);
    let doc2 = view.dom.ownerDocument;
    let root = view.root.elementFromPoint ? view.root : doc2;
    let element = root.elementFromPoint(x2, y2);
    if (element && !view.contentDOM.contains(element))
      element = null;
    if (!element) {
      x2 = Math.max(content2.left + 1, Math.min(content2.right - 1, x2));
      element = root.elementFromPoint(x2, y2);
      if (element && !view.contentDOM.contains(element))
        element = null;
    }
    let node, offset = -1;
    if (element && ((_a3 = view.docView.nearest(element)) === null || _a3 === void 0 ? void 0 : _a3.isEditable) != false) {
      if (doc2.caretPositionFromPoint) {
        let pos = doc2.caretPositionFromPoint(x2, y2);
        if (pos)
          ({ offsetNode: node, offset } = pos);
      } else if (doc2.caretRangeFromPoint) {
        let range = doc2.caretRangeFromPoint(x2, y2);
        if (range) {
          ({ startContainer: node, startOffset: offset } = range);
          if (!view.contentDOM.contains(node) || browser.safari && isSuspiciousSafariCaretResult(node, offset, x2) || browser.chrome && isSuspiciousChromeCaretResult(node, offset, x2))
            node = void 0;
        }
      }
    }
    if (!node || !view.docView.dom.contains(node)) {
      let line = LineView.find(view.docView, lineStart);
      if (!line)
        return yOffset > block.top + block.height / 2 ? block.to : block.from;
      ({ node, offset } = domPosAtCoords(line.dom, x2, y2));
    }
    let nearest = view.docView.nearest(node);
    if (!nearest)
      return null;
    if (nearest.isWidget && ((_b2 = nearest.dom) === null || _b2 === void 0 ? void 0 : _b2.nodeType) == 1) {
      let rect = nearest.dom.getBoundingClientRect();
      return coords.y < rect.top || coords.y <= rect.bottom && coords.x <= (rect.left + rect.right) / 2 ? nearest.posAtStart : nearest.posAtEnd;
    } else {
      return nearest.localPosFromDOM(node, offset) + nearest.posAtStart;
    }
  }
  function posAtCoordsImprecise(view, contentRect, block, x2, y2) {
    let into = Math.round((x2 - contentRect.left) * view.defaultCharacterWidth);
    if (view.lineWrapping && block.height > view.defaultLineHeight * 1.5) {
      let textHeight = view.viewState.heightOracle.textHeight;
      let line = Math.floor((y2 - block.top - (view.defaultLineHeight - textHeight) * 0.5) / textHeight);
      into += line * view.viewState.heightOracle.lineLength;
    }
    let content2 = view.state.sliceDoc(block.from, block.to);
    return block.from + findColumn(content2, into, view.state.tabSize);
  }
  function isSuspiciousSafariCaretResult(node, offset, x2) {
    let len;
    if (node.nodeType != 3 || offset != (len = node.nodeValue.length))
      return false;
    for (let next = node.nextSibling; next; next = next.nextSibling)
      if (next.nodeType != 1 || next.nodeName != "BR")
        return false;
    return textRange(node, len - 1, len).getBoundingClientRect().left > x2;
  }
  function isSuspiciousChromeCaretResult(node, offset, x2) {
    if (offset != 0)
      return false;
    for (let cur = node; ; ) {
      let parent = cur.parentNode;
      if (!parent || parent.nodeType != 1 || parent.firstChild != cur)
        return false;
      if (parent.classList.contains("cm-line"))
        break;
      cur = parent;
    }
    let rect = node.nodeType == 1 ? node.getBoundingClientRect() : textRange(node, 0, Math.max(node.nodeValue.length, 1)).getBoundingClientRect();
    return x2 - rect.left > 5;
  }
  function blockAt(view, pos) {
    let line = view.lineBlockAt(pos);
    if (Array.isArray(line.type))
      for (let l2 of line.type) {
        if (l2.to > pos || l2.to == pos && (l2.to == line.to || l2.type == BlockType.Text))
          return l2;
      }
    return line;
  }
  function moveToLineBoundary(view, start, forward, includeWrap) {
    let line = blockAt(view, start.head);
    let coords = !includeWrap || line.type != BlockType.Text || !(view.lineWrapping || line.widgetLineBreaks) ? null : view.coordsAtPos(start.assoc < 0 && start.head > line.from ? start.head - 1 : start.head);
    if (coords) {
      let editorRect = view.dom.getBoundingClientRect();
      let direction = view.textDirectionAt(line.from);
      let pos = view.posAtCoords({
        x: forward == (direction == Direction.LTR) ? editorRect.right - 1 : editorRect.left + 1,
        y: (coords.top + coords.bottom) / 2
      });
      if (pos != null)
        return EditorSelection.cursor(pos, forward ? -1 : 1);
    }
    return EditorSelection.cursor(forward ? line.to : line.from, forward ? -1 : 1);
  }
  function moveByChar(view, start, forward, by) {
    let line = view.state.doc.lineAt(start.head), spans = view.bidiSpans(line);
    let direction = view.textDirectionAt(line.from);
    for (let cur = start, check = null; ; ) {
      let next = moveVisually(line, spans, direction, cur, forward), char = movedOver;
      if (!next) {
        if (line.number == (forward ? view.state.doc.lines : 1))
          return cur;
        char = "\n";
        line = view.state.doc.line(line.number + (forward ? 1 : -1));
        spans = view.bidiSpans(line);
        next = view.visualLineSide(line, !forward);
      }
      if (!check) {
        if (!by)
          return next;
        check = by(char);
      } else if (!check(char)) {
        return cur;
      }
      cur = next;
    }
  }
  function byGroup(view, pos, start) {
    let categorize = view.state.charCategorizer(pos);
    let cat = categorize(start);
    return (next) => {
      let nextCat = categorize(next);
      if (cat == CharCategory.Space)
        cat = nextCat;
      return cat == nextCat;
    };
  }
  function moveVertically(view, start, forward, distance) {
    let startPos = start.head, dir = forward ? 1 : -1;
    if (startPos == (forward ? view.state.doc.length : 0))
      return EditorSelection.cursor(startPos, start.assoc);
    let goal = start.goalColumn, startY;
    let rect = view.contentDOM.getBoundingClientRect();
    let startCoords = view.coordsAtPos(startPos, start.assoc || -1), docTop = view.documentTop;
    if (startCoords) {
      if (goal == null)
        goal = startCoords.left - rect.left;
      startY = dir < 0 ? startCoords.top : startCoords.bottom;
    } else {
      let line = view.viewState.lineBlockAt(startPos);
      if (goal == null)
        goal = Math.min(rect.right - rect.left, view.defaultCharacterWidth * (startPos - line.from));
      startY = (dir < 0 ? line.top : line.bottom) + docTop;
    }
    let resolvedGoal = rect.left + goal;
    let dist2 = distance !== null && distance !== void 0 ? distance : view.viewState.heightOracle.textHeight >> 1;
    for (let extra = 0; ; extra += 10) {
      let curY = startY + (dist2 + extra) * dir;
      let pos = posAtCoords(view, { x: resolvedGoal, y: curY }, false, dir);
      if (curY < rect.top || curY > rect.bottom || (dir < 0 ? pos < startPos : pos > startPos)) {
        let charRect = view.docView.coordsForChar(pos);
        let assoc = !charRect || curY < charRect.top ? -1 : 1;
        return EditorSelection.cursor(pos, assoc, void 0, goal);
      }
    }
  }
  function skipAtomicRanges(atoms, pos, bias) {
    for (; ; ) {
      let moved = 0;
      for (let set of atoms) {
        set.between(pos - 1, pos + 1, (from, to, value) => {
          if (pos > from && pos < to) {
            let side = moved || bias || (pos - from < to - pos ? -1 : 1);
            pos = side < 0 ? from : to;
            moved = side;
          }
        });
      }
      if (!moved)
        return pos;
    }
  }
  function skipAtoms(view, oldPos, pos) {
    let newPos = skipAtomicRanges(view.state.facet(atomicRanges).map((f2) => f2(view)), pos.from, oldPos.head > pos.from ? -1 : 1);
    return newPos == pos.from ? pos : EditorSelection.cursor(newPos, newPos < pos.from ? 1 : -1);
  }
  class InputState {
    setSelectionOrigin(origin) {
      this.lastSelectionOrigin = origin;
      this.lastSelectionTime = Date.now();
    }
    constructor(view) {
      this.view = view;
      this.lastKeyCode = 0;
      this.lastKeyTime = 0;
      this.lastTouchTime = 0;
      this.lastFocusTime = 0;
      this.lastScrollTop = 0;
      this.lastScrollLeft = 0;
      this.pendingIOSKey = void 0;
      this.lastSelectionOrigin = null;
      this.lastSelectionTime = 0;
      this.lastEscPress = 0;
      this.lastContextMenu = 0;
      this.scrollHandlers = [];
      this.handlers = /* @__PURE__ */ Object.create(null);
      this.composing = -1;
      this.compositionFirstChange = null;
      this.compositionEndedAt = 0;
      this.compositionPendingKey = false;
      this.compositionPendingChange = false;
      this.mouseSelection = null;
      this.draggedContent = null;
      this.handleEvent = this.handleEvent.bind(this);
      this.notifiedFocused = view.hasFocus;
      if (browser.safari)
        view.contentDOM.addEventListener("input", () => null);
      if (browser.gecko)
        firefoxCopyCutHack(view.contentDOM.ownerDocument);
    }
    handleEvent(event) {
      if (!eventBelongsToEditor(this.view, event) || this.ignoreDuringComposition(event))
        return;
      if (event.type == "keydown" && this.keydown(event))
        return;
      this.runHandlers(event.type, event);
    }
    runHandlers(type, event) {
      let handlers2 = this.handlers[type];
      if (handlers2) {
        for (let observer of handlers2.observers)
          observer(this.view, event);
        for (let handler of handlers2.handlers) {
          if (event.defaultPrevented)
            break;
          if (handler(this.view, event)) {
            event.preventDefault();
            break;
          }
        }
      }
    }
    ensureHandlers(plugins) {
      let handlers2 = computeHandlers(plugins), prev = this.handlers, dom = this.view.contentDOM;
      for (let type in handlers2)
        if (type != "scroll") {
          let passive = !handlers2[type].handlers.length;
          let exists = prev[type];
          if (exists && passive != !exists.handlers.length) {
            dom.removeEventListener(type, this.handleEvent);
            exists = null;
          }
          if (!exists)
            dom.addEventListener(type, this.handleEvent, { passive });
        }
      for (let type in prev)
        if (type != "scroll" && !handlers2[type])
          dom.removeEventListener(type, this.handleEvent);
      this.handlers = handlers2;
    }
    keydown(event) {
      this.lastKeyCode = event.keyCode;
      this.lastKeyTime = Date.now();
      if (event.keyCode == 9 && Date.now() < this.lastEscPress + 2e3)
        return true;
      if (event.keyCode != 27 && modifierCodes.indexOf(event.keyCode) < 0)
        this.view.inputState.lastEscPress = 0;
      if (browser.android && browser.chrome && !event.synthetic && (event.keyCode == 13 || event.keyCode == 8)) {
        this.view.observer.delayAndroidKey(event.key, event.keyCode);
        return true;
      }
      let pending;
      if (browser.ios && !event.synthetic && !event.altKey && !event.metaKey && ((pending = PendingKeys.find((key) => key.keyCode == event.keyCode)) && !event.ctrlKey || EmacsyPendingKeys.indexOf(event.key) > -1 && event.ctrlKey && !event.shiftKey)) {
        this.pendingIOSKey = pending || event;
        setTimeout(() => this.flushIOSKey(), 250);
        return true;
      }
      if (event.keyCode != 229)
        this.view.observer.forceFlush();
      return false;
    }
    flushIOSKey() {
      let key = this.pendingIOSKey;
      if (!key)
        return false;
      this.pendingIOSKey = void 0;
      return dispatchKey(this.view.contentDOM, key.key, key.keyCode);
    }
    ignoreDuringComposition(event) {
      if (!/^key/.test(event.type))
        return false;
      if (this.composing > 0)
        return true;
      if (browser.safari && !browser.ios && this.compositionPendingKey && Date.now() - this.compositionEndedAt < 100) {
        this.compositionPendingKey = false;
        return true;
      }
      return false;
    }
    startMouseSelection(mouseSelection) {
      if (this.mouseSelection)
        this.mouseSelection.destroy();
      this.mouseSelection = mouseSelection;
    }
    update(update) {
      if (this.mouseSelection)
        this.mouseSelection.update(update);
      if (this.draggedContent && update.docChanged)
        this.draggedContent = this.draggedContent.map(update.changes);
      if (update.transactions.length)
        this.lastKeyCode = this.lastSelectionTime = 0;
    }
    destroy() {
      if (this.mouseSelection)
        this.mouseSelection.destroy();
    }
  }
  function bindHandler(plugin, handler) {
    return (view, event) => {
      try {
        return handler.call(plugin, event, view);
      } catch (e2) {
        logException(view.state, e2);
      }
    };
  }
  function computeHandlers(plugins) {
    let result = /* @__PURE__ */ Object.create(null);
    function record(type) {
      return result[type] || (result[type] = { observers: [], handlers: [] });
    }
    for (let plugin of plugins) {
      let spec = plugin.spec;
      if (spec && spec.domEventHandlers)
        for (let type in spec.domEventHandlers) {
          let f2 = spec.domEventHandlers[type];
          if (f2)
            record(type).handlers.push(bindHandler(plugin.value, f2));
        }
      if (spec && spec.domEventObservers)
        for (let type in spec.domEventObservers) {
          let f2 = spec.domEventObservers[type];
          if (f2)
            record(type).observers.push(bindHandler(plugin.value, f2));
        }
    }
    for (let type in handlers)
      record(type).handlers.push(handlers[type]);
    for (let type in observers)
      record(type).observers.push(observers[type]);
    return result;
  }
  const PendingKeys = [
    { key: "Backspace", keyCode: 8, inputType: "deleteContentBackward" },
    { key: "Enter", keyCode: 13, inputType: "insertParagraph" },
    { key: "Enter", keyCode: 13, inputType: "insertLineBreak" },
    { key: "Delete", keyCode: 46, inputType: "deleteContentForward" }
  ];
  const EmacsyPendingKeys = "dthko";
  const modifierCodes = [16, 17, 18, 20, 91, 92, 224, 225];
  const dragScrollMargin = 6;
  function dragScrollSpeed(dist2) {
    return Math.max(0, dist2) * 0.7 + 8;
  }
  function dist(a2, b2) {
    return Math.max(Math.abs(a2.clientX - b2.clientX), Math.abs(a2.clientY - b2.clientY));
  }
  class MouseSelection {
    constructor(view, startEvent, style, mustSelect) {
      this.view = view;
      this.startEvent = startEvent;
      this.style = style;
      this.mustSelect = mustSelect;
      this.scrollSpeed = { x: 0, y: 0 };
      this.scrolling = -1;
      this.lastEvent = startEvent;
      this.scrollParent = scrollableParent(view.contentDOM);
      this.atoms = view.state.facet(atomicRanges).map((f2) => f2(view));
      let doc2 = view.contentDOM.ownerDocument;
      doc2.addEventListener("mousemove", this.move = this.move.bind(this));
      doc2.addEventListener("mouseup", this.up = this.up.bind(this));
      this.extend = startEvent.shiftKey;
      this.multiple = view.state.facet(EditorState.allowMultipleSelections) && addsSelectionRange(view, startEvent);
      this.dragging = isInPrimarySelection(view, startEvent) && getClickType(startEvent) == 1 ? null : false;
    }
    start(event) {
      if (this.dragging === false)
        this.select(event);
    }
    move(event) {
      var _a3;
      if (event.buttons == 0)
        return this.destroy();
      if (this.dragging || this.dragging == null && dist(this.startEvent, event) < 10)
        return;
      this.select(this.lastEvent = event);
      let sx = 0, sy = 0;
      let rect = ((_a3 = this.scrollParent) === null || _a3 === void 0 ? void 0 : _a3.getBoundingClientRect()) || { left: 0, top: 0, right: this.view.win.innerWidth, bottom: this.view.win.innerHeight };
      let margins = getScrollMargins(this.view);
      if (event.clientX - margins.left <= rect.left + dragScrollMargin)
        sx = -dragScrollSpeed(rect.left - event.clientX);
      else if (event.clientX + margins.right >= rect.right - dragScrollMargin)
        sx = dragScrollSpeed(event.clientX - rect.right);
      if (event.clientY - margins.top <= rect.top + dragScrollMargin)
        sy = -dragScrollSpeed(rect.top - event.clientY);
      else if (event.clientY + margins.bottom >= rect.bottom - dragScrollMargin)
        sy = dragScrollSpeed(event.clientY - rect.bottom);
      this.setScrollSpeed(sx, sy);
    }
    up(event) {
      if (this.dragging == null)
        this.select(this.lastEvent);
      if (!this.dragging)
        event.preventDefault();
      this.destroy();
    }
    destroy() {
      this.setScrollSpeed(0, 0);
      let doc2 = this.view.contentDOM.ownerDocument;
      doc2.removeEventListener("mousemove", this.move);
      doc2.removeEventListener("mouseup", this.up);
      this.view.inputState.mouseSelection = this.view.inputState.draggedContent = null;
    }
    setScrollSpeed(sx, sy) {
      this.scrollSpeed = { x: sx, y: sy };
      if (sx || sy) {
        if (this.scrolling < 0)
          this.scrolling = setInterval(() => this.scroll(), 50);
      } else if (this.scrolling > -1) {
        clearInterval(this.scrolling);
        this.scrolling = -1;
      }
    }
    scroll() {
      if (this.scrollParent) {
        this.scrollParent.scrollLeft += this.scrollSpeed.x;
        this.scrollParent.scrollTop += this.scrollSpeed.y;
      } else {
        this.view.win.scrollBy(this.scrollSpeed.x, this.scrollSpeed.y);
      }
      if (this.dragging === false)
        this.select(this.lastEvent);
    }
    skipAtoms(sel) {
      let ranges = null;
      for (let i2 = 0; i2 < sel.ranges.length; i2++) {
        let range = sel.ranges[i2], updated = null;
        if (range.empty) {
          let pos = skipAtomicRanges(this.atoms, range.from, 0);
          if (pos != range.from)
            updated = EditorSelection.cursor(pos, -1);
        } else {
          let from = skipAtomicRanges(this.atoms, range.from, -1);
          let to = skipAtomicRanges(this.atoms, range.to, 1);
          if (from != range.from || to != range.to)
            updated = EditorSelection.range(range.from == range.anchor ? from : to, range.from == range.head ? from : to);
        }
        if (updated) {
          if (!ranges)
            ranges = sel.ranges.slice();
          ranges[i2] = updated;
        }
      }
      return ranges ? EditorSelection.create(ranges, sel.mainIndex) : sel;
    }
    select(event) {
      let { view } = this, selection = this.skipAtoms(this.style.get(event, this.extend, this.multiple));
      if (this.mustSelect || !selection.eq(view.state.selection, this.dragging === false))
        this.view.dispatch({
          selection,
          userEvent: "select.pointer"
        });
      this.mustSelect = false;
    }
    update(update) {
      if (this.style.update(update))
        setTimeout(() => this.select(this.lastEvent), 20);
    }
  }
  function addsSelectionRange(view, event) {
    let facet = view.state.facet(clickAddsSelectionRange);
    return facet.length ? facet[0](event) : browser.mac ? event.metaKey : event.ctrlKey;
  }
  function dragMovesSelection(view, event) {
    let facet = view.state.facet(dragMovesSelection$1);
    return facet.length ? facet[0](event) : browser.mac ? !event.altKey : !event.ctrlKey;
  }
  function isInPrimarySelection(view, event) {
    let { main } = view.state.selection;
    if (main.empty)
      return false;
    let sel = getSelection(view.root);
    if (!sel || sel.rangeCount == 0)
      return true;
    let rects = sel.getRangeAt(0).getClientRects();
    for (let i2 = 0; i2 < rects.length; i2++) {
      let rect = rects[i2];
      if (rect.left <= event.clientX && rect.right >= event.clientX && rect.top <= event.clientY && rect.bottom >= event.clientY)
        return true;
    }
    return false;
  }
  function eventBelongsToEditor(view, event) {
    if (!event.bubbles)
      return true;
    if (event.defaultPrevented)
      return false;
    for (let node = event.target, cView; node != view.contentDOM; node = node.parentNode)
      if (!node || node.nodeType == 11 || (cView = ContentView.get(node)) && cView.ignoreEvent(event))
        return false;
    return true;
  }
  const handlers = /* @__PURE__ */ Object.create(null);
  const observers = /* @__PURE__ */ Object.create(null);
  const brokenClipboardAPI = browser.ie && browser.ie_version < 15 || browser.ios && browser.webkit_version < 604;
  function capturePaste(view) {
    let parent = view.dom.parentNode;
    if (!parent)
      return;
    let target = parent.appendChild(document.createElement("textarea"));
    target.style.cssText = "position: fixed; left: -10000px; top: 10px";
    target.focus();
    setTimeout(() => {
      view.focus();
      target.remove();
      doPaste(view, target.value);
    }, 50);
  }
  function doPaste(view, input) {
    let { state } = view, changes, i2 = 1, text = state.toText(input);
    let byLine = text.lines == state.selection.ranges.length;
    let linewise = lastLinewiseCopy != null && state.selection.ranges.every((r2) => r2.empty) && lastLinewiseCopy == text.toString();
    if (linewise) {
      let lastLine = -1;
      changes = state.changeByRange((range) => {
        let line = state.doc.lineAt(range.from);
        if (line.from == lastLine)
          return { range };
        lastLine = line.from;
        let insert2 = state.toText((byLine ? text.line(i2++).text : input) + state.lineBreak);
        return {
          changes: { from: line.from, insert: insert2 },
          range: EditorSelection.cursor(range.from + insert2.length)
        };
      });
    } else if (byLine) {
      changes = state.changeByRange((range) => {
        let line = text.line(i2++);
        return {
          changes: { from: range.from, to: range.to, insert: line.text },
          range: EditorSelection.cursor(range.from + line.length)
        };
      });
    } else {
      changes = state.replaceSelection(text);
    }
    view.dispatch(changes, {
      userEvent: "input.paste",
      scrollIntoView: true
    });
  }
  observers.scroll = (view) => {
    view.inputState.lastScrollTop = view.scrollDOM.scrollTop;
    view.inputState.lastScrollLeft = view.scrollDOM.scrollLeft;
  };
  handlers.keydown = (view, event) => {
    view.inputState.setSelectionOrigin("select");
    if (event.keyCode == 27)
      view.inputState.lastEscPress = Date.now();
    return false;
  };
  observers.touchstart = (view, e2) => {
    view.inputState.lastTouchTime = Date.now();
    view.inputState.setSelectionOrigin("select.pointer");
  };
  observers.touchmove = (view) => {
    view.inputState.setSelectionOrigin("select.pointer");
  };
  handlers.mousedown = (view, event) => {
    view.observer.flush();
    if (view.inputState.lastTouchTime > Date.now() - 2e3)
      return false;
    let style = null;
    for (let makeStyle of view.state.facet(mouseSelectionStyle)) {
      style = makeStyle(view, event);
      if (style)
        break;
    }
    if (!style && event.button == 0)
      style = basicMouseSelection(view, event);
    if (style) {
      let mustFocus = !view.hasFocus;
      view.inputState.startMouseSelection(new MouseSelection(view, event, style, mustFocus));
      if (mustFocus)
        view.observer.ignore(() => focusPreventScroll(view.contentDOM));
      let mouseSel = view.inputState.mouseSelection;
      if (mouseSel) {
        mouseSel.start(event);
        return mouseSel.dragging === false;
      }
    }
    return false;
  };
  function rangeForClick(view, pos, bias, type) {
    if (type == 1) {
      return EditorSelection.cursor(pos, bias);
    } else if (type == 2) {
      return groupAt(view.state, pos, bias);
    } else {
      let visual = LineView.find(view.docView, pos), line = view.state.doc.lineAt(visual ? visual.posAtEnd : pos);
      let from = visual ? visual.posAtStart : line.from, to = visual ? visual.posAtEnd : line.to;
      if (to < view.state.doc.length && to == line.to)
        to++;
      return EditorSelection.range(from, to);
    }
  }
  let insideY = (y2, rect) => y2 >= rect.top && y2 <= rect.bottom;
  let inside = (x2, y2, rect) => insideY(y2, rect) && x2 >= rect.left && x2 <= rect.right;
  function findPositionSide(view, pos, x2, y2) {
    let line = LineView.find(view.docView, pos);
    if (!line)
      return 1;
    let off = pos - line.posAtStart;
    if (off == 0)
      return 1;
    if (off == line.length)
      return -1;
    let before = line.coordsAt(off, -1);
    if (before && inside(x2, y2, before))
      return -1;
    let after = line.coordsAt(off, 1);
    if (after && inside(x2, y2, after))
      return 1;
    return before && insideY(y2, before) ? -1 : 1;
  }
  function queryPos(view, event) {
    let pos = view.posAtCoords({ x: event.clientX, y: event.clientY }, false);
    return { pos, bias: findPositionSide(view, pos, event.clientX, event.clientY) };
  }
  const BadMouseDetail = browser.ie && browser.ie_version <= 11;
  let lastMouseDown = null, lastMouseDownCount = 0, lastMouseDownTime = 0;
  function getClickType(event) {
    if (!BadMouseDetail)
      return event.detail;
    let last = lastMouseDown, lastTime = lastMouseDownTime;
    lastMouseDown = event;
    lastMouseDownTime = Date.now();
    return lastMouseDownCount = !last || lastTime > Date.now() - 400 && Math.abs(last.clientX - event.clientX) < 2 && Math.abs(last.clientY - event.clientY) < 2 ? (lastMouseDownCount + 1) % 3 : 1;
  }
  function basicMouseSelection(view, event) {
    let start = queryPos(view, event), type = getClickType(event);
    let startSel = view.state.selection;
    return {
      update(update) {
        if (update.docChanged) {
          start.pos = update.changes.mapPos(start.pos);
          startSel = startSel.map(update.changes);
        }
      },
      get(event2, extend2, multiple) {
        let cur = queryPos(view, event2), removed;
        let range = rangeForClick(view, cur.pos, cur.bias, type);
        if (start.pos != cur.pos && !extend2) {
          let startRange = rangeForClick(view, start.pos, start.bias, type);
          let from = Math.min(startRange.from, range.from), to = Math.max(startRange.to, range.to);
          range = from < range.from ? EditorSelection.range(from, to) : EditorSelection.range(to, from);
        }
        if (extend2)
          return startSel.replaceRange(startSel.main.extend(range.from, range.to));
        else if (multiple && type == 1 && startSel.ranges.length > 1 && (removed = removeRangeAround(startSel, cur.pos)))
          return removed;
        else if (multiple)
          return startSel.addRange(range);
        else
          return EditorSelection.create([range]);
      }
    };
  }
  function removeRangeAround(sel, pos) {
    for (let i2 = 0; i2 < sel.ranges.length; i2++) {
      let { from, to } = sel.ranges[i2];
      if (from <= pos && to >= pos)
        return EditorSelection.create(sel.ranges.slice(0, i2).concat(sel.ranges.slice(i2 + 1)), sel.mainIndex == i2 ? 0 : sel.mainIndex - (sel.mainIndex > i2 ? 1 : 0));
    }
    return null;
  }
  handlers.dragstart = (view, event) => {
    let { selection: { main: range } } = view.state;
    if (event.target.draggable) {
      let cView = view.docView.nearest(event.target);
      if (cView && cView.isWidget) {
        let from = cView.posAtStart, to = from + cView.length;
        if (from >= range.to || to <= range.from)
          range = EditorSelection.range(from, to);
      }
    }
    let { inputState } = view;
    if (inputState.mouseSelection)
      inputState.mouseSelection.dragging = true;
    inputState.draggedContent = range;
    if (event.dataTransfer) {
      event.dataTransfer.setData("Text", view.state.sliceDoc(range.from, range.to));
      event.dataTransfer.effectAllowed = "copyMove";
    }
    return false;
  };
  handlers.dragend = (view) => {
    view.inputState.draggedContent = null;
    return false;
  };
  function dropText(view, event, text, direct) {
    if (!text)
      return;
    let dropPos = view.posAtCoords({ x: event.clientX, y: event.clientY }, false);
    let { draggedContent } = view.inputState;
    let del = direct && draggedContent && dragMovesSelection(view, event) ? { from: draggedContent.from, to: draggedContent.to } : null;
    let ins = { from: dropPos, insert: text };
    let changes = view.state.changes(del ? [del, ins] : ins);
    view.focus();
    view.dispatch({
      changes,
      selection: { anchor: changes.mapPos(dropPos, -1), head: changes.mapPos(dropPos, 1) },
      userEvent: del ? "move.drop" : "input.drop"
    });
    view.inputState.draggedContent = null;
  }
  handlers.drop = (view, event) => {
    if (!event.dataTransfer)
      return false;
    if (view.state.readOnly)
      return true;
    let files = event.dataTransfer.files;
    if (files && files.length) {
      let text = Array(files.length), read = 0;
      let finishFile = () => {
        if (++read == files.length)
          dropText(view, event, text.filter((s2) => s2 != null).join(view.state.lineBreak), false);
      };
      for (let i2 = 0; i2 < files.length; i2++) {
        let reader = new FileReader();
        reader.onerror = finishFile;
        reader.onload = () => {
          if (!/[\x00-\x08\x0e-\x1f]{2}/.test(reader.result))
            text[i2] = reader.result;
          finishFile();
        };
        reader.readAsText(files[i2]);
      }
      return true;
    } else {
      let text = event.dataTransfer.getData("Text");
      if (text) {
        dropText(view, event, text, true);
        return true;
      }
    }
    return false;
  };
  handlers.paste = (view, event) => {
    if (view.state.readOnly)
      return true;
    view.observer.flush();
    let data = brokenClipboardAPI ? null : event.clipboardData;
    if (data) {
      doPaste(view, data.getData("text/plain") || data.getData("text/uri-text"));
      return true;
    } else {
      capturePaste(view);
      return false;
    }
  };
  function captureCopy(view, text) {
    let parent = view.dom.parentNode;
    if (!parent)
      return;
    let target = parent.appendChild(document.createElement("textarea"));
    target.style.cssText = "position: fixed; left: -10000px; top: 10px";
    target.value = text;
    target.focus();
    target.selectionEnd = text.length;
    target.selectionStart = 0;
    setTimeout(() => {
      target.remove();
      view.focus();
    }, 50);
  }
  function copiedRange(state) {
    let content2 = [], ranges = [], linewise = false;
    for (let range of state.selection.ranges)
      if (!range.empty) {
        content2.push(state.sliceDoc(range.from, range.to));
        ranges.push(range);
      }
    if (!content2.length) {
      let upto = -1;
      for (let { from } of state.selection.ranges) {
        let line = state.doc.lineAt(from);
        if (line.number > upto) {
          content2.push(line.text);
          ranges.push({ from: line.from, to: Math.min(state.doc.length, line.to + 1) });
        }
        upto = line.number;
      }
      linewise = true;
    }
    return { text: content2.join(state.lineBreak), ranges, linewise };
  }
  let lastLinewiseCopy = null;
  handlers.copy = handlers.cut = (view, event) => {
    let { text, ranges, linewise } = copiedRange(view.state);
    if (!text && !linewise)
      return false;
    lastLinewiseCopy = linewise ? text : null;
    if (event.type == "cut" && !view.state.readOnly)
      view.dispatch({
        changes: ranges,
        scrollIntoView: true,
        userEvent: "delete.cut"
      });
    let data = brokenClipboardAPI ? null : event.clipboardData;
    if (data) {
      data.clearData();
      data.setData("text/plain", text);
      return true;
    } else {
      captureCopy(view, text);
      return false;
    }
  };
  const isFocusChange = /* @__PURE__ */ Annotation.define();
  function focusChangeTransaction(state, focus) {
    let effects = [];
    for (let getEffect of state.facet(focusChangeEffect)) {
      let effect = getEffect(state, focus);
      if (effect)
        effects.push(effect);
    }
    return effects ? state.update({ effects, annotations: isFocusChange.of(true) }) : null;
  }
  function updateForFocusChange(view) {
    setTimeout(() => {
      let focus = view.hasFocus;
      if (focus != view.inputState.notifiedFocused) {
        let tr = focusChangeTransaction(view.state, focus);
        if (tr)
          view.dispatch(tr);
        else
          view.update([]);
      }
    }, 10);
  }
  observers.focus = (view) => {
    view.inputState.lastFocusTime = Date.now();
    if (!view.scrollDOM.scrollTop && (view.inputState.lastScrollTop || view.inputState.lastScrollLeft)) {
      view.scrollDOM.scrollTop = view.inputState.lastScrollTop;
      view.scrollDOM.scrollLeft = view.inputState.lastScrollLeft;
    }
    updateForFocusChange(view);
  };
  observers.blur = (view) => {
    view.observer.clearSelectionRange();
    updateForFocusChange(view);
  };
  observers.compositionstart = observers.compositionupdate = (view) => {
    if (view.inputState.compositionFirstChange == null)
      view.inputState.compositionFirstChange = true;
    if (view.inputState.composing < 0) {
      view.inputState.composing = 0;
    }
  };
  observers.compositionend = (view) => {
    view.inputState.composing = -1;
    view.inputState.compositionEndedAt = Date.now();
    view.inputState.compositionPendingKey = true;
    view.inputState.compositionPendingChange = view.observer.pendingRecords().length > 0;
    view.inputState.compositionFirstChange = null;
    if (browser.chrome && browser.android) {
      view.observer.flushSoon();
    } else if (view.inputState.compositionPendingChange) {
      Promise.resolve().then(() => view.observer.flush());
    } else {
      setTimeout(() => {
        if (view.inputState.composing < 0 && view.docView.hasComposition)
          view.update([]);
      }, 50);
    }
  };
  observers.contextmenu = (view) => {
    view.inputState.lastContextMenu = Date.now();
  };
  handlers.beforeinput = (view, event) => {
    var _a3;
    let pending;
    if (browser.chrome && browser.android && (pending = PendingKeys.find((key) => key.inputType == event.inputType))) {
      view.observer.delayAndroidKey(pending.key, pending.keyCode);
      if (pending.key == "Backspace" || pending.key == "Delete") {
        let startViewHeight = ((_a3 = window.visualViewport) === null || _a3 === void 0 ? void 0 : _a3.height) || 0;
        setTimeout(() => {
          var _a4;
          if ((((_a4 = window.visualViewport) === null || _a4 === void 0 ? void 0 : _a4.height) || 0) > startViewHeight + 10 && view.hasFocus) {
            view.contentDOM.blur();
            view.focus();
          }
        }, 100);
      }
    }
    return false;
  };
  const appliedFirefoxHack = /* @__PURE__ */ new Set();
  function firefoxCopyCutHack(doc2) {
    if (!appliedFirefoxHack.has(doc2)) {
      appliedFirefoxHack.add(doc2);
      doc2.addEventListener("copy", () => {
      });
      doc2.addEventListener("cut", () => {
      });
    }
  }
  const wrappingWhiteSpace = ["pre-wrap", "normal", "pre-line", "break-spaces"];
  class HeightOracle {
    constructor(lineWrapping) {
      this.lineWrapping = lineWrapping;
      this.doc = Text.empty;
      this.heightSamples = {};
      this.lineHeight = 14;
      this.charWidth = 7;
      this.textHeight = 14;
      this.lineLength = 30;
      this.heightChanged = false;
    }
    heightForGap(from, to) {
      let lines = this.doc.lineAt(to).number - this.doc.lineAt(from).number + 1;
      if (this.lineWrapping)
        lines += Math.max(0, Math.ceil((to - from - lines * this.lineLength * 0.5) / this.lineLength));
      return this.lineHeight * lines;
    }
    heightForLine(length) {
      if (!this.lineWrapping)
        return this.lineHeight;
      let lines = 1 + Math.max(0, Math.ceil((length - this.lineLength) / (this.lineLength - 5)));
      return lines * this.lineHeight;
    }
    setDoc(doc2) {
      this.doc = doc2;
      return this;
    }
    mustRefreshForWrapping(whiteSpace) {
      return wrappingWhiteSpace.indexOf(whiteSpace) > -1 != this.lineWrapping;
    }
    mustRefreshForHeights(lineHeights) {
      let newHeight = false;
      for (let i2 = 0; i2 < lineHeights.length; i2++) {
        let h2 = lineHeights[i2];
        if (h2 < 0) {
          i2++;
        } else if (!this.heightSamples[Math.floor(h2 * 10)]) {
          newHeight = true;
          this.heightSamples[Math.floor(h2 * 10)] = true;
        }
      }
      return newHeight;
    }
    refresh(whiteSpace, lineHeight, charWidth, textHeight, lineLength, knownHeights) {
      let lineWrapping = wrappingWhiteSpace.indexOf(whiteSpace) > -1;
      let changed = Math.round(lineHeight) != Math.round(this.lineHeight) || this.lineWrapping != lineWrapping;
      this.lineWrapping = lineWrapping;
      this.lineHeight = lineHeight;
      this.charWidth = charWidth;
      this.textHeight = textHeight;
      this.lineLength = lineLength;
      if (changed) {
        this.heightSamples = {};
        for (let i2 = 0; i2 < knownHeights.length; i2++) {
          let h2 = knownHeights[i2];
          if (h2 < 0)
            i2++;
          else
            this.heightSamples[Math.floor(h2 * 10)] = true;
        }
      }
      return changed;
    }
  }
  class MeasuredHeights {
    constructor(from, heights) {
      this.from = from;
      this.heights = heights;
      this.index = 0;
    }
    get more() {
      return this.index < this.heights.length;
    }
  }
  class BlockInfo {
    /**
    @internal
    */
    constructor(from, length, top2, height, _content) {
      this.from = from;
      this.length = length;
      this.top = top2;
      this.height = height;
      this._content = _content;
    }
    /**
    The type of element this is. When querying lines, this may be
    an array of all the blocks that make up the line.
    */
    get type() {
      return typeof this._content == "number" ? BlockType.Text : Array.isArray(this._content) ? this._content : this._content.type;
    }
    /**
    The end of the element as a document position.
    */
    get to() {
      return this.from + this.length;
    }
    /**
    The bottom position of the element.
    */
    get bottom() {
      return this.top + this.height;
    }
    /**
    If this is a widget block, this will return the widget
    associated with it.
    */
    get widget() {
      return this._content instanceof PointDecoration ? this._content.widget : null;
    }
    /**
    If this is a textblock, this holds the number of line breaks
    that appear in widgets inside the block.
    */
    get widgetLineBreaks() {
      return typeof this._content == "number" ? this._content : 0;
    }
    /**
    @internal
    */
    join(other) {
      let content2 = (Array.isArray(this._content) ? this._content : [this]).concat(Array.isArray(other._content) ? other._content : [other]);
      return new BlockInfo(this.from, this.length + other.length, this.top, this.height + other.height, content2);
    }
  }
  var QueryType = /* @__PURE__ */ function(QueryType2) {
    QueryType2[QueryType2["ByPos"] = 0] = "ByPos";
    QueryType2[QueryType2["ByHeight"] = 1] = "ByHeight";
    QueryType2[QueryType2["ByPosNoHeight"] = 2] = "ByPosNoHeight";
    return QueryType2;
  }(QueryType || (QueryType = {}));
  const Epsilon = 1e-3;
  class HeightMap {
    constructor(length, height, flags = 2) {
      this.length = length;
      this.height = height;
      this.flags = flags;
    }
    get outdated() {
      return (this.flags & 2) > 0;
    }
    set outdated(value) {
      this.flags = (value ? 2 : 0) | this.flags & ~2;
    }
    setHeight(oracle, height) {
      if (this.height != height) {
        if (Math.abs(this.height - height) > Epsilon)
          oracle.heightChanged = true;
        this.height = height;
      }
    }
    // Base case is to replace a leaf node, which simply builds a tree
    // from the new nodes and returns that (HeightMapBranch and
    // HeightMapGap override this to actually use from/to)
    replace(_from, _to, nodes) {
      return HeightMap.of(nodes);
    }
    // Again, these are base cases, and are overridden for branch and gap nodes.
    decomposeLeft(_to, result) {
      result.push(this);
    }
    decomposeRight(_from, result) {
      result.push(this);
    }
    applyChanges(decorations2, oldDoc, oracle, changes) {
      let me = this, doc2 = oracle.doc;
      for (let i2 = changes.length - 1; i2 >= 0; i2--) {
        let { fromA, toA, fromB, toB } = changes[i2];
        let start = me.lineAt(fromA, QueryType.ByPosNoHeight, oracle.setDoc(oldDoc), 0, 0);
        let end = start.to >= toA ? start : me.lineAt(toA, QueryType.ByPosNoHeight, oracle, 0, 0);
        toB += end.to - toA;
        toA = end.to;
        while (i2 > 0 && start.from <= changes[i2 - 1].toA) {
          fromA = changes[i2 - 1].fromA;
          fromB = changes[i2 - 1].fromB;
          i2--;
          if (fromA < start.from)
            start = me.lineAt(fromA, QueryType.ByPosNoHeight, oracle, 0, 0);
        }
        fromB += start.from - fromA;
        fromA = start.from;
        let nodes = NodeBuilder.build(oracle.setDoc(doc2), decorations2, fromB, toB);
        me = me.replace(fromA, toA, nodes);
      }
      return me.updateHeight(oracle, 0);
    }
    static empty() {
      return new HeightMapText(0, 0);
    }
    // nodes uses null values to indicate the position of line breaks.
    // There are never line breaks at the start or end of the array, or
    // two line breaks next to each other, and the array isn't allowed
    // to be empty (same restrictions as return value from the builder).
    static of(nodes) {
      if (nodes.length == 1)
        return nodes[0];
      let i2 = 0, j2 = nodes.length, before = 0, after = 0;
      for (; ; ) {
        if (i2 == j2) {
          if (before > after * 2) {
            let split = nodes[i2 - 1];
            if (split.break)
              nodes.splice(--i2, 1, split.left, null, split.right);
            else
              nodes.splice(--i2, 1, split.left, split.right);
            j2 += 1 + split.break;
            before -= split.size;
          } else if (after > before * 2) {
            let split = nodes[j2];
            if (split.break)
              nodes.splice(j2, 1, split.left, null, split.right);
            else
              nodes.splice(j2, 1, split.left, split.right);
            j2 += 2 + split.break;
            after -= split.size;
          } else {
            break;
          }
        } else if (before < after) {
          let next = nodes[i2++];
          if (next)
            before += next.size;
        } else {
          let next = nodes[--j2];
          if (next)
            after += next.size;
        }
      }
      let brk = 0;
      if (nodes[i2 - 1] == null) {
        brk = 1;
        i2--;
      } else if (nodes[i2] == null) {
        brk = 1;
        j2++;
      }
      return new HeightMapBranch(HeightMap.of(nodes.slice(0, i2)), brk, HeightMap.of(nodes.slice(j2)));
    }
  }
  HeightMap.prototype.size = 1;
  class HeightMapBlock extends HeightMap {
    constructor(length, height, deco) {
      super(length, height);
      this.deco = deco;
    }
    blockAt(_height, _oracle, top2, offset) {
      return new BlockInfo(offset, this.length, top2, this.height, this.deco || 0);
    }
    lineAt(_value, _type, oracle, top2, offset) {
      return this.blockAt(0, oracle, top2, offset);
    }
    forEachLine(from, to, oracle, top2, offset, f2) {
      if (from <= offset + this.length && to >= offset)
        f2(this.blockAt(0, oracle, top2, offset));
    }
    updateHeight(oracle, offset = 0, _force = false, measured) {
      if (measured && measured.from <= offset && measured.more)
        this.setHeight(oracle, measured.heights[measured.index++]);
      this.outdated = false;
      return this;
    }
    toString() {
      return `block(${this.length})`;
    }
  }
  class HeightMapText extends HeightMapBlock {
    constructor(length, height) {
      super(length, height, null);
      this.collapsed = 0;
      this.widgetHeight = 0;
      this.breaks = 0;
    }
    blockAt(_height, _oracle, top2, offset) {
      return new BlockInfo(offset, this.length, top2, this.height, this.breaks);
    }
    replace(_from, _to, nodes) {
      let node = nodes[0];
      if (nodes.length == 1 && (node instanceof HeightMapText || node instanceof HeightMapGap && node.flags & 4) && Math.abs(this.length - node.length) < 10) {
        if (node instanceof HeightMapGap)
          node = new HeightMapText(node.length, this.height);
        else
          node.height = this.height;
        if (!this.outdated)
          node.outdated = false;
        return node;
      } else {
        return HeightMap.of(nodes);
      }
    }
    updateHeight(oracle, offset = 0, force = false, measured) {
      if (measured && measured.from <= offset && measured.more)
        this.setHeight(oracle, measured.heights[measured.index++]);
      else if (force || this.outdated)
        this.setHeight(oracle, Math.max(this.widgetHeight, oracle.heightForLine(this.length - this.collapsed)) + this.breaks * oracle.lineHeight);
      this.outdated = false;
      return this;
    }
    toString() {
      return `line(${this.length}${this.collapsed ? -this.collapsed : ""}${this.widgetHeight ? ":" + this.widgetHeight : ""})`;
    }
  }
  class HeightMapGap extends HeightMap {
    constructor(length) {
      super(length, 0);
    }
    heightMetrics(oracle, offset) {
      let firstLine = oracle.doc.lineAt(offset).number, lastLine = oracle.doc.lineAt(offset + this.length).number;
      let lines = lastLine - firstLine + 1;
      let perLine, perChar = 0;
      if (oracle.lineWrapping) {
        let totalPerLine = Math.min(this.height, oracle.lineHeight * lines);
        perLine = totalPerLine / lines;
        if (this.length > lines + 1)
          perChar = (this.height - totalPerLine) / (this.length - lines - 1);
      } else {
        perLine = this.height / lines;
      }
      return { firstLine, lastLine, perLine, perChar };
    }
    blockAt(height, oracle, top2, offset) {
      let { firstLine, lastLine, perLine, perChar } = this.heightMetrics(oracle, offset);
      if (oracle.lineWrapping) {
        let guess = offset + Math.round(Math.max(0, Math.min(1, (height - top2) / this.height)) * this.length);
        let line = oracle.doc.lineAt(guess), lineHeight = perLine + line.length * perChar;
        let lineTop = Math.max(top2, height - lineHeight / 2);
        return new BlockInfo(line.from, line.length, lineTop, lineHeight, 0);
      } else {
        let line = Math.max(0, Math.min(lastLine - firstLine, Math.floor((height - top2) / perLine)));
        let { from, length } = oracle.doc.line(firstLine + line);
        return new BlockInfo(from, length, top2 + perLine * line, perLine, 0);
      }
    }
    lineAt(value, type, oracle, top2, offset) {
      if (type == QueryType.ByHeight)
        return this.blockAt(value, oracle, top2, offset);
      if (type == QueryType.ByPosNoHeight) {
        let { from, to } = oracle.doc.lineAt(value);
        return new BlockInfo(from, to - from, 0, 0, 0);
      }
      let { firstLine, perLine, perChar } = this.heightMetrics(oracle, offset);
      let line = oracle.doc.lineAt(value), lineHeight = perLine + line.length * perChar;
      let linesAbove = line.number - firstLine;
      let lineTop = top2 + perLine * linesAbove + perChar * (line.from - offset - linesAbove);
      return new BlockInfo(line.from, line.length, Math.max(top2, Math.min(lineTop, top2 + this.height - lineHeight)), lineHeight, 0);
    }
    forEachLine(from, to, oracle, top2, offset, f2) {
      from = Math.max(from, offset);
      to = Math.min(to, offset + this.length);
      let { firstLine, perLine, perChar } = this.heightMetrics(oracle, offset);
      for (let pos = from, lineTop = top2; pos <= to; ) {
        let line = oracle.doc.lineAt(pos);
        if (pos == from) {
          let linesAbove = line.number - firstLine;
          lineTop += perLine * linesAbove + perChar * (from - offset - linesAbove);
        }
        let lineHeight = perLine + perChar * line.length;
        f2(new BlockInfo(line.from, line.length, lineTop, lineHeight, 0));
        lineTop += lineHeight;
        pos = line.to + 1;
      }
    }
    replace(from, to, nodes) {
      let after = this.length - to;
      if (after > 0) {
        let last = nodes[nodes.length - 1];
        if (last instanceof HeightMapGap)
          nodes[nodes.length - 1] = new HeightMapGap(last.length + after);
        else
          nodes.push(null, new HeightMapGap(after - 1));
      }
      if (from > 0) {
        let first = nodes[0];
        if (first instanceof HeightMapGap)
          nodes[0] = new HeightMapGap(from + first.length);
        else
          nodes.unshift(new HeightMapGap(from - 1), null);
      }
      return HeightMap.of(nodes);
    }
    decomposeLeft(to, result) {
      result.push(new HeightMapGap(to - 1), null);
    }
    decomposeRight(from, result) {
      result.push(null, new HeightMapGap(this.length - from - 1));
    }
    updateHeight(oracle, offset = 0, force = false, measured) {
      let end = offset + this.length;
      if (measured && measured.from <= offset + this.length && measured.more) {
        let nodes = [], pos = Math.max(offset, measured.from), singleHeight = -1;
        if (measured.from > offset)
          nodes.push(new HeightMapGap(measured.from - offset - 1).updateHeight(oracle, offset));
        while (pos <= end && measured.more) {
          let len = oracle.doc.lineAt(pos).length;
          if (nodes.length)
            nodes.push(null);
          let height = measured.heights[measured.index++];
          if (singleHeight == -1)
            singleHeight = height;
          else if (Math.abs(height - singleHeight) >= Epsilon)
            singleHeight = -2;
          let line = new HeightMapText(len, height);
          line.outdated = false;
          nodes.push(line);
          pos += len + 1;
        }
        if (pos <= end)
          nodes.push(null, new HeightMapGap(end - pos).updateHeight(oracle, pos));
        let result = HeightMap.of(nodes);
        if (singleHeight < 0 || Math.abs(result.height - this.height) >= Epsilon || Math.abs(singleHeight - this.heightMetrics(oracle, offset).perLine) >= Epsilon)
          oracle.heightChanged = true;
        return result;
      } else if (force || this.outdated) {
        this.setHeight(oracle, oracle.heightForGap(offset, offset + this.length));
        this.outdated = false;
      }
      return this;
    }
    toString() {
      return `gap(${this.length})`;
    }
  }
  class HeightMapBranch extends HeightMap {
    constructor(left, brk, right) {
      super(left.length + brk + right.length, left.height + right.height, brk | (left.outdated || right.outdated ? 2 : 0));
      this.left = left;
      this.right = right;
      this.size = left.size + right.size;
    }
    get break() {
      return this.flags & 1;
    }
    blockAt(height, oracle, top2, offset) {
      let mid = top2 + this.left.height;
      return height < mid ? this.left.blockAt(height, oracle, top2, offset) : this.right.blockAt(height, oracle, mid, offset + this.left.length + this.break);
    }
    lineAt(value, type, oracle, top2, offset) {
      let rightTop = top2 + this.left.height, rightOffset = offset + this.left.length + this.break;
      let left = type == QueryType.ByHeight ? value < rightTop : value < rightOffset;
      let base2 = left ? this.left.lineAt(value, type, oracle, top2, offset) : this.right.lineAt(value, type, oracle, rightTop, rightOffset);
      if (this.break || (left ? base2.to < rightOffset : base2.from > rightOffset))
        return base2;
      let subQuery = type == QueryType.ByPosNoHeight ? QueryType.ByPosNoHeight : QueryType.ByPos;
      if (left)
        return base2.join(this.right.lineAt(rightOffset, subQuery, oracle, rightTop, rightOffset));
      else
        return this.left.lineAt(rightOffset, subQuery, oracle, top2, offset).join(base2);
    }
    forEachLine(from, to, oracle, top2, offset, f2) {
      let rightTop = top2 + this.left.height, rightOffset = offset + this.left.length + this.break;
      if (this.break) {
        if (from < rightOffset)
          this.left.forEachLine(from, to, oracle, top2, offset, f2);
        if (to >= rightOffset)
          this.right.forEachLine(from, to, oracle, rightTop, rightOffset, f2);
      } else {
        let mid = this.lineAt(rightOffset, QueryType.ByPos, oracle, top2, offset);
        if (from < mid.from)
          this.left.forEachLine(from, mid.from - 1, oracle, top2, offset, f2);
        if (mid.to >= from && mid.from <= to)
          f2(mid);
        if (to > mid.to)
          this.right.forEachLine(mid.to + 1, to, oracle, rightTop, rightOffset, f2);
      }
    }
    replace(from, to, nodes) {
      let rightStart = this.left.length + this.break;
      if (to < rightStart)
        return this.balanced(this.left.replace(from, to, nodes), this.right);
      if (from > this.left.length)
        return this.balanced(this.left, this.right.replace(from - rightStart, to - rightStart, nodes));
      let result = [];
      if (from > 0)
        this.decomposeLeft(from, result);
      let left = result.length;
      for (let node of nodes)
        result.push(node);
      if (from > 0)
        mergeGaps(result, left - 1);
      if (to < this.length) {
        let right = result.length;
        this.decomposeRight(to, result);
        mergeGaps(result, right);
      }
      return HeightMap.of(result);
    }
    decomposeLeft(to, result) {
      let left = this.left.length;
      if (to <= left)
        return this.left.decomposeLeft(to, result);
      result.push(this.left);
      if (this.break) {
        left++;
        if (to >= left)
          result.push(null);
      }
      if (to > left)
        this.right.decomposeLeft(to - left, result);
    }
    decomposeRight(from, result) {
      let left = this.left.length, right = left + this.break;
      if (from >= right)
        return this.right.decomposeRight(from - right, result);
      if (from < left)
        this.left.decomposeRight(from, result);
      if (this.break && from < right)
        result.push(null);
      result.push(this.right);
    }
    balanced(left, right) {
      if (left.size > 2 * right.size || right.size > 2 * left.size)
        return HeightMap.of(this.break ? [left, null, right] : [left, right]);
      this.left = left;
      this.right = right;
      this.height = left.height + right.height;
      this.outdated = left.outdated || right.outdated;
      this.size = left.size + right.size;
      this.length = left.length + this.break + right.length;
      return this;
    }
    updateHeight(oracle, offset = 0, force = false, measured) {
      let { left, right } = this, rightStart = offset + left.length + this.break, rebalance = null;
      if (measured && measured.from <= offset + left.length && measured.more)
        rebalance = left = left.updateHeight(oracle, offset, force, measured);
      else
        left.updateHeight(oracle, offset, force);
      if (measured && measured.from <= rightStart + right.length && measured.more)
        rebalance = right = right.updateHeight(oracle, rightStart, force, measured);
      else
        right.updateHeight(oracle, rightStart, force);
      if (rebalance)
        return this.balanced(left, right);
      this.height = this.left.height + this.right.height;
      this.outdated = false;
      return this;
    }
    toString() {
      return this.left + (this.break ? " " : "-") + this.right;
    }
  }
  function mergeGaps(nodes, around) {
    let before, after;
    if (nodes[around] == null && (before = nodes[around - 1]) instanceof HeightMapGap && (after = nodes[around + 1]) instanceof HeightMapGap)
      nodes.splice(around - 1, 3, new HeightMapGap(before.length + 1 + after.length));
  }
  const relevantWidgetHeight = 5;
  class NodeBuilder {
    constructor(pos, oracle) {
      this.pos = pos;
      this.oracle = oracle;
      this.nodes = [];
      this.lineStart = -1;
      this.lineEnd = -1;
      this.covering = null;
      this.writtenTo = pos;
    }
    get isCovered() {
      return this.covering && this.nodes[this.nodes.length - 1] == this.covering;
    }
    span(_from, to) {
      if (this.lineStart > -1) {
        let end = Math.min(to, this.lineEnd), last = this.nodes[this.nodes.length - 1];
        if (last instanceof HeightMapText)
          last.length += end - this.pos;
        else if (end > this.pos || !this.isCovered)
          this.nodes.push(new HeightMapText(end - this.pos, -1));
        this.writtenTo = end;
        if (to > end) {
          this.nodes.push(null);
          this.writtenTo++;
          this.lineStart = -1;
        }
      }
      this.pos = to;
    }
    point(from, to, deco) {
      if (from < to || deco.heightRelevant) {
        let height = deco.widget ? deco.widget.estimatedHeight : 0;
        let breaks = deco.widget ? deco.widget.lineBreaks : 0;
        if (height < 0)
          height = this.oracle.lineHeight;
        let len = to - from;
        if (deco.block) {
          this.addBlock(new HeightMapBlock(len, height, deco));
        } else if (len || breaks || height >= relevantWidgetHeight) {
          this.addLineDeco(height, breaks, len);
        }
      } else if (to > from) {
        this.span(from, to);
      }
      if (this.lineEnd > -1 && this.lineEnd < this.pos)
        this.lineEnd = this.oracle.doc.lineAt(this.pos).to;
    }
    enterLine() {
      if (this.lineStart > -1)
        return;
      let { from, to } = this.oracle.doc.lineAt(this.pos);
      this.lineStart = from;
      this.lineEnd = to;
      if (this.writtenTo < from) {
        if (this.writtenTo < from - 1 || this.nodes[this.nodes.length - 1] == null)
          this.nodes.push(this.blankContent(this.writtenTo, from - 1));
        this.nodes.push(null);
      }
      if (this.pos > from)
        this.nodes.push(new HeightMapText(this.pos - from, -1));
      this.writtenTo = this.pos;
    }
    blankContent(from, to) {
      let gap = new HeightMapGap(to - from);
      if (this.oracle.doc.lineAt(from).to == to)
        gap.flags |= 4;
      return gap;
    }
    ensureLine() {
      this.enterLine();
      let last = this.nodes.length ? this.nodes[this.nodes.length - 1] : null;
      if (last instanceof HeightMapText)
        return last;
      let line = new HeightMapText(0, -1);
      this.nodes.push(line);
      return line;
    }
    addBlock(block) {
      this.enterLine();
      let deco = block.deco;
      if (deco && deco.startSide > 0 && !this.isCovered)
        this.ensureLine();
      this.nodes.push(block);
      this.writtenTo = this.pos = this.pos + block.length;
      if (deco && deco.endSide > 0)
        this.covering = block;
    }
    addLineDeco(height, breaks, length) {
      let line = this.ensureLine();
      line.length += length;
      line.collapsed += length;
      line.widgetHeight = Math.max(line.widgetHeight, height);
      line.breaks += breaks;
      this.writtenTo = this.pos = this.pos + length;
    }
    finish(from) {
      let last = this.nodes.length == 0 ? null : this.nodes[this.nodes.length - 1];
      if (this.lineStart > -1 && !(last instanceof HeightMapText) && !this.isCovered)
        this.nodes.push(new HeightMapText(0, -1));
      else if (this.writtenTo < this.pos || last == null)
        this.nodes.push(this.blankContent(this.writtenTo, this.pos));
      let pos = from;
      for (let node of this.nodes) {
        if (node instanceof HeightMapText)
          node.updateHeight(this.oracle, pos);
        pos += node ? node.length : 1;
      }
      return this.nodes;
    }
    // Always called with a region that on both sides either stretches
    // to a line break or the end of the document.
    // The returned array uses null to indicate line breaks, but never
    // starts or ends in a line break, or has multiple line breaks next
    // to each other.
    static build(oracle, decorations2, from, to) {
      let builder = new NodeBuilder(from, oracle);
      RangeSet.spans(decorations2, from, to, builder, 0);
      return builder.finish(from);
    }
  }
  function heightRelevantDecoChanges(a2, b2, diff) {
    let comp = new DecorationComparator();
    RangeSet.compare(a2, b2, diff, comp, 0);
    return comp.changes;
  }
  class DecorationComparator {
    constructor() {
      this.changes = [];
    }
    compareRange() {
    }
    comparePoint(from, to, a2, b2) {
      if (from < to || a2 && a2.heightRelevant || b2 && b2.heightRelevant)
        addRange(from, to, this.changes, 5);
    }
  }
  function visiblePixelRange(dom, paddingTop) {
    let rect = dom.getBoundingClientRect();
    let doc2 = dom.ownerDocument, win = doc2.defaultView || window;
    let left = Math.max(0, rect.left), right = Math.min(win.innerWidth, rect.right);
    let top2 = Math.max(0, rect.top), bottom = Math.min(win.innerHeight, rect.bottom);
    for (let parent = dom.parentNode; parent && parent != doc2.body; ) {
      if (parent.nodeType == 1) {
        let elt = parent;
        let style = window.getComputedStyle(elt);
        if ((elt.scrollHeight > elt.clientHeight || elt.scrollWidth > elt.clientWidth) && style.overflow != "visible") {
          let parentRect = elt.getBoundingClientRect();
          left = Math.max(left, parentRect.left);
          right = Math.min(right, parentRect.right);
          top2 = Math.max(top2, parentRect.top);
          bottom = parent == dom.parentNode ? parentRect.bottom : Math.min(bottom, parentRect.bottom);
        }
        parent = style.position == "absolute" || style.position == "fixed" ? elt.offsetParent : elt.parentNode;
      } else if (parent.nodeType == 11) {
        parent = parent.host;
      } else {
        break;
      }
    }
    return {
      left: left - rect.left,
      right: Math.max(left, right) - rect.left,
      top: top2 - (rect.top + paddingTop),
      bottom: Math.max(top2, bottom) - (rect.top + paddingTop)
    };
  }
  function fullPixelRange(dom, paddingTop) {
    let rect = dom.getBoundingClientRect();
    return {
      left: 0,
      right: rect.right - rect.left,
      top: paddingTop,
      bottom: rect.bottom - (rect.top + paddingTop)
    };
  }
  class LineGap {
    constructor(from, to, size) {
      this.from = from;
      this.to = to;
      this.size = size;
    }
    static same(a2, b2) {
      if (a2.length != b2.length)
        return false;
      for (let i2 = 0; i2 < a2.length; i2++) {
        let gA = a2[i2], gB = b2[i2];
        if (gA.from != gB.from || gA.to != gB.to || gA.size != gB.size)
          return false;
      }
      return true;
    }
    draw(viewState, wrapping) {
      return Decoration.replace({
        widget: new LineGapWidget(this.size * (wrapping ? viewState.scaleY : viewState.scaleX), wrapping)
      }).range(this.from, this.to);
    }
  }
  class LineGapWidget extends WidgetType {
    constructor(size, vertical) {
      super();
      this.size = size;
      this.vertical = vertical;
    }
    eq(other) {
      return other.size == this.size && other.vertical == this.vertical;
    }
    toDOM() {
      let elt = document.createElement("div");
      if (this.vertical) {
        elt.style.height = this.size + "px";
      } else {
        elt.style.width = this.size + "px";
        elt.style.height = "2px";
        elt.style.display = "inline-block";
      }
      return elt;
    }
    get estimatedHeight() {
      return this.vertical ? this.size : -1;
    }
  }
  class ViewState {
    constructor(state) {
      this.state = state;
      this.pixelViewport = { left: 0, right: window.innerWidth, top: 0, bottom: 0 };
      this.inView = true;
      this.paddingTop = 0;
      this.paddingBottom = 0;
      this.contentDOMWidth = 0;
      this.contentDOMHeight = 0;
      this.editorHeight = 0;
      this.editorWidth = 0;
      this.scrollTop = 0;
      this.scrolledToBottom = true;
      this.scaleX = 1;
      this.scaleY = 1;
      this.scrollAnchorPos = 0;
      this.scrollAnchorHeight = -1;
      this.scaler = IdScaler;
      this.scrollTarget = null;
      this.printing = false;
      this.mustMeasureContent = true;
      this.defaultTextDirection = Direction.LTR;
      this.visibleRanges = [];
      this.mustEnforceCursorAssoc = false;
      let guessWrapping = state.facet(contentAttributes).some((v2) => typeof v2 != "function" && v2.class == "cm-lineWrapping");
      this.heightOracle = new HeightOracle(guessWrapping);
      this.stateDeco = state.facet(decorations).filter((d2) => typeof d2 != "function");
      this.heightMap = HeightMap.empty().applyChanges(this.stateDeco, Text.empty, this.heightOracle.setDoc(state.doc), [new ChangedRange(0, 0, 0, state.doc.length)]);
      this.viewport = this.getViewport(0, null);
      this.updateViewportLines();
      this.updateForViewport();
      this.lineGaps = this.ensureLineGaps([]);
      this.lineGapDeco = Decoration.set(this.lineGaps.map((gap) => gap.draw(this, false)));
      this.computeVisibleRanges();
    }
    updateForViewport() {
      let viewports = [this.viewport], { main } = this.state.selection;
      for (let i2 = 0; i2 <= 1; i2++) {
        let pos = i2 ? main.head : main.anchor;
        if (!viewports.some(({ from, to }) => pos >= from && pos <= to)) {
          let { from, to } = this.lineBlockAt(pos);
          viewports.push(new Viewport(from, to));
        }
      }
      this.viewports = viewports.sort((a2, b2) => a2.from - b2.from);
      this.scaler = this.heightMap.height <= 7e6 ? IdScaler : new BigScaler(this.heightOracle, this.heightMap, this.viewports);
    }
    updateViewportLines() {
      this.viewportLines = [];
      this.heightMap.forEachLine(this.viewport.from, this.viewport.to, this.heightOracle.setDoc(this.state.doc), 0, 0, (block) => {
        this.viewportLines.push(this.scaler.scale == 1 ? block : scaleBlock(block, this.scaler));
      });
    }
    update(update, scrollTarget = null) {
      this.state = update.state;
      let prevDeco = this.stateDeco;
      this.stateDeco = this.state.facet(decorations).filter((d2) => typeof d2 != "function");
      let contentChanges = update.changedRanges;
      let heightChanges = ChangedRange.extendWithRanges(contentChanges, heightRelevantDecoChanges(prevDeco, this.stateDeco, update ? update.changes : ChangeSet.empty(this.state.doc.length)));
      let prevHeight = this.heightMap.height;
      let scrollAnchor = this.scrolledToBottom ? null : this.scrollAnchorAt(this.scrollTop);
      this.heightMap = this.heightMap.applyChanges(this.stateDeco, update.startState.doc, this.heightOracle.setDoc(this.state.doc), heightChanges);
      if (this.heightMap.height != prevHeight)
        update.flags |= 2;
      if (scrollAnchor) {
        this.scrollAnchorPos = update.changes.mapPos(scrollAnchor.from, -1);
        this.scrollAnchorHeight = scrollAnchor.top;
      } else {
        this.scrollAnchorPos = -1;
        this.scrollAnchorHeight = this.heightMap.height;
      }
      let viewport = heightChanges.length ? this.mapViewport(this.viewport, update.changes) : this.viewport;
      if (scrollTarget && (scrollTarget.range.head < viewport.from || scrollTarget.range.head > viewport.to) || !this.viewportIsAppropriate(viewport))
        viewport = this.getViewport(0, scrollTarget);
      let updateLines = !update.changes.empty || update.flags & 2 || viewport.from != this.viewport.from || viewport.to != this.viewport.to;
      this.viewport = viewport;
      this.updateForViewport();
      if (updateLines)
        this.updateViewportLines();
      if (this.lineGaps.length || this.viewport.to - this.viewport.from > 2e3 << 1)
        this.updateLineGaps(this.ensureLineGaps(this.mapLineGaps(this.lineGaps, update.changes)));
      update.flags |= this.computeVisibleRanges();
      if (scrollTarget)
        this.scrollTarget = scrollTarget;
      if (!this.mustEnforceCursorAssoc && update.selectionSet && update.view.lineWrapping && update.state.selection.main.empty && update.state.selection.main.assoc && !update.state.facet(nativeSelectionHidden))
        this.mustEnforceCursorAssoc = true;
    }
    measure(view) {
      let dom = view.contentDOM, style = window.getComputedStyle(dom);
      let oracle = this.heightOracle;
      let whiteSpace = style.whiteSpace;
      this.defaultTextDirection = style.direction == "rtl" ? Direction.RTL : Direction.LTR;
      let refresh = this.heightOracle.mustRefreshForWrapping(whiteSpace);
      let domRect = dom.getBoundingClientRect();
      let measureContent = refresh || this.mustMeasureContent || this.contentDOMHeight != domRect.height;
      this.contentDOMHeight = domRect.height;
      this.mustMeasureContent = false;
      let result = 0, bias = 0;
      if (domRect.width && domRect.height) {
        let { scaleX, scaleY } = getScale(dom, domRect);
        if (this.scaleX != scaleX || this.scaleY != scaleY) {
          this.scaleX = scaleX;
          this.scaleY = scaleY;
          result |= 8;
          refresh = measureContent = true;
        }
      }
      let paddingTop = (parseInt(style.paddingTop) || 0) * this.scaleY;
      let paddingBottom = (parseInt(style.paddingBottom) || 0) * this.scaleY;
      if (this.paddingTop != paddingTop || this.paddingBottom != paddingBottom) {
        this.paddingTop = paddingTop;
        this.paddingBottom = paddingBottom;
        result |= 8 | 2;
      }
      if (this.editorWidth != view.scrollDOM.clientWidth) {
        if (oracle.lineWrapping)
          measureContent = true;
        this.editorWidth = view.scrollDOM.clientWidth;
        result |= 8;
      }
      let scrollTop = view.scrollDOM.scrollTop * this.scaleY;
      if (this.scrollTop != scrollTop) {
        this.scrollAnchorHeight = -1;
        this.scrollTop = scrollTop;
      }
      this.scrolledToBottom = isScrolledToBottom(view.scrollDOM);
      let pixelViewport = (this.printing ? fullPixelRange : visiblePixelRange)(dom, this.paddingTop);
      let dTop = pixelViewport.top - this.pixelViewport.top, dBottom = pixelViewport.bottom - this.pixelViewport.bottom;
      this.pixelViewport = pixelViewport;
      let inView = this.pixelViewport.bottom > this.pixelViewport.top && this.pixelViewport.right > this.pixelViewport.left;
      if (inView != this.inView) {
        this.inView = inView;
        if (inView)
          measureContent = true;
      }
      if (!this.inView && !this.scrollTarget)
        return 0;
      let contentWidth = domRect.width;
      if (this.contentDOMWidth != contentWidth || this.editorHeight != view.scrollDOM.clientHeight) {
        this.contentDOMWidth = domRect.width;
        this.editorHeight = view.scrollDOM.clientHeight;
        result |= 8;
      }
      if (measureContent) {
        let lineHeights = view.docView.measureVisibleLineHeights(this.viewport);
        if (oracle.mustRefreshForHeights(lineHeights))
          refresh = true;
        if (refresh || oracle.lineWrapping && Math.abs(contentWidth - this.contentDOMWidth) > oracle.charWidth) {
          let { lineHeight, charWidth, textHeight } = view.docView.measureTextSize();
          refresh = lineHeight > 0 && oracle.refresh(whiteSpace, lineHeight, charWidth, textHeight, contentWidth / charWidth, lineHeights);
          if (refresh) {
            view.docView.minWidth = 0;
            result |= 8;
          }
        }
        if (dTop > 0 && dBottom > 0)
          bias = Math.max(dTop, dBottom);
        else if (dTop < 0 && dBottom < 0)
          bias = Math.min(dTop, dBottom);
        oracle.heightChanged = false;
        for (let vp of this.viewports) {
          let heights = vp.from == this.viewport.from ? lineHeights : view.docView.measureVisibleLineHeights(vp);
          this.heightMap = (refresh ? HeightMap.empty().applyChanges(this.stateDeco, Text.empty, this.heightOracle, [new ChangedRange(0, 0, 0, view.state.doc.length)]) : this.heightMap).updateHeight(oracle, 0, refresh, new MeasuredHeights(vp.from, heights));
        }
        if (oracle.heightChanged)
          result |= 2;
      }
      let viewportChange = !this.viewportIsAppropriate(this.viewport, bias) || this.scrollTarget && (this.scrollTarget.range.head < this.viewport.from || this.scrollTarget.range.head > this.viewport.to);
      if (viewportChange)
        this.viewport = this.getViewport(bias, this.scrollTarget);
      this.updateForViewport();
      if (result & 2 || viewportChange)
        this.updateViewportLines();
      if (this.lineGaps.length || this.viewport.to - this.viewport.from > 2e3 << 1)
        this.updateLineGaps(this.ensureLineGaps(refresh ? [] : this.lineGaps, view));
      result |= this.computeVisibleRanges();
      if (this.mustEnforceCursorAssoc) {
        this.mustEnforceCursorAssoc = false;
        view.docView.enforceCursorAssoc();
      }
      return result;
    }
    get visibleTop() {
      return this.scaler.fromDOM(this.pixelViewport.top);
    }
    get visibleBottom() {
      return this.scaler.fromDOM(this.pixelViewport.bottom);
    }
    getViewport(bias, scrollTarget) {
      let marginTop = 0.5 - Math.max(-0.5, Math.min(0.5, bias / 1e3 / 2));
      let map = this.heightMap, oracle = this.heightOracle;
      let { visibleTop, visibleBottom } = this;
      let viewport = new Viewport(map.lineAt(visibleTop - marginTop * 1e3, QueryType.ByHeight, oracle, 0, 0).from, map.lineAt(visibleBottom + (1 - marginTop) * 1e3, QueryType.ByHeight, oracle, 0, 0).to);
      if (scrollTarget) {
        let { head } = scrollTarget.range;
        if (head < viewport.from || head > viewport.to) {
          let viewHeight = Math.min(this.editorHeight, this.pixelViewport.bottom - this.pixelViewport.top);
          let block = map.lineAt(head, QueryType.ByPos, oracle, 0, 0), topPos;
          if (scrollTarget.y == "center")
            topPos = (block.top + block.bottom) / 2 - viewHeight / 2;
          else if (scrollTarget.y == "start" || scrollTarget.y == "nearest" && head < viewport.from)
            topPos = block.top;
          else
            topPos = block.bottom - viewHeight;
          viewport = new Viewport(map.lineAt(topPos - 1e3 / 2, QueryType.ByHeight, oracle, 0, 0).from, map.lineAt(topPos + viewHeight + 1e3 / 2, QueryType.ByHeight, oracle, 0, 0).to);
        }
      }
      return viewport;
    }
    mapViewport(viewport, changes) {
      let from = changes.mapPos(viewport.from, -1), to = changes.mapPos(viewport.to, 1);
      return new Viewport(this.heightMap.lineAt(from, QueryType.ByPos, this.heightOracle, 0, 0).from, this.heightMap.lineAt(to, QueryType.ByPos, this.heightOracle, 0, 0).to);
    }
    // Checks if a given viewport covers the visible part of the
    // document and not too much beyond that.
    viewportIsAppropriate({ from, to }, bias = 0) {
      if (!this.inView)
        return true;
      let { top: top2 } = this.heightMap.lineAt(from, QueryType.ByPos, this.heightOracle, 0, 0);
      let { bottom } = this.heightMap.lineAt(to, QueryType.ByPos, this.heightOracle, 0, 0);
      let { visibleTop, visibleBottom } = this;
      return (from == 0 || top2 <= visibleTop - Math.max(10, Math.min(
        -bias,
        250
        /* VP.MaxCoverMargin */
      ))) && (to == this.state.doc.length || bottom >= visibleBottom + Math.max(10, Math.min(
        bias,
        250
        /* VP.MaxCoverMargin */
      ))) && (top2 > visibleTop - 2 * 1e3 && bottom < visibleBottom + 2 * 1e3);
    }
    mapLineGaps(gaps, changes) {
      if (!gaps.length || changes.empty)
        return gaps;
      let mapped = [];
      for (let gap of gaps)
        if (!changes.touchesRange(gap.from, gap.to))
          mapped.push(new LineGap(changes.mapPos(gap.from), changes.mapPos(gap.to), gap.size));
      return mapped;
    }
    // Computes positions in the viewport where the start or end of a
    // line should be hidden, trying to reuse existing line gaps when
    // appropriate to avoid unneccesary redraws.
    // Uses crude character-counting for the positioning and sizing,
    // since actual DOM coordinates aren't always available and
    // predictable. Relies on generous margins (see LG.Margin) to hide
    // the artifacts this might produce from the user.
    ensureLineGaps(current, mayMeasure) {
      let wrapping = this.heightOracle.lineWrapping;
      let margin = wrapping ? 1e4 : 2e3, halfMargin = margin >> 1, doubleMargin = margin << 1;
      if (this.defaultTextDirection != Direction.LTR && !wrapping)
        return [];
      let gaps = [];
      let addGap = (from, to, line, structure) => {
        if (to - from < halfMargin)
          return;
        let sel = this.state.selection.main, avoid = [sel.from];
        if (!sel.empty)
          avoid.push(sel.to);
        for (let pos of avoid) {
          if (pos > from && pos < to) {
            addGap(from, pos - 10, line, structure);
            addGap(pos + 10, to, line, structure);
            return;
          }
        }
        let gap = find(current, (gap2) => gap2.from >= line.from && gap2.to <= line.to && Math.abs(gap2.from - from) < halfMargin && Math.abs(gap2.to - to) < halfMargin && !avoid.some((pos) => gap2.from < pos && gap2.to > pos));
        if (!gap) {
          if (to < line.to && mayMeasure && wrapping && mayMeasure.visibleRanges.some((r2) => r2.from <= to && r2.to >= to)) {
            let lineStart = mayMeasure.moveToLineBoundary(EditorSelection.cursor(to), false, true).head;
            if (lineStart > from)
              to = lineStart;
          }
          gap = new LineGap(from, to, this.gapSize(line, from, to, structure));
        }
        gaps.push(gap);
      };
      for (let line of this.viewportLines) {
        if (line.length < doubleMargin)
          continue;
        let structure = lineStructure(line.from, line.to, this.stateDeco);
        if (structure.total < doubleMargin)
          continue;
        let target = this.scrollTarget ? this.scrollTarget.range.head : null;
        let viewFrom, viewTo;
        if (wrapping) {
          let marginHeight = margin / this.heightOracle.lineLength * this.heightOracle.lineHeight;
          let top2, bot;
          if (target != null) {
            let targetFrac = findFraction(structure, target);
            let spaceFrac = ((this.visibleBottom - this.visibleTop) / 2 + marginHeight) / line.height;
            top2 = targetFrac - spaceFrac;
            bot = targetFrac + spaceFrac;
          } else {
            top2 = (this.visibleTop - line.top - marginHeight) / line.height;
            bot = (this.visibleBottom - line.top + marginHeight) / line.height;
          }
          viewFrom = findPosition(structure, top2);
          viewTo = findPosition(structure, bot);
        } else {
          let totalWidth = structure.total * this.heightOracle.charWidth;
          let marginWidth = margin * this.heightOracle.charWidth;
          let left, right;
          if (target != null) {
            let targetFrac = findFraction(structure, target);
            let spaceFrac = ((this.pixelViewport.right - this.pixelViewport.left) / 2 + marginWidth) / totalWidth;
            left = targetFrac - spaceFrac;
            right = targetFrac + spaceFrac;
          } else {
            left = (this.pixelViewport.left - marginWidth) / totalWidth;
            right = (this.pixelViewport.right + marginWidth) / totalWidth;
          }
          viewFrom = findPosition(structure, left);
          viewTo = findPosition(structure, right);
        }
        if (viewFrom > line.from)
          addGap(line.from, viewFrom, line, structure);
        if (viewTo < line.to)
          addGap(viewTo, line.to, line, structure);
      }
      return gaps;
    }
    gapSize(line, from, to, structure) {
      let fraction = findFraction(structure, to) - findFraction(structure, from);
      if (this.heightOracle.lineWrapping) {
        return line.height * fraction;
      } else {
        return structure.total * this.heightOracle.charWidth * fraction;
      }
    }
    updateLineGaps(gaps) {
      if (!LineGap.same(gaps, this.lineGaps)) {
        this.lineGaps = gaps;
        this.lineGapDeco = Decoration.set(gaps.map((gap) => gap.draw(this, this.heightOracle.lineWrapping)));
      }
    }
    computeVisibleRanges() {
      let deco = this.stateDeco;
      if (this.lineGaps.length)
        deco = deco.concat(this.lineGapDeco);
      let ranges = [];
      RangeSet.spans(deco, this.viewport.from, this.viewport.to, {
        span(from, to) {
          ranges.push({ from, to });
        },
        point() {
        }
      }, 20);
      let changed = ranges.length != this.visibleRanges.length || this.visibleRanges.some((r2, i2) => r2.from != ranges[i2].from || r2.to != ranges[i2].to);
      this.visibleRanges = ranges;
      return changed ? 4 : 0;
    }
    lineBlockAt(pos) {
      return pos >= this.viewport.from && pos <= this.viewport.to && this.viewportLines.find((b2) => b2.from <= pos && b2.to >= pos) || scaleBlock(this.heightMap.lineAt(pos, QueryType.ByPos, this.heightOracle, 0, 0), this.scaler);
    }
    lineBlockAtHeight(height) {
      return scaleBlock(this.heightMap.lineAt(this.scaler.fromDOM(height), QueryType.ByHeight, this.heightOracle, 0, 0), this.scaler);
    }
    scrollAnchorAt(scrollTop) {
      let block = this.lineBlockAtHeight(scrollTop + 8);
      return block.from >= this.viewport.from || this.viewportLines[0].top - scrollTop > 200 ? block : this.viewportLines[0];
    }
    elementAtHeight(height) {
      return scaleBlock(this.heightMap.blockAt(this.scaler.fromDOM(height), this.heightOracle, 0, 0), this.scaler);
    }
    get docHeight() {
      return this.scaler.toDOM(this.heightMap.height);
    }
    get contentHeight() {
      return this.docHeight + this.paddingTop + this.paddingBottom;
    }
  }
  class Viewport {
    constructor(from, to) {
      this.from = from;
      this.to = to;
    }
  }
  function lineStructure(from, to, stateDeco) {
    let ranges = [], pos = from, total = 0;
    RangeSet.spans(stateDeco, from, to, {
      span() {
      },
      point(from2, to2) {
        if (from2 > pos) {
          ranges.push({ from: pos, to: from2 });
          total += from2 - pos;
        }
        pos = to2;
      }
    }, 20);
    if (pos < to) {
      ranges.push({ from: pos, to });
      total += to - pos;
    }
    return { total, ranges };
  }
  function findPosition({ total, ranges }, ratio) {
    if (ratio <= 0)
      return ranges[0].from;
    if (ratio >= 1)
      return ranges[ranges.length - 1].to;
    let dist2 = Math.floor(total * ratio);
    for (let i2 = 0; ; i2++) {
      let { from, to } = ranges[i2], size = to - from;
      if (dist2 <= size)
        return from + dist2;
      dist2 -= size;
    }
  }
  function findFraction(structure, pos) {
    let counted = 0;
    for (let { from, to } of structure.ranges) {
      if (pos <= to) {
        counted += pos - from;
        break;
      }
      counted += to - from;
    }
    return counted / structure.total;
  }
  function find(array, f2) {
    for (let val of array)
      if (f2(val))
        return val;
    return void 0;
  }
  const IdScaler = {
    toDOM(n2) {
      return n2;
    },
    fromDOM(n2) {
      return n2;
    },
    scale: 1
  };
  class BigScaler {
    constructor(oracle, heightMap, viewports) {
      let vpHeight = 0, base2 = 0, domBase = 0;
      this.viewports = viewports.map(({ from, to }) => {
        let top2 = heightMap.lineAt(from, QueryType.ByPos, oracle, 0, 0).top;
        let bottom = heightMap.lineAt(to, QueryType.ByPos, oracle, 0, 0).bottom;
        vpHeight += bottom - top2;
        return { from, to, top: top2, bottom, domTop: 0, domBottom: 0 };
      });
      this.scale = (7e6 - vpHeight) / (heightMap.height - vpHeight);
      for (let obj of this.viewports) {
        obj.domTop = domBase + (obj.top - base2) * this.scale;
        domBase = obj.domBottom = obj.domTop + (obj.bottom - obj.top);
        base2 = obj.bottom;
      }
    }
    toDOM(n2) {
      for (let i2 = 0, base2 = 0, domBase = 0; ; i2++) {
        let vp = i2 < this.viewports.length ? this.viewports[i2] : null;
        if (!vp || n2 < vp.top)
          return domBase + (n2 - base2) * this.scale;
        if (n2 <= vp.bottom)
          return vp.domTop + (n2 - vp.top);
        base2 = vp.bottom;
        domBase = vp.domBottom;
      }
    }
    fromDOM(n2) {
      for (let i2 = 0, base2 = 0, domBase = 0; ; i2++) {
        let vp = i2 < this.viewports.length ? this.viewports[i2] : null;
        if (!vp || n2 < vp.domTop)
          return base2 + (n2 - domBase) / this.scale;
        if (n2 <= vp.domBottom)
          return vp.top + (n2 - vp.domTop);
        base2 = vp.bottom;
        domBase = vp.domBottom;
      }
    }
  }
  function scaleBlock(block, scaler) {
    if (scaler.scale == 1)
      return block;
    let bTop = scaler.toDOM(block.top), bBottom = scaler.toDOM(block.bottom);
    return new BlockInfo(block.from, block.length, bTop, bBottom - bTop, Array.isArray(block._content) ? block._content.map((b2) => scaleBlock(b2, scaler)) : block._content);
  }
  const theme = /* @__PURE__ */ Facet.define({ combine: (strs) => strs.join(" ") });
  const darkTheme = /* @__PURE__ */ Facet.define({ combine: (values) => values.indexOf(true) > -1 });
  const baseThemeID = /* @__PURE__ */ StyleModule.newName(), baseLightID = /* @__PURE__ */ StyleModule.newName(), baseDarkID = /* @__PURE__ */ StyleModule.newName();
  const lightDarkIDs = { "&light": "." + baseLightID, "&dark": "." + baseDarkID };
  function buildTheme(main, spec, scopes) {
    return new StyleModule(spec, {
      finish(sel) {
        return /&/.test(sel) ? sel.replace(/&\w*/, (m2) => {
          if (m2 == "&")
            return main;
          if (!scopes || !scopes[m2])
            throw new RangeError(`Unsupported selector: ${m2}`);
          return scopes[m2];
        }) : main + " " + sel;
      }
    });
  }
  const baseTheme$1 = /* @__PURE__ */ buildTheme("." + baseThemeID, {
    "&": {
      position: "relative !important",
      boxSizing: "border-box",
      "&.cm-focused": {
        // Provide a simple default outline to make sure a focused
        // editor is visually distinct. Can't leave the default behavior
        // because that will apply to the content element, which is
        // inside the scrollable container and doesn't include the
        // gutters. We also can't use an 'auto' outline, since those
        // are, for some reason, drawn behind the element content, which
        // will cause things like the active line background to cover
        // the outline (#297).
        outline: "1px dotted #212121"
      },
      display: "flex !important",
      flexDirection: "column"
    },
    ".cm-scroller": {
      display: "flex !important",
      alignItems: "flex-start !important",
      fontFamily: "monospace",
      lineHeight: 1.4,
      height: "100%",
      overflowX: "auto",
      position: "relative",
      zIndex: 0
    },
    ".cm-content": {
      margin: 0,
      flexGrow: 2,
      flexShrink: 0,
      display: "block",
      whiteSpace: "pre",
      wordWrap: "normal",
      // https://github.com/codemirror/dev/issues/456
      boxSizing: "border-box",
      minHeight: "100%",
      padding: "4px 0",
      outline: "none",
      "&[contenteditable=true]": {
        WebkitUserModify: "read-write-plaintext-only"
      }
    },
    ".cm-lineWrapping": {
      whiteSpace_fallback: "pre-wrap",
      // For IE
      whiteSpace: "break-spaces",
      wordBreak: "break-word",
      // For Safari, which doesn't support overflow-wrap: anywhere
      overflowWrap: "anywhere",
      flexShrink: 1
    },
    "&light .cm-content": { caretColor: "black" },
    "&dark .cm-content": { caretColor: "white" },
    ".cm-line": {
      display: "block",
      padding: "0 2px 0 6px"
    },
    ".cm-layer": {
      position: "absolute",
      left: 0,
      top: 0,
      contain: "size style",
      "& > *": {
        position: "absolute"
      }
    },
    "&light .cm-selectionBackground": {
      background: "#d9d9d9"
    },
    "&dark .cm-selectionBackground": {
      background: "#222"
    },
    "&light.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
      background: "#d7d4f0"
    },
    "&dark.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
      background: "#233"
    },
    ".cm-cursorLayer": {
      pointerEvents: "none"
    },
    "&.cm-focused > .cm-scroller > .cm-cursorLayer": {
      animation: "steps(1) cm-blink 1.2s infinite"
    },
    // Two animations defined so that we can switch between them to
    // restart the animation without forcing another style
    // recomputation.
    "@keyframes cm-blink": { "0%": {}, "50%": { opacity: 0 }, "100%": {} },
    "@keyframes cm-blink2": { "0%": {}, "50%": { opacity: 0 }, "100%": {} },
    ".cm-cursor, .cm-dropCursor": {
      borderLeft: "1.2px solid black",
      marginLeft: "-0.6px",
      pointerEvents: "none"
    },
    ".cm-cursor": {
      display: "none"
    },
    "&dark .cm-cursor": {
      borderLeftColor: "#444"
    },
    ".cm-dropCursor": {
      position: "absolute"
    },
    "&.cm-focused > .cm-scroller > .cm-cursorLayer .cm-cursor": {
      display: "block"
    },
    ".cm-iso": {
      unicodeBidi: "isolate"
    },
    ".cm-announced": {
      position: "fixed",
      top: "-10000px"
    },
    "@media print": {
      ".cm-announced": { display: "none" }
    },
    "&light .cm-activeLine": { backgroundColor: "#cceeff44" },
    "&dark .cm-activeLine": { backgroundColor: "#99eeff33" },
    "&light .cm-specialChar": { color: "red" },
    "&dark .cm-specialChar": { color: "#f78" },
    ".cm-gutters": {
      flexShrink: 0,
      display: "flex",
      height: "100%",
      boxSizing: "border-box",
      insetInlineStart: 0,
      zIndex: 200
    },
    "&light .cm-gutters": {
      backgroundColor: "#f5f5f5",
      color: "#6c6c6c",
      borderRight: "1px solid #ddd"
    },
    "&dark .cm-gutters": {
      backgroundColor: "#333338",
      color: "#ccc"
    },
    ".cm-gutter": {
      display: "flex !important",
      // Necessary -- prevents margin collapsing
      flexDirection: "column",
      flexShrink: 0,
      boxSizing: "border-box",
      minHeight: "100%",
      overflow: "hidden"
    },
    ".cm-gutterElement": {
      boxSizing: "border-box"
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 3px 0 5px",
      minWidth: "20px",
      textAlign: "right",
      whiteSpace: "nowrap"
    },
    "&light .cm-activeLineGutter": {
      backgroundColor: "#e2f2ff"
    },
    "&dark .cm-activeLineGutter": {
      backgroundColor: "#222227"
    },
    ".cm-panels": {
      boxSizing: "border-box",
      position: "sticky",
      left: 0,
      right: 0
    },
    "&light .cm-panels": {
      backgroundColor: "#f5f5f5",
      color: "black"
    },
    "&light .cm-panels-top": {
      borderBottom: "1px solid #ddd"
    },
    "&light .cm-panels-bottom": {
      borderTop: "1px solid #ddd"
    },
    "&dark .cm-panels": {
      backgroundColor: "#333338",
      color: "white"
    },
    ".cm-tab": {
      display: "inline-block",
      overflow: "hidden",
      verticalAlign: "bottom"
    },
    ".cm-widgetBuffer": {
      verticalAlign: "text-top",
      height: "1em",
      width: 0,
      display: "inline"
    },
    ".cm-placeholder": {
      color: "#888",
      display: "inline-block",
      verticalAlign: "top"
    },
    ".cm-highlightSpace:before": {
      content: "attr(data-display)",
      position: "absolute",
      pointerEvents: "none",
      color: "#888"
    },
    ".cm-highlightTab": {
      backgroundImage: `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="20"><path stroke="%23888" stroke-width="1" fill="none" d="M1 10H196L190 5M190 15L196 10M197 4L197 16"/></svg>')`,
      backgroundSize: "auto 100%",
      backgroundPosition: "right 90%",
      backgroundRepeat: "no-repeat"
    },
    ".cm-trailingSpace": {
      backgroundColor: "#ff332255"
    },
    ".cm-button": {
      verticalAlign: "middle",
      color: "inherit",
      fontSize: "70%",
      padding: ".2em 1em",
      borderRadius: "1px"
    },
    "&light .cm-button": {
      backgroundImage: "linear-gradient(#eff1f5, #d9d9df)",
      border: "1px solid #888",
      "&:active": {
        backgroundImage: "linear-gradient(#b4b4b4, #d0d3d6)"
      }
    },
    "&dark .cm-button": {
      backgroundImage: "linear-gradient(#393939, #111)",
      border: "1px solid #888",
      "&:active": {
        backgroundImage: "linear-gradient(#111, #333)"
      }
    },
    ".cm-textfield": {
      verticalAlign: "middle",
      color: "inherit",
      fontSize: "70%",
      border: "1px solid silver",
      padding: ".2em .5em"
    },
    "&light .cm-textfield": {
      backgroundColor: "white"
    },
    "&dark .cm-textfield": {
      border: "1px solid #555",
      backgroundColor: "inherit"
    }
  }, lightDarkIDs);
  const LineBreakPlaceholder = "￿";
  class DOMReader {
    constructor(points, state) {
      this.points = points;
      this.text = "";
      this.lineSeparator = state.facet(EditorState.lineSeparator);
    }
    append(text) {
      this.text += text;
    }
    lineBreak() {
      this.text += LineBreakPlaceholder;
    }
    readRange(start, end) {
      if (!start)
        return this;
      let parent = start.parentNode;
      for (let cur = start; ; ) {
        this.findPointBefore(parent, cur);
        let oldLen = this.text.length;
        this.readNode(cur);
        let next = cur.nextSibling;
        if (next == end)
          break;
        let view = ContentView.get(cur), nextView = ContentView.get(next);
        if (view && nextView ? view.breakAfter : (view ? view.breakAfter : isBlockElement(cur)) || isBlockElement(next) && (cur.nodeName != "BR" || cur.cmIgnore) && this.text.length > oldLen)
          this.lineBreak();
        cur = next;
      }
      this.findPointBefore(parent, end);
      return this;
    }
    readTextNode(node) {
      let text = node.nodeValue;
      for (let point of this.points)
        if (point.node == node)
          point.pos = this.text.length + Math.min(point.offset, text.length);
      for (let off = 0, re = this.lineSeparator ? null : /\r\n?|\n/g; ; ) {
        let nextBreak = -1, breakSize = 1, m2;
        if (this.lineSeparator) {
          nextBreak = text.indexOf(this.lineSeparator, off);
          breakSize = this.lineSeparator.length;
        } else if (m2 = re.exec(text)) {
          nextBreak = m2.index;
          breakSize = m2[0].length;
        }
        this.append(text.slice(off, nextBreak < 0 ? text.length : nextBreak));
        if (nextBreak < 0)
          break;
        this.lineBreak();
        if (breakSize > 1) {
          for (let point of this.points)
            if (point.node == node && point.pos > this.text.length)
              point.pos -= breakSize - 1;
        }
        off = nextBreak + breakSize;
      }
    }
    readNode(node) {
      if (node.cmIgnore)
        return;
      let view = ContentView.get(node);
      let fromView = view && view.overrideDOMText;
      if (fromView != null) {
        this.findPointInside(node, fromView.length);
        for (let i2 = fromView.iter(); !i2.next().done; ) {
          if (i2.lineBreak)
            this.lineBreak();
          else
            this.append(i2.value);
        }
      } else if (node.nodeType == 3) {
        this.readTextNode(node);
      } else if (node.nodeName == "BR") {
        if (node.nextSibling)
          this.lineBreak();
      } else if (node.nodeType == 1) {
        this.readRange(node.firstChild, null);
      }
    }
    findPointBefore(node, next) {
      for (let point of this.points)
        if (point.node == node && node.childNodes[point.offset] == next)
          point.pos = this.text.length;
    }
    findPointInside(node, length) {
      for (let point of this.points)
        if (node.nodeType == 3 ? point.node == node : node.contains(point.node))
          point.pos = this.text.length + (isAtEnd(node, point.node, point.offset) ? length : 0);
    }
  }
  function isAtEnd(parent, node, offset) {
    for (; ; ) {
      if (!node || offset < maxOffset(node))
        return false;
      if (node == parent)
        return true;
      offset = domIndex(node) + 1;
      node = node.parentNode;
    }
  }
  function isBlockElement(node) {
    return node.nodeType == 1 && /^(DIV|P|LI|UL|OL|BLOCKQUOTE|DD|DT|H\d|SECTION|PRE)$/.test(node.nodeName);
  }
  class DOMPoint {
    constructor(node, offset) {
      this.node = node;
      this.offset = offset;
      this.pos = -1;
    }
  }
  class DOMChange {
    constructor(view, start, end, typeOver) {
      this.typeOver = typeOver;
      this.bounds = null;
      this.text = "";
      let { impreciseHead: iHead, impreciseAnchor: iAnchor } = view.docView;
      if (view.state.readOnly && start > -1) {
        this.newSel = null;
      } else if (start > -1 && (this.bounds = view.docView.domBoundsAround(start, end, 0))) {
        let selPoints = iHead || iAnchor ? [] : selectionPoints(view);
        let reader = new DOMReader(selPoints, view.state);
        reader.readRange(this.bounds.startDOM, this.bounds.endDOM);
        this.text = reader.text;
        this.newSel = selectionFromPoints(selPoints, this.bounds.from);
      } else {
        let domSel = view.observer.selectionRange;
        let head = iHead && iHead.node == domSel.focusNode && iHead.offset == domSel.focusOffset || !contains(view.contentDOM, domSel.focusNode) ? view.state.selection.main.head : view.docView.posFromDOM(domSel.focusNode, domSel.focusOffset);
        let anchor = iAnchor && iAnchor.node == domSel.anchorNode && iAnchor.offset == domSel.anchorOffset || !contains(view.contentDOM, domSel.anchorNode) ? view.state.selection.main.anchor : view.docView.posFromDOM(domSel.anchorNode, domSel.anchorOffset);
        let vp = view.viewport;
        if (browser.ios && view.state.selection.main.empty && head != anchor && (vp.from > 0 || vp.to < view.state.doc.length)) {
          let offFrom = vp.from - Math.min(head, anchor), offTo = vp.to - Math.max(head, anchor);
          if ((offFrom == 0 || offFrom == 1) && (offTo == 0 || offTo == -1)) {
            head = 0;
            anchor = view.state.doc.length;
          }
        }
        this.newSel = EditorSelection.single(anchor, head);
      }
    }
  }
  function applyDOMChange(view, domChange) {
    let change;
    let { newSel } = domChange, sel = view.state.selection.main;
    let lastKey = view.inputState.lastKeyTime > Date.now() - 100 ? view.inputState.lastKeyCode : -1;
    if (domChange.bounds) {
      let { from, to } = domChange.bounds;
      let preferredPos = sel.from, preferredSide = null;
      if (lastKey === 8 || browser.android && domChange.text.length < to - from) {
        preferredPos = sel.to;
        preferredSide = "end";
      }
      let diff = findDiff(view.state.doc.sliceString(from, to, LineBreakPlaceholder), domChange.text, preferredPos - from, preferredSide);
      if (diff) {
        if (browser.chrome && lastKey == 13 && diff.toB == diff.from + 2 && domChange.text.slice(diff.from, diff.toB) == LineBreakPlaceholder + LineBreakPlaceholder)
          diff.toB--;
        change = {
          from: from + diff.from,
          to: from + diff.toA,
          insert: Text.of(domChange.text.slice(diff.from, diff.toB).split(LineBreakPlaceholder))
        };
      }
    } else if (newSel && (!view.hasFocus && view.state.facet(editable) || newSel.main.eq(sel))) {
      newSel = null;
    }
    if (!change && !newSel)
      return false;
    if (!change && domChange.typeOver && !sel.empty && newSel && newSel.main.empty) {
      change = { from: sel.from, to: sel.to, insert: view.state.doc.slice(sel.from, sel.to) };
    } else if (change && change.from >= sel.from && change.to <= sel.to && (change.from != sel.from || change.to != sel.to) && sel.to - sel.from - (change.to - change.from) <= 4) {
      change = {
        from: sel.from,
        to: sel.to,
        insert: view.state.doc.slice(sel.from, change.from).append(change.insert).append(view.state.doc.slice(change.to, sel.to))
      };
    } else if ((browser.mac || browser.android) && change && change.from == change.to && change.from == sel.head - 1 && /^\. ?$/.test(change.insert.toString()) && view.contentDOM.getAttribute("autocorrect") == "off") {
      if (newSel && change.insert.length == 2)
        newSel = EditorSelection.single(newSel.main.anchor - 1, newSel.main.head - 1);
      change = { from: sel.from, to: sel.to, insert: Text.of([" "]) };
    } else if (browser.chrome && change && change.from == change.to && change.from == sel.head && change.insert.toString() == "\n " && view.lineWrapping) {
      if (newSel)
        newSel = EditorSelection.single(newSel.main.anchor - 1, newSel.main.head - 1);
      change = { from: sel.from, to: sel.to, insert: Text.of([" "]) };
    }
    if (change) {
      if (browser.ios && view.inputState.flushIOSKey())
        return true;
      if (browser.android && (change.from == sel.from && change.to == sel.to && change.insert.length == 1 && change.insert.lines == 2 && dispatchKey(view.contentDOM, "Enter", 13) || (change.from == sel.from - 1 && change.to == sel.to && change.insert.length == 0 || lastKey == 8 && change.insert.length < change.to - change.from && change.to > sel.head) && dispatchKey(view.contentDOM, "Backspace", 8) || change.from == sel.from && change.to == sel.to + 1 && change.insert.length == 0 && dispatchKey(view.contentDOM, "Delete", 46)))
        return true;
      let text = change.insert.toString();
      if (view.inputState.composing >= 0)
        view.inputState.composing++;
      let defaultTr;
      let defaultInsert = () => defaultTr || (defaultTr = applyDefaultInsert(view, change, newSel));
      if (!view.state.facet(inputHandler).some((h2) => h2(view, change.from, change.to, text, defaultInsert)))
        view.dispatch(defaultInsert());
      return true;
    } else if (newSel && !newSel.main.eq(sel)) {
      let scrollIntoView2 = false, userEvent = "select";
      if (view.inputState.lastSelectionTime > Date.now() - 50) {
        if (view.inputState.lastSelectionOrigin == "select")
          scrollIntoView2 = true;
        userEvent = view.inputState.lastSelectionOrigin;
      }
      view.dispatch({ selection: newSel, scrollIntoView: scrollIntoView2, userEvent });
      return true;
    } else {
      return false;
    }
  }
  function applyDefaultInsert(view, change, newSel) {
    let tr, startState = view.state, sel = startState.selection.main;
    if (change.from >= sel.from && change.to <= sel.to && change.to - change.from >= (sel.to - sel.from) / 3 && (!newSel || newSel.main.empty && newSel.main.from == change.from + change.insert.length) && view.inputState.composing < 0) {
      let before = sel.from < change.from ? startState.sliceDoc(sel.from, change.from) : "";
      let after = sel.to > change.to ? startState.sliceDoc(change.to, sel.to) : "";
      tr = startState.replaceSelection(view.state.toText(before + change.insert.sliceString(0, void 0, view.state.lineBreak) + after));
    } else {
      let changes = startState.changes(change);
      let mainSel = newSel && newSel.main.to <= changes.newLength ? newSel.main : void 0;
      if (startState.selection.ranges.length > 1 && view.inputState.composing >= 0 && change.to <= sel.to && change.to >= sel.to - 10) {
        let replaced = view.state.sliceDoc(change.from, change.to);
        let compositionRange, composition = newSel && findCompositionNode(view, newSel.main.head);
        if (composition) {
          let dLen = change.insert.length - (change.to - change.from);
          compositionRange = { from: composition.from, to: composition.to - dLen };
        } else {
          compositionRange = view.state.doc.lineAt(sel.head);
        }
        let offset = sel.to - change.to, size = sel.to - sel.from;
        tr = startState.changeByRange((range) => {
          if (range.from == sel.from && range.to == sel.to)
            return { changes, range: mainSel || range.map(changes) };
          let to = range.to - offset, from = to - replaced.length;
          if (range.to - range.from != size || view.state.sliceDoc(from, to) != replaced || // Unfortunately, there's no way to make multiple
          // changes in the same node work without aborting
          // composition, so cursors in the composition range are
          // ignored.
          range.to >= compositionRange.from && range.from <= compositionRange.to)
            return { range };
          let rangeChanges = startState.changes({ from, to, insert: change.insert }), selOff = range.to - sel.to;
          return {
            changes: rangeChanges,
            range: !mainSel ? range.map(rangeChanges) : EditorSelection.range(Math.max(0, mainSel.anchor + selOff), Math.max(0, mainSel.head + selOff))
          };
        });
      } else {
        tr = {
          changes,
          selection: mainSel && startState.selection.replaceRange(mainSel)
        };
      }
    }
    let userEvent = "input.type";
    if (view.composing || view.inputState.compositionPendingChange && view.inputState.compositionEndedAt > Date.now() - 50) {
      view.inputState.compositionPendingChange = false;
      userEvent += ".compose";
      if (view.inputState.compositionFirstChange) {
        userEvent += ".start";
        view.inputState.compositionFirstChange = false;
      }
    }
    return startState.update(tr, { userEvent, scrollIntoView: true });
  }
  function findDiff(a2, b2, preferredPos, preferredSide) {
    let minLen = Math.min(a2.length, b2.length);
    let from = 0;
    while (from < minLen && a2.charCodeAt(from) == b2.charCodeAt(from))
      from++;
    if (from == minLen && a2.length == b2.length)
      return null;
    let toA = a2.length, toB = b2.length;
    while (toA > 0 && toB > 0 && a2.charCodeAt(toA - 1) == b2.charCodeAt(toB - 1)) {
      toA--;
      toB--;
    }
    if (preferredSide == "end") {
      let adjust = Math.max(0, from - Math.min(toA, toB));
      preferredPos -= toA + adjust - from;
    }
    if (toA < from && a2.length < b2.length) {
      let move = preferredPos <= from && preferredPos >= toA ? from - preferredPos : 0;
      from -= move;
      toB = from + (toB - toA);
      toA = from;
    } else if (toB < from) {
      let move = preferredPos <= from && preferredPos >= toB ? from - preferredPos : 0;
      from -= move;
      toA = from + (toA - toB);
      toB = from;
    }
    return { from, toA, toB };
  }
  function selectionPoints(view) {
    let result = [];
    if (view.root.activeElement != view.contentDOM)
      return result;
    let { anchorNode, anchorOffset, focusNode, focusOffset } = view.observer.selectionRange;
    if (anchorNode) {
      result.push(new DOMPoint(anchorNode, anchorOffset));
      if (focusNode != anchorNode || focusOffset != anchorOffset)
        result.push(new DOMPoint(focusNode, focusOffset));
    }
    return result;
  }
  function selectionFromPoints(points, base2) {
    if (points.length == 0)
      return null;
    let anchor = points[0].pos, head = points.length == 2 ? points[1].pos : anchor;
    return anchor > -1 && head > -1 ? EditorSelection.single(anchor + base2, head + base2) : null;
  }
  const observeOptions = {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    characterDataOldValue: true
  };
  const useCharData = browser.ie && browser.ie_version <= 11;
  class DOMObserver {
    constructor(view) {
      this.view = view;
      this.active = false;
      this.selectionRange = new DOMSelectionState();
      this.selectionChanged = false;
      this.delayedFlush = -1;
      this.resizeTimeout = -1;
      this.queue = [];
      this.delayedAndroidKey = null;
      this.flushingAndroidKey = -1;
      this.lastChange = 0;
      this.scrollTargets = [];
      this.intersection = null;
      this.resizeScroll = null;
      this.intersecting = false;
      this.gapIntersection = null;
      this.gaps = [];
      this.parentCheck = -1;
      this.dom = view.contentDOM;
      this.observer = new MutationObserver((mutations) => {
        for (let mut of mutations)
          this.queue.push(mut);
        if ((browser.ie && browser.ie_version <= 11 || browser.ios && view.composing) && mutations.some((m2) => m2.type == "childList" && m2.removedNodes.length || m2.type == "characterData" && m2.oldValue.length > m2.target.nodeValue.length))
          this.flushSoon();
        else
          this.flush();
      });
      if (useCharData)
        this.onCharData = (event) => {
          this.queue.push({
            target: event.target,
            type: "characterData",
            oldValue: event.prevValue
          });
          this.flushSoon();
        };
      this.onSelectionChange = this.onSelectionChange.bind(this);
      this.onResize = this.onResize.bind(this);
      this.onPrint = this.onPrint.bind(this);
      this.onScroll = this.onScroll.bind(this);
      if (typeof ResizeObserver == "function") {
        this.resizeScroll = new ResizeObserver(() => {
          var _a3;
          if (((_a3 = this.view.docView) === null || _a3 === void 0 ? void 0 : _a3.lastUpdate) < Date.now() - 75)
            this.onResize();
        });
        this.resizeScroll.observe(view.scrollDOM);
      }
      this.addWindowListeners(this.win = view.win);
      this.start();
      if (typeof IntersectionObserver == "function") {
        this.intersection = new IntersectionObserver((entries) => {
          if (this.parentCheck < 0)
            this.parentCheck = setTimeout(this.listenForScroll.bind(this), 1e3);
          if (entries.length > 0 && entries[entries.length - 1].intersectionRatio > 0 != this.intersecting) {
            this.intersecting = !this.intersecting;
            if (this.intersecting != this.view.inView)
              this.onScrollChanged(document.createEvent("Event"));
          }
        }, { threshold: [0, 1e-3] });
        this.intersection.observe(this.dom);
        this.gapIntersection = new IntersectionObserver((entries) => {
          if (entries.length > 0 && entries[entries.length - 1].intersectionRatio > 0)
            this.onScrollChanged(document.createEvent("Event"));
        }, {});
      }
      this.listenForScroll();
      this.readSelectionRange();
    }
    onScrollChanged(e2) {
      this.view.inputState.runHandlers("scroll", e2);
      if (this.intersecting)
        this.view.measure();
    }
    onScroll(e2) {
      if (this.intersecting)
        this.flush(false);
      this.onScrollChanged(e2);
    }
    onResize() {
      if (this.resizeTimeout < 0)
        this.resizeTimeout = setTimeout(() => {
          this.resizeTimeout = -1;
          this.view.requestMeasure();
        }, 50);
    }
    onPrint() {
      this.view.viewState.printing = true;
      this.view.measure();
      setTimeout(() => {
        this.view.viewState.printing = false;
        this.view.requestMeasure();
      }, 500);
    }
    updateGaps(gaps) {
      if (this.gapIntersection && (gaps.length != this.gaps.length || this.gaps.some((g2, i2) => g2 != gaps[i2]))) {
        this.gapIntersection.disconnect();
        for (let gap of gaps)
          this.gapIntersection.observe(gap);
        this.gaps = gaps;
      }
    }
    onSelectionChange(event) {
      let wasChanged = this.selectionChanged;
      if (!this.readSelectionRange() || this.delayedAndroidKey)
        return;
      let { view } = this, sel = this.selectionRange;
      if (view.state.facet(editable) ? view.root.activeElement != this.dom : !hasSelection(view.dom, sel))
        return;
      let context = sel.anchorNode && view.docView.nearest(sel.anchorNode);
      if (context && context.ignoreEvent(event)) {
        if (!wasChanged)
          this.selectionChanged = false;
        return;
      }
      if ((browser.ie && browser.ie_version <= 11 || browser.android && browser.chrome) && !view.state.selection.main.empty && // (Selection.isCollapsed isn't reliable on IE)
      sel.focusNode && isEquivalentPosition(sel.focusNode, sel.focusOffset, sel.anchorNode, sel.anchorOffset))
        this.flushSoon();
      else
        this.flush(false);
    }
    readSelectionRange() {
      let { view } = this;
      let range = browser.safari && view.root.nodeType == 11 && deepActiveElement(this.dom.ownerDocument) == this.dom && safariSelectionRangeHack(this.view) || getSelection(view.root);
      if (!range || this.selectionRange.eq(range))
        return false;
      let local = hasSelection(this.dom, range);
      if (local && !this.selectionChanged && view.inputState.lastFocusTime > Date.now() - 200 && view.inputState.lastTouchTime < Date.now() - 300 && atElementStart(this.dom, range)) {
        this.view.inputState.lastFocusTime = 0;
        view.docView.updateSelection();
        return false;
      }
      this.selectionRange.setRange(range);
      if (local)
        this.selectionChanged = true;
      return true;
    }
    setSelectionRange(anchor, head) {
      this.selectionRange.set(anchor.node, anchor.offset, head.node, head.offset);
      this.selectionChanged = false;
    }
    clearSelectionRange() {
      this.selectionRange.set(null, 0, null, 0);
    }
    listenForScroll() {
      this.parentCheck = -1;
      let i2 = 0, changed = null;
      for (let dom = this.dom; dom; ) {
        if (dom.nodeType == 1) {
          if (!changed && i2 < this.scrollTargets.length && this.scrollTargets[i2] == dom)
            i2++;
          else if (!changed)
            changed = this.scrollTargets.slice(0, i2);
          if (changed)
            changed.push(dom);
          dom = dom.assignedSlot || dom.parentNode;
        } else if (dom.nodeType == 11) {
          dom = dom.host;
        } else {
          break;
        }
      }
      if (i2 < this.scrollTargets.length && !changed)
        changed = this.scrollTargets.slice(0, i2);
      if (changed) {
        for (let dom of this.scrollTargets)
          dom.removeEventListener("scroll", this.onScroll);
        for (let dom of this.scrollTargets = changed)
          dom.addEventListener("scroll", this.onScroll);
      }
    }
    ignore(f2) {
      if (!this.active)
        return f2();
      try {
        this.stop();
        return f2();
      } finally {
        this.start();
        this.clear();
      }
    }
    start() {
      if (this.active)
        return;
      this.observer.observe(this.dom, observeOptions);
      if (useCharData)
        this.dom.addEventListener("DOMCharacterDataModified", this.onCharData);
      this.active = true;
    }
    stop() {
      if (!this.active)
        return;
      this.active = false;
      this.observer.disconnect();
      if (useCharData)
        this.dom.removeEventListener("DOMCharacterDataModified", this.onCharData);
    }
    // Throw away any pending changes
    clear() {
      this.processRecords();
      this.queue.length = 0;
      this.selectionChanged = false;
    }
    // Chrome Android, especially in combination with GBoard, not only
    // doesn't reliably fire regular key events, but also often
    // surrounds the effect of enter or backspace with a bunch of
    // composition events that, when interrupted, cause text duplication
    // or other kinds of corruption. This hack makes the editor back off
    // from handling DOM changes for a moment when such a key is
    // detected (via beforeinput or keydown), and then tries to flush
    // them or, if that has no effect, dispatches the given key.
    delayAndroidKey(key, keyCode) {
      var _a3;
      if (!this.delayedAndroidKey) {
        let flush = () => {
          let key2 = this.delayedAndroidKey;
          if (key2) {
            this.clearDelayedAndroidKey();
            this.view.inputState.lastKeyCode = key2.keyCode;
            this.view.inputState.lastKeyTime = Date.now();
            let flushed = this.flush();
            if (!flushed && key2.force)
              dispatchKey(this.dom, key2.key, key2.keyCode);
          }
        };
        this.flushingAndroidKey = this.view.win.requestAnimationFrame(flush);
      }
      if (!this.delayedAndroidKey || key == "Enter")
        this.delayedAndroidKey = {
          key,
          keyCode,
          // Only run the key handler when no changes are detected if
          // this isn't coming right after another change, in which case
          // it is probably part of a weird chain of updates, and should
          // be ignored if it returns the DOM to its previous state.
          force: this.lastChange < Date.now() - 50 || !!((_a3 = this.delayedAndroidKey) === null || _a3 === void 0 ? void 0 : _a3.force)
        };
    }
    clearDelayedAndroidKey() {
      this.win.cancelAnimationFrame(this.flushingAndroidKey);
      this.delayedAndroidKey = null;
      this.flushingAndroidKey = -1;
    }
    flushSoon() {
      if (this.delayedFlush < 0)
        this.delayedFlush = this.view.win.requestAnimationFrame(() => {
          this.delayedFlush = -1;
          this.flush();
        });
    }
    forceFlush() {
      if (this.delayedFlush >= 0) {
        this.view.win.cancelAnimationFrame(this.delayedFlush);
        this.delayedFlush = -1;
      }
      this.flush();
    }
    pendingRecords() {
      for (let mut of this.observer.takeRecords())
        this.queue.push(mut);
      return this.queue;
    }
    processRecords() {
      let records = this.pendingRecords();
      if (records.length)
        this.queue = [];
      let from = -1, to = -1, typeOver = false;
      for (let record of records) {
        let range = this.readMutation(record);
        if (!range)
          continue;
        if (range.typeOver)
          typeOver = true;
        if (from == -1) {
          ({ from, to } = range);
        } else {
          from = Math.min(range.from, from);
          to = Math.max(range.to, to);
        }
      }
      return { from, to, typeOver };
    }
    readChange() {
      let { from, to, typeOver } = this.processRecords();
      let newSel = this.selectionChanged && hasSelection(this.dom, this.selectionRange);
      if (from < 0 && !newSel)
        return null;
      if (from > -1)
        this.lastChange = Date.now();
      this.view.inputState.lastFocusTime = 0;
      this.selectionChanged = false;
      let change = new DOMChange(this.view, from, to, typeOver);
      this.view.docView.domChanged = { newSel: change.newSel ? change.newSel.main : null };
      return change;
    }
    // Apply pending changes, if any
    flush(readSelection = true) {
      if (this.delayedFlush >= 0 || this.delayedAndroidKey)
        return false;
      if (readSelection)
        this.readSelectionRange();
      let domChange = this.readChange();
      if (!domChange) {
        this.view.requestMeasure();
        return false;
      }
      let startState = this.view.state;
      let handled = applyDOMChange(this.view, domChange);
      if (this.view.state == startState)
        this.view.update([]);
      return handled;
    }
    readMutation(rec) {
      let cView = this.view.docView.nearest(rec.target);
      if (!cView || cView.ignoreMutation(rec))
        return null;
      cView.markDirty(rec.type == "attributes");
      if (rec.type == "attributes")
        cView.flags |= 4;
      if (rec.type == "childList") {
        let childBefore = findChild(cView, rec.previousSibling || rec.target.previousSibling, -1);
        let childAfter = findChild(cView, rec.nextSibling || rec.target.nextSibling, 1);
        return {
          from: childBefore ? cView.posAfter(childBefore) : cView.posAtStart,
          to: childAfter ? cView.posBefore(childAfter) : cView.posAtEnd,
          typeOver: false
        };
      } else if (rec.type == "characterData") {
        return { from: cView.posAtStart, to: cView.posAtEnd, typeOver: rec.target.nodeValue == rec.oldValue };
      } else {
        return null;
      }
    }
    setWindow(win) {
      if (win != this.win) {
        this.removeWindowListeners(this.win);
        this.win = win;
        this.addWindowListeners(this.win);
      }
    }
    addWindowListeners(win) {
      win.addEventListener("resize", this.onResize);
      win.addEventListener("beforeprint", this.onPrint);
      win.addEventListener("scroll", this.onScroll);
      win.document.addEventListener("selectionchange", this.onSelectionChange);
    }
    removeWindowListeners(win) {
      win.removeEventListener("scroll", this.onScroll);
      win.removeEventListener("resize", this.onResize);
      win.removeEventListener("beforeprint", this.onPrint);
      win.document.removeEventListener("selectionchange", this.onSelectionChange);
    }
    destroy() {
      var _a3, _b2, _c;
      this.stop();
      (_a3 = this.intersection) === null || _a3 === void 0 ? void 0 : _a3.disconnect();
      (_b2 = this.gapIntersection) === null || _b2 === void 0 ? void 0 : _b2.disconnect();
      (_c = this.resizeScroll) === null || _c === void 0 ? void 0 : _c.disconnect();
      for (let dom of this.scrollTargets)
        dom.removeEventListener("scroll", this.onScroll);
      this.removeWindowListeners(this.win);
      clearTimeout(this.parentCheck);
      clearTimeout(this.resizeTimeout);
      this.win.cancelAnimationFrame(this.delayedFlush);
      this.win.cancelAnimationFrame(this.flushingAndroidKey);
    }
  }
  function findChild(cView, dom, dir) {
    while (dom) {
      let curView = ContentView.get(dom);
      if (curView && curView.parent == cView)
        return curView;
      let parent = dom.parentNode;
      dom = parent != cView.dom ? parent : dir > 0 ? dom.nextSibling : dom.previousSibling;
    }
    return null;
  }
  function safariSelectionRangeHack(view) {
    let found = null;
    function read(event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      found = event.getTargetRanges()[0];
    }
    view.contentDOM.addEventListener("beforeinput", read, true);
    view.dom.ownerDocument.execCommand("indent");
    view.contentDOM.removeEventListener("beforeinput", read, true);
    if (!found)
      return null;
    let anchorNode = found.startContainer, anchorOffset = found.startOffset;
    let focusNode = found.endContainer, focusOffset = found.endOffset;
    let curAnchor = view.docView.domAtPos(view.state.selection.main.anchor);
    if (isEquivalentPosition(curAnchor.node, curAnchor.offset, focusNode, focusOffset))
      [anchorNode, anchorOffset, focusNode, focusOffset] = [focusNode, focusOffset, anchorNode, anchorOffset];
    return { anchorNode, anchorOffset, focusNode, focusOffset };
  }
  class EditorView {
    /**
    The current editor state.
    */
    get state() {
      return this.viewState.state;
    }
    /**
    To be able to display large documents without consuming too much
    memory or overloading the browser, CodeMirror only draws the
    code that is visible (plus a margin around it) to the DOM. This
    property tells you the extent of the current drawn viewport, in
    document positions.
    */
    get viewport() {
      return this.viewState.viewport;
    }
    /**
    When there are, for example, large collapsed ranges in the
    viewport, its size can be a lot bigger than the actual visible
    content. Thus, if you are doing something like styling the
    content in the viewport, it is preferable to only do so for
    these ranges, which are the subset of the viewport that is
    actually drawn.
    */
    get visibleRanges() {
      return this.viewState.visibleRanges;
    }
    /**
    Returns false when the editor is entirely scrolled out of view
    or otherwise hidden.
    */
    get inView() {
      return this.viewState.inView;
    }
    /**
    Indicates whether the user is currently composing text via
    [IME](https://en.wikipedia.org/wiki/Input_method), and at least
    one change has been made in the current composition.
    */
    get composing() {
      return this.inputState.composing > 0;
    }
    /**
    Indicates whether the user is currently in composing state. Note
    that on some platforms, like Android, this will be the case a
    lot, since just putting the cursor on a word starts a
    composition there.
    */
    get compositionStarted() {
      return this.inputState.composing >= 0;
    }
    /**
    The document or shadow root that the view lives in.
    */
    get root() {
      return this._root;
    }
    /**
    @internal
    */
    get win() {
      return this.dom.ownerDocument.defaultView || window;
    }
    /**
    Construct a new view. You'll want to either provide a `parent`
    option, or put `view.dom` into your document after creating a
    view, so that the user can see the editor.
    */
    constructor(config = {}) {
      this.plugins = [];
      this.pluginMap = /* @__PURE__ */ new Map();
      this.editorAttrs = {};
      this.contentAttrs = {};
      this.bidiCache = [];
      this.destroyed = false;
      this.updateState = 2;
      this.measureScheduled = -1;
      this.measureRequests = [];
      this.contentDOM = document.createElement("div");
      this.scrollDOM = document.createElement("div");
      this.scrollDOM.tabIndex = -1;
      this.scrollDOM.className = "cm-scroller";
      this.scrollDOM.appendChild(this.contentDOM);
      this.announceDOM = document.createElement("div");
      this.announceDOM.className = "cm-announced";
      this.announceDOM.setAttribute("aria-live", "polite");
      this.dom = document.createElement("div");
      this.dom.appendChild(this.announceDOM);
      this.dom.appendChild(this.scrollDOM);
      if (config.parent)
        config.parent.appendChild(this.dom);
      let { dispatch } = config;
      this.dispatchTransactions = config.dispatchTransactions || dispatch && ((trs) => trs.forEach((tr) => dispatch(tr, this))) || ((trs) => this.update(trs));
      this.dispatch = this.dispatch.bind(this);
      this._root = config.root || getRoot(config.parent) || document;
      this.viewState = new ViewState(config.state || EditorState.create(config));
      if (config.scrollTo && config.scrollTo.is(scrollIntoView))
        this.viewState.scrollTarget = config.scrollTo.value.clip(this.viewState.state);
      this.plugins = this.state.facet(viewPlugin).map((spec) => new PluginInstance(spec));
      for (let plugin of this.plugins)
        plugin.update(this);
      this.observer = new DOMObserver(this);
      this.inputState = new InputState(this);
      this.inputState.ensureHandlers(this.plugins);
      this.docView = new DocView(this);
      this.mountStyles();
      this.updateAttrs();
      this.updateState = 0;
      this.requestMeasure();
    }
    dispatch(...input) {
      let trs = input.length == 1 && input[0] instanceof Transaction ? input : input.length == 1 && Array.isArray(input[0]) ? input[0] : [this.state.update(...input)];
      this.dispatchTransactions(trs, this);
    }
    /**
    Update the view for the given array of transactions. This will
    update the visible document and selection to match the state
    produced by the transactions, and notify view plugins of the
    change. You should usually call
    [`dispatch`](https://codemirror.net/6/docs/ref/#view.EditorView.dispatch) instead, which uses this
    as a primitive.
    */
    update(transactions) {
      if (this.updateState != 0)
        throw new Error("Calls to EditorView.update are not allowed while an update is in progress");
      let redrawn = false, attrsChanged = false, update;
      let state = this.state;
      for (let tr of transactions) {
        if (tr.startState != state)
          throw new RangeError("Trying to update state with a transaction that doesn't start from the previous state.");
        state = tr.state;
      }
      if (this.destroyed) {
        this.viewState.state = state;
        return;
      }
      let focus = this.hasFocus, focusFlag = 0, dispatchFocus = null;
      if (transactions.some((tr) => tr.annotation(isFocusChange))) {
        this.inputState.notifiedFocused = focus;
        focusFlag = 1;
      } else if (focus != this.inputState.notifiedFocused) {
        this.inputState.notifiedFocused = focus;
        dispatchFocus = focusChangeTransaction(state, focus);
        if (!dispatchFocus)
          focusFlag = 1;
      }
      let pendingKey = this.observer.delayedAndroidKey, domChange = null;
      if (pendingKey) {
        this.observer.clearDelayedAndroidKey();
        domChange = this.observer.readChange();
        if (domChange && !this.state.doc.eq(state.doc) || !this.state.selection.eq(state.selection))
          domChange = null;
      } else {
        this.observer.clear();
      }
      if (state.facet(EditorState.phrases) != this.state.facet(EditorState.phrases))
        return this.setState(state);
      update = ViewUpdate.create(this, state, transactions);
      update.flags |= focusFlag;
      let scrollTarget = this.viewState.scrollTarget;
      try {
        this.updateState = 2;
        for (let tr of transactions) {
          if (scrollTarget)
            scrollTarget = scrollTarget.map(tr.changes);
          if (tr.scrollIntoView) {
            let { main } = tr.state.selection;
            scrollTarget = new ScrollTarget(main.empty ? main : EditorSelection.cursor(main.head, main.head > main.anchor ? -1 : 1));
          }
          for (let e2 of tr.effects)
            if (e2.is(scrollIntoView))
              scrollTarget = e2.value.clip(this.state);
        }
        this.viewState.update(update, scrollTarget);
        this.bidiCache = CachedOrder.update(this.bidiCache, update.changes);
        if (!update.empty) {
          this.updatePlugins(update);
          this.inputState.update(update);
        }
        redrawn = this.docView.update(update);
        if (this.state.facet(styleModule) != this.styleModules)
          this.mountStyles();
        attrsChanged = this.updateAttrs();
        this.showAnnouncements(transactions);
        this.docView.updateSelection(redrawn, transactions.some((tr) => tr.isUserEvent("select.pointer")));
      } finally {
        this.updateState = 0;
      }
      if (update.startState.facet(theme) != update.state.facet(theme))
        this.viewState.mustMeasureContent = true;
      if (redrawn || attrsChanged || scrollTarget || this.viewState.mustEnforceCursorAssoc || this.viewState.mustMeasureContent)
        this.requestMeasure();
      if (!update.empty)
        for (let listener of this.state.facet(updateListener)) {
          try {
            listener(update);
          } catch (e2) {
            logException(this.state, e2, "update listener");
          }
        }
      if (dispatchFocus || domChange)
        Promise.resolve().then(() => {
          if (dispatchFocus && this.state == dispatchFocus.startState)
            this.dispatch(dispatchFocus);
          if (domChange) {
            if (!applyDOMChange(this, domChange) && pendingKey.force)
              dispatchKey(this.contentDOM, pendingKey.key, pendingKey.keyCode);
          }
        });
    }
    /**
    Reset the view to the given state. (This will cause the entire
    document to be redrawn and all view plugins to be reinitialized,
    so you should probably only use it when the new state isn't
    derived from the old state. Otherwise, use
    [`dispatch`](https://codemirror.net/6/docs/ref/#view.EditorView.dispatch) instead.)
    */
    setState(newState) {
      if (this.updateState != 0)
        throw new Error("Calls to EditorView.setState are not allowed while an update is in progress");
      if (this.destroyed) {
        this.viewState.state = newState;
        return;
      }
      this.updateState = 2;
      let hadFocus = this.hasFocus;
      try {
        for (let plugin of this.plugins)
          plugin.destroy(this);
        this.viewState = new ViewState(newState);
        this.plugins = newState.facet(viewPlugin).map((spec) => new PluginInstance(spec));
        this.pluginMap.clear();
        for (let plugin of this.plugins)
          plugin.update(this);
        this.docView.destroy();
        this.docView = new DocView(this);
        this.inputState.ensureHandlers(this.plugins);
        this.mountStyles();
        this.updateAttrs();
        this.bidiCache = [];
      } finally {
        this.updateState = 0;
      }
      if (hadFocus)
        this.focus();
      this.requestMeasure();
    }
    updatePlugins(update) {
      let prevSpecs = update.startState.facet(viewPlugin), specs = update.state.facet(viewPlugin);
      if (prevSpecs != specs) {
        let newPlugins = [];
        for (let spec of specs) {
          let found = prevSpecs.indexOf(spec);
          if (found < 0) {
            newPlugins.push(new PluginInstance(spec));
          } else {
            let plugin = this.plugins[found];
            plugin.mustUpdate = update;
            newPlugins.push(plugin);
          }
        }
        for (let plugin of this.plugins)
          if (plugin.mustUpdate != update)
            plugin.destroy(this);
        this.plugins = newPlugins;
        this.pluginMap.clear();
      } else {
        for (let p2 of this.plugins)
          p2.mustUpdate = update;
      }
      for (let i2 = 0; i2 < this.plugins.length; i2++)
        this.plugins[i2].update(this);
      if (prevSpecs != specs)
        this.inputState.ensureHandlers(this.plugins);
    }
    /**
    @internal
    */
    measure(flush = true) {
      if (this.destroyed)
        return;
      if (this.measureScheduled > -1)
        this.win.cancelAnimationFrame(this.measureScheduled);
      if (this.observer.delayedAndroidKey) {
        this.measureScheduled = -1;
        this.requestMeasure();
        return;
      }
      this.measureScheduled = 0;
      if (flush)
        this.observer.forceFlush();
      let updated = null;
      let sDOM = this.scrollDOM, scrollTop = sDOM.scrollTop * this.scaleY;
      let { scrollAnchorPos, scrollAnchorHeight } = this.viewState;
      if (Math.abs(scrollTop - this.viewState.scrollTop) > 1)
        scrollAnchorHeight = -1;
      this.viewState.scrollAnchorHeight = -1;
      try {
        for (let i2 = 0; ; i2++) {
          if (scrollAnchorHeight < 0) {
            if (isScrolledToBottom(sDOM)) {
              scrollAnchorPos = -1;
              scrollAnchorHeight = this.viewState.heightMap.height;
            } else {
              let block = this.viewState.scrollAnchorAt(scrollTop);
              scrollAnchorPos = block.from;
              scrollAnchorHeight = block.top;
            }
          }
          this.updateState = 1;
          let changed = this.viewState.measure(this);
          if (!changed && !this.measureRequests.length && this.viewState.scrollTarget == null)
            break;
          if (i2 > 5) {
            console.warn(this.measureRequests.length ? "Measure loop restarted more than 5 times" : "Viewport failed to stabilize");
            break;
          }
          let measuring = [];
          if (!(changed & 4))
            [this.measureRequests, measuring] = [measuring, this.measureRequests];
          let measured = measuring.map((m2) => {
            try {
              return m2.read(this);
            } catch (e2) {
              logException(this.state, e2);
              return BadMeasure;
            }
          });
          let update = ViewUpdate.create(this, this.state, []), redrawn = false;
          update.flags |= changed;
          if (!updated)
            updated = update;
          else
            updated.flags |= changed;
          this.updateState = 2;
          if (!update.empty) {
            this.updatePlugins(update);
            this.inputState.update(update);
            this.updateAttrs();
            redrawn = this.docView.update(update);
          }
          for (let i3 = 0; i3 < measuring.length; i3++)
            if (measured[i3] != BadMeasure) {
              try {
                let m2 = measuring[i3];
                if (m2.write)
                  m2.write(measured[i3], this);
              } catch (e2) {
                logException(this.state, e2);
              }
            }
          if (redrawn)
            this.docView.updateSelection(true);
          if (!update.viewportChanged && this.measureRequests.length == 0) {
            if (this.viewState.editorHeight) {
              if (this.viewState.scrollTarget) {
                this.docView.scrollIntoView(this.viewState.scrollTarget);
                this.viewState.scrollTarget = null;
                scrollAnchorHeight = -1;
                continue;
              } else {
                let newAnchorHeight = scrollAnchorPos < 0 ? this.viewState.heightMap.height : this.viewState.lineBlockAt(scrollAnchorPos).top;
                let diff = newAnchorHeight - scrollAnchorHeight;
                if (diff > 1 || diff < -1) {
                  scrollTop = scrollTop + diff;
                  sDOM.scrollTop = scrollTop / this.scaleY;
                  scrollAnchorHeight = -1;
                  continue;
                }
              }
            }
            break;
          }
        }
      } finally {
        this.updateState = 0;
        this.measureScheduled = -1;
      }
      if (updated && !updated.empty)
        for (let listener of this.state.facet(updateListener))
          listener(updated);
    }
    /**
    Get the CSS classes for the currently active editor themes.
    */
    get themeClasses() {
      return baseThemeID + " " + (this.state.facet(darkTheme) ? baseDarkID : baseLightID) + " " + this.state.facet(theme);
    }
    updateAttrs() {
      let editorAttrs = attrsFromFacet(this, editorAttributes, {
        class: "cm-editor" + (this.hasFocus ? " cm-focused " : " ") + this.themeClasses
      });
      let contentAttrs = {
        spellcheck: "false",
        autocorrect: "off",
        autocapitalize: "off",
        translate: "no",
        contenteditable: !this.state.facet(editable) ? "false" : "true",
        class: "cm-content",
        style: `${browser.tabSize}: ${this.state.tabSize}`,
        role: "textbox",
        "aria-multiline": "true"
      };
      if (this.state.readOnly)
        contentAttrs["aria-readonly"] = "true";
      attrsFromFacet(this, contentAttributes, contentAttrs);
      let changed = this.observer.ignore(() => {
        let changedContent = updateAttrs(this.contentDOM, this.contentAttrs, contentAttrs);
        let changedEditor = updateAttrs(this.dom, this.editorAttrs, editorAttrs);
        return changedContent || changedEditor;
      });
      this.editorAttrs = editorAttrs;
      this.contentAttrs = contentAttrs;
      return changed;
    }
    showAnnouncements(trs) {
      let first = true;
      for (let tr of trs)
        for (let effect of tr.effects)
          if (effect.is(EditorView.announce)) {
            if (first)
              this.announceDOM.textContent = "";
            first = false;
            let div = this.announceDOM.appendChild(document.createElement("div"));
            div.textContent = effect.value;
          }
    }
    mountStyles() {
      this.styleModules = this.state.facet(styleModule);
      let nonce = this.state.facet(EditorView.cspNonce);
      StyleModule.mount(this.root, this.styleModules.concat(baseTheme$1).reverse(), nonce ? { nonce } : void 0);
    }
    readMeasured() {
      if (this.updateState == 2)
        throw new Error("Reading the editor layout isn't allowed during an update");
      if (this.updateState == 0 && this.measureScheduled > -1)
        this.measure(false);
    }
    /**
    Schedule a layout measurement, optionally providing callbacks to
    do custom DOM measuring followed by a DOM write phase. Using
    this is preferable reading DOM layout directly from, for
    example, an event handler, because it'll make sure measuring and
    drawing done by other components is synchronized, avoiding
    unnecessary DOM layout computations.
    */
    requestMeasure(request) {
      if (this.measureScheduled < 0)
        this.measureScheduled = this.win.requestAnimationFrame(() => this.measure());
      if (request) {
        if (this.measureRequests.indexOf(request) > -1)
          return;
        if (request.key != null)
          for (let i2 = 0; i2 < this.measureRequests.length; i2++) {
            if (this.measureRequests[i2].key === request.key) {
              this.measureRequests[i2] = request;
              return;
            }
          }
        this.measureRequests.push(request);
      }
    }
    /**
    Get the value of a specific plugin, if present. Note that
    plugins that crash can be dropped from a view, so even when you
    know you registered a given plugin, it is recommended to check
    the return value of this method.
    */
    plugin(plugin) {
      let known = this.pluginMap.get(plugin);
      if (known === void 0 || known && known.spec != plugin)
        this.pluginMap.set(plugin, known = this.plugins.find((p2) => p2.spec == plugin) || null);
      return known && known.update(this).value;
    }
    /**
    The top position of the document, in screen coordinates. This
    may be negative when the editor is scrolled down. Points
    directly to the top of the first line, not above the padding.
    */
    get documentTop() {
      return this.contentDOM.getBoundingClientRect().top + this.viewState.paddingTop;
    }
    /**
    Reports the padding above and below the document.
    */
    get documentPadding() {
      return { top: this.viewState.paddingTop, bottom: this.viewState.paddingBottom };
    }
    /**
    If the editor is transformed with CSS, this provides the scale
    along the X axis. Otherwise, it will just be 1. Note that
    transforms other than translation and scaling are not supported.
    */
    get scaleX() {
      return this.viewState.scaleX;
    }
    /**
    Provide the CSS transformed scale along the Y axis.
    */
    get scaleY() {
      return this.viewState.scaleY;
    }
    /**
    Find the text line or block widget at the given vertical
    position (which is interpreted as relative to the [top of the
    document](https://codemirror.net/6/docs/ref/#view.EditorView.documentTop)).
    */
    elementAtHeight(height) {
      this.readMeasured();
      return this.viewState.elementAtHeight(height);
    }
    /**
    Find the line block (see
    [`lineBlockAt`](https://codemirror.net/6/docs/ref/#view.EditorView.lineBlockAt) at the given
    height, again interpreted relative to the [top of the
    document](https://codemirror.net/6/docs/ref/#view.EditorView.documentTop).
    */
    lineBlockAtHeight(height) {
      this.readMeasured();
      return this.viewState.lineBlockAtHeight(height);
    }
    /**
    Get the extent and vertical position of all [line
    blocks](https://codemirror.net/6/docs/ref/#view.EditorView.lineBlockAt) in the viewport. Positions
    are relative to the [top of the
    document](https://codemirror.net/6/docs/ref/#view.EditorView.documentTop);
    */
    get viewportLineBlocks() {
      return this.viewState.viewportLines;
    }
    /**
    Find the line block around the given document position. A line
    block is a range delimited on both sides by either a
    non-[hidden](https://codemirror.net/6/docs/ref/#view.Decoration^replace) line breaks, or the
    start/end of the document. It will usually just hold a line of
    text, but may be broken into multiple textblocks by block
    widgets.
    */
    lineBlockAt(pos) {
      return this.viewState.lineBlockAt(pos);
    }
    /**
    The editor's total content height.
    */
    get contentHeight() {
      return this.viewState.contentHeight;
    }
    /**
    Move a cursor position by [grapheme
    cluster](https://codemirror.net/6/docs/ref/#state.findClusterBreak). `forward` determines whether
    the motion is away from the line start, or towards it. In
    bidirectional text, the line is traversed in visual order, using
    the editor's [text direction](https://codemirror.net/6/docs/ref/#view.EditorView.textDirection).
    When the start position was the last one on the line, the
    returned position will be across the line break. If there is no
    further line, the original position is returned.
    
    By default, this method moves over a single cluster. The
    optional `by` argument can be used to move across more. It will
    be called with the first cluster as argument, and should return
    a predicate that determines, for each subsequent cluster,
    whether it should also be moved over.
    */
    moveByChar(start, forward, by) {
      return skipAtoms(this, start, moveByChar(this, start, forward, by));
    }
    /**
    Move a cursor position across the next group of either
    [letters](https://codemirror.net/6/docs/ref/#state.EditorState.charCategorizer) or non-letter
    non-whitespace characters.
    */
    moveByGroup(start, forward) {
      return skipAtoms(this, start, moveByChar(this, start, forward, (initial) => byGroup(this, start.head, initial)));
    }
    /**
    Get the cursor position visually at the start or end of a line.
    Note that this may differ from the _logical_ position at its
    start or end (which is simply at `line.from`/`line.to`) if text
    at the start or end goes against the line's base text direction.
    */
    visualLineSide(line, end) {
      let order = this.bidiSpans(line), dir = this.textDirectionAt(line.from);
      let span = order[end ? order.length - 1 : 0];
      return EditorSelection.cursor(span.side(end, dir) + line.from, span.forward(!end, dir) ? 1 : -1);
    }
    /**
    Move to the next line boundary in the given direction. If
    `includeWrap` is true, line wrapping is on, and there is a
    further wrap point on the current line, the wrap point will be
    returned. Otherwise this function will return the start or end
    of the line.
    */
    moveToLineBoundary(start, forward, includeWrap = true) {
      return moveToLineBoundary(this, start, forward, includeWrap);
    }
    /**
    Move a cursor position vertically. When `distance` isn't given,
    it defaults to moving to the next line (including wrapped
    lines). Otherwise, `distance` should provide a positive distance
    in pixels.
    
    When `start` has a
    [`goalColumn`](https://codemirror.net/6/docs/ref/#state.SelectionRange.goalColumn), the vertical
    motion will use that as a target horizontal position. Otherwise,
    the cursor's own horizontal position is used. The returned
    cursor will have its goal column set to whichever column was
    used.
    */
    moveVertically(start, forward, distance) {
      return skipAtoms(this, start, moveVertically(this, start, forward, distance));
    }
    /**
    Find the DOM parent node and offset (child offset if `node` is
    an element, character offset when it is a text node) at the
    given document position.
    
    Note that for positions that aren't currently in
    `visibleRanges`, the resulting DOM position isn't necessarily
    meaningful (it may just point before or after a placeholder
    element).
    */
    domAtPos(pos) {
      return this.docView.domAtPos(pos);
    }
    /**
    Find the document position at the given DOM node. Can be useful
    for associating positions with DOM events. Will raise an error
    when `node` isn't part of the editor content.
    */
    posAtDOM(node, offset = 0) {
      return this.docView.posFromDOM(node, offset);
    }
    posAtCoords(coords, precise = true) {
      this.readMeasured();
      return posAtCoords(this, coords, precise);
    }
    /**
    Get the screen coordinates at the given document position.
    `side` determines whether the coordinates are based on the
    element before (-1) or after (1) the position (if no element is
    available on the given side, the method will transparently use
    another strategy to get reasonable coordinates).
    */
    coordsAtPos(pos, side = 1) {
      this.readMeasured();
      let rect = this.docView.coordsAt(pos, side);
      if (!rect || rect.left == rect.right)
        return rect;
      let line = this.state.doc.lineAt(pos), order = this.bidiSpans(line);
      let span = order[BidiSpan.find(order, pos - line.from, -1, side)];
      return flattenRect(rect, span.dir == Direction.LTR == side > 0);
    }
    /**
    Return the rectangle around a given character. If `pos` does not
    point in front of a character that is in the viewport and
    rendered (i.e. not replaced, not a line break), this will return
    null. For space characters that are a line wrap point, this will
    return the position before the line break.
    */
    coordsForChar(pos) {
      this.readMeasured();
      return this.docView.coordsForChar(pos);
    }
    /**
    The default width of a character in the editor. May not
    accurately reflect the width of all characters (given variable
    width fonts or styling of invididual ranges).
    */
    get defaultCharacterWidth() {
      return this.viewState.heightOracle.charWidth;
    }
    /**
    The default height of a line in the editor. May not be accurate
    for all lines.
    */
    get defaultLineHeight() {
      return this.viewState.heightOracle.lineHeight;
    }
    /**
    The text direction
    ([`direction`](https://developer.mozilla.org/en-US/docs/Web/CSS/direction)
    CSS property) of the editor's content element.
    */
    get textDirection() {
      return this.viewState.defaultTextDirection;
    }
    /**
    Find the text direction of the block at the given position, as
    assigned by CSS. If
    [`perLineTextDirection`](https://codemirror.net/6/docs/ref/#view.EditorView^perLineTextDirection)
    isn't enabled, or the given position is outside of the viewport,
    this will always return the same as
    [`textDirection`](https://codemirror.net/6/docs/ref/#view.EditorView.textDirection). Note that
    this may trigger a DOM layout.
    */
    textDirectionAt(pos) {
      let perLine = this.state.facet(perLineTextDirection);
      if (!perLine || pos < this.viewport.from || pos > this.viewport.to)
        return this.textDirection;
      this.readMeasured();
      return this.docView.textDirectionAt(pos);
    }
    /**
    Whether this editor [wraps lines](https://codemirror.net/6/docs/ref/#view.EditorView.lineWrapping)
    (as determined by the
    [`white-space`](https://developer.mozilla.org/en-US/docs/Web/CSS/white-space)
    CSS property of its content element).
    */
    get lineWrapping() {
      return this.viewState.heightOracle.lineWrapping;
    }
    /**
    Returns the bidirectional text structure of the given line
    (which should be in the current document) as an array of span
    objects. The order of these spans matches the [text
    direction](https://codemirror.net/6/docs/ref/#view.EditorView.textDirection)—if that is
    left-to-right, the leftmost spans come first, otherwise the
    rightmost spans come first.
    */
    bidiSpans(line) {
      if (line.length > MaxBidiLine)
        return trivialOrder(line.length);
      let dir = this.textDirectionAt(line.from), isolates;
      for (let entry of this.bidiCache) {
        if (entry.from == line.from && entry.dir == dir && (entry.fresh || isolatesEq(entry.isolates, isolates = getIsolatedRanges(this, line))))
          return entry.order;
      }
      if (!isolates)
        isolates = getIsolatedRanges(this, line);
      let order = computeOrder(line.text, dir, isolates);
      this.bidiCache.push(new CachedOrder(line.from, line.to, dir, isolates, true, order));
      return order;
    }
    /**
    Check whether the editor has focus.
    */
    get hasFocus() {
      var _a3;
      return (this.dom.ownerDocument.hasFocus() || browser.safari && ((_a3 = this.inputState) === null || _a3 === void 0 ? void 0 : _a3.lastContextMenu) > Date.now() - 3e4) && this.root.activeElement == this.contentDOM;
    }
    /**
    Put focus on the editor.
    */
    focus() {
      this.observer.ignore(() => {
        focusPreventScroll(this.contentDOM);
        this.docView.updateSelection();
      });
    }
    /**
    Update the [root](https://codemirror.net/6/docs/ref/##view.EditorViewConfig.root) in which the editor lives. This is only
    necessary when moving the editor's existing DOM to a new window or shadow root.
    */
    setRoot(root) {
      if (this._root != root) {
        this._root = root;
        this.observer.setWindow((root.nodeType == 9 ? root : root.ownerDocument).defaultView || window);
        this.mountStyles();
      }
    }
    /**
    Clean up this editor view, removing its element from the
    document, unregistering event handlers, and notifying
    plugins. The view instance can no longer be used after
    calling this.
    */
    destroy() {
      for (let plugin of this.plugins)
        plugin.destroy(this);
      this.plugins = [];
      this.inputState.destroy();
      this.docView.destroy();
      this.dom.remove();
      this.observer.destroy();
      if (this.measureScheduled > -1)
        this.win.cancelAnimationFrame(this.measureScheduled);
      this.destroyed = true;
    }
    /**
    Returns an effect that can be
    [added](https://codemirror.net/6/docs/ref/#state.TransactionSpec.effects) to a transaction to
    cause it to scroll the given position or range into view.
    */
    static scrollIntoView(pos, options = {}) {
      return scrollIntoView.of(new ScrollTarget(typeof pos == "number" ? EditorSelection.cursor(pos) : pos, options.y, options.x, options.yMargin, options.xMargin));
    }
    /**
    Return an effect that resets the editor to its current (at the
    time this method was called) scroll position. Note that this
    only affects the editor's own scrollable element, not parents.
    See also
    [`EditorViewConfig.scrollTo`](https://codemirror.net/6/docs/ref/#view.EditorViewConfig.scrollTo).
    
    The effect should be used with a document identical to the one
    it was created for. Failing to do so is not an error, but may
    not scroll to the expected position. You can
    [map](https://codemirror.net/6/docs/ref/#state.StateEffect.map) the effect to account for changes.
    */
    scrollSnapshot() {
      let { scrollTop, scrollLeft } = this.scrollDOM;
      let ref = this.viewState.scrollAnchorAt(scrollTop);
      return scrollIntoView.of(new ScrollTarget(EditorSelection.cursor(ref.from), "start", "start", ref.top - scrollTop, scrollLeft, true));
    }
    /**
    Returns an extension that can be used to add DOM event handlers.
    The value should be an object mapping event names to handler
    functions. For any given event, such functions are ordered by
    extension precedence, and the first handler to return true will
    be assumed to have handled that event, and no other handlers or
    built-in behavior will be activated for it. These are registered
    on the [content element](https://codemirror.net/6/docs/ref/#view.EditorView.contentDOM), except
    for `scroll` handlers, which will be called any time the
    editor's [scroll element](https://codemirror.net/6/docs/ref/#view.EditorView.scrollDOM) or one of
    its parent nodes is scrolled.
    */
    static domEventHandlers(handlers2) {
      return ViewPlugin.define(() => ({}), { eventHandlers: handlers2 });
    }
    /**
    Create an extension that registers DOM event observers. Contrary
    to event [handlers](https://codemirror.net/6/docs/ref/#view.EditorView^domEventHandlers),
    observers can't be prevented from running by a higher-precedence
    handler returning true. They also don't prevent other handlers
    and observers from running when they return true, and should not
    call `preventDefault`.
    */
    static domEventObservers(observers2) {
      return ViewPlugin.define(() => ({}), { eventObservers: observers2 });
    }
    /**
    Create a theme extension. The first argument can be a
    [`style-mod`](https://github.com/marijnh/style-mod#documentation)
    style spec providing the styles for the theme. These will be
    prefixed with a generated class for the style.
    
    Because the selectors will be prefixed with a scope class, rule
    that directly match the editor's [wrapper
    element](https://codemirror.net/6/docs/ref/#view.EditorView.dom)—to which the scope class will be
    added—need to be explicitly differentiated by adding an `&` to
    the selector for that element—for example
    `&.cm-focused`.
    
    When `dark` is set to true, the theme will be marked as dark,
    which will cause the `&dark` rules from [base
    themes](https://codemirror.net/6/docs/ref/#view.EditorView^baseTheme) to be used (as opposed to
    `&light` when a light theme is active).
    */
    static theme(spec, options) {
      let prefix = StyleModule.newName();
      let result = [theme.of(prefix), styleModule.of(buildTheme(`.${prefix}`, spec))];
      if (options && options.dark)
        result.push(darkTheme.of(true));
      return result;
    }
    /**
    Create an extension that adds styles to the base theme. Like
    with [`theme`](https://codemirror.net/6/docs/ref/#view.EditorView^theme), use `&` to indicate the
    place of the editor wrapper element when directly targeting
    that. You can also use `&dark` or `&light` instead to only
    target editors with a dark or light theme.
    */
    static baseTheme(spec) {
      return Prec.lowest(styleModule.of(buildTheme("." + baseThemeID, spec, lightDarkIDs)));
    }
    /**
    Retrieve an editor view instance from the view's DOM
    representation.
    */
    static findFromDOM(dom) {
      var _a3;
      let content2 = dom.querySelector(".cm-content");
      let cView = content2 && ContentView.get(content2) || ContentView.get(dom);
      return ((_a3 = cView === null || cView === void 0 ? void 0 : cView.rootView) === null || _a3 === void 0 ? void 0 : _a3.view) || null;
    }
  }
  EditorView.styleModule = styleModule;
  EditorView.inputHandler = inputHandler;
  EditorView.focusChangeEffect = focusChangeEffect;
  EditorView.perLineTextDirection = perLineTextDirection;
  EditorView.exceptionSink = exceptionSink;
  EditorView.updateListener = updateListener;
  EditorView.editable = editable;
  EditorView.mouseSelectionStyle = mouseSelectionStyle;
  EditorView.dragMovesSelection = dragMovesSelection$1;
  EditorView.clickAddsSelectionRange = clickAddsSelectionRange;
  EditorView.decorations = decorations;
  EditorView.outerDecorations = outerDecorations;
  EditorView.atomicRanges = atomicRanges;
  EditorView.bidiIsolatedRanges = bidiIsolatedRanges;
  EditorView.scrollMargins = scrollMargins;
  EditorView.darkTheme = darkTheme;
  EditorView.cspNonce = /* @__PURE__ */ Facet.define({ combine: (values) => values.length ? values[0] : "" });
  EditorView.contentAttributes = contentAttributes;
  EditorView.editorAttributes = editorAttributes;
  EditorView.lineWrapping = /* @__PURE__ */ EditorView.contentAttributes.of({ "class": "cm-lineWrapping" });
  EditorView.announce = /* @__PURE__ */ StateEffect.define();
  const MaxBidiLine = 4096;
  const BadMeasure = {};
  class CachedOrder {
    constructor(from, to, dir, isolates, fresh, order) {
      this.from = from;
      this.to = to;
      this.dir = dir;
      this.isolates = isolates;
      this.fresh = fresh;
      this.order = order;
    }
    static update(cache, changes) {
      if (changes.empty && !cache.some((c2) => c2.fresh))
        return cache;
      let result = [], lastDir = cache.length ? cache[cache.length - 1].dir : Direction.LTR;
      for (let i2 = Math.max(0, cache.length - 10); i2 < cache.length; i2++) {
        let entry = cache[i2];
        if (entry.dir == lastDir && !changes.touchesRange(entry.from, entry.to))
          result.push(new CachedOrder(changes.mapPos(entry.from, 1), changes.mapPos(entry.to, -1), entry.dir, entry.isolates, false, entry.order));
      }
      return result;
    }
  }
  function attrsFromFacet(view, facet, base2) {
    for (let sources = view.state.facet(facet), i2 = sources.length - 1; i2 >= 0; i2--) {
      let source = sources[i2], value = typeof source == "function" ? source(view) : source;
      if (value)
        combineAttrs(value, base2);
    }
    return base2;
  }
  const currentPlatform = browser.mac ? "mac" : browser.windows ? "win" : browser.linux ? "linux" : "key";
  function normalizeKeyName(name2, platform) {
    const parts = name2.split(/-(?!$)/);
    let result = parts[parts.length - 1];
    if (result == "Space")
      result = " ";
    let alt, ctrl, shift2, meta2;
    for (let i2 = 0; i2 < parts.length - 1; ++i2) {
      const mod = parts[i2];
      if (/^(cmd|meta|m)$/i.test(mod))
        meta2 = true;
      else if (/^a(lt)?$/i.test(mod))
        alt = true;
      else if (/^(c|ctrl|control)$/i.test(mod))
        ctrl = true;
      else if (/^s(hift)?$/i.test(mod))
        shift2 = true;
      else if (/^mod$/i.test(mod)) {
        if (platform == "mac")
          meta2 = true;
        else
          ctrl = true;
      } else
        throw new Error("Unrecognized modifier name: " + mod);
    }
    if (alt)
      result = "Alt-" + result;
    if (ctrl)
      result = "Ctrl-" + result;
    if (meta2)
      result = "Meta-" + result;
    if (shift2)
      result = "Shift-" + result;
    return result;
  }
  function modifiers(name2, event, shift2) {
    if (event.altKey)
      name2 = "Alt-" + name2;
    if (event.ctrlKey)
      name2 = "Ctrl-" + name2;
    if (event.metaKey)
      name2 = "Meta-" + name2;
    if (shift2 !== false && event.shiftKey)
      name2 = "Shift-" + name2;
    return name2;
  }
  const handleKeyEvents = /* @__PURE__ */ Prec.default(/* @__PURE__ */ EditorView.domEventHandlers({
    keydown(event, view) {
      return runHandlers(getKeymap(view.state), event, view, "editor");
    }
  }));
  const keymap = /* @__PURE__ */ Facet.define({ enables: handleKeyEvents });
  const Keymaps = /* @__PURE__ */ new WeakMap();
  function getKeymap(state) {
    let bindings = state.facet(keymap);
    let map = Keymaps.get(bindings);
    if (!map)
      Keymaps.set(bindings, map = buildKeymap(bindings.reduce((a2, b2) => a2.concat(b2), [])));
    return map;
  }
  let storedPrefix = null;
  const PrefixTimeout = 4e3;
  function buildKeymap(bindings, platform = currentPlatform) {
    let bound = /* @__PURE__ */ Object.create(null);
    let isPrefix = /* @__PURE__ */ Object.create(null);
    let checkPrefix = (name2, is) => {
      let current = isPrefix[name2];
      if (current == null)
        isPrefix[name2] = is;
      else if (current != is)
        throw new Error("Key binding " + name2 + " is used both as a regular binding and as a multi-stroke prefix");
    };
    let add = (scope, key, command2, preventDefault, stopPropagation) => {
      var _a3, _b2;
      let scopeObj = bound[scope] || (bound[scope] = /* @__PURE__ */ Object.create(null));
      let parts = key.split(/ (?!$)/).map((k2) => normalizeKeyName(k2, platform));
      for (let i2 = 1; i2 < parts.length; i2++) {
        let prefix = parts.slice(0, i2).join(" ");
        checkPrefix(prefix, true);
        if (!scopeObj[prefix])
          scopeObj[prefix] = {
            preventDefault: true,
            stopPropagation: false,
            run: [(view) => {
              let ourObj = storedPrefix = { view, prefix, scope };
              setTimeout(() => {
                if (storedPrefix == ourObj)
                  storedPrefix = null;
              }, PrefixTimeout);
              return true;
            }]
          };
      }
      let full = parts.join(" ");
      checkPrefix(full, false);
      let binding = scopeObj[full] || (scopeObj[full] = {
        preventDefault: false,
        stopPropagation: false,
        run: ((_b2 = (_a3 = scopeObj._any) === null || _a3 === void 0 ? void 0 : _a3.run) === null || _b2 === void 0 ? void 0 : _b2.slice()) || []
      });
      if (command2)
        binding.run.push(command2);
      if (preventDefault)
        binding.preventDefault = true;
      if (stopPropagation)
        binding.stopPropagation = true;
    };
    for (let b2 of bindings) {
      let scopes = b2.scope ? b2.scope.split(" ") : ["editor"];
      if (b2.any)
        for (let scope of scopes) {
          let scopeObj = bound[scope] || (bound[scope] = /* @__PURE__ */ Object.create(null));
          if (!scopeObj._any)
            scopeObj._any = { preventDefault: false, stopPropagation: false, run: [] };
          for (let key in scopeObj)
            scopeObj[key].run.push(b2.any);
        }
      let name2 = b2[platform] || b2.key;
      if (!name2)
        continue;
      for (let scope of scopes) {
        add(scope, name2, b2.run, b2.preventDefault, b2.stopPropagation);
        if (b2.shift)
          add(scope, "Shift-" + name2, b2.shift, b2.preventDefault, b2.stopPropagation);
      }
    }
    return bound;
  }
  function runHandlers(map, event, view, scope) {
    let name2 = keyName(event);
    let charCode = codePointAt(name2, 0), isChar = codePointSize(charCode) == name2.length && name2 != " ";
    let prefix = "", handled = false, prevented = false, stopPropagation = false;
    if (storedPrefix && storedPrefix.view == view && storedPrefix.scope == scope) {
      prefix = storedPrefix.prefix + " ";
      if (modifierCodes.indexOf(event.keyCode) < 0) {
        prevented = true;
        storedPrefix = null;
      }
    }
    let ran = /* @__PURE__ */ new Set();
    let runFor = (binding) => {
      if (binding) {
        for (let cmd2 of binding.run)
          if (!ran.has(cmd2)) {
            ran.add(cmd2);
            if (cmd2(view, event)) {
              if (binding.stopPropagation)
                stopPropagation = true;
              return true;
            }
          }
        if (binding.preventDefault) {
          if (binding.stopPropagation)
            stopPropagation = true;
          prevented = true;
        }
      }
      return false;
    };
    let scopeObj = map[scope], baseName, shiftName;
    if (scopeObj) {
      if (runFor(scopeObj[prefix + modifiers(name2, event, !isChar)])) {
        handled = true;
      } else if (isChar && (event.altKey || event.metaKey || event.ctrlKey) && // Ctrl-Alt may be used for AltGr on Windows
      !(browser.windows && event.ctrlKey && event.altKey) && (baseName = base[event.keyCode]) && baseName != name2) {
        if (runFor(scopeObj[prefix + modifiers(baseName, event, true)])) {
          handled = true;
        } else if (event.shiftKey && (shiftName = shift[event.keyCode]) != name2 && shiftName != baseName && runFor(scopeObj[prefix + modifiers(shiftName, event, false)])) {
          handled = true;
        }
      } else if (isChar && event.shiftKey && runFor(scopeObj[prefix + modifiers(name2, event, true)])) {
        handled = true;
      }
      if (!handled && runFor(scopeObj._any))
        handled = true;
    }
    if (prevented)
      handled = true;
    if (handled && stopPropagation)
      event.stopPropagation();
    return handled;
  }
  class RectangleMarker {
    /**
    Create a marker with the given class and dimensions. If `width`
    is null, the DOM element will get no width style.
    */
    constructor(className, left, top2, width, height) {
      this.className = className;
      this.left = left;
      this.top = top2;
      this.width = width;
      this.height = height;
    }
    draw() {
      let elt = document.createElement("div");
      elt.className = this.className;
      this.adjust(elt);
      return elt;
    }
    update(elt, prev) {
      if (prev.className != this.className)
        return false;
      this.adjust(elt);
      return true;
    }
    adjust(elt) {
      elt.style.left = this.left + "px";
      elt.style.top = this.top + "px";
      if (this.width != null)
        elt.style.width = this.width + "px";
      elt.style.height = this.height + "px";
    }
    eq(p2) {
      return this.left == p2.left && this.top == p2.top && this.width == p2.width && this.height == p2.height && this.className == p2.className;
    }
    /**
    Create a set of rectangles for the given selection range,
    assigning them theclass`className`. Will create a single
    rectangle for empty ranges, and a set of selection-style
    rectangles covering the range's content (in a bidi-aware
    way) for non-empty ones.
    */
    static forRange(view, className, range) {
      if (range.empty) {
        let pos = view.coordsAtPos(range.head, range.assoc || 1);
        if (!pos)
          return [];
        let base2 = getBase(view);
        return [new RectangleMarker(className, pos.left - base2.left, pos.top - base2.top, null, pos.bottom - pos.top)];
      } else {
        return rectanglesForRange(view, className, range);
      }
    }
  }
  function getBase(view) {
    let rect = view.scrollDOM.getBoundingClientRect();
    let left = view.textDirection == Direction.LTR ? rect.left : rect.right - view.scrollDOM.clientWidth * view.scaleX;
    return { left: left - view.scrollDOM.scrollLeft * view.scaleX, top: rect.top - view.scrollDOM.scrollTop * view.scaleY };
  }
  function wrappedLine(view, pos, inside2) {
    let range = EditorSelection.cursor(pos);
    return {
      from: Math.max(inside2.from, view.moveToLineBoundary(range, false, true).from),
      to: Math.min(inside2.to, view.moveToLineBoundary(range, true, true).from),
      type: BlockType.Text
    };
  }
  function rectanglesForRange(view, className, range) {
    if (range.to <= view.viewport.from || range.from >= view.viewport.to)
      return [];
    let from = Math.max(range.from, view.viewport.from), to = Math.min(range.to, view.viewport.to);
    let ltr = view.textDirection == Direction.LTR;
    let content2 = view.contentDOM, contentRect = content2.getBoundingClientRect(), base2 = getBase(view);
    let lineElt = content2.querySelector(".cm-line"), lineStyle = lineElt && window.getComputedStyle(lineElt);
    let leftSide = contentRect.left + (lineStyle ? parseInt(lineStyle.paddingLeft) + Math.min(0, parseInt(lineStyle.textIndent)) : 0);
    let rightSide = contentRect.right - (lineStyle ? parseInt(lineStyle.paddingRight) : 0);
    let startBlock = blockAt(view, from), endBlock = blockAt(view, to);
    let visualStart = startBlock.type == BlockType.Text ? startBlock : null;
    let visualEnd = endBlock.type == BlockType.Text ? endBlock : null;
    if (visualStart && (view.lineWrapping || startBlock.widgetLineBreaks))
      visualStart = wrappedLine(view, from, visualStart);
    if (visualEnd && (view.lineWrapping || endBlock.widgetLineBreaks))
      visualEnd = wrappedLine(view, to, visualEnd);
    if (visualStart && visualEnd && visualStart.from == visualEnd.from) {
      return pieces(drawForLine(range.from, range.to, visualStart));
    } else {
      let top2 = visualStart ? drawForLine(range.from, null, visualStart) : drawForWidget(startBlock, false);
      let bottom = visualEnd ? drawForLine(null, range.to, visualEnd) : drawForWidget(endBlock, true);
      let between = [];
      if ((visualStart || startBlock).to < (visualEnd || endBlock).from - (visualStart && visualEnd ? 1 : 0) || startBlock.widgetLineBreaks > 1 && top2.bottom + view.defaultLineHeight / 2 < bottom.top)
        between.push(piece(leftSide, top2.bottom, rightSide, bottom.top));
      else if (top2.bottom < bottom.top && view.elementAtHeight((top2.bottom + bottom.top) / 2).type == BlockType.Text)
        top2.bottom = bottom.top = (top2.bottom + bottom.top) / 2;
      return pieces(top2).concat(between).concat(pieces(bottom));
    }
    function piece(left, top2, right, bottom) {
      return new RectangleMarker(
        className,
        left - base2.left,
        top2 - base2.top - 0.01,
        right - left,
        bottom - top2 + 0.01
        /* C.Epsilon */
      );
    }
    function pieces({ top: top2, bottom, horizontal }) {
      let pieces2 = [];
      for (let i2 = 0; i2 < horizontal.length; i2 += 2)
        pieces2.push(piece(horizontal[i2], top2, horizontal[i2 + 1], bottom));
      return pieces2;
    }
    function drawForLine(from2, to2, line) {
      let top2 = 1e9, bottom = -1e9, horizontal = [];
      function addSpan(from3, fromOpen, to3, toOpen, dir) {
        let fromCoords = view.coordsAtPos(from3, from3 == line.to ? -2 : 2);
        let toCoords = view.coordsAtPos(to3, to3 == line.from ? 2 : -2);
        if (!fromCoords || !toCoords)
          return;
        top2 = Math.min(fromCoords.top, toCoords.top, top2);
        bottom = Math.max(fromCoords.bottom, toCoords.bottom, bottom);
        if (dir == Direction.LTR)
          horizontal.push(ltr && fromOpen ? leftSide : fromCoords.left, ltr && toOpen ? rightSide : toCoords.right);
        else
          horizontal.push(!ltr && toOpen ? leftSide : toCoords.left, !ltr && fromOpen ? rightSide : fromCoords.right);
      }
      let start = from2 !== null && from2 !== void 0 ? from2 : line.from, end = to2 !== null && to2 !== void 0 ? to2 : line.to;
      for (let r2 of view.visibleRanges)
        if (r2.to > start && r2.from < end) {
          for (let pos = Math.max(r2.from, start), endPos = Math.min(r2.to, end); ; ) {
            let docLine = view.state.doc.lineAt(pos);
            for (let span of view.bidiSpans(docLine)) {
              let spanFrom = span.from + docLine.from, spanTo = span.to + docLine.from;
              if (spanFrom >= endPos)
                break;
              if (spanTo > pos)
                addSpan(Math.max(spanFrom, pos), from2 == null && spanFrom <= start, Math.min(spanTo, endPos), to2 == null && spanTo >= end, span.dir);
            }
            pos = docLine.to + 1;
            if (pos >= endPos)
              break;
          }
        }
      if (horizontal.length == 0)
        addSpan(start, from2 == null, end, to2 == null, view.textDirection);
      return { top: top2, bottom, horizontal };
    }
    function drawForWidget(block, top2) {
      let y2 = contentRect.top + (top2 ? block.top : block.bottom);
      return { top: y2, bottom: y2, horizontal: [] };
    }
  }
  function sameMarker(a2, b2) {
    return a2.constructor == b2.constructor && a2.eq(b2);
  }
  class LayerView {
    constructor(view, layer2) {
      this.view = view;
      this.layer = layer2;
      this.drawn = [];
      this.scaleX = 1;
      this.scaleY = 1;
      this.measureReq = { read: this.measure.bind(this), write: this.draw.bind(this) };
      this.dom = view.scrollDOM.appendChild(document.createElement("div"));
      this.dom.classList.add("cm-layer");
      if (layer2.above)
        this.dom.classList.add("cm-layer-above");
      if (layer2.class)
        this.dom.classList.add(layer2.class);
      this.scale();
      this.dom.setAttribute("aria-hidden", "true");
      this.setOrder(view.state);
      view.requestMeasure(this.measureReq);
      if (layer2.mount)
        layer2.mount(this.dom, view);
    }
    update(update) {
      if (update.startState.facet(layerOrder) != update.state.facet(layerOrder))
        this.setOrder(update.state);
      if (this.layer.update(update, this.dom) || update.geometryChanged) {
        this.scale();
        update.view.requestMeasure(this.measureReq);
      }
    }
    setOrder(state) {
      let pos = 0, order = state.facet(layerOrder);
      while (pos < order.length && order[pos] != this.layer)
        pos++;
      this.dom.style.zIndex = String((this.layer.above ? 150 : -1) - pos);
    }
    measure() {
      return this.layer.markers(this.view);
    }
    scale() {
      let { scaleX, scaleY } = this.view;
      if (scaleX != this.scaleX || scaleY != this.scaleY) {
        this.scaleX = scaleX;
        this.scaleY = scaleY;
        this.dom.style.transform = `scale(${1 / scaleX}, ${1 / scaleY})`;
      }
    }
    draw(markers) {
      if (markers.length != this.drawn.length || markers.some((p2, i2) => !sameMarker(p2, this.drawn[i2]))) {
        let old = this.dom.firstChild, oldI = 0;
        for (let marker of markers) {
          if (marker.update && old && marker.constructor && this.drawn[oldI].constructor && marker.update(old, this.drawn[oldI])) {
            old = old.nextSibling;
            oldI++;
          } else {
            this.dom.insertBefore(marker.draw(), old);
          }
        }
        while (old) {
          let next = old.nextSibling;
          old.remove();
          old = next;
        }
        this.drawn = markers;
      }
    }
    destroy() {
      if (this.layer.destroy)
        this.layer.destroy(this.dom, this.view);
      this.dom.remove();
    }
  }
  const layerOrder = /* @__PURE__ */ Facet.define();
  function layer(config) {
    return [
      ViewPlugin.define((v2) => new LayerView(v2, config)),
      layerOrder.of(config)
    ];
  }
  const CanHidePrimary = !browser.ios;
  const selectionConfig = /* @__PURE__ */ Facet.define({
    combine(configs) {
      return combineConfig(configs, {
        cursorBlinkRate: 1200,
        drawRangeCursor: true
      }, {
        cursorBlinkRate: (a2, b2) => Math.min(a2, b2),
        drawRangeCursor: (a2, b2) => a2 || b2
      });
    }
  });
  function drawSelection(config = {}) {
    return [
      selectionConfig.of(config),
      cursorLayer,
      selectionLayer,
      hideNativeSelection,
      nativeSelectionHidden.of(true)
    ];
  }
  function configChanged(update) {
    return update.startState.facet(selectionConfig) != update.state.facet(selectionConfig);
  }
  const cursorLayer = /* @__PURE__ */ layer({
    above: true,
    markers(view) {
      let { state } = view, conf = state.facet(selectionConfig);
      let cursors = [];
      for (let r2 of state.selection.ranges) {
        let prim = r2 == state.selection.main;
        if (r2.empty ? !prim || CanHidePrimary : conf.drawRangeCursor) {
          let className = prim ? "cm-cursor cm-cursor-primary" : "cm-cursor cm-cursor-secondary";
          let cursor = r2.empty ? r2 : EditorSelection.cursor(r2.head, r2.head > r2.anchor ? -1 : 1);
          for (let piece of RectangleMarker.forRange(view, className, cursor))
            cursors.push(piece);
        }
      }
      return cursors;
    },
    update(update, dom) {
      if (update.transactions.some((tr) => tr.selection))
        dom.style.animationName = dom.style.animationName == "cm-blink" ? "cm-blink2" : "cm-blink";
      let confChange = configChanged(update);
      if (confChange)
        setBlinkRate(update.state, dom);
      return update.docChanged || update.selectionSet || confChange;
    },
    mount(dom, view) {
      setBlinkRate(view.state, dom);
    },
    class: "cm-cursorLayer"
  });
  function setBlinkRate(state, dom) {
    dom.style.animationDuration = state.facet(selectionConfig).cursorBlinkRate + "ms";
  }
  const selectionLayer = /* @__PURE__ */ layer({
    above: false,
    markers(view) {
      return view.state.selection.ranges.map((r2) => r2.empty ? [] : RectangleMarker.forRange(view, "cm-selectionBackground", r2)).reduce((a2, b2) => a2.concat(b2));
    },
    update(update, dom) {
      return update.docChanged || update.selectionSet || update.viewportChanged || configChanged(update);
    },
    class: "cm-selectionLayer"
  });
  const themeSpec = {
    ".cm-line": {
      "& ::selection": { backgroundColor: "transparent !important" },
      "&::selection": { backgroundColor: "transparent !important" }
    }
  };
  if (CanHidePrimary) {
    themeSpec[".cm-line"].caretColor = "transparent !important";
    themeSpec[".cm-content"] = { caretColor: "transparent !important" };
  }
  const hideNativeSelection = /* @__PURE__ */ Prec.highest(/* @__PURE__ */ EditorView.theme(themeSpec));
  function iterMatches(doc2, re, from, to, f2) {
    re.lastIndex = 0;
    for (let cursor = doc2.iterRange(from, to), pos = from, m2; !cursor.next().done; pos += cursor.value.length) {
      if (!cursor.lineBreak)
        while (m2 = re.exec(cursor.value))
          f2(pos + m2.index, m2);
    }
  }
  function matchRanges(view, maxLength) {
    let visible = view.visibleRanges;
    if (visible.length == 1 && visible[0].from == view.viewport.from && visible[0].to == view.viewport.to)
      return visible;
    let result = [];
    for (let { from, to } of visible) {
      from = Math.max(view.state.doc.lineAt(from).from, from - maxLength);
      to = Math.min(view.state.doc.lineAt(to).to, to + maxLength);
      if (result.length && result[result.length - 1].to >= from)
        result[result.length - 1].to = to;
      else
        result.push({ from, to });
    }
    return result;
  }
  class MatchDecorator {
    /**
    Create a decorator.
    */
    constructor(config) {
      const { regexp, decoration, decorate, boundary, maxLength = 1e3 } = config;
      if (!regexp.global)
        throw new RangeError("The regular expression given to MatchDecorator should have its 'g' flag set");
      this.regexp = regexp;
      if (decorate) {
        this.addMatch = (match, view, from, add) => decorate(add, from, from + match[0].length, match, view);
      } else if (typeof decoration == "function") {
        this.addMatch = (match, view, from, add) => {
          let deco = decoration(match, view, from);
          if (deco)
            add(from, from + match[0].length, deco);
        };
      } else if (decoration) {
        this.addMatch = (match, _view, from, add) => add(from, from + match[0].length, decoration);
      } else {
        throw new RangeError("Either 'decorate' or 'decoration' should be provided to MatchDecorator");
      }
      this.boundary = boundary;
      this.maxLength = maxLength;
    }
    /**
    Compute the full set of decorations for matches in the given
    view's viewport. You'll want to call this when initializing your
    plugin.
    */
    createDeco(view) {
      let build = new RangeSetBuilder(), add = build.add.bind(build);
      for (let { from, to } of matchRanges(view, this.maxLength))
        iterMatches(view.state.doc, this.regexp, from, to, (from2, m2) => this.addMatch(m2, view, from2, add));
      return build.finish();
    }
    /**
    Update a set of decorations for a view update. `deco` _must_ be
    the set of decorations produced by _this_ `MatchDecorator` for
    the view state before the update.
    */
    updateDeco(update, deco) {
      let changeFrom = 1e9, changeTo = -1;
      if (update.docChanged)
        update.changes.iterChanges((_f2, _t, from, to) => {
          if (to > update.view.viewport.from && from < update.view.viewport.to) {
            changeFrom = Math.min(from, changeFrom);
            changeTo = Math.max(to, changeTo);
          }
        });
      if (update.viewportChanged || changeTo - changeFrom > 1e3)
        return this.createDeco(update.view);
      if (changeTo > -1)
        return this.updateRange(update.view, deco.map(update.changes), changeFrom, changeTo);
      return deco;
    }
    updateRange(view, deco, updateFrom, updateTo) {
      for (let r2 of view.visibleRanges) {
        let from = Math.max(r2.from, updateFrom), to = Math.min(r2.to, updateTo);
        if (to > from) {
          let fromLine = view.state.doc.lineAt(from), toLine = fromLine.to < to ? view.state.doc.lineAt(to) : fromLine;
          let start = Math.max(r2.from, fromLine.from), end = Math.min(r2.to, toLine.to);
          if (this.boundary) {
            for (; from > fromLine.from; from--)
              if (this.boundary.test(fromLine.text[from - 1 - fromLine.from])) {
                start = from;
                break;
              }
            for (; to < toLine.to; to++)
              if (this.boundary.test(toLine.text[to - toLine.from])) {
                end = to;
                break;
              }
          }
          let ranges = [], m2;
          let add = (from2, to2, deco2) => ranges.push(deco2.range(from2, to2));
          if (fromLine == toLine) {
            this.regexp.lastIndex = start - fromLine.from;
            while ((m2 = this.regexp.exec(fromLine.text)) && m2.index < end - fromLine.from)
              this.addMatch(m2, view, m2.index + fromLine.from, add);
          } else {
            iterMatches(view.state.doc, this.regexp, start, end, (from2, m3) => this.addMatch(m3, view, from2, add));
          }
          deco = deco.update({ filterFrom: start, filterTo: end, filter: (from2, to2) => from2 < start || to2 > end, add: ranges });
        }
      }
      return deco;
    }
  }
  const UnicodeRegexpSupport = /x/.unicode != null ? "gu" : "g";
  const Specials = /* @__PURE__ */ new RegExp("[\0-\b\n--­؜​‎‏\u2028\u2029‭‮⁦⁧⁩\uFEFF￹-￼]", UnicodeRegexpSupport);
  const Names = {
    0: "null",
    7: "bell",
    8: "backspace",
    10: "newline",
    11: "vertical tab",
    13: "carriage return",
    27: "escape",
    8203: "zero width space",
    8204: "zero width non-joiner",
    8205: "zero width joiner",
    8206: "left-to-right mark",
    8207: "right-to-left mark",
    8232: "line separator",
    8237: "left-to-right override",
    8238: "right-to-left override",
    8294: "left-to-right isolate",
    8295: "right-to-left isolate",
    8297: "pop directional isolate",
    8233: "paragraph separator",
    65279: "zero width no-break space",
    65532: "object replacement"
  };
  let _supportsTabSize = null;
  function supportsTabSize() {
    var _a3;
    if (_supportsTabSize == null && typeof document != "undefined" && document.body) {
      let styles = document.body.style;
      _supportsTabSize = ((_a3 = styles.tabSize) !== null && _a3 !== void 0 ? _a3 : styles.MozTabSize) != null;
    }
    return _supportsTabSize || false;
  }
  const specialCharConfig = /* @__PURE__ */ Facet.define({
    combine(configs) {
      let config = combineConfig(configs, {
        render: null,
        specialChars: Specials,
        addSpecialChars: null
      });
      if (config.replaceTabs = !supportsTabSize())
        config.specialChars = new RegExp("	|" + config.specialChars.source, UnicodeRegexpSupport);
      if (config.addSpecialChars)
        config.specialChars = new RegExp(config.specialChars.source + "|" + config.addSpecialChars.source, UnicodeRegexpSupport);
      return config;
    }
  });
  function highlightSpecialChars(config = {}) {
    return [specialCharConfig.of(config), specialCharPlugin()];
  }
  let _plugin = null;
  function specialCharPlugin() {
    return _plugin || (_plugin = ViewPlugin.fromClass(class {
      constructor(view) {
        this.view = view;
        this.decorations = Decoration.none;
        this.decorationCache = /* @__PURE__ */ Object.create(null);
        this.decorator = this.makeDecorator(view.state.facet(specialCharConfig));
        this.decorations = this.decorator.createDeco(view);
      }
      makeDecorator(conf) {
        return new MatchDecorator({
          regexp: conf.specialChars,
          decoration: (m2, view, pos) => {
            let { doc: doc2 } = view.state;
            let code2 = codePointAt(m2[0], 0);
            if (code2 == 9) {
              let line = doc2.lineAt(pos);
              let size = view.state.tabSize, col = countColumn(line.text, size, pos - line.from);
              return Decoration.replace({
                widget: new TabWidget((size - col % size) * this.view.defaultCharacterWidth / this.view.scaleX)
              });
            }
            return this.decorationCache[code2] || (this.decorationCache[code2] = Decoration.replace({ widget: new SpecialCharWidget(conf, code2) }));
          },
          boundary: conf.replaceTabs ? void 0 : /[^]/
        });
      }
      update(update) {
        let conf = update.state.facet(specialCharConfig);
        if (update.startState.facet(specialCharConfig) != conf) {
          this.decorator = this.makeDecorator(conf);
          this.decorations = this.decorator.createDeco(update.view);
        } else {
          this.decorations = this.decorator.updateDeco(update, this.decorations);
        }
      }
    }, {
      decorations: (v2) => v2.decorations
    }));
  }
  const DefaultPlaceholder = "•";
  function placeholder$1(code2) {
    if (code2 >= 32)
      return DefaultPlaceholder;
    if (code2 == 10)
      return "␤";
    return String.fromCharCode(9216 + code2);
  }
  class SpecialCharWidget extends WidgetType {
    constructor(options, code2) {
      super();
      this.options = options;
      this.code = code2;
    }
    eq(other) {
      return other.code == this.code;
    }
    toDOM(view) {
      let ph = placeholder$1(this.code);
      let desc = view.state.phrase("Control character") + " " + (Names[this.code] || "0x" + this.code.toString(16));
      let custom = this.options.render && this.options.render(this.code, desc, ph);
      if (custom)
        return custom;
      let span = document.createElement("span");
      span.textContent = ph;
      span.title = desc;
      span.setAttribute("aria-label", desc);
      span.className = "cm-specialChar";
      return span;
    }
    ignoreEvent() {
      return false;
    }
  }
  class TabWidget extends WidgetType {
    constructor(width) {
      super();
      this.width = width;
    }
    eq(other) {
      return other.width == this.width;
    }
    toDOM() {
      let span = document.createElement("span");
      span.textContent = "	";
      span.className = "cm-tab";
      span.style.width = this.width + "px";
      return span;
    }
    ignoreEvent() {
      return false;
    }
  }
  class GutterMarker extends RangeValue {
    /**
    @internal
    */
    compare(other) {
      return this == other || this.constructor == other.constructor && this.eq(other);
    }
    /**
    Compare this marker to another marker of the same type.
    */
    eq(other) {
      return false;
    }
    /**
    Called if the marker has a `toDOM` method and its representation
    was removed from a gutter.
    */
    destroy(dom) {
    }
  }
  GutterMarker.prototype.elementClass = "";
  GutterMarker.prototype.toDOM = void 0;
  GutterMarker.prototype.mapMode = MapMode.TrackBefore;
  GutterMarker.prototype.startSide = GutterMarker.prototype.endSide = -1;
  GutterMarker.prototype.point = true;
  var _a;
  const languageDataProp = /* @__PURE__ */ new NodeProp();
  function defineLanguageFacet(baseData) {
    return Facet.define({
      combine: baseData ? (values) => values.concat(baseData) : void 0
    });
  }
  const sublanguageProp = /* @__PURE__ */ new NodeProp();
  class Language {
    /**
    Construct a language object. If you need to invoke this
    directly, first define a data facet with
    [`defineLanguageFacet`](https://codemirror.net/6/docs/ref/#language.defineLanguageFacet), and then
    configure your parser to [attach](https://codemirror.net/6/docs/ref/#language.languageDataProp) it
    to the language's outer syntax node.
    */
    constructor(data, parser2, extraExtensions = [], name2 = "") {
      this.data = data;
      this.name = name2;
      if (!EditorState.prototype.hasOwnProperty("tree"))
        Object.defineProperty(EditorState.prototype, "tree", { get() {
          return syntaxTree(this);
        } });
      this.parser = parser2;
      this.extension = [
        language.of(this),
        EditorState.languageData.of((state, pos, side) => {
          let top2 = topNodeAt(state, pos, side), data2 = top2.type.prop(languageDataProp);
          if (!data2)
            return [];
          let base2 = state.facet(data2), sub = top2.type.prop(sublanguageProp);
          if (sub) {
            let innerNode = top2.resolve(pos - top2.from, side);
            for (let sublang of sub)
              if (sublang.test(innerNode, state)) {
                let data3 = state.facet(sublang.facet);
                return sublang.type == "replace" ? data3 : data3.concat(base2);
              }
          }
          return base2;
        })
      ].concat(extraExtensions);
    }
    /**
    Query whether this language is active at the given position.
    */
    isActiveAt(state, pos, side = -1) {
      return topNodeAt(state, pos, side).type.prop(languageDataProp) == this.data;
    }
    /**
    Find the document regions that were parsed using this language.
    The returned regions will _include_ any nested languages rooted
    in this language, when those exist.
    */
    findRegions(state) {
      let lang = state.facet(language);
      if ((lang === null || lang === void 0 ? void 0 : lang.data) == this.data)
        return [{ from: 0, to: state.doc.length }];
      if (!lang || !lang.allowsNesting)
        return [];
      let result = [];
      let explore = (tree, from) => {
        if (tree.prop(languageDataProp) == this.data) {
          result.push({ from, to: from + tree.length });
          return;
        }
        let mount = tree.prop(NodeProp.mounted);
        if (mount) {
          if (mount.tree.prop(languageDataProp) == this.data) {
            if (mount.overlay)
              for (let r2 of mount.overlay)
                result.push({ from: r2.from + from, to: r2.to + from });
            else
              result.push({ from, to: from + tree.length });
            return;
          } else if (mount.overlay) {
            let size = result.length;
            explore(mount.tree, mount.overlay[0].from + from);
            if (result.length > size)
              return;
          }
        }
        for (let i2 = 0; i2 < tree.children.length; i2++) {
          let ch = tree.children[i2];
          if (ch instanceof Tree)
            explore(ch, tree.positions[i2] + from);
        }
      };
      explore(syntaxTree(state), 0);
      return result;
    }
    /**
    Indicates whether this language allows nested languages. The
    default implementation returns true.
    */
    get allowsNesting() {
      return true;
    }
  }
  Language.setState = /* @__PURE__ */ StateEffect.define();
  function topNodeAt(state, pos, side) {
    let topLang = state.facet(language), tree = syntaxTree(state).topNode;
    if (!topLang || topLang.allowsNesting) {
      for (let node = tree; node; node = node.enter(pos, side, IterMode.ExcludeBuffers))
        if (node.type.isTop)
          tree = node;
    }
    return tree;
  }
  class LRLanguage extends Language {
    constructor(data, parser2, name2) {
      super(data, parser2, [], name2);
      this.parser = parser2;
    }
    /**
    Define a language from a parser.
    */
    static define(spec) {
      let data = defineLanguageFacet(spec.languageData);
      return new LRLanguage(data, spec.parser.configure({
        props: [languageDataProp.add((type) => type.isTop ? data : void 0)]
      }), spec.name);
    }
    /**
    Create a new instance of this language with a reconfigured
    version of its parser and optionally a new name.
    */
    configure(options, name2) {
      return new LRLanguage(this.data, this.parser.configure(options), name2 || this.name);
    }
    get allowsNesting() {
      return this.parser.hasWrappers();
    }
  }
  function syntaxTree(state) {
    let field = state.field(Language.state, false);
    return field ? field.tree : Tree.empty;
  }
  class DocInput {
    /**
    Create an input object for the given document.
    */
    constructor(doc2) {
      this.doc = doc2;
      this.cursorPos = 0;
      this.string = "";
      this.cursor = doc2.iter();
    }
    get length() {
      return this.doc.length;
    }
    syncTo(pos) {
      this.string = this.cursor.next(pos - this.cursorPos).value;
      this.cursorPos = pos + this.string.length;
      return this.cursorPos - this.string.length;
    }
    chunk(pos) {
      this.syncTo(pos);
      return this.string;
    }
    get lineChunks() {
      return true;
    }
    read(from, to) {
      let stringStart = this.cursorPos - this.string.length;
      if (from < stringStart || to >= this.cursorPos)
        return this.doc.sliceString(from, to);
      else
        return this.string.slice(from - stringStart, to - stringStart);
    }
  }
  let currentContext = null;
  class ParseContext {
    constructor(parser2, state, fragments = [], tree, treeLen, viewport, skipped, scheduleOn) {
      this.parser = parser2;
      this.state = state;
      this.fragments = fragments;
      this.tree = tree;
      this.treeLen = treeLen;
      this.viewport = viewport;
      this.skipped = skipped;
      this.scheduleOn = scheduleOn;
      this.parse = null;
      this.tempSkipped = [];
    }
    /**
    @internal
    */
    static create(parser2, state, viewport) {
      return new ParseContext(parser2, state, [], Tree.empty, 0, viewport, [], null);
    }
    startParse() {
      return this.parser.startParse(new DocInput(this.state.doc), this.fragments);
    }
    /**
    @internal
    */
    work(until, upto) {
      if (upto != null && upto >= this.state.doc.length)
        upto = void 0;
      if (this.tree != Tree.empty && this.isDone(upto !== null && upto !== void 0 ? upto : this.state.doc.length)) {
        this.takeTree();
        return true;
      }
      return this.withContext(() => {
        var _a3;
        if (typeof until == "number") {
          let endTime = Date.now() + until;
          until = () => Date.now() > endTime;
        }
        if (!this.parse)
          this.parse = this.startParse();
        if (upto != null && (this.parse.stoppedAt == null || this.parse.stoppedAt > upto) && upto < this.state.doc.length)
          this.parse.stopAt(upto);
        for (; ; ) {
          let done = this.parse.advance();
          if (done) {
            this.fragments = this.withoutTempSkipped(TreeFragment.addTree(done, this.fragments, this.parse.stoppedAt != null));
            this.treeLen = (_a3 = this.parse.stoppedAt) !== null && _a3 !== void 0 ? _a3 : this.state.doc.length;
            this.tree = done;
            this.parse = null;
            if (this.treeLen < (upto !== null && upto !== void 0 ? upto : this.state.doc.length))
              this.parse = this.startParse();
            else
              return true;
          }
          if (until())
            return false;
        }
      });
    }
    /**
    @internal
    */
    takeTree() {
      let pos, tree;
      if (this.parse && (pos = this.parse.parsedPos) >= this.treeLen) {
        if (this.parse.stoppedAt == null || this.parse.stoppedAt > pos)
          this.parse.stopAt(pos);
        this.withContext(() => {
          while (!(tree = this.parse.advance())) {
          }
        });
        this.treeLen = pos;
        this.tree = tree;
        this.fragments = this.withoutTempSkipped(TreeFragment.addTree(this.tree, this.fragments, true));
        this.parse = null;
      }
    }
    withContext(f2) {
      let prev = currentContext;
      currentContext = this;
      try {
        return f2();
      } finally {
        currentContext = prev;
      }
    }
    withoutTempSkipped(fragments) {
      for (let r2; r2 = this.tempSkipped.pop(); )
        fragments = cutFragments(fragments, r2.from, r2.to);
      return fragments;
    }
    /**
    @internal
    */
    changes(changes, newState) {
      let { fragments, tree, treeLen, viewport, skipped } = this;
      this.takeTree();
      if (!changes.empty) {
        let ranges = [];
        changes.iterChangedRanges((fromA, toA, fromB, toB) => ranges.push({ fromA, toA, fromB, toB }));
        fragments = TreeFragment.applyChanges(fragments, ranges);
        tree = Tree.empty;
        treeLen = 0;
        viewport = { from: changes.mapPos(viewport.from, -1), to: changes.mapPos(viewport.to, 1) };
        if (this.skipped.length) {
          skipped = [];
          for (let r2 of this.skipped) {
            let from = changes.mapPos(r2.from, 1), to = changes.mapPos(r2.to, -1);
            if (from < to)
              skipped.push({ from, to });
          }
        }
      }
      return new ParseContext(this.parser, newState, fragments, tree, treeLen, viewport, skipped, this.scheduleOn);
    }
    /**
    @internal
    */
    updateViewport(viewport) {
      if (this.viewport.from == viewport.from && this.viewport.to == viewport.to)
        return false;
      this.viewport = viewport;
      let startLen = this.skipped.length;
      for (let i2 = 0; i2 < this.skipped.length; i2++) {
        let { from, to } = this.skipped[i2];
        if (from < viewport.to && to > viewport.from) {
          this.fragments = cutFragments(this.fragments, from, to);
          this.skipped.splice(i2--, 1);
        }
      }
      if (this.skipped.length >= startLen)
        return false;
      this.reset();
      return true;
    }
    /**
    @internal
    */
    reset() {
      if (this.parse) {
        this.takeTree();
        this.parse = null;
      }
    }
    /**
    Notify the parse scheduler that the given region was skipped
    because it wasn't in view, and the parse should be restarted
    when it comes into view.
    */
    skipUntilInView(from, to) {
      this.skipped.push({ from, to });
    }
    /**
    Returns a parser intended to be used as placeholder when
    asynchronously loading a nested parser. It'll skip its input and
    mark it as not-really-parsed, so that the next update will parse
    it again.
    
    When `until` is given, a reparse will be scheduled when that
    promise resolves.
    */
    static getSkippingParser(until) {
      return new class extends Parser {
        createParse(input, fragments, ranges) {
          let from = ranges[0].from, to = ranges[ranges.length - 1].to;
          let parser2 = {
            parsedPos: from,
            advance() {
              let cx = currentContext;
              if (cx) {
                for (let r2 of ranges)
                  cx.tempSkipped.push(r2);
                if (until)
                  cx.scheduleOn = cx.scheduleOn ? Promise.all([cx.scheduleOn, until]) : until;
              }
              this.parsedPos = to;
              return new Tree(NodeType.none, [], [], to - from);
            },
            stoppedAt: null,
            stopAt() {
            }
          };
          return parser2;
        }
      }();
    }
    /**
    @internal
    */
    isDone(upto) {
      upto = Math.min(upto, this.state.doc.length);
      let frags = this.fragments;
      return this.treeLen >= upto && frags.length && frags[0].from == 0 && frags[0].to >= upto;
    }
    /**
    Get the context for the current parse, or `null` if no editor
    parse is in progress.
    */
    static get() {
      return currentContext;
    }
  }
  function cutFragments(fragments, from, to) {
    return TreeFragment.applyChanges(fragments, [{ fromA: from, toA: to, fromB: from, toB: to }]);
  }
  class LanguageState {
    constructor(context) {
      this.context = context;
      this.tree = context.tree;
    }
    apply(tr) {
      if (!tr.docChanged && this.tree == this.context.tree)
        return this;
      let newCx = this.context.changes(tr.changes, tr.state);
      let upto = this.context.treeLen == tr.startState.doc.length ? void 0 : Math.max(tr.changes.mapPos(this.context.treeLen), newCx.viewport.to);
      if (!newCx.work(20, upto))
        newCx.takeTree();
      return new LanguageState(newCx);
    }
    static init(state) {
      let vpTo = Math.min(3e3, state.doc.length);
      let parseState = ParseContext.create(state.facet(language).parser, state, { from: 0, to: vpTo });
      if (!parseState.work(20, vpTo))
        parseState.takeTree();
      return new LanguageState(parseState);
    }
  }
  Language.state = /* @__PURE__ */ StateField.define({
    create: LanguageState.init,
    update(value, tr) {
      for (let e2 of tr.effects)
        if (e2.is(Language.setState))
          return e2.value;
      if (tr.startState.facet(language) != tr.state.facet(language))
        return LanguageState.init(tr.state);
      return value.apply(tr);
    }
  });
  let requestIdle = (callback) => {
    let timeout = setTimeout(
      () => callback(),
      500
      /* Work.MaxPause */
    );
    return () => clearTimeout(timeout);
  };
  if (typeof requestIdleCallback != "undefined")
    requestIdle = (callback) => {
      let idle = -1, timeout = setTimeout(
        () => {
          idle = requestIdleCallback(callback, {
            timeout: 500 - 100
            /* Work.MinPause */
          });
        },
        100
        /* Work.MinPause */
      );
      return () => idle < 0 ? clearTimeout(timeout) : cancelIdleCallback(idle);
    };
  const isInputPending = typeof navigator != "undefined" && ((_a = navigator.scheduling) === null || _a === void 0 ? void 0 : _a.isInputPending) ? () => navigator.scheduling.isInputPending() : null;
  const parseWorker = /* @__PURE__ */ ViewPlugin.fromClass(class ParseWorker {
    constructor(view) {
      this.view = view;
      this.working = null;
      this.workScheduled = 0;
      this.chunkEnd = -1;
      this.chunkBudget = -1;
      this.work = this.work.bind(this);
      this.scheduleWork();
    }
    update(update) {
      let cx = this.view.state.field(Language.state).context;
      if (cx.updateViewport(update.view.viewport) || this.view.viewport.to > cx.treeLen)
        this.scheduleWork();
      if (update.docChanged || update.selectionSet) {
        if (this.view.hasFocus)
          this.chunkBudget += 50;
        this.scheduleWork();
      }
      this.checkAsyncSchedule(cx);
    }
    scheduleWork() {
      if (this.working)
        return;
      let { state } = this.view, field = state.field(Language.state);
      if (field.tree != field.context.tree || !field.context.isDone(state.doc.length))
        this.working = requestIdle(this.work);
    }
    work(deadline) {
      this.working = null;
      let now = Date.now();
      if (this.chunkEnd < now && (this.chunkEnd < 0 || this.view.hasFocus)) {
        this.chunkEnd = now + 3e4;
        this.chunkBudget = 3e3;
      }
      if (this.chunkBudget <= 0)
        return;
      let { state, viewport: { to: vpTo } } = this.view, field = state.field(Language.state);
      if (field.tree == field.context.tree && field.context.isDone(
        vpTo + 1e5
        /* Work.MaxParseAhead */
      ))
        return;
      let endTime = Date.now() + Math.min(this.chunkBudget, 100, deadline && !isInputPending ? Math.max(25, deadline.timeRemaining() - 5) : 1e9);
      let viewportFirst = field.context.treeLen < vpTo && state.doc.length > vpTo + 1e3;
      let done = field.context.work(() => {
        return isInputPending && isInputPending() || Date.now() > endTime;
      }, vpTo + (viewportFirst ? 0 : 1e5));
      this.chunkBudget -= Date.now() - now;
      if (done || this.chunkBudget <= 0) {
        field.context.takeTree();
        this.view.dispatch({ effects: Language.setState.of(new LanguageState(field.context)) });
      }
      if (this.chunkBudget > 0 && !(done && !viewportFirst))
        this.scheduleWork();
      this.checkAsyncSchedule(field.context);
    }
    checkAsyncSchedule(cx) {
      if (cx.scheduleOn) {
        this.workScheduled++;
        cx.scheduleOn.then(() => this.scheduleWork()).catch((err) => logException(this.view.state, err)).then(() => this.workScheduled--);
        cx.scheduleOn = null;
      }
    }
    destroy() {
      if (this.working)
        this.working();
    }
    isWorking() {
      return !!(this.working || this.workScheduled > 0);
    }
  }, {
    eventHandlers: { focus() {
      this.scheduleWork();
    } }
  });
  const language = /* @__PURE__ */ Facet.define({
    combine(languages) {
      return languages.length ? languages[0] : null;
    },
    enables: (language2) => [
      Language.state,
      parseWorker,
      EditorView.contentAttributes.compute([language2], (state) => {
        let lang = state.facet(language2);
        return lang && lang.name ? { "data-language": lang.name } : {};
      })
    ]
  });
  class LanguageSupport {
    /**
    Create a language support object.
    */
    constructor(language2, support = []) {
      this.language = language2;
      this.support = support;
      this.extension = [language2, support];
    }
  }
  const indentService = /* @__PURE__ */ Facet.define();
  const indentUnit = /* @__PURE__ */ Facet.define({
    combine: (values) => {
      if (!values.length)
        return "  ";
      let unit = values[0];
      if (!unit || /\S/.test(unit) || Array.from(unit).some((e2) => e2 != unit[0]))
        throw new Error("Invalid indent unit: " + JSON.stringify(values[0]));
      return unit;
    }
  });
  function getIndentUnit(state) {
    let unit = state.facet(indentUnit);
    return unit.charCodeAt(0) == 9 ? state.tabSize * unit.length : unit.length;
  }
  function indentString(state, cols) {
    let result = "", ts = state.tabSize, ch = state.facet(indentUnit)[0];
    if (ch == "	") {
      while (cols >= ts) {
        result += "	";
        cols -= ts;
      }
      ch = " ";
    }
    for (let i2 = 0; i2 < cols; i2++)
      result += ch;
    return result;
  }
  function getIndentation(context, pos) {
    if (context instanceof EditorState)
      context = new IndentContext(context);
    for (let service of context.state.facet(indentService)) {
      let result = service(context, pos);
      if (result !== void 0)
        return result;
    }
    let tree = syntaxTree(context.state);
    return tree.length >= pos ? syntaxIndentation(context, tree, pos) : null;
  }
  class IndentContext {
    /**
    Create an indent context.
    */
    constructor(state, options = {}) {
      this.state = state;
      this.options = options;
      this.unit = getIndentUnit(state);
    }
    /**
    Get a description of the line at the given position, taking
    [simulated line
    breaks](https://codemirror.net/6/docs/ref/#language.IndentContext.constructor^options.simulateBreak)
    into account. If there is such a break at `pos`, the `bias`
    argument determines whether the part of the line line before or
    after the break is used.
    */
    lineAt(pos, bias = 1) {
      let line = this.state.doc.lineAt(pos);
      let { simulateBreak, simulateDoubleBreak } = this.options;
      if (simulateBreak != null && simulateBreak >= line.from && simulateBreak <= line.to) {
        if (simulateDoubleBreak && simulateBreak == pos)
          return { text: "", from: pos };
        else if (bias < 0 ? simulateBreak < pos : simulateBreak <= pos)
          return { text: line.text.slice(simulateBreak - line.from), from: simulateBreak };
        else
          return { text: line.text.slice(0, simulateBreak - line.from), from: line.from };
      }
      return line;
    }
    /**
    Get the text directly after `pos`, either the entire line
    or the next 100 characters, whichever is shorter.
    */
    textAfterPos(pos, bias = 1) {
      if (this.options.simulateDoubleBreak && pos == this.options.simulateBreak)
        return "";
      let { text, from } = this.lineAt(pos, bias);
      return text.slice(pos - from, Math.min(text.length, pos + 100 - from));
    }
    /**
    Find the column for the given position.
    */
    column(pos, bias = 1) {
      let { text, from } = this.lineAt(pos, bias);
      let result = this.countColumn(text, pos - from);
      let override = this.options.overrideIndentation ? this.options.overrideIndentation(from) : -1;
      if (override > -1)
        result += override - this.countColumn(text, text.search(/\S|$/));
      return result;
    }
    /**
    Find the column position (taking tabs into account) of the given
    position in the given string.
    */
    countColumn(line, pos = line.length) {
      return countColumn(line, this.state.tabSize, pos);
    }
    /**
    Find the indentation column of the line at the given point.
    */
    lineIndent(pos, bias = 1) {
      let { text, from } = this.lineAt(pos, bias);
      let override = this.options.overrideIndentation;
      if (override) {
        let overriden = override(from);
        if (overriden > -1)
          return overriden;
      }
      return this.countColumn(text, text.search(/\S|$/));
    }
    /**
    Returns the [simulated line
    break](https://codemirror.net/6/docs/ref/#language.IndentContext.constructor^options.simulateBreak)
    for this context, if any.
    */
    get simulatedBreak() {
      return this.options.simulateBreak || null;
    }
  }
  const indentNodeProp = /* @__PURE__ */ new NodeProp();
  function syntaxIndentation(cx, ast, pos) {
    let stack = ast.resolveStack(pos);
    let inner = stack.node.enterUnfinishedNodesBefore(pos);
    if (inner != stack.node) {
      let add = [];
      for (let cur = inner; cur != stack.node; cur = cur.parent)
        add.push(cur);
      for (let i2 = add.length - 1; i2 >= 0; i2--)
        stack = { node: add[i2], next: stack };
    }
    return indentFor(stack, cx, pos);
  }
  function indentFor(stack, cx, pos) {
    for (let cur = stack; cur; cur = cur.next) {
      let strategy = indentStrategy(cur.node);
      if (strategy)
        return strategy(TreeIndentContext.create(cx, pos, cur));
    }
    return 0;
  }
  function ignoreClosed(cx) {
    return cx.pos == cx.options.simulateBreak && cx.options.simulateDoubleBreak;
  }
  function indentStrategy(tree) {
    let strategy = tree.type.prop(indentNodeProp);
    if (strategy)
      return strategy;
    let first = tree.firstChild, close;
    if (first && (close = first.type.prop(NodeProp.closedBy))) {
      let last = tree.lastChild, closed = last && close.indexOf(last.name) > -1;
      return (cx) => delimitedStrategy(cx, true, 1, void 0, closed && !ignoreClosed(cx) ? last.from : void 0);
    }
    return tree.parent == null ? topIndent : null;
  }
  function topIndent() {
    return 0;
  }
  class TreeIndentContext extends IndentContext {
    constructor(base2, pos, context) {
      super(base2.state, base2.options);
      this.base = base2;
      this.pos = pos;
      this.context = context;
    }
    /**
    The syntax tree node to which the indentation strategy
    applies.
    */
    get node() {
      return this.context.node;
    }
    /**
    @internal
    */
    static create(base2, pos, context) {
      return new TreeIndentContext(base2, pos, context);
    }
    /**
    Get the text directly after `this.pos`, either the entire line
    or the next 100 characters, whichever is shorter.
    */
    get textAfter() {
      return this.textAfterPos(this.pos);
    }
    /**
    Get the indentation at the reference line for `this.node`, which
    is the line on which it starts, unless there is a node that is
    _not_ a parent of this node covering the start of that line. If
    so, the line at the start of that node is tried, again skipping
    on if it is covered by another such node.
    */
    get baseIndent() {
      return this.baseIndentFor(this.node);
    }
    /**
    Get the indentation for the reference line of the given node
    (see [`baseIndent`](https://codemirror.net/6/docs/ref/#language.TreeIndentContext.baseIndent)).
    */
    baseIndentFor(node) {
      let line = this.state.doc.lineAt(node.from);
      for (; ; ) {
        let atBreak = node.resolve(line.from);
        while (atBreak.parent && atBreak.parent.from == atBreak.from)
          atBreak = atBreak.parent;
        if (isParent(atBreak, node))
          break;
        line = this.state.doc.lineAt(atBreak.from);
      }
      return this.lineIndent(line.from);
    }
    /**
    Continue looking for indentations in the node's parent nodes,
    and return the result of that.
    */
    continue() {
      return indentFor(this.context.next, this.base, this.pos);
    }
  }
  function isParent(parent, of) {
    for (let cur = of; cur; cur = cur.parent)
      if (parent == cur)
        return true;
    return false;
  }
  function bracketedAligned(context) {
    let tree = context.node;
    let openToken = tree.childAfter(tree.from), last = tree.lastChild;
    if (!openToken)
      return null;
    let sim = context.options.simulateBreak;
    let openLine = context.state.doc.lineAt(openToken.from);
    let lineEnd = sim == null || sim <= openLine.from ? openLine.to : Math.min(openLine.to, sim);
    for (let pos = openToken.to; ; ) {
      let next = tree.childAfter(pos);
      if (!next || next == last)
        return null;
      if (!next.type.isSkipped)
        return next.from < lineEnd ? openToken : null;
      pos = next.to;
    }
  }
  function delimitedStrategy(context, align, units, closing, closedAt) {
    let after = context.textAfter, space = after.match(/^\s*/)[0].length;
    let closed = closing && after.slice(space, space + closing.length) == closing || closedAt == context.pos + space;
    let aligned = align ? bracketedAligned(context) : null;
    if (aligned)
      return closed ? context.column(aligned.from) : context.column(aligned.to);
    return context.baseIndent + (closed ? 0 : context.unit * units);
  }
  function continuedIndent({ except, units = 1 } = {}) {
    return (context) => {
      let matchExcept = except && except.test(context.textAfter);
      return context.baseIndent + (matchExcept ? 0 : units * context.unit);
    };
  }
  const foldNodeProp = /* @__PURE__ */ new NodeProp();
  function foldInside(node) {
    let first = node.firstChild, last = node.lastChild;
    return first && first.to < last.from ? { from: first.to, to: last.type.isError ? node.to : last.from } : null;
  }
  class HighlightStyle {
    constructor(specs, options) {
      this.specs = specs;
      let modSpec;
      function def(spec) {
        let cls = StyleModule.newName();
        (modSpec || (modSpec = /* @__PURE__ */ Object.create(null)))["." + cls] = spec;
        return cls;
      }
      const all = typeof options.all == "string" ? options.all : options.all ? def(options.all) : void 0;
      const scopeOpt = options.scope;
      this.scope = scopeOpt instanceof Language ? (type) => type.prop(languageDataProp) == scopeOpt.data : scopeOpt ? (type) => type == scopeOpt : void 0;
      this.style = tagHighlighter(specs.map((style) => ({
        tag: style.tag,
        class: style.class || def(Object.assign({}, style, { tag: null }))
      })), {
        all
      }).style;
      this.module = modSpec ? new StyleModule(modSpec) : null;
      this.themeType = options.themeType;
    }
    /**
    Create a highlighter style that associates the given styles to
    the given tags. The specs must be objects that hold a style tag
    or array of tags in their `tag` property, and either a single
    `class` property providing a static CSS class (for highlighter
    that rely on external styling), or a
    [`style-mod`](https://github.com/marijnh/style-mod#documentation)-style
    set of CSS properties (which define the styling for those tags).
    
    The CSS rules created for a highlighter will be emitted in the
    order of the spec's properties. That means that for elements that
    have multiple tags associated with them, styles defined further
    down in the list will have a higher CSS precedence than styles
    defined earlier.
    */
    static define(specs, options) {
      return new HighlightStyle(specs, options || {});
    }
  }
  const highlighterFacet = /* @__PURE__ */ Facet.define();
  const fallbackHighlighter = /* @__PURE__ */ Facet.define({
    combine(values) {
      return values.length ? [values[0]] : null;
    }
  });
  function getHighlighters(state) {
    let main = state.facet(highlighterFacet);
    return main.length ? main : state.facet(fallbackHighlighter);
  }
  function syntaxHighlighting(highlighter, options) {
    let ext = [treeHighlighter], themeType;
    if (highlighter instanceof HighlightStyle) {
      if (highlighter.module)
        ext.push(EditorView.styleModule.of(highlighter.module));
      themeType = highlighter.themeType;
    }
    if (options === null || options === void 0 ? void 0 : options.fallback)
      ext.push(fallbackHighlighter.of(highlighter));
    else if (themeType)
      ext.push(highlighterFacet.computeN([EditorView.darkTheme], (state) => {
        return state.facet(EditorView.darkTheme) == (themeType == "dark") ? [highlighter] : [];
      }));
    else
      ext.push(highlighterFacet.of(highlighter));
    return ext;
  }
  class TreeHighlighter {
    constructor(view) {
      this.markCache = /* @__PURE__ */ Object.create(null);
      this.tree = syntaxTree(view.state);
      this.decorations = this.buildDeco(view, getHighlighters(view.state));
    }
    update(update) {
      let tree = syntaxTree(update.state), highlighters = getHighlighters(update.state);
      let styleChange = highlighters != getHighlighters(update.startState);
      if (tree.length < update.view.viewport.to && !styleChange && tree.type == this.tree.type) {
        this.decorations = this.decorations.map(update.changes);
      } else if (tree != this.tree || update.viewportChanged || styleChange) {
        this.tree = tree;
        this.decorations = this.buildDeco(update.view, highlighters);
      }
    }
    buildDeco(view, highlighters) {
      if (!highlighters || !this.tree.length)
        return Decoration.none;
      let builder = new RangeSetBuilder();
      for (let { from, to } of view.visibleRanges) {
        highlightTree(this.tree, highlighters, (from2, to2, style) => {
          builder.add(from2, to2, this.markCache[style] || (this.markCache[style] = Decoration.mark({ class: style })));
        }, from, to);
      }
      return builder.finish();
    }
  }
  const treeHighlighter = /* @__PURE__ */ Prec.high(/* @__PURE__ */ ViewPlugin.fromClass(TreeHighlighter, {
    decorations: (v2) => v2.decorations
  }));
  const defaultHighlightStyle = /* @__PURE__ */ HighlightStyle.define([
    {
      tag: tags.meta,
      color: "#404740"
    },
    {
      tag: tags.link,
      textDecoration: "underline"
    },
    {
      tag: tags.heading,
      textDecoration: "underline",
      fontWeight: "bold"
    },
    {
      tag: tags.emphasis,
      fontStyle: "italic"
    },
    {
      tag: tags.strong,
      fontWeight: "bold"
    },
    {
      tag: tags.strikethrough,
      textDecoration: "line-through"
    },
    {
      tag: tags.keyword,
      color: "#708"
    },
    {
      tag: [tags.atom, tags.bool, tags.url, tags.contentSeparator, tags.labelName],
      color: "#219"
    },
    {
      tag: [tags.literal, tags.inserted],
      color: "#164"
    },
    {
      tag: [tags.string, tags.deleted],
      color: "#a11"
    },
    {
      tag: [tags.regexp, tags.escape, /* @__PURE__ */ tags.special(tags.string)],
      color: "#e40"
    },
    {
      tag: /* @__PURE__ */ tags.definition(tags.variableName),
      color: "#00f"
    },
    {
      tag: /* @__PURE__ */ tags.local(tags.variableName),
      color: "#30a"
    },
    {
      tag: [tags.typeName, tags.namespace],
      color: "#085"
    },
    {
      tag: tags.className,
      color: "#167"
    },
    {
      tag: [/* @__PURE__ */ tags.special(tags.variableName), tags.macroName],
      color: "#256"
    },
    {
      tag: /* @__PURE__ */ tags.definition(tags.propertyName),
      color: "#00c"
    },
    {
      tag: tags.comment,
      color: "#940"
    },
    {
      tag: tags.invalid,
      color: "#f00"
    }
  ]);
  const DefaultScanDist = 1e4, DefaultBrackets = "()[]{}";
  const bracketMatchingHandle = /* @__PURE__ */ new NodeProp();
  function matchingNodes(node, dir, brackets) {
    let byProp = node.prop(dir < 0 ? NodeProp.openedBy : NodeProp.closedBy);
    if (byProp)
      return byProp;
    if (node.name.length == 1) {
      let index = brackets.indexOf(node.name);
      if (index > -1 && index % 2 == (dir < 0 ? 1 : 0))
        return [brackets[index + dir]];
    }
    return null;
  }
  function findHandle(node) {
    let hasHandle = node.type.prop(bracketMatchingHandle);
    return hasHandle ? hasHandle(node.node) : node;
  }
  function matchBrackets(state, pos, dir, config = {}) {
    let maxScanDistance = config.maxScanDistance || DefaultScanDist, brackets = config.brackets || DefaultBrackets;
    let tree = syntaxTree(state), node = tree.resolveInner(pos, dir);
    for (let cur = node; cur; cur = cur.parent) {
      let matches = matchingNodes(cur.type, dir, brackets);
      if (matches && cur.from < cur.to) {
        let handle = findHandle(cur);
        if (handle && (dir > 0 ? pos >= handle.from && pos < handle.to : pos > handle.from && pos <= handle.to))
          return matchMarkedBrackets(state, pos, dir, cur, handle, matches, brackets);
      }
    }
    return matchPlainBrackets(state, pos, dir, tree, node.type, maxScanDistance, brackets);
  }
  function matchMarkedBrackets(_state, _pos, dir, token, handle, matching, brackets) {
    let parent = token.parent, firstToken = { from: handle.from, to: handle.to };
    let depth = 0, cursor = parent === null || parent === void 0 ? void 0 : parent.cursor();
    if (cursor && (dir < 0 ? cursor.childBefore(token.from) : cursor.childAfter(token.to)))
      do {
        if (dir < 0 ? cursor.to <= token.from : cursor.from >= token.to) {
          if (depth == 0 && matching.indexOf(cursor.type.name) > -1 && cursor.from < cursor.to) {
            let endHandle = findHandle(cursor);
            return { start: firstToken, end: endHandle ? { from: endHandle.from, to: endHandle.to } : void 0, matched: true };
          } else if (matchingNodes(cursor.type, dir, brackets)) {
            depth++;
          } else if (matchingNodes(cursor.type, -dir, brackets)) {
            if (depth == 0) {
              let endHandle = findHandle(cursor);
              return {
                start: firstToken,
                end: endHandle && endHandle.from < endHandle.to ? { from: endHandle.from, to: endHandle.to } : void 0,
                matched: false
              };
            }
            depth--;
          }
        }
      } while (dir < 0 ? cursor.prevSibling() : cursor.nextSibling());
    return { start: firstToken, matched: false };
  }
  function matchPlainBrackets(state, pos, dir, tree, tokenType, maxScanDistance, brackets) {
    let startCh = dir < 0 ? state.sliceDoc(pos - 1, pos) : state.sliceDoc(pos, pos + 1);
    let bracket2 = brackets.indexOf(startCh);
    if (bracket2 < 0 || bracket2 % 2 == 0 != dir > 0)
      return null;
    let startToken = { from: dir < 0 ? pos - 1 : pos, to: dir > 0 ? pos + 1 : pos };
    let iter = state.doc.iterRange(pos, dir > 0 ? state.doc.length : 0), depth = 0;
    for (let distance = 0; !iter.next().done && distance <= maxScanDistance; ) {
      let text = iter.value;
      if (dir < 0)
        distance += text.length;
      let basePos = pos + distance * dir;
      for (let pos2 = dir > 0 ? 0 : text.length - 1, end = dir > 0 ? text.length : -1; pos2 != end; pos2 += dir) {
        let found = brackets.indexOf(text[pos2]);
        if (found < 0 || tree.resolveInner(basePos + pos2, 1).type != tokenType)
          continue;
        if (found % 2 == 0 == dir > 0) {
          depth++;
        } else if (depth == 1) {
          return { start: startToken, end: { from: basePos + pos2, to: basePos + pos2 + 1 }, matched: found >> 1 == bracket2 >> 1 };
        } else {
          depth--;
        }
      }
      if (dir > 0)
        distance += text.length;
    }
    return iter.done ? { start: startToken, matched: false } : null;
  }
  const noTokens = /* @__PURE__ */ Object.create(null);
  const typeArray = [NodeType.none];
  const warned = [];
  const byTag = /* @__PURE__ */ Object.create(null);
  const defaultTable = /* @__PURE__ */ Object.create(null);
  for (let [legacyName, name2] of [
    ["variable", "variableName"],
    ["variable-2", "variableName.special"],
    ["string-2", "string.special"],
    ["def", "variableName.definition"],
    ["tag", "tagName"],
    ["attribute", "attributeName"],
    ["type", "typeName"],
    ["builtin", "variableName.standard"],
    ["qualifier", "modifier"],
    ["error", "invalid"],
    ["header", "heading"],
    ["property", "propertyName"]
  ])
    defaultTable[legacyName] = /* @__PURE__ */ createTokenType(noTokens, name2);
  function warnForPart(part, msg) {
    if (warned.indexOf(part) > -1)
      return;
    warned.push(part);
    console.warn(msg);
  }
  function createTokenType(extra, tagStr) {
    let tags$1 = [];
    for (let name3 of tagStr.split(" ")) {
      let found = [];
      for (let part of name3.split(".")) {
        let value = extra[part] || tags[part];
        if (!value) {
          warnForPart(part, `Unknown highlighting tag ${part}`);
        } else if (typeof value == "function") {
          if (!found.length)
            warnForPart(part, `Modifier ${part} used at start of tag`);
          else
            found = found.map(value);
        } else {
          if (found.length)
            warnForPart(part, `Tag ${part} used as modifier`);
          else
            found = Array.isArray(value) ? value : [value];
        }
      }
      for (let tag of found)
        tags$1.push(tag);
    }
    if (!tags$1.length)
      return 0;
    let name2 = tagStr.replace(/ /g, "_"), key = name2 + " " + tags$1.map((t2) => t2.id);
    let known = byTag[key];
    if (known)
      return known.id;
    let type = byTag[key] = NodeType.define({
      id: typeArray.length,
      name: name2,
      props: [styleTags({ [name2]: tags$1 })]
    });
    typeArray.push(type);
    return type.id;
  }
  ({
    rtl: /* @__PURE__ */ Decoration.mark({ class: "cm-iso", inclusive: true, attributes: { dir: "rtl" }, bidiIsolate: Direction.RTL }),
    ltr: /* @__PURE__ */ Decoration.mark({ class: "cm-iso", inclusive: true, attributes: { dir: "ltr" }, bidiIsolate: Direction.LTR }),
    auto: /* @__PURE__ */ Decoration.mark({ class: "cm-iso", inclusive: true, attributes: { dir: "auto" }, bidiIsolate: null })
  });
  const rustLanguage = /* @__PURE__ */ LRLanguage.define({
    name: "rust",
    parser: /* @__PURE__ */ parser.configure({
      props: [
        /* @__PURE__ */ indentNodeProp.add({
          IfExpression: /* @__PURE__ */ continuedIndent({ except: /^\s*({|else\b)/ }),
          "String BlockComment": () => null,
          "AttributeItem": (cx) => cx.continue(),
          "Statement MatchArm": /* @__PURE__ */ continuedIndent()
        }),
        /* @__PURE__ */ foldNodeProp.add((type) => {
          if (/(Block|edTokens|List)$/.test(type.name))
            return foldInside;
          if (type.name == "BlockComment")
            return (tree) => ({ from: tree.from + 2, to: tree.to - 2 });
          return void 0;
        })
      ]
    }),
    languageData: {
      commentTokens: { line: "//", block: { open: "/*", close: "*/" } },
      indentOnInput: /^\s*(?:\{|\})$/,
      closeBrackets: { stringPrefixes: ["b", "r", "br"] }
    }
  });
  function rust() {
    return new LanguageSupport(rustLanguage);
  }
  const toggleComment = (target) => {
    let { state } = target, line = state.doc.lineAt(state.selection.main.from), config = getConfig(target.state, line.from);
    return config.line ? toggleLineComment(target) : config.block ? toggleBlockCommentByLine(target) : false;
  };
  function command(f2, option) {
    return ({ state, dispatch }) => {
      if (state.readOnly)
        return false;
      let tr = f2(option, state);
      if (!tr)
        return false;
      dispatch(state.update(tr));
      return true;
    };
  }
  const toggleLineComment = /* @__PURE__ */ command(
    changeLineComment,
    0
    /* CommentOption.Toggle */
  );
  const toggleBlockComment = /* @__PURE__ */ command(
    changeBlockComment,
    0
    /* CommentOption.Toggle */
  );
  const toggleBlockCommentByLine = /* @__PURE__ */ command(
    (o2, s2) => changeBlockComment(o2, s2, selectedLineRanges(s2)),
    0
    /* CommentOption.Toggle */
  );
  function getConfig(state, pos) {
    let data = state.languageDataAt("commentTokens", pos);
    return data.length ? data[0] : {};
  }
  const SearchMargin = 50;
  function findBlockComment(state, { open, close }, from, to) {
    let textBefore = state.sliceDoc(from - SearchMargin, from);
    let textAfter = state.sliceDoc(to, to + SearchMargin);
    let spaceBefore = /\s*$/.exec(textBefore)[0].length, spaceAfter = /^\s*/.exec(textAfter)[0].length;
    let beforeOff = textBefore.length - spaceBefore;
    if (textBefore.slice(beforeOff - open.length, beforeOff) == open && textAfter.slice(spaceAfter, spaceAfter + close.length) == close) {
      return {
        open: { pos: from - spaceBefore, margin: spaceBefore && 1 },
        close: { pos: to + spaceAfter, margin: spaceAfter && 1 }
      };
    }
    let startText, endText;
    if (to - from <= 2 * SearchMargin) {
      startText = endText = state.sliceDoc(from, to);
    } else {
      startText = state.sliceDoc(from, from + SearchMargin);
      endText = state.sliceDoc(to - SearchMargin, to);
    }
    let startSpace = /^\s*/.exec(startText)[0].length, endSpace = /\s*$/.exec(endText)[0].length;
    let endOff = endText.length - endSpace - close.length;
    if (startText.slice(startSpace, startSpace + open.length) == open && endText.slice(endOff, endOff + close.length) == close) {
      return {
        open: {
          pos: from + startSpace + open.length,
          margin: /\s/.test(startText.charAt(startSpace + open.length)) ? 1 : 0
        },
        close: {
          pos: to - endSpace - close.length,
          margin: /\s/.test(endText.charAt(endOff - 1)) ? 1 : 0
        }
      };
    }
    return null;
  }
  function selectedLineRanges(state) {
    let ranges = [];
    for (let r2 of state.selection.ranges) {
      let fromLine = state.doc.lineAt(r2.from);
      let toLine = r2.to <= fromLine.to ? fromLine : state.doc.lineAt(r2.to);
      let last = ranges.length - 1;
      if (last >= 0 && ranges[last].to > fromLine.from)
        ranges[last].to = toLine.to;
      else
        ranges.push({ from: fromLine.from + /^\s*/.exec(fromLine.text)[0].length, to: toLine.to });
    }
    return ranges;
  }
  function changeBlockComment(option, state, ranges = state.selection.ranges) {
    let tokens = ranges.map((r2) => getConfig(state, r2.from).block);
    if (!tokens.every((c2) => c2))
      return null;
    let comments = ranges.map((r2, i2) => findBlockComment(state, tokens[i2], r2.from, r2.to));
    if (option != 2 && !comments.every((c2) => c2)) {
      return { changes: state.changes(ranges.map((range, i2) => {
        if (comments[i2])
          return [];
        return [{ from: range.from, insert: tokens[i2].open + " " }, { from: range.to, insert: " " + tokens[i2].close }];
      })) };
    } else if (option != 1 && comments.some((c2) => c2)) {
      let changes = [];
      for (let i2 = 0, comment2; i2 < comments.length; i2++)
        if (comment2 = comments[i2]) {
          let token = tokens[i2], { open, close } = comment2;
          changes.push({ from: open.pos - token.open.length, to: open.pos + open.margin }, { from: close.pos - close.margin, to: close.pos + token.close.length });
        }
      return { changes };
    }
    return null;
  }
  function changeLineComment(option, state, ranges = state.selection.ranges) {
    let lines = [];
    let prevLine = -1;
    for (let { from, to } of ranges) {
      let startI = lines.length, minIndent = 1e9;
      let token = getConfig(state, from).line;
      if (!token)
        continue;
      for (let pos = from; pos <= to; ) {
        let line = state.doc.lineAt(pos);
        if (line.from > prevLine && (from == to || to > line.from)) {
          prevLine = line.from;
          let indent = /^\s*/.exec(line.text)[0].length;
          let empty = indent == line.length;
          let comment2 = line.text.slice(indent, indent + token.length) == token ? indent : -1;
          if (indent < line.text.length && indent < minIndent)
            minIndent = indent;
          lines.push({ line, comment: comment2, token, indent, empty, single: false });
        }
        pos = line.to + 1;
      }
      if (minIndent < 1e9) {
        for (let i2 = startI; i2 < lines.length; i2++)
          if (lines[i2].indent < lines[i2].line.text.length)
            lines[i2].indent = minIndent;
      }
      if (lines.length == startI + 1)
        lines[startI].single = true;
    }
    if (option != 2 && lines.some((l2) => l2.comment < 0 && (!l2.empty || l2.single))) {
      let changes = [];
      for (let { line, token, indent, empty, single } of lines)
        if (single || !empty)
          changes.push({ from: line.from + indent, insert: token + " " });
      let changeSet = state.changes(changes);
      return { changes: changeSet, selection: state.selection.map(changeSet, 1) };
    } else if (option != 1 && lines.some((l2) => l2.comment >= 0)) {
      let changes = [];
      for (let { line, comment: comment2, token } of lines)
        if (comment2 >= 0) {
          let from = line.from + comment2, to = from + token.length;
          if (line.text[to - line.from] == " ")
            to++;
          changes.push({ from, to });
        }
      return { changes };
    }
    return null;
  }
  const fromHistory = /* @__PURE__ */ Annotation.define();
  const isolateHistory = /* @__PURE__ */ Annotation.define();
  const invertedEffects = /* @__PURE__ */ Facet.define();
  const historyConfig = /* @__PURE__ */ Facet.define({
    combine(configs) {
      return combineConfig(configs, {
        minDepth: 100,
        newGroupDelay: 500,
        joinToEvent: (_t, isAdjacent2) => isAdjacent2
      }, {
        minDepth: Math.max,
        newGroupDelay: Math.min,
        joinToEvent: (a2, b2) => (tr, adj) => a2(tr, adj) || b2(tr, adj)
      });
    }
  });
  const historyField_ = /* @__PURE__ */ StateField.define({
    create() {
      return HistoryState.empty;
    },
    update(state, tr) {
      let config = tr.state.facet(historyConfig);
      let fromHist = tr.annotation(fromHistory);
      if (fromHist) {
        let item = HistEvent.fromTransaction(tr, fromHist.selection), from = fromHist.side;
        let other = from == 0 ? state.undone : state.done;
        if (item)
          other = updateBranch(other, other.length, config.minDepth, item);
        else
          other = addSelection(other, tr.startState.selection);
        return new HistoryState(from == 0 ? fromHist.rest : other, from == 0 ? other : fromHist.rest);
      }
      let isolate = tr.annotation(isolateHistory);
      if (isolate == "full" || isolate == "before")
        state = state.isolate();
      if (tr.annotation(Transaction.addToHistory) === false)
        return !tr.changes.empty ? state.addMapping(tr.changes.desc) : state;
      let event = HistEvent.fromTransaction(tr);
      let time = tr.annotation(Transaction.time), userEvent = tr.annotation(Transaction.userEvent);
      if (event)
        state = state.addChanges(event, time, userEvent, config, tr);
      else if (tr.selection)
        state = state.addSelection(tr.startState.selection, time, userEvent, config.newGroupDelay);
      if (isolate == "full" || isolate == "after")
        state = state.isolate();
      return state;
    },
    toJSON(value) {
      return { done: value.done.map((e2) => e2.toJSON()), undone: value.undone.map((e2) => e2.toJSON()) };
    },
    fromJSON(json) {
      return new HistoryState(json.done.map(HistEvent.fromJSON), json.undone.map(HistEvent.fromJSON));
    }
  });
  function history(config = {}) {
    return [
      historyField_,
      historyConfig.of(config),
      EditorView.domEventHandlers({
        beforeinput(e2, view) {
          let command2 = e2.inputType == "historyUndo" ? undo : e2.inputType == "historyRedo" ? redo : null;
          if (!command2)
            return false;
          e2.preventDefault();
          return command2(view);
        }
      })
    ];
  }
  function cmd(side, selection) {
    return function({ state, dispatch }) {
      if (!selection && state.readOnly)
        return false;
      let historyState = state.field(historyField_, false);
      if (!historyState)
        return false;
      let tr = historyState.pop(side, state, selection);
      if (!tr)
        return false;
      dispatch(tr);
      return true;
    };
  }
  const undo = /* @__PURE__ */ cmd(0, false);
  const redo = /* @__PURE__ */ cmd(1, false);
  const undoSelection = /* @__PURE__ */ cmd(0, true);
  const redoSelection = /* @__PURE__ */ cmd(1, true);
  class HistEvent {
    constructor(changes, effects, mapped, startSelection, selectionsAfter) {
      this.changes = changes;
      this.effects = effects;
      this.mapped = mapped;
      this.startSelection = startSelection;
      this.selectionsAfter = selectionsAfter;
    }
    setSelAfter(after) {
      return new HistEvent(this.changes, this.effects, this.mapped, this.startSelection, after);
    }
    toJSON() {
      var _a3, _b2, _c;
      return {
        changes: (_a3 = this.changes) === null || _a3 === void 0 ? void 0 : _a3.toJSON(),
        mapped: (_b2 = this.mapped) === null || _b2 === void 0 ? void 0 : _b2.toJSON(),
        startSelection: (_c = this.startSelection) === null || _c === void 0 ? void 0 : _c.toJSON(),
        selectionsAfter: this.selectionsAfter.map((s2) => s2.toJSON())
      };
    }
    static fromJSON(json) {
      return new HistEvent(json.changes && ChangeSet.fromJSON(json.changes), [], json.mapped && ChangeDesc.fromJSON(json.mapped), json.startSelection && EditorSelection.fromJSON(json.startSelection), json.selectionsAfter.map(EditorSelection.fromJSON));
    }
    // This does not check `addToHistory` and such, it assumes the
    // transaction needs to be converted to an item. Returns null when
    // there are no changes or effects in the transaction.
    static fromTransaction(tr, selection) {
      let effects = none;
      for (let invert of tr.startState.facet(invertedEffects)) {
        let result = invert(tr);
        if (result.length)
          effects = effects.concat(result);
      }
      if (!effects.length && tr.changes.empty)
        return null;
      return new HistEvent(tr.changes.invert(tr.startState.doc), effects, void 0, selection || tr.startState.selection, none);
    }
    static selection(selections) {
      return new HistEvent(void 0, none, void 0, void 0, selections);
    }
  }
  function updateBranch(branch, to, maxLen, newEvent) {
    let start = to + 1 > maxLen + 20 ? to - maxLen - 1 : 0;
    let newBranch = branch.slice(start, to);
    newBranch.push(newEvent);
    return newBranch;
  }
  function isAdjacent(a2, b2) {
    let ranges = [], isAdjacent2 = false;
    a2.iterChangedRanges((f2, t2) => ranges.push(f2, t2));
    b2.iterChangedRanges((_f2, _t, f2, t2) => {
      for (let i2 = 0; i2 < ranges.length; ) {
        let from = ranges[i2++], to = ranges[i2++];
        if (t2 >= from && f2 <= to)
          isAdjacent2 = true;
      }
    });
    return isAdjacent2;
  }
  function eqSelectionShape(a2, b2) {
    return a2.ranges.length == b2.ranges.length && a2.ranges.filter((r2, i2) => r2.empty != b2.ranges[i2].empty).length === 0;
  }
  function conc(a2, b2) {
    return !a2.length ? b2 : !b2.length ? a2 : a2.concat(b2);
  }
  const none = [];
  const MaxSelectionsPerEvent = 200;
  function addSelection(branch, selection) {
    if (!branch.length) {
      return [HistEvent.selection([selection])];
    } else {
      let lastEvent = branch[branch.length - 1];
      let sels = lastEvent.selectionsAfter.slice(Math.max(0, lastEvent.selectionsAfter.length - MaxSelectionsPerEvent));
      if (sels.length && sels[sels.length - 1].eq(selection))
        return branch;
      sels.push(selection);
      return updateBranch(branch, branch.length - 1, 1e9, lastEvent.setSelAfter(sels));
    }
  }
  function popSelection(branch) {
    let last = branch[branch.length - 1];
    let newBranch = branch.slice();
    newBranch[branch.length - 1] = last.setSelAfter(last.selectionsAfter.slice(0, last.selectionsAfter.length - 1));
    return newBranch;
  }
  function addMappingToBranch(branch, mapping) {
    if (!branch.length)
      return branch;
    let length = branch.length, selections = none;
    while (length) {
      let event = mapEvent(branch[length - 1], mapping, selections);
      if (event.changes && !event.changes.empty || event.effects.length) {
        let result = branch.slice(0, length);
        result[length - 1] = event;
        return result;
      } else {
        mapping = event.mapped;
        length--;
        selections = event.selectionsAfter;
      }
    }
    return selections.length ? [HistEvent.selection(selections)] : none;
  }
  function mapEvent(event, mapping, extraSelections) {
    let selections = conc(event.selectionsAfter.length ? event.selectionsAfter.map((s2) => s2.map(mapping)) : none, extraSelections);
    if (!event.changes)
      return HistEvent.selection(selections);
    let mappedChanges = event.changes.map(mapping), before = mapping.mapDesc(event.changes, true);
    let fullMapping = event.mapped ? event.mapped.composeDesc(before) : before;
    return new HistEvent(mappedChanges, StateEffect.mapEffects(event.effects, mapping), fullMapping, event.startSelection.map(before), selections);
  }
  const joinableUserEvent = /^(input\.type|delete)($|\.)/;
  class HistoryState {
    constructor(done, undone, prevTime = 0, prevUserEvent = void 0) {
      this.done = done;
      this.undone = undone;
      this.prevTime = prevTime;
      this.prevUserEvent = prevUserEvent;
    }
    isolate() {
      return this.prevTime ? new HistoryState(this.done, this.undone) : this;
    }
    addChanges(event, time, userEvent, config, tr) {
      let done = this.done, lastEvent = done[done.length - 1];
      if (lastEvent && lastEvent.changes && !lastEvent.changes.empty && event.changes && (!userEvent || joinableUserEvent.test(userEvent)) && (!lastEvent.selectionsAfter.length && time - this.prevTime < config.newGroupDelay && config.joinToEvent(tr, isAdjacent(lastEvent.changes, event.changes)) || // For compose (but not compose.start) events, always join with previous event
      userEvent == "input.type.compose")) {
        done = updateBranch(done, done.length - 1, config.minDepth, new HistEvent(event.changes.compose(lastEvent.changes), conc(event.effects, lastEvent.effects), lastEvent.mapped, lastEvent.startSelection, none));
      } else {
        done = updateBranch(done, done.length, config.minDepth, event);
      }
      return new HistoryState(done, none, time, userEvent);
    }
    addSelection(selection, time, userEvent, newGroupDelay) {
      let last = this.done.length ? this.done[this.done.length - 1].selectionsAfter : none;
      if (last.length > 0 && time - this.prevTime < newGroupDelay && userEvent == this.prevUserEvent && userEvent && /^select($|\.)/.test(userEvent) && eqSelectionShape(last[last.length - 1], selection))
        return this;
      return new HistoryState(addSelection(this.done, selection), this.undone, time, userEvent);
    }
    addMapping(mapping) {
      return new HistoryState(addMappingToBranch(this.done, mapping), addMappingToBranch(this.undone, mapping), this.prevTime, this.prevUserEvent);
    }
    pop(side, state, onlySelection) {
      let branch = side == 0 ? this.done : this.undone;
      if (branch.length == 0)
        return null;
      let event = branch[branch.length - 1], selection = event.selectionsAfter[0] || state.selection;
      if (onlySelection && event.selectionsAfter.length) {
        return state.update({
          selection: event.selectionsAfter[event.selectionsAfter.length - 1],
          annotations: fromHistory.of({ side, rest: popSelection(branch), selection }),
          userEvent: side == 0 ? "select.undo" : "select.redo",
          scrollIntoView: true
        });
      } else if (!event.changes) {
        return null;
      } else {
        let rest = branch.length == 1 ? none : branch.slice(0, branch.length - 1);
        if (event.mapped)
          rest = addMappingToBranch(rest, event.mapped);
        return state.update({
          changes: event.changes,
          selection: event.startSelection,
          effects: event.effects,
          annotations: fromHistory.of({ side, rest, selection }),
          filter: false,
          userEvent: side == 0 ? "undo" : "redo",
          scrollIntoView: true
        });
      }
    }
  }
  HistoryState.empty = /* @__PURE__ */ new HistoryState(none, none);
  const historyKeymap = [
    { key: "Mod-z", run: undo, preventDefault: true },
    { key: "Mod-y", mac: "Mod-Shift-z", run: redo, preventDefault: true },
    { linux: "Ctrl-Shift-z", run: redo, preventDefault: true },
    { key: "Mod-u", run: undoSelection, preventDefault: true },
    { key: "Alt-u", mac: "Mod-Shift-u", run: redoSelection, preventDefault: true }
  ];
  function updateSel(sel, by) {
    return EditorSelection.create(sel.ranges.map(by), sel.mainIndex);
  }
  function setSel(state, selection) {
    return state.update({ selection, scrollIntoView: true, userEvent: "select" });
  }
  function moveSel({ state, dispatch }, how) {
    let selection = updateSel(state.selection, how);
    if (selection.eq(state.selection, true))
      return false;
    dispatch(setSel(state, selection));
    return true;
  }
  function rangeEnd(range, forward) {
    return EditorSelection.cursor(forward ? range.to : range.from);
  }
  function cursorByChar(view, forward) {
    return moveSel(view, (range) => range.empty ? view.moveByChar(range, forward) : rangeEnd(range, forward));
  }
  function ltrAtCursor(view) {
    return view.textDirectionAt(view.state.selection.main.head) == Direction.LTR;
  }
  const cursorCharLeft = (view) => cursorByChar(view, !ltrAtCursor(view));
  const cursorCharRight = (view) => cursorByChar(view, ltrAtCursor(view));
  function cursorByGroup(view, forward) {
    return moveSel(view, (range) => range.empty ? view.moveByGroup(range, forward) : rangeEnd(range, forward));
  }
  const cursorGroupLeft = (view) => cursorByGroup(view, !ltrAtCursor(view));
  const cursorGroupRight = (view) => cursorByGroup(view, ltrAtCursor(view));
  function interestingNode(state, node, bracketProp) {
    if (node.type.prop(bracketProp))
      return true;
    let len = node.to - node.from;
    return len && (len > 2 || /[^\s,.;:]/.test(state.sliceDoc(node.from, node.to))) || node.firstChild;
  }
  function moveBySyntax(state, start, forward) {
    let pos = syntaxTree(state).resolveInner(start.head);
    let bracketProp = forward ? NodeProp.closedBy : NodeProp.openedBy;
    for (let at = start.head; ; ) {
      let next = forward ? pos.childAfter(at) : pos.childBefore(at);
      if (!next)
        break;
      if (interestingNode(state, next, bracketProp))
        pos = next;
      else
        at = forward ? next.to : next.from;
    }
    let bracket2 = pos.type.prop(bracketProp), match, newPos;
    if (bracket2 && (match = forward ? matchBrackets(state, pos.from, 1) : matchBrackets(state, pos.to, -1)) && match.matched)
      newPos = forward ? match.end.to : match.end.from;
    else
      newPos = forward ? pos.to : pos.from;
    return EditorSelection.cursor(newPos, forward ? -1 : 1);
  }
  const cursorSyntaxLeft = (view) => moveSel(view, (range) => moveBySyntax(view.state, range, !ltrAtCursor(view)));
  const cursorSyntaxRight = (view) => moveSel(view, (range) => moveBySyntax(view.state, range, ltrAtCursor(view)));
  function cursorByLine(view, forward) {
    return moveSel(view, (range) => {
      if (!range.empty)
        return rangeEnd(range, forward);
      let moved = view.moveVertically(range, forward);
      return moved.head != range.head ? moved : view.moveToLineBoundary(range, forward);
    });
  }
  const cursorLineUp = (view) => cursorByLine(view, false);
  const cursorLineDown = (view) => cursorByLine(view, true);
  function pageInfo(view) {
    let selfScroll = view.scrollDOM.clientHeight < view.scrollDOM.scrollHeight - 2;
    let marginTop = 0, marginBottom = 0, height;
    if (selfScroll) {
      for (let source of view.state.facet(EditorView.scrollMargins)) {
        let margins = source(view);
        if (margins === null || margins === void 0 ? void 0 : margins.top)
          marginTop = Math.max(margins === null || margins === void 0 ? void 0 : margins.top, marginTop);
        if (margins === null || margins === void 0 ? void 0 : margins.bottom)
          marginBottom = Math.max(margins === null || margins === void 0 ? void 0 : margins.bottom, marginBottom);
      }
      height = view.scrollDOM.clientHeight - marginTop - marginBottom;
    } else {
      height = (view.dom.ownerDocument.defaultView || window).innerHeight;
    }
    return {
      marginTop,
      marginBottom,
      selfScroll,
      height: Math.max(view.defaultLineHeight, height - 5)
    };
  }
  function cursorByPage(view, forward) {
    let page = pageInfo(view);
    let { state } = view, selection = updateSel(state.selection, (range) => {
      return range.empty ? view.moveVertically(range, forward, page.height) : rangeEnd(range, forward);
    });
    if (selection.eq(state.selection))
      return false;
    let effect;
    if (page.selfScroll) {
      let startPos = view.coordsAtPos(state.selection.main.head);
      let scrollRect = view.scrollDOM.getBoundingClientRect();
      let scrollTop = scrollRect.top + page.marginTop, scrollBottom = scrollRect.bottom - page.marginBottom;
      if (startPos && startPos.top > scrollTop && startPos.bottom < scrollBottom)
        effect = EditorView.scrollIntoView(selection.main.head, { y: "start", yMargin: startPos.top - scrollTop });
    }
    view.dispatch(setSel(state, selection), { effects: effect });
    return true;
  }
  const cursorPageUp = (view) => cursorByPage(view, false);
  const cursorPageDown = (view) => cursorByPage(view, true);
  function moveByLineBoundary(view, start, forward) {
    let line = view.lineBlockAt(start.head), moved = view.moveToLineBoundary(start, forward);
    if (moved.head == start.head && moved.head != (forward ? line.to : line.from))
      moved = view.moveToLineBoundary(start, forward, false);
    if (!forward && moved.head == line.from && line.length) {
      let space = /^\s*/.exec(view.state.sliceDoc(line.from, Math.min(line.from + 100, line.to)))[0].length;
      if (space && start.head != line.from + space)
        moved = EditorSelection.cursor(line.from + space);
    }
    return moved;
  }
  const cursorLineBoundaryForward = (view) => moveSel(view, (range) => moveByLineBoundary(view, range, true));
  const cursorLineBoundaryBackward = (view) => moveSel(view, (range) => moveByLineBoundary(view, range, false));
  const cursorLineBoundaryLeft = (view) => moveSel(view, (range) => moveByLineBoundary(view, range, !ltrAtCursor(view)));
  const cursorLineBoundaryRight = (view) => moveSel(view, (range) => moveByLineBoundary(view, range, ltrAtCursor(view)));
  const cursorLineStart = (view) => moveSel(view, (range) => EditorSelection.cursor(view.lineBlockAt(range.head).from, 1));
  const cursorLineEnd = (view) => moveSel(view, (range) => EditorSelection.cursor(view.lineBlockAt(range.head).to, -1));
  function toMatchingBracket(state, dispatch, extend2) {
    let found = false, selection = updateSel(state.selection, (range) => {
      let matching = matchBrackets(state, range.head, -1) || matchBrackets(state, range.head, 1) || range.head > 0 && matchBrackets(state, range.head - 1, 1) || range.head < state.doc.length && matchBrackets(state, range.head + 1, -1);
      if (!matching || !matching.end)
        return range;
      found = true;
      let head = matching.start.from == range.head ? matching.end.to : matching.end.from;
      return extend2 ? EditorSelection.range(range.anchor, head) : EditorSelection.cursor(head);
    });
    if (!found)
      return false;
    dispatch(setSel(state, selection));
    return true;
  }
  const cursorMatchingBracket = ({ state, dispatch }) => toMatchingBracket(state, dispatch, false);
  function extendSel(view, how) {
    let selection = updateSel(view.state.selection, (range) => {
      let head = how(range);
      return EditorSelection.range(range.anchor, head.head, head.goalColumn, head.bidiLevel || void 0);
    });
    if (selection.eq(view.state.selection))
      return false;
    view.dispatch(setSel(view.state, selection));
    return true;
  }
  function selectByChar(view, forward) {
    return extendSel(view, (range) => view.moveByChar(range, forward));
  }
  const selectCharLeft = (view) => selectByChar(view, !ltrAtCursor(view));
  const selectCharRight = (view) => selectByChar(view, ltrAtCursor(view));
  function selectByGroup(view, forward) {
    return extendSel(view, (range) => view.moveByGroup(range, forward));
  }
  const selectGroupLeft = (view) => selectByGroup(view, !ltrAtCursor(view));
  const selectGroupRight = (view) => selectByGroup(view, ltrAtCursor(view));
  const selectSyntaxLeft = (view) => extendSel(view, (range) => moveBySyntax(view.state, range, !ltrAtCursor(view)));
  const selectSyntaxRight = (view) => extendSel(view, (range) => moveBySyntax(view.state, range, ltrAtCursor(view)));
  function selectByLine(view, forward) {
    return extendSel(view, (range) => view.moveVertically(range, forward));
  }
  const selectLineUp = (view) => selectByLine(view, false);
  const selectLineDown = (view) => selectByLine(view, true);
  function selectByPage(view, forward) {
    return extendSel(view, (range) => view.moveVertically(range, forward, pageInfo(view).height));
  }
  const selectPageUp = (view) => selectByPage(view, false);
  const selectPageDown = (view) => selectByPage(view, true);
  const selectLineBoundaryForward = (view) => extendSel(view, (range) => moveByLineBoundary(view, range, true));
  const selectLineBoundaryBackward = (view) => extendSel(view, (range) => moveByLineBoundary(view, range, false));
  const selectLineBoundaryLeft = (view) => extendSel(view, (range) => moveByLineBoundary(view, range, !ltrAtCursor(view)));
  const selectLineBoundaryRight = (view) => extendSel(view, (range) => moveByLineBoundary(view, range, ltrAtCursor(view)));
  const selectLineStart = (view) => extendSel(view, (range) => EditorSelection.cursor(view.lineBlockAt(range.head).from));
  const selectLineEnd = (view) => extendSel(view, (range) => EditorSelection.cursor(view.lineBlockAt(range.head).to));
  const cursorDocStart = ({ state, dispatch }) => {
    dispatch(setSel(state, { anchor: 0 }));
    return true;
  };
  const cursorDocEnd = ({ state, dispatch }) => {
    dispatch(setSel(state, { anchor: state.doc.length }));
    return true;
  };
  const selectDocStart = ({ state, dispatch }) => {
    dispatch(setSel(state, { anchor: state.selection.main.anchor, head: 0 }));
    return true;
  };
  const selectDocEnd = ({ state, dispatch }) => {
    dispatch(setSel(state, { anchor: state.selection.main.anchor, head: state.doc.length }));
    return true;
  };
  const selectAll = ({ state, dispatch }) => {
    dispatch(state.update({ selection: { anchor: 0, head: state.doc.length }, userEvent: "select" }));
    return true;
  };
  const selectLine = ({ state, dispatch }) => {
    let ranges = selectedLineBlocks(state).map(({ from, to }) => EditorSelection.range(from, Math.min(to + 1, state.doc.length)));
    dispatch(state.update({ selection: EditorSelection.create(ranges), userEvent: "select" }));
    return true;
  };
  const selectParentSyntax = ({ state, dispatch }) => {
    let selection = updateSel(state.selection, (range) => {
      var _a3;
      let stack = syntaxTree(state).resolveStack(range.from, 1);
      for (let cur = stack; cur; cur = cur.next) {
        let { node } = cur;
        if ((node.from < range.from && node.to >= range.to || node.to > range.to && node.from <= range.from) && ((_a3 = node.parent) === null || _a3 === void 0 ? void 0 : _a3.parent))
          return EditorSelection.range(node.to, node.from);
      }
      return range;
    });
    dispatch(setSel(state, selection));
    return true;
  };
  const simplifySelection = ({ state, dispatch }) => {
    let cur = state.selection, selection = null;
    if (cur.ranges.length > 1)
      selection = EditorSelection.create([cur.main]);
    else if (!cur.main.empty)
      selection = EditorSelection.create([EditorSelection.cursor(cur.main.head)]);
    if (!selection)
      return false;
    dispatch(setSel(state, selection));
    return true;
  };
  function deleteBy(target, by) {
    if (target.state.readOnly)
      return false;
    let event = "delete.selection", { state } = target;
    let changes = state.changeByRange((range) => {
      let { from, to } = range;
      if (from == to) {
        let towards = by(range);
        if (towards < from) {
          event = "delete.backward";
          towards = skipAtomic(target, towards, false);
        } else if (towards > from) {
          event = "delete.forward";
          towards = skipAtomic(target, towards, true);
        }
        from = Math.min(from, towards);
        to = Math.max(to, towards);
      } else {
        from = skipAtomic(target, from, false);
        to = skipAtomic(target, to, true);
      }
      return from == to ? { range } : { changes: { from, to }, range: EditorSelection.cursor(from, from < range.head ? -1 : 1) };
    });
    if (changes.changes.empty)
      return false;
    target.dispatch(state.update(changes, {
      scrollIntoView: true,
      userEvent: event,
      effects: event == "delete.selection" ? EditorView.announce.of(state.phrase("Selection deleted")) : void 0
    }));
    return true;
  }
  function skipAtomic(target, pos, forward) {
    if (target instanceof EditorView)
      for (let ranges of target.state.facet(EditorView.atomicRanges).map((f2) => f2(target)))
        ranges.between(pos, pos, (from, to) => {
          if (from < pos && to > pos)
            pos = forward ? to : from;
        });
    return pos;
  }
  const deleteByChar = (target, forward) => deleteBy(target, (range) => {
    let pos = range.from, { state } = target, line = state.doc.lineAt(pos), before, targetPos;
    if (!forward && pos > line.from && pos < line.from + 200 && !/[^ \t]/.test(before = line.text.slice(0, pos - line.from))) {
      if (before[before.length - 1] == "	")
        return pos - 1;
      let col = countColumn(before, state.tabSize), drop = col % getIndentUnit(state) || getIndentUnit(state);
      for (let i2 = 0; i2 < drop && before[before.length - 1 - i2] == " "; i2++)
        pos--;
      targetPos = pos;
    } else {
      targetPos = findClusterBreak(line.text, pos - line.from, forward, forward) + line.from;
      if (targetPos == pos && line.number != (forward ? state.doc.lines : 1))
        targetPos += forward ? 1 : -1;
      else if (!forward && /[\ufe00-\ufe0f]/.test(line.text.slice(targetPos - line.from, pos - line.from)))
        targetPos = findClusterBreak(line.text, targetPos - line.from, false, false) + line.from;
    }
    return targetPos;
  });
  const deleteCharBackward = (view) => deleteByChar(view, false);
  const deleteCharForward = (view) => deleteByChar(view, true);
  const deleteByGroup = (target, forward) => deleteBy(target, (range) => {
    let pos = range.head, { state } = target, line = state.doc.lineAt(pos);
    let categorize = state.charCategorizer(pos);
    for (let cat = null; ; ) {
      if (pos == (forward ? line.to : line.from)) {
        if (pos == range.head && line.number != (forward ? state.doc.lines : 1))
          pos += forward ? 1 : -1;
        break;
      }
      let next = findClusterBreak(line.text, pos - line.from, forward) + line.from;
      let nextChar = line.text.slice(Math.min(pos, next) - line.from, Math.max(pos, next) - line.from);
      let nextCat = categorize(nextChar);
      if (cat != null && nextCat != cat)
        break;
      if (nextChar != " " || pos != range.head)
        cat = nextCat;
      pos = next;
    }
    return pos;
  });
  const deleteGroupBackward = (target) => deleteByGroup(target, false);
  const deleteGroupForward = (target) => deleteByGroup(target, true);
  const deleteToLineEnd = (view) => deleteBy(view, (range) => {
    let lineEnd = view.lineBlockAt(range.head).to;
    return range.head < lineEnd ? lineEnd : Math.min(view.state.doc.length, range.head + 1);
  });
  const deleteLineBoundaryBackward = (view) => deleteBy(view, (range) => {
    let lineStart = view.moveToLineBoundary(range, false).head;
    return range.head > lineStart ? lineStart : Math.max(0, range.head - 1);
  });
  const deleteLineBoundaryForward = (view) => deleteBy(view, (range) => {
    let lineStart = view.moveToLineBoundary(range, true).head;
    return range.head < lineStart ? lineStart : Math.min(view.state.doc.length, range.head + 1);
  });
  const splitLine = ({ state, dispatch }) => {
    if (state.readOnly)
      return false;
    let changes = state.changeByRange((range) => {
      return {
        changes: { from: range.from, to: range.to, insert: Text.of(["", ""]) },
        range: EditorSelection.cursor(range.from)
      };
    });
    dispatch(state.update(changes, { scrollIntoView: true, userEvent: "input" }));
    return true;
  };
  const transposeChars = ({ state, dispatch }) => {
    if (state.readOnly)
      return false;
    let changes = state.changeByRange((range) => {
      if (!range.empty || range.from == 0 || range.from == state.doc.length)
        return { range };
      let pos = range.from, line = state.doc.lineAt(pos);
      let from = pos == line.from ? pos - 1 : findClusterBreak(line.text, pos - line.from, false) + line.from;
      let to = pos == line.to ? pos + 1 : findClusterBreak(line.text, pos - line.from, true) + line.from;
      return {
        changes: { from, to, insert: state.doc.slice(pos, to).append(state.doc.slice(from, pos)) },
        range: EditorSelection.cursor(to)
      };
    });
    if (changes.changes.empty)
      return false;
    dispatch(state.update(changes, { scrollIntoView: true, userEvent: "move.character" }));
    return true;
  };
  function selectedLineBlocks(state) {
    let blocks = [], upto = -1;
    for (let range of state.selection.ranges) {
      let startLine = state.doc.lineAt(range.from), endLine = state.doc.lineAt(range.to);
      if (!range.empty && range.to == endLine.from)
        endLine = state.doc.lineAt(range.to - 1);
      if (upto >= startLine.number) {
        let prev = blocks[blocks.length - 1];
        prev.to = endLine.to;
        prev.ranges.push(range);
      } else {
        blocks.push({ from: startLine.from, to: endLine.to, ranges: [range] });
      }
      upto = endLine.number + 1;
    }
    return blocks;
  }
  function moveLine(state, dispatch, forward) {
    if (state.readOnly)
      return false;
    let changes = [], ranges = [];
    for (let block of selectedLineBlocks(state)) {
      if (forward ? block.to == state.doc.length : block.from == 0)
        continue;
      let nextLine = state.doc.lineAt(forward ? block.to + 1 : block.from - 1);
      let size = nextLine.length + 1;
      if (forward) {
        changes.push({ from: block.to, to: nextLine.to }, { from: block.from, insert: nextLine.text + state.lineBreak });
        for (let r2 of block.ranges)
          ranges.push(EditorSelection.range(Math.min(state.doc.length, r2.anchor + size), Math.min(state.doc.length, r2.head + size)));
      } else {
        changes.push({ from: nextLine.from, to: block.from }, { from: block.to, insert: state.lineBreak + nextLine.text });
        for (let r2 of block.ranges)
          ranges.push(EditorSelection.range(r2.anchor - size, r2.head - size));
      }
    }
    if (!changes.length)
      return false;
    dispatch(state.update({
      changes,
      scrollIntoView: true,
      selection: EditorSelection.create(ranges, state.selection.mainIndex),
      userEvent: "move.line"
    }));
    return true;
  }
  const moveLineUp = ({ state, dispatch }) => moveLine(state, dispatch, false);
  const moveLineDown = ({ state, dispatch }) => moveLine(state, dispatch, true);
  function copyLine(state, dispatch, forward) {
    if (state.readOnly)
      return false;
    let changes = [];
    for (let block of selectedLineBlocks(state)) {
      if (forward)
        changes.push({ from: block.from, insert: state.doc.slice(block.from, block.to) + state.lineBreak });
      else
        changes.push({ from: block.to, insert: state.lineBreak + state.doc.slice(block.from, block.to) });
    }
    dispatch(state.update({ changes, scrollIntoView: true, userEvent: "input.copyline" }));
    return true;
  }
  const copyLineUp = ({ state, dispatch }) => copyLine(state, dispatch, false);
  const copyLineDown = ({ state, dispatch }) => copyLine(state, dispatch, true);
  const deleteLine = (view) => {
    if (view.state.readOnly)
      return false;
    let { state } = view, changes = state.changes(selectedLineBlocks(state).map(({ from, to }) => {
      if (from > 0)
        from--;
      else if (to < state.doc.length)
        to++;
      return { from, to };
    }));
    let selection = updateSel(state.selection, (range) => view.moveVertically(range, true)).map(changes);
    view.dispatch({ changes, selection, scrollIntoView: true, userEvent: "delete.line" });
    return true;
  };
  function isBetweenBrackets(state, pos) {
    if (/\(\)|\[\]|\{\}/.test(state.sliceDoc(pos - 1, pos + 1)))
      return { from: pos, to: pos };
    let context = syntaxTree(state).resolveInner(pos);
    let before = context.childBefore(pos), after = context.childAfter(pos), closedBy;
    if (before && after && before.to <= pos && after.from >= pos && (closedBy = before.type.prop(NodeProp.closedBy)) && closedBy.indexOf(after.name) > -1 && state.doc.lineAt(before.to).from == state.doc.lineAt(after.from).from && !/\S/.test(state.sliceDoc(before.to, after.from)))
      return { from: before.to, to: after.from };
    return null;
  }
  const insertNewlineAndIndent = /* @__PURE__ */ newlineAndIndent(false);
  const insertBlankLine = /* @__PURE__ */ newlineAndIndent(true);
  function newlineAndIndent(atEof) {
    return ({ state, dispatch }) => {
      if (state.readOnly)
        return false;
      let changes = state.changeByRange((range) => {
        let { from, to } = range, line = state.doc.lineAt(from);
        let explode = !atEof && from == to && isBetweenBrackets(state, from);
        if (atEof)
          from = to = (to <= line.to ? line : state.doc.lineAt(to)).to;
        let cx = new IndentContext(state, { simulateBreak: from, simulateDoubleBreak: !!explode });
        let indent = getIndentation(cx, from);
        if (indent == null)
          indent = countColumn(/^\s*/.exec(state.doc.lineAt(from).text)[0], state.tabSize);
        while (to < line.to && /\s/.test(line.text[to - line.from]))
          to++;
        if (explode)
          ({ from, to } = explode);
        else if (from > line.from && from < line.from + 100 && !/\S/.test(line.text.slice(0, from)))
          from = line.from;
        let insert2 = ["", indentString(state, indent)];
        if (explode)
          insert2.push(indentString(state, cx.lineIndent(line.from, -1)));
        return {
          changes: { from, to, insert: Text.of(insert2) },
          range: EditorSelection.cursor(from + 1 + insert2[1].length)
        };
      });
      dispatch(state.update(changes, { scrollIntoView: true, userEvent: "input" }));
      return true;
    };
  }
  function changeBySelectedLine(state, f2) {
    let atLine = -1;
    return state.changeByRange((range) => {
      let changes = [];
      for (let pos = range.from; pos <= range.to; ) {
        let line = state.doc.lineAt(pos);
        if (line.number > atLine && (range.empty || range.to > line.from)) {
          f2(line, changes, range);
          atLine = line.number;
        }
        pos = line.to + 1;
      }
      let changeSet = state.changes(changes);
      return {
        changes,
        range: EditorSelection.range(changeSet.mapPos(range.anchor, 1), changeSet.mapPos(range.head, 1))
      };
    });
  }
  const indentSelection = ({ state, dispatch }) => {
    if (state.readOnly)
      return false;
    let updated = /* @__PURE__ */ Object.create(null);
    let context = new IndentContext(state, { overrideIndentation: (start) => {
      let found = updated[start];
      return found == null ? -1 : found;
    } });
    let changes = changeBySelectedLine(state, (line, changes2, range) => {
      let indent = getIndentation(context, line.from);
      if (indent == null)
        return;
      if (!/\S/.test(line.text))
        indent = 0;
      let cur = /^\s*/.exec(line.text)[0];
      let norm = indentString(state, indent);
      if (cur != norm || range.from < line.from + cur.length) {
        updated[line.from] = indent;
        changes2.push({ from: line.from, to: line.from + cur.length, insert: norm });
      }
    });
    if (!changes.changes.empty)
      dispatch(state.update(changes, { userEvent: "indent" }));
    return true;
  };
  const indentMore = ({ state, dispatch }) => {
    if (state.readOnly)
      return false;
    dispatch(state.update(changeBySelectedLine(state, (line, changes) => {
      changes.push({ from: line.from, insert: state.facet(indentUnit) });
    }), { userEvent: "input.indent" }));
    return true;
  };
  const indentLess = ({ state, dispatch }) => {
    if (state.readOnly)
      return false;
    dispatch(state.update(changeBySelectedLine(state, (line, changes) => {
      let space = /^\s*/.exec(line.text)[0];
      if (!space)
        return;
      let col = countColumn(space, state.tabSize), keep = 0;
      let insert2 = indentString(state, Math.max(0, col - getIndentUnit(state)));
      while (keep < space.length && keep < insert2.length && space.charCodeAt(keep) == insert2.charCodeAt(keep))
        keep++;
      changes.push({ from: line.from + keep, to: line.from + space.length, insert: insert2.slice(keep) });
    }), { userEvent: "delete.dedent" }));
    return true;
  };
  const emacsStyleKeymap = [
    { key: "Ctrl-b", run: cursorCharLeft, shift: selectCharLeft, preventDefault: true },
    { key: "Ctrl-f", run: cursorCharRight, shift: selectCharRight },
    { key: "Ctrl-p", run: cursorLineUp, shift: selectLineUp },
    { key: "Ctrl-n", run: cursorLineDown, shift: selectLineDown },
    { key: "Ctrl-a", run: cursorLineStart, shift: selectLineStart },
    { key: "Ctrl-e", run: cursorLineEnd, shift: selectLineEnd },
    { key: "Ctrl-d", run: deleteCharForward },
    { key: "Ctrl-h", run: deleteCharBackward },
    { key: "Ctrl-k", run: deleteToLineEnd },
    { key: "Ctrl-Alt-h", run: deleteGroupBackward },
    { key: "Ctrl-o", run: splitLine },
    { key: "Ctrl-t", run: transposeChars },
    { key: "Ctrl-v", run: cursorPageDown }
  ];
  const standardKeymap = /* @__PURE__ */ [
    { key: "ArrowLeft", run: cursorCharLeft, shift: selectCharLeft, preventDefault: true },
    { key: "Mod-ArrowLeft", mac: "Alt-ArrowLeft", run: cursorGroupLeft, shift: selectGroupLeft, preventDefault: true },
    { mac: "Cmd-ArrowLeft", run: cursorLineBoundaryLeft, shift: selectLineBoundaryLeft, preventDefault: true },
    { key: "ArrowRight", run: cursorCharRight, shift: selectCharRight, preventDefault: true },
    { key: "Mod-ArrowRight", mac: "Alt-ArrowRight", run: cursorGroupRight, shift: selectGroupRight, preventDefault: true },
    { mac: "Cmd-ArrowRight", run: cursorLineBoundaryRight, shift: selectLineBoundaryRight, preventDefault: true },
    { key: "ArrowUp", run: cursorLineUp, shift: selectLineUp, preventDefault: true },
    { mac: "Cmd-ArrowUp", run: cursorDocStart, shift: selectDocStart },
    { mac: "Ctrl-ArrowUp", run: cursorPageUp, shift: selectPageUp },
    { key: "ArrowDown", run: cursorLineDown, shift: selectLineDown, preventDefault: true },
    { mac: "Cmd-ArrowDown", run: cursorDocEnd, shift: selectDocEnd },
    { mac: "Ctrl-ArrowDown", run: cursorPageDown, shift: selectPageDown },
    { key: "PageUp", run: cursorPageUp, shift: selectPageUp },
    { key: "PageDown", run: cursorPageDown, shift: selectPageDown },
    { key: "Home", run: cursorLineBoundaryBackward, shift: selectLineBoundaryBackward, preventDefault: true },
    { key: "Mod-Home", run: cursorDocStart, shift: selectDocStart },
    { key: "End", run: cursorLineBoundaryForward, shift: selectLineBoundaryForward, preventDefault: true },
    { key: "Mod-End", run: cursorDocEnd, shift: selectDocEnd },
    { key: "Enter", run: insertNewlineAndIndent },
    { key: "Mod-a", run: selectAll },
    { key: "Backspace", run: deleteCharBackward, shift: deleteCharBackward },
    { key: "Delete", run: deleteCharForward },
    { key: "Mod-Backspace", mac: "Alt-Backspace", run: deleteGroupBackward },
    { key: "Mod-Delete", mac: "Alt-Delete", run: deleteGroupForward },
    { mac: "Mod-Backspace", run: deleteLineBoundaryBackward },
    { mac: "Mod-Delete", run: deleteLineBoundaryForward }
  ].concat(/* @__PURE__ */ emacsStyleKeymap.map((b2) => ({ mac: b2.key, run: b2.run, shift: b2.shift })));
  const defaultKeymap = /* @__PURE__ */ [
    { key: "Alt-ArrowLeft", mac: "Ctrl-ArrowLeft", run: cursorSyntaxLeft, shift: selectSyntaxLeft },
    { key: "Alt-ArrowRight", mac: "Ctrl-ArrowRight", run: cursorSyntaxRight, shift: selectSyntaxRight },
    { key: "Alt-ArrowUp", run: moveLineUp },
    { key: "Shift-Alt-ArrowUp", run: copyLineUp },
    { key: "Alt-ArrowDown", run: moveLineDown },
    { key: "Shift-Alt-ArrowDown", run: copyLineDown },
    { key: "Escape", run: simplifySelection },
    { key: "Mod-Enter", run: insertBlankLine },
    { key: "Alt-l", mac: "Ctrl-l", run: selectLine },
    { key: "Mod-i", run: selectParentSyntax, preventDefault: true },
    { key: "Mod-[", run: indentLess },
    { key: "Mod-]", run: indentMore },
    { key: "Mod-Alt-\\", run: indentSelection },
    { key: "Shift-Mod-k", run: deleteLine },
    { key: "Shift-Mod-\\", run: cursorMatchingBracket },
    { key: "Mod-/", run: toggleComment },
    { key: "Alt-A", run: toggleBlockComment }
  ].concat(standardKeymap);
  const minimalSetup = /* @__PURE__ */ (() => [
    highlightSpecialChars(),
    history(),
    drawSelection(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap
    ])
  ])();
  /**
   * @license
   * Copyright 2019 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   */
  const t$3 = globalThis, e$4 = t$3.ShadowRoot && (void 0 === t$3.ShadyCSS || t$3.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype, s$3 = Symbol(), o$4 = /* @__PURE__ */ new WeakMap();
  let n$4 = class n {
    constructor(t2, e2, o2) {
      if (this._$cssResult$ = true, o2 !== s$3)
        throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
      this.cssText = t2, this.t = e2;
    }
    get styleSheet() {
      let t2 = this.o;
      const s2 = this.t;
      if (e$4 && void 0 === t2) {
        const e2 = void 0 !== s2 && 1 === s2.length;
        e2 && (t2 = o$4.get(s2)), void 0 === t2 && ((this.o = t2 = new CSSStyleSheet()).replaceSync(this.cssText), e2 && o$4.set(s2, t2));
      }
      return t2;
    }
    toString() {
      return this.cssText;
    }
  };
  const r$4 = (t2) => new n$4("string" == typeof t2 ? t2 : t2 + "", void 0, s$3), i$3 = (t2, ...e2) => {
    const o2 = 1 === t2.length ? t2[0] : e2.reduce((e3, s2, o3) => e3 + ((t3) => {
      if (true === t3._$cssResult$)
        return t3.cssText;
      if ("number" == typeof t3)
        return t3;
      throw Error("Value passed to 'css' function must be a 'css' function result: " + t3 + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
    })(s2) + t2[o3 + 1], t2[0]);
    return new n$4(o2, t2, s$3);
  }, S$1 = (s2, o2) => {
    if (e$4)
      s2.adoptedStyleSheets = o2.map((t2) => t2 instanceof CSSStyleSheet ? t2 : t2.styleSheet);
    else
      for (const e2 of o2) {
        const o3 = document.createElement("style"), n2 = t$3.litNonce;
        void 0 !== n2 && o3.setAttribute("nonce", n2), o3.textContent = e2.cssText, s2.appendChild(o3);
      }
  }, c$3 = e$4 ? (t2) => t2 : (t2) => t2 instanceof CSSStyleSheet ? ((t3) => {
    let e2 = "";
    for (const s2 of t3.cssRules)
      e2 += s2.cssText;
    return r$4(e2);
  })(t2) : t2;
  /**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   */
  const { is: i$2, defineProperty: e$3, getOwnPropertyDescriptor: r$3, getOwnPropertyNames: h$3, getOwnPropertySymbols: o$3, getPrototypeOf: n$3 } = Object, a$1 = globalThis, c$2 = a$1.trustedTypes, l$1 = c$2 ? c$2.emptyScript : "", p$1 = a$1.reactiveElementPolyfillSupport, d$1 = (t2, s2) => t2, u$1 = { toAttribute(t2, s2) {
    switch (s2) {
      case Boolean:
        t2 = t2 ? l$1 : null;
        break;
      case Object:
      case Array:
        t2 = null == t2 ? t2 : JSON.stringify(t2);
    }
    return t2;
  }, fromAttribute(t2, s2) {
    let i2 = t2;
    switch (s2) {
      case Boolean:
        i2 = null !== t2;
        break;
      case Number:
        i2 = null === t2 ? null : Number(t2);
        break;
      case Object:
      case Array:
        try {
          i2 = JSON.parse(t2);
        } catch (t3) {
          i2 = null;
        }
    }
    return i2;
  } }, f$3 = (t2, s2) => !i$2(t2, s2), y$1 = { attribute: true, type: String, converter: u$1, reflect: false, hasChanged: f$3 };
  Symbol.metadata ?? (Symbol.metadata = Symbol("metadata")), a$1.litPropertyMetadata ?? (a$1.litPropertyMetadata = /* @__PURE__ */ new WeakMap());
  class b extends HTMLElement {
    static addInitializer(t2) {
      this._$Ei(), (this.l ?? (this.l = [])).push(t2);
    }
    static get observedAttributes() {
      return this.finalize(), this._$Eh && [...this._$Eh.keys()];
    }
    static createProperty(t2, s2 = y$1) {
      if (s2.state && (s2.attribute = false), this._$Ei(), this.elementProperties.set(t2, s2), !s2.noAccessor) {
        const i2 = Symbol(), r2 = this.getPropertyDescriptor(t2, i2, s2);
        void 0 !== r2 && e$3(this.prototype, t2, r2);
      }
    }
    static getPropertyDescriptor(t2, s2, i2) {
      const { get: e2, set: h2 } = r$3(this.prototype, t2) ?? { get() {
        return this[s2];
      }, set(t3) {
        this[s2] = t3;
      } };
      return { get() {
        return e2 == null ? void 0 : e2.call(this);
      }, set(s3) {
        const r2 = e2 == null ? void 0 : e2.call(this);
        h2.call(this, s3), this.requestUpdate(t2, r2, i2);
      }, configurable: true, enumerable: true };
    }
    static getPropertyOptions(t2) {
      return this.elementProperties.get(t2) ?? y$1;
    }
    static _$Ei() {
      if (this.hasOwnProperty(d$1("elementProperties")))
        return;
      const t2 = n$3(this);
      t2.finalize(), void 0 !== t2.l && (this.l = [...t2.l]), this.elementProperties = new Map(t2.elementProperties);
    }
    static finalize() {
      if (this.hasOwnProperty(d$1("finalized")))
        return;
      if (this.finalized = true, this._$Ei(), this.hasOwnProperty(d$1("properties"))) {
        const t3 = this.properties, s2 = [...h$3(t3), ...o$3(t3)];
        for (const i2 of s2)
          this.createProperty(i2, t3[i2]);
      }
      const t2 = this[Symbol.metadata];
      if (null !== t2) {
        const s2 = litPropertyMetadata.get(t2);
        if (void 0 !== s2)
          for (const [t3, i2] of s2)
            this.elementProperties.set(t3, i2);
      }
      this._$Eh = /* @__PURE__ */ new Map();
      for (const [t3, s2] of this.elementProperties) {
        const i2 = this._$Eu(t3, s2);
        void 0 !== i2 && this._$Eh.set(i2, t3);
      }
      this.elementStyles = this.finalizeStyles(this.styles);
    }
    static finalizeStyles(s2) {
      const i2 = [];
      if (Array.isArray(s2)) {
        const e2 = new Set(s2.flat(1 / 0).reverse());
        for (const s3 of e2)
          i2.unshift(c$3(s3));
      } else
        void 0 !== s2 && i2.push(c$3(s2));
      return i2;
    }
    static _$Eu(t2, s2) {
      const i2 = s2.attribute;
      return false === i2 ? void 0 : "string" == typeof i2 ? i2 : "string" == typeof t2 ? t2.toLowerCase() : void 0;
    }
    constructor() {
      super(), this._$Ep = void 0, this.isUpdatePending = false, this.hasUpdated = false, this._$Em = null, this._$Ev();
    }
    _$Ev() {
      var _a3;
      this._$Eg = new Promise((t2) => this.enableUpdating = t2), this._$AL = /* @__PURE__ */ new Map(), this._$ES(), this.requestUpdate(), (_a3 = this.constructor.l) == null ? void 0 : _a3.forEach((t2) => t2(this));
    }
    addController(t2) {
      var _a3;
      (this._$E_ ?? (this._$E_ = /* @__PURE__ */ new Set())).add(t2), void 0 !== this.renderRoot && this.isConnected && ((_a3 = t2.hostConnected) == null ? void 0 : _a3.call(t2));
    }
    removeController(t2) {
      var _a3;
      (_a3 = this._$E_) == null ? void 0 : _a3.delete(t2);
    }
    _$ES() {
      const t2 = /* @__PURE__ */ new Map(), s2 = this.constructor.elementProperties;
      for (const i2 of s2.keys())
        this.hasOwnProperty(i2) && (t2.set(i2, this[i2]), delete this[i2]);
      t2.size > 0 && (this._$Ep = t2);
    }
    createRenderRoot() {
      const t2 = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
      return S$1(t2, this.constructor.elementStyles), t2;
    }
    connectedCallback() {
      var _a3;
      this.renderRoot ?? (this.renderRoot = this.createRenderRoot()), this.enableUpdating(true), (_a3 = this._$E_) == null ? void 0 : _a3.forEach((t2) => {
        var _a4;
        return (_a4 = t2.hostConnected) == null ? void 0 : _a4.call(t2);
      });
    }
    enableUpdating(t2) {
    }
    disconnectedCallback() {
      var _a3;
      (_a3 = this._$E_) == null ? void 0 : _a3.forEach((t2) => {
        var _a4;
        return (_a4 = t2.hostDisconnected) == null ? void 0 : _a4.call(t2);
      });
    }
    attributeChangedCallback(t2, s2, i2) {
      this._$AK(t2, i2);
    }
    _$EO(t2, s2) {
      var _a3;
      const i2 = this.constructor.elementProperties.get(t2), e2 = this.constructor._$Eu(t2, i2);
      if (void 0 !== e2 && true === i2.reflect) {
        const r2 = (void 0 !== ((_a3 = i2.converter) == null ? void 0 : _a3.toAttribute) ? i2.converter : u$1).toAttribute(s2, i2.type);
        this._$Em = t2, null == r2 ? this.removeAttribute(e2) : this.setAttribute(e2, r2), this._$Em = null;
      }
    }
    _$AK(t2, s2) {
      var _a3;
      const i2 = this.constructor, e2 = i2._$Eh.get(t2);
      if (void 0 !== e2 && this._$Em !== e2) {
        const t3 = i2.getPropertyOptions(e2), r2 = "function" == typeof t3.converter ? { fromAttribute: t3.converter } : void 0 !== ((_a3 = t3.converter) == null ? void 0 : _a3.fromAttribute) ? t3.converter : u$1;
        this._$Em = e2, this[e2] = r2.fromAttribute(s2, t3.type), this._$Em = null;
      }
    }
    requestUpdate(t2, s2, i2, e2 = false, r2) {
      if (void 0 !== t2) {
        if (i2 ?? (i2 = this.constructor.getPropertyOptions(t2)), !(i2.hasChanged ?? f$3)(e2 ? r2 : this[t2], s2))
          return;
        this.C(t2, s2, i2);
      }
      false === this.isUpdatePending && (this._$Eg = this._$EP());
    }
    C(t2, s2, i2) {
      this._$AL.has(t2) || this._$AL.set(t2, s2), true === i2.reflect && this._$Em !== t2 && (this._$Ej ?? (this._$Ej = /* @__PURE__ */ new Set())).add(t2);
    }
    async _$EP() {
      this.isUpdatePending = true;
      try {
        await this._$Eg;
      } catch (t3) {
        Promise.reject(t3);
      }
      const t2 = this.scheduleUpdate();
      return null != t2 && await t2, !this.isUpdatePending;
    }
    scheduleUpdate() {
      return this.performUpdate();
    }
    performUpdate() {
      var _a3;
      if (!this.isUpdatePending)
        return;
      if (!this.hasUpdated) {
        if (this.renderRoot ?? (this.renderRoot = this.createRenderRoot()), this._$Ep) {
          for (const [t4, s3] of this._$Ep)
            this[t4] = s3;
          this._$Ep = void 0;
        }
        const t3 = this.constructor.elementProperties;
        if (t3.size > 0)
          for (const [s3, i2] of t3)
            true !== i2.wrapped || this._$AL.has(s3) || void 0 === this[s3] || this.C(s3, this[s3], i2);
      }
      let t2 = false;
      const s2 = this._$AL;
      try {
        t2 = this.shouldUpdate(s2), t2 ? (this.willUpdate(s2), (_a3 = this._$E_) == null ? void 0 : _a3.forEach((t3) => {
          var _a4;
          return (_a4 = t3.hostUpdate) == null ? void 0 : _a4.call(t3);
        }), this.update(s2)) : this._$ET();
      } catch (s3) {
        throw t2 = false, this._$ET(), s3;
      }
      t2 && this._$AE(s2);
    }
    willUpdate(t2) {
    }
    _$AE(t2) {
      var _a3;
      (_a3 = this._$E_) == null ? void 0 : _a3.forEach((t3) => {
        var _a4;
        return (_a4 = t3.hostUpdated) == null ? void 0 : _a4.call(t3);
      }), this.hasUpdated || (this.hasUpdated = true, this.firstUpdated(t2)), this.updated(t2);
    }
    _$ET() {
      this._$AL = /* @__PURE__ */ new Map(), this.isUpdatePending = false;
    }
    get updateComplete() {
      return this.getUpdateComplete();
    }
    getUpdateComplete() {
      return this._$Eg;
    }
    shouldUpdate(t2) {
      return true;
    }
    update(t2) {
      this._$Ej && (this._$Ej = this._$Ej.forEach((t3) => this._$EO(t3, this[t3]))), this._$ET();
    }
    updated(t2) {
    }
    firstUpdated(t2) {
    }
  }
  b.elementStyles = [], b.shadowRootOptions = { mode: "open" }, b[d$1("elementProperties")] = /* @__PURE__ */ new Map(), b[d$1("finalized")] = /* @__PURE__ */ new Map(), p$1 == null ? void 0 : p$1({ ReactiveElement: b }), (a$1.reactiveElementVersions ?? (a$1.reactiveElementVersions = [])).push("2.0.2");
  /**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   */
  const t$2 = globalThis, i$1 = t$2.trustedTypes, s$2 = i$1 ? i$1.createPolicy("lit-html", { createHTML: (t2) => t2 }) : void 0, e$2 = "$lit$", h$2 = `lit$${(Math.random() + "").slice(9)}$`, o$2 = "?" + h$2, n$2 = `<${o$2}>`, r$2 = document, l = () => r$2.createComment(""), c$1 = (t2) => null === t2 || "object" != typeof t2 && "function" != typeof t2, a = Array.isArray, u = (t2) => a(t2) || "function" == typeof (t2 == null ? void 0 : t2[Symbol.iterator]), d = "[ 	\n\f\r]", f$2 = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g, v = /-->/g, _ = />/g, m = RegExp(`>|${d}(?:([^\\s"'>=/]+)(${d}*=${d}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g"), p = /'/g, g = /"/g, $ = /^(?:script|style|textarea|title)$/i, y = (t2) => (i2, ...s2) => ({ _$litType$: t2, strings: i2, values: s2 }), x = y(1), w = Symbol.for("lit-noChange"), T = Symbol.for("lit-nothing"), A = /* @__PURE__ */ new WeakMap(), E = r$2.createTreeWalker(r$2, 129);
  function C(t2, i2) {
    if (!Array.isArray(t2) || !t2.hasOwnProperty("raw"))
      throw Error("invalid template strings array");
    return void 0 !== s$2 ? s$2.createHTML(i2) : i2;
  }
  const P = (t2, i2) => {
    const s2 = t2.length - 1, o2 = [];
    let r2, l2 = 2 === i2 ? "<svg>" : "", c2 = f$2;
    for (let i3 = 0; i3 < s2; i3++) {
      const s3 = t2[i3];
      let a2, u2, d2 = -1, y2 = 0;
      for (; y2 < s3.length && (c2.lastIndex = y2, u2 = c2.exec(s3), null !== u2); )
        y2 = c2.lastIndex, c2 === f$2 ? "!--" === u2[1] ? c2 = v : void 0 !== u2[1] ? c2 = _ : void 0 !== u2[2] ? ($.test(u2[2]) && (r2 = RegExp("</" + u2[2], "g")), c2 = m) : void 0 !== u2[3] && (c2 = m) : c2 === m ? ">" === u2[0] ? (c2 = r2 ?? f$2, d2 = -1) : void 0 === u2[1] ? d2 = -2 : (d2 = c2.lastIndex - u2[2].length, a2 = u2[1], c2 = void 0 === u2[3] ? m : '"' === u2[3] ? g : p) : c2 === g || c2 === p ? c2 = m : c2 === v || c2 === _ ? c2 = f$2 : (c2 = m, r2 = void 0);
      const x2 = c2 === m && t2[i3 + 1].startsWith("/>") ? " " : "";
      l2 += c2 === f$2 ? s3 + n$2 : d2 >= 0 ? (o2.push(a2), s3.slice(0, d2) + e$2 + s3.slice(d2) + h$2 + x2) : s3 + h$2 + (-2 === d2 ? i3 : x2);
    }
    return [C(t2, l2 + (t2[s2] || "<?>") + (2 === i2 ? "</svg>" : "")), o2];
  };
  class V {
    constructor({ strings: t2, _$litType$: s2 }, n2) {
      let r2;
      this.parts = [];
      let c2 = 0, a2 = 0;
      const u2 = t2.length - 1, d2 = this.parts, [f2, v2] = P(t2, s2);
      if (this.el = V.createElement(f2, n2), E.currentNode = this.el.content, 2 === s2) {
        const t3 = this.el.content.firstChild;
        t3.replaceWith(...t3.childNodes);
      }
      for (; null !== (r2 = E.nextNode()) && d2.length < u2; ) {
        if (1 === r2.nodeType) {
          if (r2.hasAttributes())
            for (const t3 of r2.getAttributeNames())
              if (t3.endsWith(e$2)) {
                const i2 = v2[a2++], s3 = r2.getAttribute(t3).split(h$2), e2 = /([.?@])?(.*)/.exec(i2);
                d2.push({ type: 1, index: c2, name: e2[2], strings: s3, ctor: "." === e2[1] ? k : "?" === e2[1] ? H : "@" === e2[1] ? I : R }), r2.removeAttribute(t3);
              } else
                t3.startsWith(h$2) && (d2.push({ type: 6, index: c2 }), r2.removeAttribute(t3));
          if ($.test(r2.tagName)) {
            const t3 = r2.textContent.split(h$2), s3 = t3.length - 1;
            if (s3 > 0) {
              r2.textContent = i$1 ? i$1.emptyScript : "";
              for (let i2 = 0; i2 < s3; i2++)
                r2.append(t3[i2], l()), E.nextNode(), d2.push({ type: 2, index: ++c2 });
              r2.append(t3[s3], l());
            }
          }
        } else if (8 === r2.nodeType)
          if (r2.data === o$2)
            d2.push({ type: 2, index: c2 });
          else {
            let t3 = -1;
            for (; -1 !== (t3 = r2.data.indexOf(h$2, t3 + 1)); )
              d2.push({ type: 7, index: c2 }), t3 += h$2.length - 1;
          }
        c2++;
      }
    }
    static createElement(t2, i2) {
      const s2 = r$2.createElement("template");
      return s2.innerHTML = t2, s2;
    }
  }
  function N(t2, i2, s2 = t2, e2) {
    var _a3, _b2;
    if (i2 === w)
      return i2;
    let h2 = void 0 !== e2 ? (_a3 = s2._$Co) == null ? void 0 : _a3[e2] : s2._$Cl;
    const o2 = c$1(i2) ? void 0 : i2._$litDirective$;
    return (h2 == null ? void 0 : h2.constructor) !== o2 && ((_b2 = h2 == null ? void 0 : h2._$AO) == null ? void 0 : _b2.call(h2, false), void 0 === o2 ? h2 = void 0 : (h2 = new o2(t2), h2._$AT(t2, s2, e2)), void 0 !== e2 ? (s2._$Co ?? (s2._$Co = []))[e2] = h2 : s2._$Cl = h2), void 0 !== h2 && (i2 = N(t2, h2._$AS(t2, i2.values), h2, e2)), i2;
  }
  class S {
    constructor(t2, i2) {
      this._$AV = [], this._$AN = void 0, this._$AD = t2, this._$AM = i2;
    }
    get parentNode() {
      return this._$AM.parentNode;
    }
    get _$AU() {
      return this._$AM._$AU;
    }
    u(t2) {
      const { el: { content: i2 }, parts: s2 } = this._$AD, e2 = ((t2 == null ? void 0 : t2.creationScope) ?? r$2).importNode(i2, true);
      E.currentNode = e2;
      let h2 = E.nextNode(), o2 = 0, n2 = 0, l2 = s2[0];
      for (; void 0 !== l2; ) {
        if (o2 === l2.index) {
          let i3;
          2 === l2.type ? i3 = new M(h2, h2.nextSibling, this, t2) : 1 === l2.type ? i3 = new l2.ctor(h2, l2.name, l2.strings, this, t2) : 6 === l2.type && (i3 = new L(h2, this, t2)), this._$AV.push(i3), l2 = s2[++n2];
        }
        o2 !== (l2 == null ? void 0 : l2.index) && (h2 = E.nextNode(), o2++);
      }
      return E.currentNode = r$2, e2;
    }
    p(t2) {
      let i2 = 0;
      for (const s2 of this._$AV)
        void 0 !== s2 && (void 0 !== s2.strings ? (s2._$AI(t2, s2, i2), i2 += s2.strings.length - 2) : s2._$AI(t2[i2])), i2++;
    }
  }
  class M {
    get _$AU() {
      var _a3;
      return ((_a3 = this._$AM) == null ? void 0 : _a3._$AU) ?? this._$Cv;
    }
    constructor(t2, i2, s2, e2) {
      this.type = 2, this._$AH = T, this._$AN = void 0, this._$AA = t2, this._$AB = i2, this._$AM = s2, this.options = e2, this._$Cv = (e2 == null ? void 0 : e2.isConnected) ?? true;
    }
    get parentNode() {
      let t2 = this._$AA.parentNode;
      const i2 = this._$AM;
      return void 0 !== i2 && 11 === (t2 == null ? void 0 : t2.nodeType) && (t2 = i2.parentNode), t2;
    }
    get startNode() {
      return this._$AA;
    }
    get endNode() {
      return this._$AB;
    }
    _$AI(t2, i2 = this) {
      t2 = N(this, t2, i2), c$1(t2) ? t2 === T || null == t2 || "" === t2 ? (this._$AH !== T && this._$AR(), this._$AH = T) : t2 !== this._$AH && t2 !== w && this._(t2) : void 0 !== t2._$litType$ ? this.g(t2) : void 0 !== t2.nodeType ? this.$(t2) : u(t2) ? this.T(t2) : this._(t2);
    }
    k(t2) {
      return this._$AA.parentNode.insertBefore(t2, this._$AB);
    }
    $(t2) {
      this._$AH !== t2 && (this._$AR(), this._$AH = this.k(t2));
    }
    _(t2) {
      this._$AH !== T && c$1(this._$AH) ? this._$AA.nextSibling.data = t2 : this.$(r$2.createTextNode(t2)), this._$AH = t2;
    }
    g(t2) {
      var _a3;
      const { values: i2, _$litType$: s2 } = t2, e2 = "number" == typeof s2 ? this._$AC(t2) : (void 0 === s2.el && (s2.el = V.createElement(C(s2.h, s2.h[0]), this.options)), s2);
      if (((_a3 = this._$AH) == null ? void 0 : _a3._$AD) === e2)
        this._$AH.p(i2);
      else {
        const t3 = new S(e2, this), s3 = t3.u(this.options);
        t3.p(i2), this.$(s3), this._$AH = t3;
      }
    }
    _$AC(t2) {
      let i2 = A.get(t2.strings);
      return void 0 === i2 && A.set(t2.strings, i2 = new V(t2)), i2;
    }
    T(t2) {
      a(this._$AH) || (this._$AH = [], this._$AR());
      const i2 = this._$AH;
      let s2, e2 = 0;
      for (const h2 of t2)
        e2 === i2.length ? i2.push(s2 = new M(this.k(l()), this.k(l()), this, this.options)) : s2 = i2[e2], s2._$AI(h2), e2++;
      e2 < i2.length && (this._$AR(s2 && s2._$AB.nextSibling, e2), i2.length = e2);
    }
    _$AR(t2 = this._$AA.nextSibling, i2) {
      var _a3;
      for ((_a3 = this._$AP) == null ? void 0 : _a3.call(this, false, true, i2); t2 && t2 !== this._$AB; ) {
        const i3 = t2.nextSibling;
        t2.remove(), t2 = i3;
      }
    }
    setConnected(t2) {
      var _a3;
      void 0 === this._$AM && (this._$Cv = t2, (_a3 = this._$AP) == null ? void 0 : _a3.call(this, t2));
    }
  }
  class R {
    get tagName() {
      return this.element.tagName;
    }
    get _$AU() {
      return this._$AM._$AU;
    }
    constructor(t2, i2, s2, e2, h2) {
      this.type = 1, this._$AH = T, this._$AN = void 0, this.element = t2, this.name = i2, this._$AM = e2, this.options = h2, s2.length > 2 || "" !== s2[0] || "" !== s2[1] ? (this._$AH = Array(s2.length - 1).fill(new String()), this.strings = s2) : this._$AH = T;
    }
    _$AI(t2, i2 = this, s2, e2) {
      const h2 = this.strings;
      let o2 = false;
      if (void 0 === h2)
        t2 = N(this, t2, i2, 0), o2 = !c$1(t2) || t2 !== this._$AH && t2 !== w, o2 && (this._$AH = t2);
      else {
        const e3 = t2;
        let n2, r2;
        for (t2 = h2[0], n2 = 0; n2 < h2.length - 1; n2++)
          r2 = N(this, e3[s2 + n2], i2, n2), r2 === w && (r2 = this._$AH[n2]), o2 || (o2 = !c$1(r2) || r2 !== this._$AH[n2]), r2 === T ? t2 = T : t2 !== T && (t2 += (r2 ?? "") + h2[n2 + 1]), this._$AH[n2] = r2;
      }
      o2 && !e2 && this.O(t2);
    }
    O(t2) {
      t2 === T ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t2 ?? "");
    }
  }
  class k extends R {
    constructor() {
      super(...arguments), this.type = 3;
    }
    O(t2) {
      this.element[this.name] = t2 === T ? void 0 : t2;
    }
  }
  class H extends R {
    constructor() {
      super(...arguments), this.type = 4;
    }
    O(t2) {
      this.element.toggleAttribute(this.name, !!t2 && t2 !== T);
    }
  }
  class I extends R {
    constructor(t2, i2, s2, e2, h2) {
      super(t2, i2, s2, e2, h2), this.type = 5;
    }
    _$AI(t2, i2 = this) {
      if ((t2 = N(this, t2, i2, 0) ?? T) === w)
        return;
      const s2 = this._$AH, e2 = t2 === T && s2 !== T || t2.capture !== s2.capture || t2.once !== s2.once || t2.passive !== s2.passive, h2 = t2 !== T && (s2 === T || e2);
      e2 && this.element.removeEventListener(this.name, this, s2), h2 && this.element.addEventListener(this.name, this, t2), this._$AH = t2;
    }
    handleEvent(t2) {
      var _a3;
      "function" == typeof this._$AH ? this._$AH.call(((_a3 = this.options) == null ? void 0 : _a3.host) ?? this.element, t2) : this._$AH.handleEvent(t2);
    }
  }
  class L {
    constructor(t2, i2, s2) {
      this.element = t2, this.type = 6, this._$AN = void 0, this._$AM = i2, this.options = s2;
    }
    get _$AU() {
      return this._$AM._$AU;
    }
    _$AI(t2) {
      N(this, t2);
    }
  }
  const Z = t$2.litHtmlPolyfillSupport;
  Z == null ? void 0 : Z(V, M), (t$2.litHtmlVersions ?? (t$2.litHtmlVersions = [])).push("3.1.0");
  const j = (t2, i2, s2) => {
    const e2 = (s2 == null ? void 0 : s2.renderBefore) ?? i2;
    let h2 = e2._$litPart$;
    if (void 0 === h2) {
      const t3 = (s2 == null ? void 0 : s2.renderBefore) ?? null;
      e2._$litPart$ = h2 = new M(i2.insertBefore(l(), t3), t3, void 0, s2 ?? {});
    }
    return h2._$AI(t2), h2;
  };
  /**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   */
  let s$1 = class s extends b {
    constructor() {
      super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
    }
    createRenderRoot() {
      var _a3;
      const t2 = super.createRenderRoot();
      return (_a3 = this.renderOptions).renderBefore ?? (_a3.renderBefore = t2.firstChild), t2;
    }
    update(t2) {
      const i2 = this.render();
      this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t2), this._$Do = j(i2, this.renderRoot, this.renderOptions);
    }
    connectedCallback() {
      var _a3;
      super.connectedCallback(), (_a3 = this._$Do) == null ? void 0 : _a3.setConnected(true);
    }
    disconnectedCallback() {
      var _a3;
      super.disconnectedCallback(), (_a3 = this._$Do) == null ? void 0 : _a3.setConnected(false);
    }
    render() {
      return w;
    }
  };
  s$1._$litElement$ = true, s$1["finalized"] = true, (_a2 = globalThis.litElementHydrateSupport) == null ? void 0 : _a2.call(globalThis, { LitElement: s$1 });
  const r$1 = globalThis.litElementPolyfillSupport;
  r$1 == null ? void 0 : r$1({ LitElement: s$1 });
  (globalThis.litElementVersions ?? (globalThis.litElementVersions = [])).push("4.0.2");
  /**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   */
  const t$1 = (t2) => (e2, o2) => {
    void 0 !== o2 ? o2.addInitializer(() => {
      customElements.define(t2, e2);
    }) : customElements.define(t2, e2);
  };
  /**
   * @license
   * Copyright 2020 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   */
  const f$1 = (o2) => void 0 === o2.strings;
  /**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   */
  const t = { ATTRIBUTE: 1, CHILD: 2, PROPERTY: 3, BOOLEAN_ATTRIBUTE: 4, EVENT: 5, ELEMENT: 6 }, e$1 = (t2) => (...e2) => ({ _$litDirective$: t2, values: e2 });
  class i {
    constructor(t2) {
    }
    get _$AU() {
      return this._$AM._$AU;
    }
    _$AT(t2, e2, i2) {
      this._$Ct = t2, this._$AM = e2, this._$Ci = i2;
    }
    _$AS(t2, e2) {
      return this.update(t2, e2);
    }
    update(t2, e2) {
      return this.render(...e2);
    }
  }
  /**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   */
  const s = (i2, t2) => {
    var _a3;
    const e2 = i2._$AN;
    if (void 0 === e2)
      return false;
    for (const i3 of e2)
      (_a3 = i3._$AO) == null ? void 0 : _a3.call(i3, t2, false), s(i3, t2);
    return true;
  }, o$1 = (i2) => {
    let t2, e2;
    do {
      if (void 0 === (t2 = i2._$AM))
        break;
      e2 = t2._$AN, e2.delete(i2), i2 = t2;
    } while (0 === (e2 == null ? void 0 : e2.size));
  }, r = (i2) => {
    for (let t2; t2 = i2._$AM; i2 = t2) {
      let e2 = t2._$AN;
      if (void 0 === e2)
        t2._$AN = e2 = /* @__PURE__ */ new Set();
      else if (e2.has(i2))
        break;
      e2.add(i2), c(t2);
    }
  };
  function h$1(i2) {
    void 0 !== this._$AN ? (o$1(this), this._$AM = i2, r(this)) : this._$AM = i2;
  }
  function n$1(i2, t2 = false, e2 = 0) {
    const r2 = this._$AH, h2 = this._$AN;
    if (void 0 !== h2 && 0 !== h2.size)
      if (t2)
        if (Array.isArray(r2))
          for (let i3 = e2; i3 < r2.length; i3++)
            s(r2[i3], false), o$1(r2[i3]);
        else
          null != r2 && (s(r2, false), o$1(r2));
      else
        s(this, i2);
  }
  const c = (i2) => {
    i2.type == t.CHILD && (i2._$AP ?? (i2._$AP = n$1), i2._$AQ ?? (i2._$AQ = h$1));
  };
  class f extends i {
    constructor() {
      super(...arguments), this._$AN = void 0;
    }
    _$AT(i2, t2, e2) {
      super._$AT(i2, t2, e2), r(this), this.isConnected = i2._$AU;
    }
    _$AO(i2, t2 = true) {
      var _a3, _b2;
      i2 !== this.isConnected && (this.isConnected = i2, i2 ? (_a3 = this.reconnected) == null ? void 0 : _a3.call(this) : (_b2 = this.disconnected) == null ? void 0 : _b2.call(this)), t2 && (s(this, i2), o$1(this));
    }
    setValue(t2) {
      if (f$1(this._$Ct))
        this._$Ct._$AI(t2, this);
      else {
        const i2 = [...this._$Ct._$AH];
        i2[this._$Ci] = t2, this._$Ct._$AI(i2, this, 0);
      }
    }
    disconnected() {
    }
    reconnected() {
    }
  }
  /**
   * @license
   * Copyright 2020 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   */
  const e = () => new h();
  class h {
  }
  const o = /* @__PURE__ */ new WeakMap(), n = e$1(class extends f {
    render(i2) {
      return T;
    }
    update(i2, [s2]) {
      var _a3;
      const e2 = s2 !== this.G;
      return e2 && void 0 !== this.G && this.ot(void 0), (e2 || this.rt !== this.lt) && (this.G = s2, this.ct = (_a3 = i2.options) == null ? void 0 : _a3.host, this.ot(this.lt = i2.element)), T;
    }
    ot(t2) {
      if ("function" == typeof this.G) {
        const i2 = this.ct ?? globalThis;
        let s2 = o.get(i2);
        void 0 === s2 && (s2 = /* @__PURE__ */ new WeakMap(), o.set(i2, s2)), void 0 !== s2.get(this.G) && this.G.call(this.ct, void 0), s2.set(this.G, t2), void 0 !== t2 && this.G.call(this.ct, t2);
      } else
        this.G.value = t2;
    }
    get rt() {
      var _a3, _b2;
      return "function" == typeof this.G ? (_a3 = o.get(this.ct ?? globalThis)) == null ? void 0 : _a3.get(this.G) : (_b2 = this.G) == null ? void 0 : _b2.value;
    }
    disconnected() {
      this.rt === this.lt && this.ot(void 0);
    }
    reconnected() {
      this.ot(this.lt);
    }
  });
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __decorateClass = (decorators, target, key, kind) => {
    var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
    for (var i2 = decorators.length - 1, decorator; i2 >= 0; i2--)
      if (decorator = decorators[i2])
        result = (kind ? decorator(target, key, result) : decorator(result)) || result;
    if (kind && result)
      __defProp(target, key, result);
    return result;
  };
  const codeHighlight = Decoration.mark({ class: "code-highlight" });
  exports.CodeDescription = class CodeDescription extends s$1 {
    constructor() {
      super(...arguments);
      this.codeRef = e();
      this.descRef = e();
    }
    firstUpdated() {
      let preEl = this.children.item(0);
      let codeEl = preEl.querySelector("code");
      let spans = {};
      let index = 0;
      codeEl.childNodes.forEach((node) => {
        if (node.nodeType == Node.TEXT_NODE) {
          index += node.textContent.length;
        } else if (node.nodeType == Node.ELEMENT_NODE) {
          let el = node;
          let end = index + el.innerText.length;
          let id = el.getAttribute("id");
          if (id)
            spans[id] = [index, end];
          index = end;
        } else {
          console.warn("Unexpected node type", node.nodeType);
        }
      });
      let code2 = preEl.innerText;
      let decorations2 = RangeSet.of(
        Object.values(spans).map(([from, to]) => codeHighlight.range(from, to))
      );
      this.editor = new EditorView({
        extensions: [
          minimalSetup,
          rust(),
          EditorState.readOnly.of(true),
          EditorView.decorations.of(decorations2)
        ],
        parent: this.codeRef.value,
        doc: code2
      });
    }
    render() {
      let desc = this.children.item(1);
      return x`
      <div ${n(this.codeRef)}></div>
      <div ${n(this.descRef)}>${desc}</div>
    `;
    }
  };
  exports.CodeDescription.styles = i$3`
    .code-highlight {
      text-decoration: underline;
    }
  `;
  exports.CodeDescription = __decorateClass([
    t$1("code-description")
  ], exports.CodeDescription);
  console.log("Loaded component script.");
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  return exports;
}({});
//# sourceMappingURL=bene-components.iife.js.map
