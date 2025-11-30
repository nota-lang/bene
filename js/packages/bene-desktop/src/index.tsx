import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
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

async function upload(path: string) {
  await invoke("upload", { path });

  let intvl: number;
  intvl = setInterval(async () => {
    let finished = await poll();
    if (finished) clearInterval(intvl);
  }, 100);
}

window.addEventListener("message", async event => {
  const message = event.data;
  log.info("Parent received message:", message);

  if (message.type === "ready") {
    await poll();
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
    upload(path);
  }
});

getCurrentWebview().onDragDropEvent(event => {
  if (event.payload.type === "drop") {
    let paths = event.payload.paths;
    if (paths.length !== 1) return;

    let path = paths[0];
    if (!path.endsWith("epub")) return;

    upload(path);
  }
});
