import { invoke } from "@tauri-apps/api/core";
import { type Epub, type LoadedEpub, log, type Result } from "bene-common";

window.addEventListener("message", async event => {
  const readerIframe = document.getElementById("reader")! as HTMLIFrameElement;
  const readerWindow = readerIframe.contentWindow!;

  const message = event.data;
  log.info("Parent received message:", message);

  if (message.type === "ready") {
    let state = await invoke<any>("state", {});
    let epubResult: Result<LoadedEpub, string>;
    if (state.type === "Ready") {
      const epub = state.value as Epub;
      epubResult = {
        status: "ok",
        data: { metadata: epub, url: undefined, path: "" }
      };
    } else if (state.type === "Error") {
      epubResult = {
        status: "error",
        error: state.value
      };
    } else {
      throw Error("TODO");
    }
    readerWindow.postMessage({ type: "loaded-epub", data: epubResult }, "*");
  }
});
