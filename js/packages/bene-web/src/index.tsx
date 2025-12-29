import type { ChildMessage, LoadedEpub } from "bene-types";
import { createEffect, createResource, onMount } from "solid-js";
import { render } from "solid-js/web";

import workerUrl from "../worker.ts?worker&url";

const INITIAL_EPUB = new URL(window.location.href).searchParams.get("preload");

export type WorkerMessage = { type: "loaded-epub"; data: LoadedEpub };
export type ManagerMessage = {
  type: "new-epub";
  data: {
    data: Uint8Array;
    scope: string;
    url?: string;
    path?: string;
  };
};

async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  // Setup a means of getting debug info out of the service worker.
  const logChannel = new BroadcastChannel("log-channel");
  logChannel.addEventListener("message", event =>
    console.debug("Service worker:", event.data)
  );

  const registrations = await navigator.serviceWorker.getRegistrations();
  const existingRegistration = registrations.find(
    reg => reg.active && reg.active.scriptURL === workerUrl
  );

  if (existingRegistration) {
    console.debug("Found existing worker registration", existingRegistration);

    // HACK: have to soft reload after a hard reload. See:
    // https://stackoverflow.com/questions/51597231/register-service-worker-after-hard-refresh
    if (
      existingRegistration.active &&
      navigator.serviceWorker.controller === null
    )
      window.location.reload();

    return existingRegistration;
  } else {
    console.debug("No existing worker registration, creating new one");

    const workerReady = new Promise(resolve =>
      navigator.serviceWorker.addEventListener("controllerchange", _event => {
        resolve(undefined);
      })
    );

    const registration = await navigator.serviceWorker.register(workerUrl);
    console.debug(
      `Registered worker at scope ${registration.scope}, waiting for it to activate.`,
      registration
    );

    // After registering the service worker, we want to wait until it's installed and activated
    // so it's ready for use.
    await workerReady;
    console.assert(
      registration.active !== null,
      "Service worker is not active?"
    );
    console.debug("Successfully activated service worker.");

    return registration;
  }
}

// In the embedded web view, EPUB paths are encoded into a URL fragment
// so they can be stored in the URL without navigating away from the reading system.

function serializeUrl(url: URL) {
  const trimmedPath = url.pathname.split("/bene-reader/")[1];
  return `${encodeURIComponent(trimmedPath)}$${url.hash.slice("#".length)}`;
}

function deserializeUrl(location: Location): string | undefined {
  if (location.hash === "") return undefined;
  const contents = location.hash.slice("#".length);
  const parts = contents.split("$");
  const trimmedPath = decodeURIComponent(parts[0]);
  const hash = parts.slice(1).join("-");
  return `${trimmedPath}#${hash}`;
}

function App() {
  let iframe: HTMLIFrameElement | undefined;
  let fileInput: HTMLInputElement | undefined;

  const [registration] = createResource(async () => {
    let reg = await registerServiceWorker();

    navigator.serviceWorker.addEventListener("message", event => {
      const message = event.data as WorkerMessage;

      if (message.type === "loaded-epub") {
        // When the service worker has finished loading an EPUB, pass along the metadata
        // to the inner frame.
        iframe!.contentWindow!.postMessage({
          type: "loaded-epub",
          data: {
            status: "ok",
            data: message.data
          }
        });
      }
    });

    return reg;
  });

  const setNewEpub = (data: Uint8Array, url?: URL) => {
    const reg = registration()!;
    const path = deserializeUrl(window.location);
    const message: ManagerMessage = {
      type: "new-epub",
      data: {
        data,
        scope: reg.scope,
        url: url?.href,
        path
      }
    };
    reg.active!.postMessage(message);
  };

  async function fetchEpub(file: string) {
    // Note: if file is an absolute URL, then window.location.href
    // is ignored.
    const url = new URL(file, window.location.href);
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    setNewEpub(new Uint8Array(buffer), url);
  }

  createEffect(() => {
    const reg = registration();
    if (reg && INITIAL_EPUB) fetchEpub(INITIAL_EPUB);
  });

  function loadFile(file: File) {
    const reader = new FileReader();
    reader.onload = async e => {
      if (!e.target) return;
      const arrayBuffer = e.target.result as ArrayBuffer;
      const byteArray = new Uint8Array(arrayBuffer);
      setNewEpub(byteArray);
    };
    reader.readAsArrayBuffer(file);
  }

  onMount(() => {
    window.addEventListener("message", event => {
      if (event.source !== iframe!.contentWindow) return;

      const message = event.data as ChildMessage;
      console.info("Parent window received message", message);
      if (message.type === "request-upload") {
        fileInput!.click();
      } else if (message.type === "finished-upload") {
        const file: File = message.data;
        loadFile(file);
      } else if (message.type === "navigate") {
        const url = new URL(message.data);
        const hash = serializeUrl(url);
        window.history.replaceState(undefined, "", `#${hash}`);
      } else if (message.type === "open-url") {
        const url = message.data;
        window.open(url, "_blank");
      } else if (message.type === "ready") {
        // Ignore, only used on desktop target.
        // TODO: *should* this be ignored?
      } else {
        console.warn("Unhandled message", message);
      }
    });
  });

  return (
    <>
      <iframe
        ref={iframe}
        title="Bene Reader"
        src="bene-reader/index.html"
        referrerPolicy="no-referrer"
      />
      <input
        ref={fileInput}
        type="file"
        style={{ display: "none" }}
        onChange={event => {
          let files = event.target.files;
          if (files?.length && files.length > 0) {
            const file = files[0];
            loadFile(file);
          }
        }}
      />
    </>
  );
}

render(() => <App />, document.getElementById("root")!);
