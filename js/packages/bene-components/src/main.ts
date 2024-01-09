import { rust } from "@codemirror/lang-rust";
import { EditorState, RangeSet } from "@codemirror/state";
import { Decoration, DecorationSet } from "@codemirror/view";
import { EditorView, minimalSetup } from "codemirror";
import { LitElement, css, html } from "lit";
import { customElement } from "lit/decorators.js";
import { Ref, createRef, ref } from "lit/directives/ref.js";

const codeHighlight = Decoration.mark({ class: "code-highlight" });

@customElement("code-description")
export class CodeDescription extends LitElement {
  codeRef: Ref<HTMLDivElement> = createRef();
  descRef: Ref<HTMLDivElement> = createRef();
  editor: EditorView | undefined;

  static styles = css`
    .code-highlight {
      text-decoration: underline;
    }
  `;

  firstUpdated() {
    let preEl = this.children.item(0)! as HTMLPreElement;
    let codeEl = preEl.querySelector("code")!;

    let spans: { [id: string]: [number, number] } = {};
    let index = 0;
    codeEl.childNodes.forEach(node => {
      if (node.nodeType == Node.TEXT_NODE) {
        index += node.textContent!.length;
      } else if (node.nodeType == Node.ELEMENT_NODE) {
        let el = node as HTMLElement;
        let end = index + el.innerText.length;
        let id = el.getAttribute("id");
        if (id) spans[id] = [index, end];
        index = end;
      } else {
        console.warn("Unexpected node type", node.nodeType);
      }
    });

    let code = preEl.innerText;

    let decorations: DecorationSet = RangeSet.of(
      Object.values(spans).map(([from, to]) => codeHighlight.range(from, to))
    );

    this.editor = new EditorView({
      extensions: [
        minimalSetup,
        rust(),
        EditorState.readOnly.of(true),
        EditorView.decorations.of(decorations),
      ],
      parent: this.codeRef.value!,
      doc: code,
    });
  }

  render() {
    let desc = this.children.item(1);
    return html`
      <div ${ref(this.codeRef)}></div>
      <div ${ref(this.descRef)}>${desc}</div>
    `;
  }
}

console.log("Loaded component script.");
