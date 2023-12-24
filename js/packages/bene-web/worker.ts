/// <reference lib="WebWorker" />
import init, { EpubCtxt, init_rs, load_epub } from "rs-utils";

let globalSelf = self as any as ServiceWorkerGlobalScope;
let currentEpub: EpubCtxt | undefined;
let currentScope: string | undefined;

globalSelf.addEventListener("install", async _event => {
  console.log("Installed on service side.");
  await globalSelf.skipWaiting();
  await init();
  init_rs();
});

let installChannel = new BroadcastChannel("install-channel");
globalSelf.addEventListener("activate", async _event => {
  console.log("Activated on service side.");
  await globalSelf.clients.claim();
  installChannel.postMessage("installed");
});

globalSelf.addEventListener("fetch", event => {
  const EPUB_PATH = "bene-reader/epub-content/";
  let epubBaseUrl = currentScope! + EPUB_PATH;
  if (currentEpub && event.request.url.startsWith(epubBaseUrl)) {
    let path = event.request.url.slice(epubBaseUrl.length);
    let contents = currentEpub.read_file(path);
    event.respondWith(new Response(contents));
  }
});

globalSelf.addEventListener("message", async event => {
  let message = event.data;
  if (message.type == "new-epub") {
    let { data, scope } = message.data;
    currentEpub = load_epub(data);
    currentScope = scope;
    let metadata = JSON.parse(currentEpub.metadata());
    let clients = await globalSelf.clients.matchAll();
    for (let client of clients) {
      client.postMessage({
        type: "loaded-epub",
        data: metadata,
      });
    }
  }
});
