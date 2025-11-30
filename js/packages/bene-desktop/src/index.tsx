import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { type Epub, type LoadedEpub, log, type Result } from "bene-common";

async function poll(): Promise<boolean> {
  const readerIframe = document.getElementById("reader")! as HTMLIFrameElement;
  const readerWindow = readerIframe.contentWindow!;

  let state = await invoke<any>("state", {});
  let epubResult: Result<LoadedEpub, string> | undefined;
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
  } else if (state.type === "Waiting") {
    return false;
  }
  readerWindow.postMessage({ type: "loaded-epub", data: epubResult }, "*");
  return true;
}

window.addEventListener("message", async event => {
  const message = event.data;
  log.info("Parent received message:", message);

  if (message.type === "ready") {
    console.assert((await poll()) === true);
  } else if (message.type === "user-upload") {
    let path = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: "EPUB",
          extensions: ["epub"]
        }
      ]
    });
    if (!path) return;
    await invoke("upload", { path });

    let intvl = setInterval(async () => {
      let finished = await poll();
      if (finished) clearInterval(intvl);
    }, 100);
  }
});
