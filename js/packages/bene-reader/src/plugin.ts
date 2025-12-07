import type { JSX } from "solid-js/jsx-runtime";
import { createStore, type SetStoreFunction } from "solid-js/store";

export interface Plugin {
  Toolbar?(): JSX.Element;
  mount?(document: Document, window: Window & typeof globalThis): void;
  onKeydown?(event: KeyboardEvent): void;
}

export abstract class SolidPlugin<State extends object> {
  state: State;
  setState: SetStoreFunction<State>;

  constructor() {
    [this.state, this.setState] = createStore(this.initialState());
  }

  abstract initialState(): State;
}
