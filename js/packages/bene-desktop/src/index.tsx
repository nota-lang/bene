import { invoke } from "@tauri-apps/api/core";
import { type Epub, type LoadedEpub, log, type Result } from "bene-common";

window.addEventListener("message", async event => {
  const readerIframe = document.getElementById("reader")! as HTMLIFrameElement;
  const readerWindow = readerIframe.contentWindow!;

  const message = event.data;
  log.info("Parent received message:", message);

  if (message.type === "ready") {
    let epubResult: Result<LoadedEpub, string>;
    try {
      const epub = (await invoke("epub", {})) as Epub;
      epubResult = {
        status: "ok",
        data: { metadata: epub, url: undefined, path: "" }
      };
    } catch (e: any) {
      epubResult = { status: "error", error: e.toString() };
    }
    readerWindow.postMessage({ type: "loaded-epub", data: epubResult }, "*");
  }
});
