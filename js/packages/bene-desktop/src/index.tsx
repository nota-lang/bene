import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { open as openShell } from "@tauri-apps/plugin-shell";
import type {
  ChildMessage,
  Epub,
  LoadedEpub,
  ParentMessage,
  Result
} from "bene-types";

function sendMessageToChild(message: ParentMessage) {
  const readerIframe = document.getElementById("reader")! as HTMLIFrameElement;
  const readerWindow = readerIframe.contentWindow!;
  readerWindow.postMessage(message, "*");
}

async function poll(): Promise<boolean> {
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

  sendMessageToChild({ type: "loaded-epub", data: epubResult! });
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
  const message = event.data as ChildMessage;
  console.info("Parent received message:", message);

  if (message.type === "ready") {
    await poll();
  } else if (message.type === "request-upload") {
    let path = await openDialog({
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
  } else if (message.type === "open-url") {
    const urlStr = message.data;
    openShell(urlStr.toString());
  } else {
    console.warn("Unhandled message", message);
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
