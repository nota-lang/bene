import type { Rendition } from "bene-types";
import type { Annotation } from "bene-types/bindings/Annotation";
import type { Path } from "bene-types/bindings/Path";
import { type DocState, useDocState } from "./index";
import { type Plugin, SolidPlugin } from "./plugin";

function getTextRanges(fullRange: Range): Range[] {
  // TODO: this might cause perf issues in large docs because some selections
  // will have the entire document as the root, so all text will be iterated over.
  let root = fullRange.commonAncestorContainer;
  let iter = document.createNodeIterator(root, NodeFilter.SHOW_TEXT);
  let ranges = [];
  while (true) {
    let node = iter.nextNode() as Text | null;
    if (node === null) break;

    // TODO: the `.match` is because bulk selections between nodes will include random
    // whitespace that isn't really logically part of the document, and whose annotations
    // aren't visible. This heuristic eliminates them, but would also in theory prevent
    // annotations on e.g. a space between two inline elements.
    if (fullRange.intersectsNode(node) && !node.textContent.match(/^\s+$/)) {
      let start = node === fullRange.startContainer ? fullRange.startOffset : 0;
      let end =
        node === fullRange.endContainer
          ? fullRange.endOffset
          : node.textContent.length;

      let range = new Range();
      range.setStart(node, start);
      range.setEnd(node, end);
      ranges.push(range);
    }
  }

  return ranges;
}

class CFICursor {
  constructor(
    public node: Element | Text,
    public window: Window & typeof globalThis,
    public offset: number | undefined = undefined
  ) {}
}

class CFIResolver {
  constructor(
    readonly rendition: Rendition,
    readonly chapterHref: string,
    readonly contentDoc: Document,
    readonly contentWindow: Window & typeof globalThis
  ) {}

  resolve(cursor: CFICursor, path: Path): boolean {
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

function annotateSelection(
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
  let resolver = new CFIResolver(
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

  let cursor = new CFICursor(pkg.querySelector("package")!, window);
  if (!resolver.resolve(cursor, selector.path)) return;
  console.debug("After initial resolution, cursor points to", cursor.node);

  if (!selector.range) throw Error("TODO: handle point annotations");

  let { from, to } = selector.range;
  let fromCursor = cursor;
  let toCursor = new CFICursor(fromCursor.node, fromCursor.window);

  resolver.resolve(fromCursor, from);
  resolver.resolve(toCursor, to);

  console.debug(
    "From cursor points to",
    fromCursor.node,
    fromCursor.node.parentNode
  );
  console.debug("To cursor points to", toCursor.node, toCursor.node.parentNode);

  let range = new contentWindow.Range();
  range.setStart(fromCursor.node, fromCursor.offset!);
  range.setEnd(toCursor.node, toCursor.offset!);

  for (let textRange of getTextRanges(range)) {
    if (textRange.startContainer.parentElement!.tagName === "MARK") {
      // todo
    } else {
      let mark = contentDoc.createElement("mark");
      textRange.surroundContents(mark);
    }
  }
}

function addAnnotations(
  _contentDoc: Document,
  _contentWindow: Window & typeof globalThis,
  _state: DocState,
  _chapterHref: string
) {
  // for (let annot of state.rendition().annotations) {
  //   addAnnotation(contentDoc, contentWindow, state, chapterHref, annot);
  // }
}

interface AnnotationState {
  annotations: Annotation[];
}

export class AnnotationPlugin
  extends SolidPlugin<AnnotationState>
  implements Plugin
{
  initialState() {
    return { annotations: [] };
  }

  Toolbar = () => {
    let [docState] = useDocState();

    function highlightSelection() {
      let selection = docState.iframe!.contentWindow!.getSelection();
      if (!selection) return;

      annotateSelection(
        docState.iframe!.contentDocument!,
        docState.iframe!.contentWindow! as Window & typeof globalThis,
        docState,
        docState.chapterHref(),
        selection
      );
    }

    return (
      <button
        type="button"
        class="icon-button highlight"
        aria-label="Highlight text"
        onClick={highlightSelection}
      />
    );
  };

  mount(document: Document, window: Window & typeof globalThis): void {
    addAnnotations(document, window, {} as any, {} as any);
  }
}
