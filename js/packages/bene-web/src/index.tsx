import { createEffect, createResource, onMount } from "solid-js";
import { render } from "solid-js/web";

import workerUrl from "../worker.ts?worker&url";

async function registerServiceWorker(
  post: (data: any) => void
): Promise<ServiceWorkerRegistration> {
  let installChannel = new BroadcastChannel("install-channel");
  let logChannel = new BroadcastChannel("log-channel");

  logChannel.addEventListener("message", event =>
    console.debug("Service worker:", event.data)
  );

  let installedPromise = new Promise(resolve => {
    installChannel.addEventListener("message", () => resolve(undefined));
  });

  let registrations = await navigator.serviceWorker.getRegistrations();
  let prevRegistration = registrations.find(
    reg => reg.active && reg.active.scriptURL == workerUrl
  );
  if (prevRegistration !== undefined) await prevRegistration.unregister();

  let registration = await navigator.serviceWorker.register(workerUrl);
  console.debug("Registered worker, waiting for it to activate.", registration);

  await installedPromise;
  console.assert(registration.active !== null, "Service worker is not active?");
  console.debug("Service worker activated.");

  window.addEventListener("beforeunload", () => registration!.unregister());

  navigator.serviceWorker.addEventListener("message", event => {
    let message = event.data;
    if (message.type == "loaded-epub") {
      let metadata = message.data;
      post({
        type: "loaded-epub",
        data: {
          status: "ok",
          data: metadata,
        },
      });
    }
  });

  return registration;
}

declare var TEST_EPUB: string | undefined;

function serializeUrl(url: URL) {
  let trimmedPath = url.pathname.split("/bene-reader/")[1];
  return encodeURIComponent(trimmedPath) + "$" + url.hash.slice("#".length);
}

function deserializeUrl(location: Location): string | undefined {
  if (location.hash === "") return undefined;
  let contents = location.hash.slice("#".length);
  let parts = contents.split("$");
  let trimmedPath = decodeURIComponent(parts[0]);
  let hash = parts.slice(1).join("-");
  return trimmedPath + "#" + hash;
}

function App() {
  let iframe: HTMLIFrameElement | undefined;

  let [registration] = createResource(
    async () =>
      await registerServiceWorker(data =>
        iframe!.contentWindow!.postMessage(data)
      )
  );

  let setNewEpub = (data: Uint8Array, url?: string) => {
    let reg = registration()!;
    let path = deserializeUrl(window.location);
    reg.active!.postMessage({
      type: "new-epub",
      data: {
        data,
        url,
        scope: reg.scope,
        path,
      },
    });
  };

  async function fetchZip(file: string) {
    let url = new URL(`epubs/${file}`, window.location.href).href;
    let response = await fetch(url);
    let buffer = await response.arrayBuffer();
    setNewEpub(new Uint8Array(buffer), url);
  }

  createEffect(() => {
    let reg = registration();
    if (reg && TEST_EPUB) fetchZip(TEST_EPUB);
  });

  onMount(() => {
    window.addEventListener("message", event => {
      if (event.source != iframe!.contentWindow) return;

      let message = event.data;
      if (message.type == "user-upload") {
        let file = message.data;

        const reader = new FileReader();

        reader.onload = async e => {
          if (!e.target) return;
          const arrayBuffer = e.target.result as ArrayBuffer;
          const byteArray = new Uint8Array(arrayBuffer);
          setNewEpub(byteArray);
        };

        reader.readAsArrayBuffer(file);
      } else if (message.type == "navigate") {
        let urlStr = message.data as string;
        let url = new URL(urlStr);
        let hash = serializeUrl(url);
        window.history.replaceState(undefined, "", "#" + hash);
      }
    });
  });

  return (
    <iframe
      ref={iframe}
      src="bene-reader/index.html"
      referrerPolicy="no-referrer"
    />
  );
}

render(() => <App />, document.getElementById("root")!);
