import { createEffect } from "solid-js";
import { type Plugin, SolidPlugin } from "./plugin";

const clamp = (a: number, b: number) => (x: number) =>
  Math.min(Math.max(x, a), b);
const ZOOM_LEVELS = [
  30, 50, 67, 80, 90, 100, 110, 120, 133, 150, 170, 200, 240, 300, 400, 500
];
const clampZoom = clamp(0, ZOOM_LEVELS.length - 1);

interface ZoomState {
  level: number;
}

export class ZoomPlugin extends SolidPlugin<ZoomState> implements Plugin {
  initialState() {
    return {
      level: ZOOM_LEVELS.indexOf(100)
    };
  }

  Toolbar = () => (
    <>
      <button
        type="button"
        class="icon-button zoom-out"
        aria-label="Reduce font size"
        onClick={() => {
          this.setState({ level: clampZoom(this.state.level - 1) });
        }}
      />
      <div class="split-icon-button-separator" />
      <button
        type="button"
        class="icon-button zoom-in"
        aria-label="Increase font size"
        onClick={() => {
          this.setState({ level: clampZoom(this.state.level + 1) });
        }}
      />
      <select
        aria-label="Set zoom level"
        value={this.state.level}
        onInput={e => {
          const level = parseInt(e.target.value, 10);
          this.setState({ level });
        }}
      >
        {ZOOM_LEVELS.map((n, i) => (
          <option value={i.toString()}>{n}%</option>
        ))}
      </select>
    </>
  );

  mount(document: Document) {
    const styleEl = document.createElement("style");
    document.body.appendChild(styleEl);
    createEffect(() => {
      const zoomPercent = ZOOM_LEVELS[this.state.level];
      let css = `
    html {
      font-size: ${zoomPercent}%;
    }   
    `;
      if (zoomPercent >= 200) {
        css += `
    html, p {
      text-align: left;
    }
    `;
      }

      styleEl.innerText = css;
    });
  }

  onKeydown(event: KeyboardEvent) {
    let meta = event.getModifierState("Meta");
    let key = event.key;
    if (meta && key === "=")
      this.setState({ level: clampZoom(this.state.level + 1) });
    else if (meta && key === "-")
      this.setState({ level: clampZoom(this.state.level - 1) });
  }
}
