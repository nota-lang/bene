import { For, createEffect, createResource, onMount } from "solid-js";
import { render } from "solid-js/web";

import workerUrl from "../worker.ts?worker&url";

async function registerServiceWorker(post: (data: any) => void) {
  let installChannel = new BroadcastChannel("install-channel");
  let logChannel = new BroadcastChannel("log-channel");

  logChannel.addEventListener("message", event =>
    console.log("Service worker:", event.data)
  );

  let installedPromise = new Promise(resolve => {
    installChannel.addEventListener("message", () => resolve(undefined));
  });

  let registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map(reg => reg.unregister()));
  console.log("Unregistered service workers.");

  let registration = await navigator.serviceWorker.register(workerUrl);
  console.log("Registered worker, waiting for it to activate.", registration);

  await installedPromise;
  console.assert(registration.active !== null, "Service worker is not active?");
  console.log("Service worker activated.");

  window.addEventListener("beforeunload", () => registration.unregister());

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

const ZIPS = [
  {
    file: "moby-dick.epub",
    title: "Moby Dick (Herman Melville, 1851)",
  },
  {
    file: "wasteland.epub",
    title: "The Waste Land (T. S. Eliot, 1922)",
  },
  {
    file: "PLAI-3-2-2.epub",
    title:
      "Programming Languages: Applications and Interpretation (Shriram Krishnamurthi, 2023)",
  },
];

type NewEpubCallback = (data: Uint8Array) => void;

declare var TEST_EPUB: string | undefined;

function ProvidedEpubs(props: { fetchZip: (url: string) => void }) {
  return (
    <select
      class="provided-epub"
      onchange={event => props.fetchZip(event.target.value)}
    >
      <option>Select an epub...</option>
      <For each={ZIPS}>
        {zip => <option value={zip.file}>{zip.title}</option>}
      </For>
    </select>
  );
}

function CustomEpub(props: { newEpub: NewEpubCallback }) {
  let dropEl: HTMLDivElement | undefined;
  onMount(() => {
    dropEl!.addEventListener("dragover", event => {
      event.stopPropagation();
      event.preventDefault();
      event.dataTransfer!.dropEffect = "copy";
    });

    dropEl!.addEventListener("drop", event => {
      event.stopPropagation();
      event.preventDefault();

      const files = event.dataTransfer?.files;
      if (files?.length && files.length > 0) {
        const file = files[0];
        const reader = new FileReader();

        reader.onload = async e => {
          if (!e.target) return;
          const arrayBuffer = e.target.result as ArrayBuffer;
          const byteArray = new Uint8Array(arrayBuffer);
          props.newEpub(byteArray);
        };

        reader.readAsArrayBuffer(file);
      }
    });
  });
  return (
    <div ref={dropEl} class="custom-epub">
      Drop an EPUB here
    </div>
  );
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
    reg.active!.postMessage({
      type: "new-epub",
      data: {
        data,
        url,
        scope: reg.scope,
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
