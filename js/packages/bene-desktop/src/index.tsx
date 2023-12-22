import { invoke } from "@tauri-apps/api/primitives";

window.addEventListener("message", async event => {
  let readerIframe = document.getElementById("reader")! as HTMLIFrameElement;
  let readerWindow = readerIframe.contentWindow!;

  let message = event.data;
  console.log("Parent received message", message);
  if (message.type == "load-epub") {
    let epubResult;
    try {
      let epub = await invoke("epub", {});
      epubResult = { status: "ok", data: epub };
    } catch (e: any) {
      epubResult = { status: "error", error: e.toString() };
    }

    readerWindow.postMessage({ type: "loaded-epub", data: epubResult }, "*");
  }
});
