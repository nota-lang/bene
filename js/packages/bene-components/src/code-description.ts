import { rust } from "@codemirror/lang-rust";
import {
  EditorState,
  type Range,
  RangeSet,
  StateEffect,
  StateField
} from "@codemirror/state";
import { Decoration, type DecorationSet } from "@codemirror/view";
import { log } from "bene-common";
import { EditorView, minimalSetup } from "codemirror";
import { html, LitElement, unsafeCSS } from "lit";
import { customElement, state } from "lit/decorators.js";
import { createRef, type Ref, ref } from "lit/directives/ref.js";
import _ from "lodash";

import cssContent from "./code-description.scss?inline";

const highlightDecoration = (index: number, id: string) =>
  Decoration.mark({
    class: `code-highlight highlight-${index}`,
    attributes: { id: `deco-${id}` }
  });
const delimiterStartDecoration = (index: number, id: string) =>
  Decoration.mark({
    class: `code-delimiter start highlight-${index}`,
    attributes: { id: `deco-${id}` }
  });
const delimiterEndDecoration = (index: number, id: string) =>
  Decoration.mark({
    class: `code-delimiter end highlight-${index}`,
    attributes: { id: `deco-${id}` }
  });

const setDecorations = StateEffect.define<{
  decorations: Range<Decoration>[];
}>();
const highlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);
    for (const e of tr.effects)
      if (e.is(setDecorations)) {
        decorations = RangeSet.of(
          _.sortBy(e.value.decorations, deco => deco.from)
        );
      }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f)
});

interface Span {
  id: string;
  start: number;
  end: number;
  multiline: boolean;
}
type Spans = {
  [id: string]: Span;
};

@customElement("code-description")
export class CodeDescription extends LitElement {
  descRef: Ref<HTMLDivElement> = createRef();
  editor: EditorView | undefined;
  code: string;
  spans: Spans;
  steps: HTMLElement[];

  @state()
  protected step: number = 0;

  static styles = unsafeCSS(cssContent);

  parseCode(codeEl: HTMLElement, newlines: number[]): Spans {
    const spans: Spans = {};
    let index = 0;
    function scan(el: HTMLElement) {
      el.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          index += node.textContent!.length;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          const start = index;
          scan(el);
          const end = index;

          const id = el.getAttribute("id");
          const multiline = newlines.some(idx => start <= idx && idx < end);
          if (id) spans[id] = { id, start, end, multiline };
        } else {
          log.warn(`Unexpected node type: ${node.nodeType}`);
        }
      });
    }
    scan(codeEl);
    return spans;
  }

  parseDescription(descEl: HTMLElement): HTMLElement[] {
    return Array.from(descEl.querySelectorAll("span[*|type=code-step]"));
  }

  constructor() {
    super();

    const preEl = this.children.item(0);
    if (!preEl || !(preEl instanceof HTMLElement))
      throw new Error("Missing pre element");
    const codeEl = preEl.querySelector("code");
    if (!codeEl) throw new Error("Missing code element");

    this.code = preEl.innerText;
    const newlines = Array.from(this.code.matchAll(/\n/g)).map(
      match => match.index!
    );

    this.spans = this.parseCode(codeEl, newlines);

    const descEl = this.children.item(1);
    if (!descEl || !(descEl instanceof HTMLElement))
      throw new Error("Missing description element");
    this.steps = this.parseDescription(descEl);
  }

  firstUpdated() {
    const steps = this.renderRoot.querySelectorAll<HTMLElement>("code-step");
    steps.forEach(step => {
      const anchors = Array.from(step.querySelectorAll<HTMLAnchorElement>("a"));

      let index = 0;
      const groupedAnchors: {
        [id: string]: { index: number; anchors: HTMLAnchorElement[] };
      } = {};
      for (const a of anchors) {
        const id = _.last(a.href.split("#"))!;
        if (!(id in groupedAnchors)) {
          groupedAnchors[id] = { index, anchors: [] };
          index += 1;
        }
        groupedAnchors[id].anchors.push(a);
      }

      const sortedIds = _.sortBy(
        Object.entries(groupedAnchors),
        ([_id, { index }]) => index
      ).map(([id]) => id);

      const spans = sortedIds.map(id => this.spans[id]);
      const decorations = spans.flatMap((span, i) => {
        const contains = spans.some(
          other =>
            span.id !== other.id &&
            span.start <= other.start &&
            other.end <= span.end
        );
        if (span.multiline || contains) {
          return [
            delimiterStartDecoration(i, span.id).range(
              span.start,
              span.start + 1
            ),
            delimiterEndDecoration(i, span.id).range(span.end - 1, span.end)
          ];
        } else {
          return [highlightDecoration(i, span.id).range(span.start, span.end)];
        }
      });

      sortedIds.forEach(id => {
        for (const a of groupedAnchors[id].anchors) {
          a.addEventListener("mouseenter", () => {
            const deco = this.editor!.dom.querySelector(`#deco-${id}`);
            if (!deco) return;
            deco.classList.add("emphasize");
          });
          a.addEventListener("mouseleave", () => {
            const deco = this.editor!.dom.querySelector(`#deco-${id}`);
            if (!deco) return;
            deco.classList.remove("emphasize");
          });
        }
      });

      step.addEventListener("mouseenter", () => {
        sortedIds.forEach((id, i) => {
          for (const a of groupedAnchors[id].anchors) {
            a.classList.add("code-highlight", `highlight-${i}`);
          }
        });

        this.editor!.dispatch({ effects: setDecorations.of({ decorations }) });
      });
      step.addEventListener("mouseleave", () => {
        sortedIds.forEach((id, i) => {
          for (const a of groupedAnchors[id].anchors) {
            a.classList.remove("code-highlight", `highlight-${i}`);
          }
        });

        this.editor!.dispatch({
          effects: setDecorations.of({ decorations: [] })
        });
      });
    });
  }

  connectedCallback() {
    super.connectedCallback();

    const doc = this.code;

    const root = this.shadowRoot;
    if (!root) throw new Error("Shadow root is null");

    const extensions = [
      minimalSetup,
      rust(),
      EditorState.readOnly.of(true),
      highlightField,
      EditorView.baseTheme({
        ".cm-scroller": { lineHeight: "1.7" },
        ".cm-content": { fontSize: "90%" }
      })
    ];

    this.editor = new EditorView({ doc, root, extensions });
  }

  render() {
    const descEl = this.children.item(1);
    return html`
      <div class="code">${this.editor!.dom}</div>
      <div class="description" ${ref(this.descRef)}>${descEl}</div>
    `;
  }
}
