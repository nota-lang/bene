import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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

let child_ready = false;

function sendMessageToChild(message: ParentMessage) {
  if (!child_ready) {
    setTimeout(() => sendMessageToChild(message), 100);
  } else {
    const readerIframe = document.getElementById(
      "reader"
    )! as HTMLIFrameElement;
    const readerWindow = readerIframe.contentWindow!;
    readerWindow.postMessage(message, "*");
  }
}

async function upload(path: string) {
  await invoke("upload", { path });
}

window.addEventListener("message", async event => {
  const message = event.data as ChildMessage;
  console.info("Parent received message:", message);

  if (message.type === "ready") {
    child_ready = true;
    let state = await invoke<SharedState>("state");
    handleSharedState(state);
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

type SharedState =
  | { type: "Waiting" }
  | { type: "Loading" }
  | { type: "Error"; value: string }
  | { type: "Ready"; value: Epub };

function handleSharedState(state: SharedState) {
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
  } else if (state.type === "Waiting" || state.type === "Loading") {
    return;
  }

  sendMessageToChild({ type: "loaded-epub", data: epubResult! });
}

listen<SharedState>("state", event => handleSharedState(event.payload));

getCurrentWebview().onDragDropEvent(event => {
  if (event.payload.type === "drop") {
    let paths = event.payload.paths;
    if (paths.length !== 1) return;

    let path = paths[0];
    if (!path.endsWith("epub")) return;

    upload(path);
  }
});

// Custom schemes generate different URLs on Windows vs. non-Windows
// platforms. See: https://docs.rs/tauri/2.9.5/tauri/struct.Builder.html#warning
const isWindows = window.navigator.platform.startsWith("Win");
const iframe = document.createElement("iframe");
iframe.id = "reader";
iframe.src = isWindows
  ? "http://bene.localhost/index.html"
  : "bene://localhost/index.html";
document.body.appendChild(iframe);
