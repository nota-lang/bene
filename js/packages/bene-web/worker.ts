/// <reference lib="WebWorker" />

import init, {
  type EpubCtxt,
  guess_mime_type,
  load_epub,
} from "rs-utils";

let globalSelf = self as any as ServiceWorkerGlobalScope;
let currentEpub: EpubCtxt | undefined;
let currentScope: string | undefined;

let logChannel = new BroadcastChannel("log-channel");
let log = (...args: any[]) =>
  logChannel.postMessage(args.map(arg => arg.toString()).join("\t"));

globalSelf.addEventListener("install", event => {
  log("Installed");
  globalSelf.skipWaiting();
  event.waitUntil(init());
  log("Initialized");
});

globalSelf.addEventListener("activate", event => {
  log("Activated");
  event.waitUntil(globalSelf.clients.claim());
  log("Claimed");
});

globalSelf.addEventListener("fetch", event => {
  if (!currentEpub) {
    log("Ignoring request due to no loaded EPUB");
    return;
  }
  if (!currentScope) {
    log("Ignoring request due to no current scope");
    return;
  }

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
          "Content-Type": mimeType
        }
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
  if (message.type === "new-epub") {
    let { data, scope, url, path } = message.data;
    log("Attempting to load new epub");

    // TODO: seems to be flaky behavior where sometimes `__wbindgen_malloc` is undefined,
    // which I think is b/c wasm hasn't been initialized via the `init()` function.
    event.waitUntil(init());    

    try {
      currentEpub = load_epub(data);
    } catch (e: any) {
      log("Failed to load EPUB with error: ", e);
      return;
    }

    currentScope = scope;
    let metadata = JSON.parse(currentEpub.metadata());
    let clients = await globalSelf.clients.matchAll();
    log("Loaded new epub, broadcasting to window");
    for (let client of clients) {
      client.postMessage({
        type: "loaded-epub",
        data: {
          metadata,
          url,
          path
        }
      });
    }
  }
});
