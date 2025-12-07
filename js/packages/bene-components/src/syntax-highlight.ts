import { html } from "@codemirror/lang-html";
import { rust } from "@codemirror/lang-rust";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, minimalSetup } from "codemirror";
import { LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("syntax-highlight")
export class SyntaxHighlight extends LitElement {
  editor: EditorView | undefined;

  @property()
  language?: string;

  @property({ attribute: "word-wrap", type: Boolean })
  wordWrap = false;

  connectedCallback() {
    super.connectedCallback();

    const doc = this.children.item(0)!.querySelector("code")!.innerText;
    const root = this.shadowRoot;
    if (!root) throw new Error("Shadow root is null");

    const extensions = [
      minimalSetup,
      EditorState.readOnly.of(true),
      EditorView.baseTheme({
        ".cm-content": { fontSize: "90%" }
      })
    ];

    if (this.language) {
      const languages: { [lang: string]: () => Extension } = { rust, html };
      const langConstructor = languages[this.language];
      if (langConstructor) extensions.push(langConstructor());
      else console.warn(`Missing language package: ${langConstructor}`);
    }

    if (this.wordWrap) extensions.push(EditorView.lineWrapping);

    this.editor = new EditorView({ doc, root, extensions });
  }

  render() {
    return this.editor!.dom;
  }
}
