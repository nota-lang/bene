// TODO: write a .d.ts file for epub-cfi-resolver
//@ts-expect-error
import CFI from "epub-cfi-resolver";
import type { DocState } from "./index";

export function addAnnotations(
  document: Document,
  state: DocState,
  chapterHref: string
) {
  let rendition = state.rendition();

  // TODO: not ideal that we ship & re-parse the XML here.
  // Ideally that would be done on the Rust side, and the item
  // IDs attached directly to annotations.
  const pkg = new DOMParser().parseFromString(
    rendition.package_string,
    "application/xhtml+xml"
  );

  for (let annot of rendition.annotations) {
    let cfi = new CFI(annot.selector);
    let uri = cfi.resolveURI(0, pkg);
    if (uri !== chapterHref) continue;

    let resolved = cfi.resolveLast(document);
    if (!resolved.isRange) throw Error("TODO: handle point annotations");

    let { from, to } = resolved;
    let range = new Range();
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);

    const mark = document.createElement("mark");
    range.surroundContents(mark);
  }
}
