import * as tauri_log from "@tauri-apps/plugin-log";
import type { Epub } from "./bindings/Epub";

export type { Epub } from "./bindings/Epub";
export type { Item } from "./bindings/Item";
export type { Rendition } from "./bindings/Rendition";

export type Result<T, E> = Ok<T> | Err<E>;
export type Ok<T> = { status: "ok"; data: T };
export type Err<E> = { status: "error"; error: E };
export interface LoadedEpub {
  metadata: Epub;
  path: string;
  url?: URL;
}

let logger =
  (rs_f: (msg: string) => void, js_f: (...args: any[]) => void) =>
  (...args: any[]) => {
    if (
      "__TAURI_INTERNALS__" in window &&
      "invoke" in (window as any).__TAURI_INTERNALS__
    ) {
      rs_f(
        args
          .map(arg => {
            if (typeof arg === "string") {
              return arg;
            } else {
              return JSON.stringify(arg, undefined, 2);
            }
          })
          .join(" ")
      );
    }
    js_f(...args);
  };

export let log = {
  debug: logger(tauri_log.debug, console.debug),
  info: logger(tauri_log.info, console.info),
  warn: logger(tauri_log.warn, console.warn),
  error: logger(tauri_log.error, console.error)
};
