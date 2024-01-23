/// <reference lib="WebWorker" />
import init, { EpubCtxt, guess_mime_type, init_rs, load_epub } from "rs-utils";

let globalSelf = self as any as ServiceWorkerGlobalScope;
let currentEpub: EpubCtxt | undefined;
let currentScope: string | undefined;

let installChannel = new BroadcastChannel("install-channel");
let logChannel = new BroadcastChannel("log-channel");
let log = (...args: any[]) =>
  logChannel.postMessage(args.map(arg => arg.toString()).join("\t"));

globalSelf.addEventListener("install", async _event => {
  log("Installed");
  await Promise.all([globalSelf.skipWaiting(), init()]);
  init_rs();
  log("Initialized");
  installChannel.postMessage("installed");
});

globalSelf.addEventListener("activate", async _event => {
  log("Activated");
  await globalSelf.clients.claim();
  log("Claimed");
});

globalSelf.addEventListener("fetch", event => {
  if (!currentEpub || !currentScope) return;

  const EPUB_PATH = "bene-reader/epub-content/";
  let epubBaseUrl = currentScope + EPUB_PATH;
  if (event.request.url.startsWith(epubBaseUrl)) {
    let path = event.request.url.slice(epubBaseUrl.length);
    path = path.split("#")[0];
    let contents = currentEpub.read_file(path);
    let mimeType = guess_mime_type(path);
    event.respondWith(
      new Response(contents, {
        status: 200,
        headers: {
          "Content-Type": mimeType,
        },
      })
    );
    log(
      "Handling request for",
      event.request.url,
      "with guessed type",
      mimeType
    );
  } else {
    log("Ignoring request for", event.request.url);
  }
});

globalSelf.addEventListener("message", async event => {
  let message = event.data;
  if (message.type == "new-epub") {
    let { data, scope, url, path } = message.data;
    currentEpub = load_epub(data);
    currentScope = scope;
    let metadata = JSON.parse(currentEpub.metadata());
    let clients = await globalSelf.clients.matchAll();
    for (let client of clients) {
      client.postMessage({
        type: "loaded-epub",
        data: {
          metadata,
          url,
          path,
        },
      });
    }
  }
});
