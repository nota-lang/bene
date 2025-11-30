import { log, type Rendition } from "bene-common";
import type { Annotation } from "bene-common/bindings/Annotation";
import type { Path } from "bene-common/bindings/Path";
import type { DocState } from "./index";

// Adapted from https://stackoverflow.com/a/12823606
function getTextRanges(fullRange: Range): Range[] {
  let root = fullRange.commonAncestorContainer;

  let collectAncestors = (node: Node): Node[] => {
    let nodes = [];
    while (node !== root) {
      nodes.push(node);
      node = node.parentNode!;
    }
    return nodes;
  };

  let startAncestors = collectAncestors(fullRange.startContainer);
  let endAncestors = collectAncestors(fullRange.endContainer);

  if (startAncestors.length === 0 && endAncestors.length === 0)
    return [fullRange];

  let ranges = [];
  for (let i = 0; i < startAncestors.length; i++) {
    let range = new Range();
    if (i > 0) {
      range.setStartAfter(startAncestors[i - 1]);
      range.setEndAfter(startAncestors[i].lastChild!);
    } else {
      range.setStart(startAncestors[i], fullRange.startOffset);
      range.setEndAfter(
        startAncestors[i].nodeType === Node.TEXT_NODE
          ? startAncestors[i]
          : startAncestors[i].lastChild!
      );
    }
    ranges.push(range);
  }

  for (let i = 0; i < endAncestors.length; i++) {
    let range = new Range();
    if (i > 0) {
      range.setStartBefore(endAncestors[i].firstChild!);
      range.setEndBefore(endAncestors[i - 1]);
    } else {
      range.setStartBefore(
        endAncestors[i].nodeType === Node.TEXT_NODE
          ? endAncestors[i]
          : endAncestors[i].firstChild!
      );
      range.setEnd(endAncestors[i], fullRange.endOffset);
    }
    ranges.push(range);
  }

  let range = new Range();
  range.setStartAfter(startAncestors[startAncestors.length - 1]);
  range.setEndBefore(endAncestors[endAncestors.length - 1]);
  ranges.push(range);

  return ranges;
}

class Cursor {
  constructor(
    public node: Element | Text,
    public window: Window & typeof globalThis,
    public offset: number | undefined = undefined
  ) {}
}

class Resolver {
  constructor(
    readonly rendition: Rendition,
    readonly chapterHref: string,
    readonly contentDoc: Document,
    readonly contentWindow: Window & typeof globalThis
  ) {}

  resolve(cursor: Cursor, path: Path): boolean {
    let nodeIsNotMark = (node: Node): boolean =>
      !(node instanceof cursor.window.Element && node.tagName === "MARK");

    let i = 0;
    for (let elem of path.components) {
      if (elem.type === "Step") {
        let index = elem.value;
        let nodeIndex: number, isText: boolean;
        if (index % 2 === 0) {
          nodeIndex = index / 2 - 1;
          isText = false;
        } else {
          nodeIndex = (index - 1) / 2 - 1;
          isText = true;
        }

        if (!(cursor.node instanceof cursor.window.Element))
          throw Error("invalid CFI, tried to step into non-parent");

        if (i === path.components.length - 1) {
          let children = Array.from(cursor.node.children).filter(nodeIsNotMark);
          if (nodeIndex >= cursor.node.children.length)
            throw Error("invalid CFI, tried to index outside node list");

          if (!isText) cursor.node = children[nodeIndex];
          else {
            let textOrMark =
              nodeIndex === -1
                ? cursor.node.childNodes[0]
                : children[nodeIndex].nextSibling;
            let textNodes: Text[] = [];

            while (true) {
              if (
                textOrMark instanceof cursor.window.Text ||
                textOrMark instanceof Text // TODO: UTTER HACK
              )
                textNodes.push(textOrMark);
              else if (
                textOrMark instanceof cursor.window.Element &&
                textOrMark.tagName === "MARK"
              )
                textNodes.push(textOrMark.childNodes[0] as Text);
              else break;
              textOrMark = textOrMark.nextSibling;
            }

            let len = 0;
            let i = 0;

            if (path.offset === null || path.offset.type !== "Character")
              throw Error("missing offset");
            let offset = path.offset.value;
            while (i < textNodes.length) {
              let nodeLen = textNodes[i].textContent?.length || 0;
              if (len + nodeLen >= offset) break;
              ++i;
              len += nodeLen;
            }

            if (i === textNodes.length)
              throw Error("invalid CFI, missing text node for offset");

            cursor.node = textNodes[i];
            cursor.offset = offset - len;
          }
        } else {
          if (nodeIndex >= cursor.node.children.length)
            throw Error("invalid CFI, tried to index outside node list");
          cursor.node = cursor.node.children[nodeIndex];
        }
      } else if (elem.type === "Assertion") {
        let assertion = elem.value;
        if (assertion.type === "Id") {
          if (!(cursor.node instanceof cursor.window.Element))
            throw Error("invalid CFI, expected element and found text node");
          if (cursor.node.id !== assertion.value)
            throw Error(
              `invalid ID in CFI, expected "${assertion.value}", found "${cursor.node.id}"`
            );
        }
      } else if (elem.type === "Indirection") {
        if (!(cursor.node instanceof cursor.window.Element))
          throw Error("invalid indirection in CFI");
        let idref = cursor.node.getAttribute("idref");
        let item = this.rendition.package.manifest.item.find(
          item => item["@id"] === idref
        )!;
        if (item["@href"] !== this.chapterHref) return false;
        cursor.node = this.contentDoc.documentElement;
        cursor.window = this.contentWindow;
      }
      ++i;
    }
    return true;
  }
}

export function annotateSelection(
  contentDoc: Document,
  contentWindow: Window & typeof globalThis,
  state: DocState,
  chapterHref: string,
  selection: Selection
) {
  let rendition = state.rendition();
  const pkg = new DOMParser().parseFromString(
    rendition.package_string,
    "application/xhtml+xml"
  );
  let item = pkg.querySelector(`manifest item[href="${state.chapterHref()}"]`)!;
  let spine = pkg.querySelector("spine")!;
  let index = Array.from(spine.children).findIndex(
    itemref => itemref.getAttribute("idref") === item.id
  );

  let path: Path = {
    components: [
      {
        type: "Step",
        value: 6
      },
      {
        type: "Step",
        value: 2 * (index + 1)
      },
      {
        type: "Indirection"
      }
    ],
    offset: null
  };

  let ranges = selection.getComposedRanges();
  let range = ranges[0];

  let nodeIsNotMark = (node: Node): boolean =>
    !(node instanceof contentWindow.Element && node.tagName === "MARK");

  function computePath(node: Node, offset: number): Path {
    let path: Path = { components: [], offset: null };

    if (node.nodeType === Node.TEXT_NODE) {
      let prefixLength = 0;

      let cursor = node.previousSibling;
      while (
        cursor !== null &&
        (cursor instanceof contentWindow.Text ||
          cursor instanceof Text ||
          !nodeIsNotMark(cursor))
      ) {
        prefixLength += cursor.textContent?.length || 0;
        cursor = cursor.previousSibling;
      }

      path.offset = {
        type: "Character",
        value: prefixLength + offset
      };
    }

    while (node !== contentDoc.documentElement) {
      let index: number;
      let parent = node.parentNode!;
      let children = Array.from(parent.children).filter(nodeIsNotMark);
      let childNodes = Array.from(parent.childNodes).filter(nodeIsNotMark);
      let nodeIndex = childNodes.indexOf(node as ChildNode);
      if (node.nodeType === Node.TEXT_NODE) {
        if (nodeIndex === 0) {
          index = 1;
        } else {
          let prev = childNodes[nodeIndex - 1] as Element;
          index = (children.indexOf(prev) + 1) * 2 + 1;
        }
      } else {
        index = (children.indexOf(node as Element) + 1) * 2;
      }
      path.components.push({
        type: "Step",
        value: index
      });
      node = parent;
    }

    path.components = path.components.reverse();
    return path;
  }

  let from = computePath(range.startContainer, range.startOffset);
  let to = computePath(range.endContainer, range.endOffset);
  let selector = {
    path,
    range: { from, to }
  };
  let annotation: Annotation = {
    selector,
    body: null
  };
  addAnnotation(contentDoc, contentWindow, state, chapterHref, annotation);
}

function addAnnotation(
  contentDoc: Document,
  contentWindow: Window & typeof globalThis,
  state: DocState,
  chapterHref: string,
  { selector }: Annotation
) {
  let resolver = new Resolver(
    state.rendition(),
    chapterHref,
    contentDoc,
    contentWindow
  );
  let rendition = state.rendition();

  // TODO: not ideal that we ship & re-parse the XML here.
  // Ideally that would be done on the Rust side, and the item
  // IDs attached directly to annotations.
  const pkg = new DOMParser().parseFromString(
    rendition.package_string,
    "application/xhtml+xml"
  );

  let cursor = new Cursor(pkg.querySelector("package")!, window);
  if (!resolver.resolve(cursor, selector.path)) return;
  log.debug("After initial resolution, cursor points to", cursor.node);

  if (!selector.range) throw Error("todo: handle point annotations");

  let { from, to } = selector.range;
  let fromCursor = cursor;
  let toCursor = new Cursor(fromCursor.node, fromCursor.window);

  resolver.resolve(fromCursor, from);
  resolver.resolve(toCursor, to);

  log.debug(
    "From cursor points to",
    fromCursor.node,
    fromCursor.node.parentNode
  );
  log.debug("To cursor points to", toCursor.node, toCursor.node.parentNode);

  let range = new contentWindow.Range();
  range.setStart(fromCursor.node, fromCursor.offset!);
  range.setEnd(toCursor.node, toCursor.offset!);

  for (let textRange of getTextRanges(range)) {
    let mark = contentDoc.createElement("mark");
    textRange.surroundContents(mark);
  }
}

export function addAnnotations(
  contentDoc: Document,
  contentWindow: Window & typeof globalThis,
  state: DocState,
  chapterHref: string
) {
  for (let annot of state.rendition().annotations) {
    addAnnotation(contentDoc, contentWindow, state, chapterHref, annot);
  }
}
