import type { Epub } from "./bindings/Epub";

export type { Epub } from "./bindings/Epub";
export type { Item } from "./bindings/Item";
export type { Path } from "./bindings/Path";
export type { Rendition } from "./bindings/Rendition";

// Note: types appearing in messages must be clone-able. In particular, URL is not clone-able.
// See: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm#supported_types

export type Result<T, E> = Ok<T> | Err<E>;
export type Ok<T> = { status: "ok"; data: T };
export type Err<E> = { status: "error"; error: E };
export interface LoadedEpub {
  metadata: Epub;
  path?: string;
  url?: string;
}

export type ParentMessage = {
  type: "loaded-epub";
  data: Result<LoadedEpub, string>;
};

export type ChildMessage =
  | { type: "ready" }
  | {
      type: "navigate";
      data: string;
    }
  | {
      type: "open-url";
      data: string;
    }
  | { type: "request-upload" }
  | {
      type: "finished-upload";
      data: File;
    };
