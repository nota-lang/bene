import type { Epub } from "./bindings/Epub";

export type { Epub } from "./bindings/Epub";
export type { Item } from "./bindings/Item";
export type { Path } from "./bindings/Path";
export type { Rendition } from "./bindings/Rendition";

export type Result<T, E> = Ok<T> | Err<E>;
export type Ok<T> = { status: "ok"; data: T };
export type Err<E> = { status: "error"; error: E };
export interface LoadedEpub {
  metadata: Epub;
  path?: string;
  url?: URL;
}

export type ParentMessage = {
  type: "loaded-epub";
  data: Result<LoadedEpub, string>;
};

export type ChildMessage =
  | { type: "ready" }
  | {
      type: "navigate";
      data: URL;
    }
  | {
      type: "open-url";
      data: URL;
    }
  | { type: "request-upload" }
  | {
      type: "finished-upload";
      data: File;
    };
