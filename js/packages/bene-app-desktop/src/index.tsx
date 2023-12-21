import { invoke } from "@tauri-apps/api/primitives";
import {
  Component,
  Resource,
  createResource,
  createSignal,
  onMount,
} from "solid-js";
import { render } from "solid-js/web";

import "../styles/index.css";

// import { Rendition, commands } from "./bindings";

type Result<T, E> = { status: "ok"; data: T } | { status: "error"; error: E };
// type Epub = { renditions: Rendition[] };

let epubUrl = (rendition: any, href: string) =>
  `bene://localhost:5173/epub/${
    rendition.root ? rendition.root + "/" : ""
  }${href}`;

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
          contentIframe!.contentWindow!.location.href = event.target.href;
        }
      });
    });
  });

  return (
    <div class="epub">
      <iframe ref={contentIframe} class="epub-content" src={chapterUrl()} />
      <iframe ref={navIframe} class="epub-nav" src={navUrl()} />
    </div>
  );
}

function App() {
  let [epubResource] = createResource(async () => await invoke("epub", {}));
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
