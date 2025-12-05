import { type LoadedEpub, log, type Result } from "bene-common";
import { createEffect, createResource, onMount } from "solid-js";
import { render } from "solid-js/web";

import workerUrl from "../worker.ts?worker&url";

async function registerServiceWorker(
  post: (data: {
    type: "loaded-epub";
    data: Result<LoadedEpub, string>;
  }) => void
): Promise<ServiceWorkerRegistration> {
  const logChannel = new BroadcastChannel("log-channel");
  logChannel.addEventListener("message", event =>
    log.debug("Service worker:", event.data)
  );

  const registrations = await navigator.serviceWorker.getRegistrations();
  const existingRegistration = registrations.find(
    reg => reg.active && reg.active.scriptURL === workerUrl
  );

  if (existingRegistration) {
    log.debug("Found existing worker registration", existingRegistration);

    // HACK: have to soft reload after a hard reload. See:
    // https://stackoverflow.com/questions/51597231/register-service-worker-after-hard-refresh
    if (
      existingRegistration.active &&
      navigator.serviceWorker.controller === null
    )
      window.location.reload();

    navigator.serviceWorker.addEventListener("message", event => {
      const message = event.data;

      if (message.type === "loaded-epub") {
        const metadata = message.data;
        post({
          type: "loaded-epub",
          data: {
            status: "ok",
            data: metadata
          }
        });
      }
    });
    return existingRegistration;
  } else {
    log.debug("No existing worker registration, creating new one");

    const workerReady = new Promise(resolve =>
      navigator.serviceWorker.addEventListener("controllerchange", _event => {
        resolve(undefined);
      })
    );

    const registration = await navigator.serviceWorker.register(workerUrl);
    log.debug(
      `Registered worker at scope ${registration.scope}, waiting for it to activate.`,
      registration
    );

    await workerReady;
    console.assert(
      registration.active !== null,
      "Service worker is not active?"
    );
    log.debug("Successfully activated service worker.");

    return registration;
  }
}

declare var TEST_EPUB: string | undefined;

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

  const [registration] = createResource(
    async () =>
      await registerServiceWorker(data =>
        iframe!.contentWindow!.postMessage(data)
      )
  );

  const setNewEpub = (data: Uint8Array, url?: string) => {
    const reg = registration()!;
    const path = deserializeUrl(window.location);
    reg.active!.postMessage({
      type: "new-epub",
      data: {
        data,
        url,
        scope: reg.scope,
        path
      }
    });
  };

  async function fetchZip(file: string) {
    const url = new URL(`epubs/${file}`, window.location.href).href;
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    setNewEpub(new Uint8Array(buffer), url);
  }

  createEffect(() => {
    const reg = registration();
    if (reg && TEST_EPUB) fetchZip(TEST_EPUB);
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

      const message = event.data;
      log.info("Parent window received message", message);
      if (message.type === "request-upload") {
        fileInput!.click();
      } else if (message.type === "finished-upload") {
        const file: File = message.data;
        loadFile(file);
      } else if (message.type === "navigate") {
        const urlStr = message.data as string;
        const url = new URL(urlStr);
        const hash = serializeUrl(url);
        window.history.replaceState(undefined, "", `#${hash}`);
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
