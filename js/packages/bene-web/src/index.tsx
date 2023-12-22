import { onMount } from "solid-js";
import { render } from "solid-js/web";

import workerUrl from "../worker.ts?worker&url";

function App() {
  let iframe: HTMLIFrameElement | undefined;
  onMount(async () => {
    let installChannel = new BroadcastChannel("install-channel");
    let installedPromise = new Promise(resolve => {
      installChannel.addEventListener("message", () => resolve(undefined));
    });

    let registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(reg => reg.unregister()));
    console.log("Unregistered service workers.");

    let registration = await navigator.serviceWorker.register(workerUrl, {
      scope: "/",
    });
    console.log("Registered worker, waiting for it to activate.", registration);

    await installedPromise;
    console.assert(
      registration.active !== null,
      "Service worker is not active?"
    );
    console.log("Service worker activated.");

    window.addEventListener("beforeunload", () => registration.unregister());

    navigator.serviceWorker.addEventListener("message", event => {
      let message = event.data;
      if (message.type == "loaded-epub") {
        let metadata = message.data;
        iframe!.contentWindow!.postMessage({
          type: "loaded-epub",
          data: {
            status: "ok",
            data: metadata,
          },
        });
      }
    });

    document.addEventListener("dragover", event => {
      event.stopPropagation();
      event.preventDefault();
      event.dataTransfer!.dropEffect = "copy";
    });

    document.addEventListener("drop", event => {
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

          registration.active!.postMessage({
            type: "new-epub",
            data: byteArray,
          });
        };

        reader.readAsArrayBuffer(file);
      }
    });
  });

  return (
    <div>
      <iframe ref={iframe} src="bene-reader/index.html" />
    </div>
  );
}

render(() => <App />, document.getElementById("root")!);
