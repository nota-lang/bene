/// <reference lib="WebWorker" />

import init, { type EpubCtxt, guess_mime_type, load_epub } from "rs-utils";
import type { ManagerMessage, WorkerMessage } from "./src";

let globalSelf = self as any as ServiceWorkerGlobalScope;
let currentEpub: EpubCtxt | undefined;
let currentScope: string | undefined;

let logChannel = new BroadcastChannel("log-channel");
let log = (...args: any[]) =>
  logChannel.postMessage(args.map(arg => arg.toString()).join("\t"));

globalSelf.addEventListener("install", event => {
  async function handler() {
    log("Installed");
    globalSelf.skipWaiting();
    await init();
    log("Initialized");
  }
  event.waitUntil(handler());
});

globalSelf.addEventListener("activate", event => {
  async function handler() {
    log("Activated");
    await globalSelf.clients.claim();
    log("Claimed");
  }
  event.waitUntil(handler());
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

globalSelf.addEventListener("message", event => {
  async function handler() {
    let message = event.data as ManagerMessage;
    if (message.type === "new-epub") {
      let { data, scope, url, path } = message.data;
      log("Attempting to load new epub");

      // HACK: I think this is necessary if someone revisits
      // the page after closing the browser (window? process?)
      // and the worker state is gone, and needs to be reinitialized.
      // Unsure if this should happen somewhere else.
      await init();

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
        let message: WorkerMessage = {
          type: "loaded-epub",
          data: {
            metadata,
            url,
            path
          }
        };
        client.postMessage(message);
      }
    }
  }
  event.waitUntil(handler());
});
