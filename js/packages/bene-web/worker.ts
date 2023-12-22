/// <reference lib="WebWorker" />
import init, { EpubCtxt, init_rs, load_epub } from "rs-utils";

let globalSelf = self as any as ServiceWorkerGlobalScope;
let currentEpub: EpubCtxt | undefined;

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
  let url = new URL(event.request.url);
  if (currentEpub && url.pathname.startsWith("/epub")) {
    let path = url.pathname.slice("/epub/".length);
    let contents = currentEpub.read_file(path);
    event.respondWith(new Response(contents));
  }
});

globalSelf.addEventListener("message", async event => {
  let message = event.data;
  if (message.type == "new-epub") {
    currentEpub = load_epub(message.data);
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
