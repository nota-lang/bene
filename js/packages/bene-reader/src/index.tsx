import componentScriptUrl from "bene-components?url";
import { throttle } from "@solid-primitives/scheduled";
import componentStyleUrl from "bene-components/dist/bene-components.css?url";
import type {
  ChildMessage,
  Epub,
  Item,
  LoadedEpub,
  ParentMessage,
  Rendition
} from "bene-types";
import _ from "lodash";
import {
  createContext,
  createEffect,
  createSignal,
  on,
  onMount,
  useContext
} from "solid-js";
import { createStore, reconcile, type SetStoreFunction } from "solid-js/store";
import { render } from "solid-js/web";
import contentStyleUrl from "../styles/content.scss?url";
import { AnnotationPlugin } from "./annotation";
import { findNavItem, Nav } from "./nav";
import type { Plugin } from "./plugin";
import { ZoomPlugin } from "./zoom";

const ZOOM_PLUGIN = new ZoomPlugin();
const ANNOT_PLUGIN = new AnnotationPlugin();
const PLUGINS: Plugin[] = [ZOOM_PLUGIN, ANNOT_PLUGIN];

function insertJs(doc: Document, url: string) {
  const script = doc.createElement("script");
  script.setAttribute("type", "text/javascript");
  script.setAttribute("src", url);
  doc.body.appendChild(script);
}

export function insertCss(doc: Document, url: string) {
  const link = doc.createElement("link");
  link.setAttribute("rel", "stylesheet");
  link.setAttribute("type", "text/css");
  link.setAttribute("href", url);
  doc.head.appendChild(link);
}

interface PageInfo {
  currentPage: number;
  numPages: number;
  pageHeight: number;
  container: Window;
}

export interface DocState {
  renditionIndex: number;
  chapterIndex: number;
  showNav: boolean;
  width: number;
  pageInfo?: PageInfo;
  epub: Epub;
  url?: URL;
  initialPath?: string;
  iframe?: HTMLIFrameElement;

  rendition(): Rendition;
  chapterId(): string;
  isPpub(): boolean;
  chapterHref(): string;
  chapterUrl(): string;
}

type State =
  | { type: "ready"; state: DocState }
  | { type: "error"; error: string }
  | { type: "waiting" };

export const epubUrl = (rendition: Rendition, href: string) =>
  `epub-content/${rendition.root ? `${rendition.root}/` : ""}${href}`;

const StateContext = createContext<
  [State, SetStoreFunction<State>] | undefined
>(undefined);

export function useDocState(): [DocState, (state: Partial<DocState>) => void] {
  let [state, setState] = useContext(StateContext)!;
  return [
    (state as any).state,
    (arg: Partial<DocState>) => (setState as any)("state", arg)
  ];
}

function ToolbarInner() {
  let [state, setState] = useDocState();

  function setPage(delta: number) {
    const pageInfo = state.pageInfo;
    if (!pageInfo) return;
    const currentPage = _.clamp(
      pageInfo.currentPage + delta,
      1,
      pageInfo.numPages
    );

    pageInfo.container.scrollTo({
      top: pageInfo.pageHeight * (currentPage - 1)
    });

    setState({
      pageInfo: {
        ...pageInfo,
        currentPage
      }
    });
  }

  function downloadEpub(url: URL) {
    const a = document.createElement("a");
    a.href = url.toString();
    a.download = _.last(url.pathname.split("/"))!;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <>
      <div class="toolbar-left">
        {findNavItem(state) && (
          <>
            <button
              type="button"
              class="icon-button sidebar-toggle"
              aria-label="Show navigation"
              onClick={() => setState({ showNav: !state.showNav })}
            />
            <div class="icon-button-spacer" />
          </>
        )}
        <button
          type="button"
          class="icon-button page-up"
          aria-label="Previous page"
          onClick={() => setPage(-1)}
        />
        <div class="split-icon-button-separator" />
        <button
          type="button"
          class="icon-button page-down"
          aria-label="Next page"
          onClick={() => setPage(1)}
        />
        <input
          type="number"
          class="page-input"
          aria-label="Page number"
          value={state.pageInfo?.currentPage}
        />
        <span class="label" aria-label="Total pages">
          of {state.pageInfo?.numPages ?? "-"}
        </span>
      </div>
      <div class="toolbar-middle">
        <ZOOM_PLUGIN.Toolbar />
      </div>
      <div class="toolbar-right">
        <ANNOT_PLUGIN.Toolbar />
        {state.url ? (
          <button
            type="button"
            class="icon-button download"
            aria-label="Download EPUB"
            onClick={() => downloadEpub(state.url!)}
          />
        ) : null}
      </div>
    </>
  );
}

function Toolbar() {
  let [state] = useContext(StateContext)!;
  return (
    <div class="toolbar">{state.type === "ready" && <ToolbarInner />}</div>
  );
}

function Content(props: { navigateEvent: EventTarget }) {
  const [state, setState] = useDocState();
  const [styleEl, setStyleEl] = createSignal<HTMLStyleElement | undefined>(
    undefined
  );

  function updateStyleEl(el: HTMLStyleElement) {
    let css = `
      article {
        max-width: ${state.width}px;
      }
      `;
    el.innerText = css;
  }

  let iframeRef: HTMLIFrameElement | undefined;

  onMount(() => {
    const iframe = iframeRef!;
    setState({ iframe });

    const SCROLL_KEY = "bene-scroll-info";
    interface ScrollInfo {
      scrollTop: number;
      docHeight: number;
    }

    let initializedScroll = state.chapterUrl().includes("#");
    const savedScrollStr = localStorage.getItem(SCROLL_KEY);
    const savedScroll =
      savedScrollStr !== null
        ? (JSON.parse(savedScrollStr) as ScrollInfo)
        : undefined;

    function updatePageInfo() {
      const container = iframe.contentWindow!;
      const doc = iframe.contentDocument!.body;
      const pageHeight = iframe.getBoundingClientRect().height;
      const docHeight = doc.getBoundingClientRect().height;
      const numPages = Math.ceil(docHeight / pageHeight);
      let currentPage =
        container.scrollY + pageHeight >= docHeight
          ? numPages
          : 1 + Math.floor(container.scrollY / pageHeight);

      currentPage = _.clamp(currentPage, 1, numPages);
      const pages: PageInfo = {
        numPages,
        pageHeight,
        currentPage,
        container
      };
      if (!_.isEqual(pages, state.pageInfo)) setState({ pageInfo: pages });

      if (
        savedScroll &&
        !initializedScroll &&
        savedScroll.docHeight === docHeight
      ) {
        container.scrollTo({ top: savedScroll.scrollTop });
        initializedScroll = true;
      }

      const scrollInfo: ScrollInfo = {
        scrollTop: container.scrollY,
        docHeight
      };
      localStorage.setItem(SCROLL_KEY, JSON.stringify(scrollInfo));
    }

    function injectReaderStylesAndScripts(contentDoc: Document) {
      insertCss(contentDoc, contentStyleUrl);
      insertCss(contentDoc, componentStyleUrl);

      const styleEl = contentDoc.createElement("style");
      updateStyleEl(styleEl);
      contentDoc.head.appendChild(styleEl);
      setStyleEl(styleEl);

      insertJs(contentDoc, componentScriptUrl);
    }

    function registerPageInfoCallbacks(
      iframe: HTMLIFrameElement,
      contentDoc: Document
    ) {
      const pageObserver = new ResizeObserver(() => updatePageInfo());
      pageObserver.observe(iframe);
      pageObserver.observe(contentDoc.body);

      const SCROLL_CALLBACK_DELAY = 30;
      contentDoc.addEventListener(
        "scroll",
        throttle(() => updatePageInfo(), SCROLL_CALLBACK_DELAY)
      );
    }

    function updateAnchors(contentWindow: Window, contentDoc: Document) {
      contentWindow.addEventListener("popstate", () => {
        sendMessageToParent({
          type: "navigate",
          data: contentWindow.location.href
        });
      });

      function updateAnchor(a: HTMLAnchorElement) {
        if (!a.href) return;

        if (new URL(a.href).host !== window.location.host) {
          // HACK: Tauri doesn't currently support opening external URLs via _blank anchors
          // when specifically nested inside an iframe. As a workaround, we post a message
          // to the parent and handle with the shell plugin. This should be removed when the
          // upstream bug is fixed. See: https://github.com/tauri-apps/tauri/issues/9912
          a.addEventListener("click", event => {
            event.preventDefault();
            sendMessageToParent({
              type: "open-url",
              data: a.href
            });
          });
        }
      }

      function updateAll(container: HTMLElement) {
        const anchors =
          container.querySelectorAll<HTMLAnchorElement>("a[href]");
        anchors.forEach(updateAnchor);
      }

      updateAll(contentDoc.documentElement);

      const observer = new MutationObserver(records =>
        records.forEach(record =>
          record.addedNodes.forEach(added => {
            if (added instanceof (contentWindow as any).HTMLElement)
              updateAll(added as any);
          })
        )
      );
      observer.observe(contentDoc.documentElement, {
        subtree: true,
        childList: true
      });
    }

    function handleTocNavigation(contentWindow: Window) {
      props.navigateEvent.addEventListener("navigate", e => {
        const url = (e as CustomEvent<string>).detail;
        console.debug("Navigating to", url);
        contentWindow.location.href = url;
      });
    }

    function makePortable(contentDoc: Document) {
      let article = contentDoc.createElement("article");
      article.append(...contentDoc.body.children);
      contentDoc.body.appendChild(article);

      contentDoc.querySelectorAll("figcaption").forEach(el => {
        if (el.children.length > 1) {
          let container = contentDoc.createElement("div");
          container.append(...el.children);
          el.appendChild(container);
        }
      });
    }

    function addResizeHandle(contentDoc: Document) {
      const article = contentDoc.querySelector<HTMLElement>("article");
      if (!article) throw Error("Missing <article> element!");

      const handleRoot = contentDoc.createElement("resize-handle");
      article.appendChild(handleRoot);
    }

    function handleSelection(contentDoc: Document) {
      contentDoc.addEventListener("mouseup", () => {
        let selection = contentDoc.getSelection();
        if (selection === null || selection.isCollapsed) return;

        // TODO: selection bar
      });
    }

    iframe.addEventListener("load", () => {
      // TODO: all this logic should be pushed into a script that doesn't have to distinguish
      // between two types of windows.
      const contentWindow = iframe.contentWindow! as Window &
        typeof globalThis /* ?? */;
      const contentDoc = iframe.contentDocument!;

      contentDoc.addEventListener("keydown", event => {
        PLUGINS.forEach(plugin => {
          if (plugin.onKeydown) plugin.onKeydown(event);
        });
      });

      injectReaderStylesAndScripts(contentDoc);
      registerPageInfoCallbacks(iframe, contentDoc);
      updateAnchors(contentWindow, contentDoc);
      handleTocNavigation(contentWindow);
      if (!state.isPpub()) makePortable(contentDoc);
      addResizeHandle(contentDoc);
      handleSelection(contentDoc);

      PLUGINS.forEach(plugin => {
        if (plugin.mount) plugin.mount(contentDoc, contentWindow);
      });
    });
  });

  createEffect(() => {
    const el = styleEl();
    if (!el) return;
    updateStyleEl(el);
  });

  let firstRender = false;
  createEffect(
    on(
      () => state.epub,
      () => {
        if (!firstRender) firstRender = true;
        else iframeRef!.contentWindow!.location.reload();
      }
    )
  );

  return (
    <iframe
      class="content"
      title="Document content"
      aria-label="Document content"
      ref={iframeRef}
      src={state.chapterUrl()}
      referrerPolicy="no-referrer"
    />
  );
}

function ViewerInner() {
  const navigateEvent = new EventTarget();
  const [state] = useDocState();
  return (
    <>
      {findNavItem(state) && (
        <Nav navigateEvent={navigateEvent} navItem={findNavItem(state)!} />
      )}
      <Content navigateEvent={navigateEvent} />
    </>
  );
}

function Loader() {
  const [state] = useContext(StateContext)!;

  return (
    <div class="loader-container">
      {state.type === "waiting" ? (
        <>
          Drag an EPUB file into the window, or click here to upload:{" "}
          <button
            type="button"
            class="icon-button open-file"
            aria-label="Upload EPUB"
            onClick={() => {
              sendMessageToParent({ type: "request-upload" });
            }}
            style={{ opacity: 0.4, top: "2px", left: "3px" }}
          />
        </>
      ) : state.type === "error" ? (
        <pre>Error: {state.error}</pre>
      ) : null}
    </div>
  );
}

function Viewer() {
  const [state] = useContext(StateContext)!;
  return (
    <div class="viewer">
      {state.type === "ready" ? <ViewerInner /> : <Loader />}
    </div>
  );
}

function listenForDropEvents() {
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
      console.info("Uploaded user file:", file.name);
      sendMessageToParent({
        type: "finished-upload",
        data: file
      });
    }
  });
}

function createInitialState(data: LoadedEpub): DocState {
  return {
    renditionIndex: 0,
    chapterIndex: 0,
    showNav: false,
    width: 800,
    epub: data.metadata,
    url: data.url ? new URL(data.url) : undefined,
    initialPath: data.path,

    rendition() {
      return data.metadata.renditions[this.renditionIndex];
    },

    chapterId() {
      return this.rendition().package.spine.itemref![this.chapterIndex][
        "@idref"
      ];
    },

    isPpub() {
      let metadata = this.rendition().package.metadata.$value;
      let tag = metadata.find(
        field =>
          typeof field !== "string" &&
          "meta" in field &&
          field.meta["@property"] === "ppub:valid"
      );
      return tag !== undefined;
    },

    chapterHref() {
      if (this.initialPath) return this.initialPath;
      const id = this.chapterId();
      const rend = this.rendition();
      const items = rend.package.manifest.item!;
      return items.find((item: Item) => item["@id"] === id)!["@href"];
    },

    chapterUrl() {
      if (this.initialPath) return this.initialPath;
      const rend = this.rendition();
      const href = this.chapterHref();
      return epubUrl(rend, href);
    }
  };
}

function listenForParentMessages(setState: SetStoreFunction<State>) {
  window.addEventListener("message", event => {
    const message = event.data as ParentMessage;
    console.debug("Received message from window:", message);
    if (message.type === "loaded-epub") {
      let result = message.data;
      if (result.status === "error") {
        setState({ type: "error", error: result.error });
      } else {
        let data = result.data;
        // Note: `reconcile` ensures that if this `setState` overwrites a previous EPUB,
        // then the `state.state` field is not re-allocated but instead granularly assigned.
        // Otherwise, Solid observers elsewhere in the app will be reacting to signals on a
        // stale proxy object.
        setState(
          reconcile({
            type: "ready",
            state: createInitialState(data)
          })
        );
      }
    }
  });
}

function sendMessageToParent(message: ChildMessage) {
  window.parent.postMessage(message, "*");
}

function App() {
  const [state, setState] = createStore<State>({
    type: "waiting"
  });

  onMount(() => {
    listenForParentMessages(setState);
    sendMessageToParent({ type: "ready" });
    listenForDropEvents();
  });

  return (
    <StateContext.Provider value={[state, setState]}>
      <div class="epub">
        <Toolbar />
        <Viewer />
      </div>
    </StateContext.Provider>
  );
}

window.addEventListener("load", () => {
  render(() => <App />, document.getElementById("root")!);
});
