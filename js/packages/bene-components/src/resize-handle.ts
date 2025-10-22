import { html, LitElement, unsafeCSS } from "lit";
import { customElement } from "lit/decorators.js";
import { createRef, type Ref, ref } from "lit/directives/ref.js";

import cssContent from "./resize-handle.scss?inline";

@customElement("resize-handle")
export class ResizeHandle extends LitElement {
  article: HTMLElement;
  handleRef: Ref<HTMLElement> = createRef();

  static styles = unsafeCSS(cssContent);

  constructor() {
    super();
    this.article = document.querySelector("article")!;
  }

  onMouseDown(event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();

    const handle = this.handleRef.value!;
    const handleBounds = handle.getBoundingClientRect();
    const deltaX = handleBounds.right - event.x;

    const self = this;
    function onMouseMove(event: MouseEvent) {
      const width = Math.abs(event.x + deltaX - window.innerWidth / 2) * 2;
      self.article.style.maxWidth = `${width}px`;
    }

    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  render() {
    return html`<div
      class="resize-handle-container"
      @mousedown="${this.onMouseDown}"
    >
      <div class="resize-handle" ${ref(this.handleRef)} />
    </div>`;
  }
}
