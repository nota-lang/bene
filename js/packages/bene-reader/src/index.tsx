import { createResource, createSignal, onMount } from "solid-js";
import { render } from "solid-js/web";

// import { Rendition, commands } from "./bindings";

type Result<T, E> = { status: "ok"; data: T } | { status: "error"; error: E };
// type Epub = { renditions: Rendition[] };

let epubUrl = (rendition: any, href: string) =>
  `/epub/${rendition.root ? rendition.root + "/" : ""}${href}`;

function EpubView({ data }: { data: /*Epub*/ any }) {
  let [renditionIndex] = createSignal(0);
  let rendition = () => data.renditions[renditionIndex()];

  let [chapterIndex, _setChapterIndex] = createSignal(0);
  let chapterId = () =>
    rendition().package.spine.itemref![chapterIndex()]["@idref"];

  let chapterUrl = () => {
    let id = chapterId();
    let rend = rendition();
    let items = rend.package.manifest.item!;
    let href = items.find((item: any) => item["@id"] == id)!["@href"];
    return epubUrl(rend, href);
  };

  let navUrl = () => {
    let rend = rendition();
    let items = rend.package.manifest.item!;
    let href = items.find((item: any) =>
      item["@properties"]
        ? item["@properties"].split(" ").includes("nav")
        : false
    )!["@href"];
    return epubUrl(rend, href);
  };

  let contentIframe: HTMLIFrameElement | undefined;
  let navIframe: HTMLIFrameElement | undefined;
  onMount(() => {
    navIframe!.addEventListener("load", () => {
      let navDoc = navIframe!.contentDocument!;
      navDoc.addEventListener("click", event => {
        event.preventDefault();
        if (
          event.target &&
          "tagName" in event.target &&
          event.target.tagName == "a"
        ) {
          contentIframe!.contentWindow!.location.href = (
            event.target as any
          ).href;
        }
      });
    });
  });

  return (
    <div class="epub">
      <iframe ref={navIframe} class="epub-nav" src={navUrl()} />
      <iframe ref={contentIframe} class="epub-content" src={chapterUrl()} />
    </div>
  );
}

function App() {
  // TODO: make it so you it rerenders new epub when getting another msg
  let [epubResource] = createResource(
    () =>
      new Promise<any>((resolve, reject) => {
        window.addEventListener("message", event => {
          let message = event.data;
          console.log("Child received message", message);
          if (message.type == "loaded-epub") {
            if (message.data.status == "ok") resolve(message.data.data);
            else reject(message.data.error);
          }
        });
        window.parent.postMessage({ type: "load-epub" }, "*");
      })
  );
  return (
    <>
      {epubResource.loading ? (
        <>Loading...</>
      ) : epubResource.error ? (
        <pre>{epubResource.error.toString()}</pre>
      ) : (
        <EpubView data={epubResource()!} />
      )}
    </>
  );
}

window.addEventListener("load", () => {
  render(() => <App />, document.getElementById("root")!);
});
