import { rust } from "@codemirror/lang-rust";
import { EditorView, minimalSetup } from "codemirror";
import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import { Ref, createRef, ref } from "lit/directives/ref.js";

@customElement("code-description")
export class CodeDescription extends LitElement {
  codeRef: Ref<HTMLDivElement> = createRef();
  descRef: Ref<HTMLDivElement> = createRef();
  editor: EditorView | undefined;

  firstUpdated() {
    let preEl = this.children.item(0)! as HTMLPreElement;
    let code = preEl.innerText;

    this.editor = new EditorView({
      extensions: [minimalSetup, rust()],
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
