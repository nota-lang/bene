import componentScriptUrl from "bene-components?url";
import { throttle } from "@solid-primitives/scheduled";
import {
  type Epub,
  type Item,
  type LoadedEpub,
  log,
  type Rendition,
  type Result
} from "bene-common";
import componentStyleUrl from "bene-components/dist/bene-components.css?url";
import _ from "lodash";
import {
  createContext,
  createEffect,
  createSignal,
  on,
  onMount,
  useContext
} from "solid-js";
import { createStore, type SetStoreFunction } from "solid-js/store";
import { render } from "solid-js/web";
import navCssUrl from "../styles/nav.scss?url";
import { addAnnotations } from "./annotation";

function insertJs(doc: Document, url: string) {
  const script = doc.createElement("script");
  script.setAttribute("type", "text/javascript");
  script.setAttribute("src", url);
  doc.body.appendChild(script);
}

function insertCss(doc: Document, url: string) {
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

const clamp = (a: number, b: number) => (x: number) =>
  Math.min(Math.max(x, a), b);
const ZOOM_LEVELS = [
  30, 50, 67, 80, 90, 100, 110, 120, 133, 150, 170, 200, 240, 300, 400, 500
];
const clampZoom = clamp(0, ZOOM_LEVELS.length - 1);

export interface DocState {
  renditionIndex: number;
  chapterIndex: number;
  zoomLevel: number;
  showNav: boolean;
  width: number;
  pageInfo?: PageInfo;
  epub: Epub;
  url?: URL;
  initialPath?: string;

  rendition(): Rendition;
  chapterId(): string;
  isPpub(): boolean;
}

type State =
  | { type: "ready"; state: DocState }
  | { type: "error"; error: string }
  | { type: "waiting" };

const epubUrl = (rendition: Rendition, href: string) =>
  `epub-content/${rendition.root ? `${rendition.root}/` : ""}${href}`;

const StateContext = createContext<
  [State, SetStoreFunction<State>] | undefined
>(undefined);

function useDocState(): [DocState, (state: Partial<DocState>) => void] {
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
        <button
          type="button"
          class="icon-button zoom-out"
          aria-label="Reduce font size"
          onClick={() =>
            setState({ zoomLevel: clampZoom(state.zoomLevel - 1) })
          }
        />
        <div class="split-icon-button-separator" />
        <button
          type="button"
          class="icon-button zoom-in"
          aria-label="Increase font size"
          onClick={() =>
            setState({ zoomLevel: clampZoom(state.zoomLevel + 1) })
          }
        />
        <select
          aria-label="Set zoom level"
          value={state.zoomLevel}
          onInput={e => {
            const zoomLevel = parseInt(e.target.value, 10);
            setState({ zoomLevel });
          }}
        >
          {ZOOM_LEVELS.map((n, i) => (
            <option value={i.toString()}>{n}%</option>
          ))}
        </select>
      </div>
      <div class="toolbar-right">
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

let findNavItem = (state: DocState): Item | undefined => {
  const rend = state.rendition();
  const items = rend.package.manifest.item;
  return items.find((item: Item) =>
    item["@properties"] ? item["@properties"].split(" ").includes("nav") : false
  );
};

function Nav(props: { navigateEvent: EventTarget; navItem: Item }) {
  let [state] = useDocState();
  const navUrl = () => {
    let navItem = findNavItem(state)!;
    return epubUrl(state.rendition(), navItem["@href"]);
  };

  let iframeRef: HTMLIFrameElement | undefined;
  onMount(() => {
    const iframe = iframeRef!;

    iframe.addEventListener("load", () => {
      const navDoc = iframe.contentDocument!;
      insertCss(navDoc, navCssUrl);

      navDoc.querySelectorAll("nav a").forEach(node => {
        node.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          let parentA = (event.target as HTMLElement).closest("a");
          if (!parentA) console.warn("Clicked on link but no parent anchor");
          else
            props.navigateEvent.dispatchEvent(
              new CustomEvent("navigate", { detail: parentA.href })
            );
        });
      });

      const navEl = navDoc.querySelector<HTMLElement>("nav");
      if (!navEl)
        throw new Error("<nav> element is missing from navigation document");

      const navWidth = getComputedStyle(iframe).getPropertyValue("--nav-width");
      // TODO: make this react to changes in nav-width
      navEl.style.width = navWidth;
    });
  });

  return (
    <iframe
      class="nav"
      classList={{ show: state.showNav }}
      title="Document navigation"
      aria-label="Document navigation"
      ref={iframeRef}
      src={navUrl()}
      referrerPolicy="no-referrer"
    />
  );
}

let handleKeydown =
  (state: DocState, setState: (state: Partial<DocState>) => void) =>
  (event: KeyboardEvent) => {
    let meta = event.getModifierState("Meta");
    let key = event.key;
    if (meta && key === "=")
      setState({ zoomLevel: clampZoom(state.zoomLevel + 1) });
    else if (meta && key === "-")
      setState({ zoomLevel: clampZoom(state.zoomLevel - 1) });
  };

function Content(props: { navigateEvent: EventTarget }) {
  const [state, setState] = useDocState();
  const [styleEl, setStyleEl] = createSignal<HTMLStyleElement | undefined>(
    undefined
  );

  function updateStyleEl(el: HTMLStyleElement) {
    const zoomPercent = ZOOM_LEVELS[state.zoomLevel];
    let css = `
      html {
        font-size: ${zoomPercent}%;
      }

      article {
        max-width: ${state.width}px;
      }
      `;

    if (zoomPercent >= 200) {
      css += `
      html, p {
        text-align: left;
      }
      `;
    }

    el.innerText = css;
  }

  const chapterHref = () => {
    if (state.initialPath) return state.initialPath;
    const id = state.chapterId();
    const rend = state.rendition();
    const items = rend.package.manifest.item!;
    return items.find((item: Item) => item["@id"] === id)!["@href"];
  };

  const chapterUrl = () => {
    if (state.initialPath) return state.initialPath;
    const rend = state.rendition();
    const href = chapterHref();
    return epubUrl(rend, href);
  };

  let iframeRef: HTMLIFrameElement | undefined;

  onMount(() => {
    const iframe = iframeRef!;

    const SCROLL_KEY = "bene-scroll-info";
    interface ScrollInfo {
      scrollTop: number;
      docHeight: number;
    }

    let initializedScroll = chapterUrl().includes("#");
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
        window.parent.postMessage(
          {
            type: "navigate",
            data: contentWindow.location.href
          },
          "*"
        );
      });

      function updateAnchor(a: HTMLAnchorElement) {
        if (!a.href) return;

        const url = new URL(a.href);
        if (url.host !== window.location.host) {
          // Need to add target="_blank" to all anchors, or else external navigation will
          // occur within the reader's iframe.
          a.setAttribute("target", "_blank");
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

      if (!article) {
        log.warn("Missing <article> element!");
        return;
      }

      const handleRoot = contentDoc.createElement("resize-handle");
      article.appendChild(handleRoot);
    }

    iframe.addEventListener("load", () => {
      const contentWindow = iframe.contentWindow!;
      const contentDoc = iframe.contentDocument!;

      contentDoc.addEventListener("keydown", handleKeydown(state, setState));

      injectReaderStylesAndScripts(contentDoc);
      registerPageInfoCallbacks(iframe, contentDoc);
      updateAnchors(contentWindow, contentDoc);
      handleTocNavigation(contentWindow);
      if (!state.isPpub()) makePortable(contentDoc);
      addResizeHandle(contentDoc);
      addAnnotations(contentDoc, state, chapterHref());
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
      src={chapterUrl()}
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

// const LOADING_THRESHOLD = 500;
// const LOADING_LONG_THRESHOLD = 5000;

function Loader() {
  const [state] = useContext(StateContext)!;
  let ref: HTMLInputElement | undefined;

  // const [stillWaiting, setStillWaiting] = createSignal(false);
  // const [stillWaitingLong, setStillWaitingLong] = createSignal(false);
  // setTimeout(() => setStillWaiting(true), LOADING_THRESHOLD);
  // setTimeout(() => setStillWaitingLong(true), LOADING_LONG_THRESHOLD);

  return (
    <div class="loader-container">
      {state.type === "waiting" ? (
        <>
          Drag an EPUB file into the window, or click here to upload:{" "}
          <button
            type="button"
            class="icon-button open-file"
            aria-label="Upload EPUB"
            onClick={e => {
              e.preventDefault();
              ref!.click();
            }}
            style={{ opacity: 0.4, top: "2px", left: "3px" }}
          />
          <input
            ref={ref}
            type="file"
            style={{ display: "none" }}
            onChange={event => {
              let files = event.target.files;
              if (files?.length && files.length > 0) {
                const file = files[0];
                log.info("Uploaded user file:", file.name);
                window.parent.postMessage(
                  {
                    type: "user-upload",
                    data: file
                  },
                  "*"
                );
              }
            }}
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

function registerDropEvents() {
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
      log.info("Uploaded user file:", file.name);
      window.parent.postMessage(
        {
          type: "user-upload",
          data: file
        },
        "*"
      );
    }
  });
}

function App() {
  const [state, setState] = createStore<State>({
    type: "waiting"
  });

  onMount(() => {
    window.addEventListener("message", event => {
      const message = event.data;
      log.debug("Received message from window:", message);
      if (message.type === "loaded-epub") {
        let result = message.data as Result<LoadedEpub, string>;
        if (result.status === "error") {
          setState({ type: "error", error: result.error });
        } else {
          let data = result.data;
          setState({
            type: "ready",
            state: {
              renditionIndex: 0,
              chapterIndex: 0,
              zoomLevel: ZOOM_LEVELS.indexOf(100),
              showNav: false,
              width: 800,
              epub: data.metadata,
              url: data.url ? new URL(data.url) : undefined,
              initialPath: data.path,

              rendition() {
                return data.metadata.renditions[this.renditionIndex];
              },

              chapterId() {
                return this.rendition().package.spine.itemref![
                  this.chapterIndex
                ]["@idref"];
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
              }
            }
          });
        }
      }
    });
    window.parent.postMessage({ type: "ready" }, "*");
    registerDropEvents();
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
  console.log("hm");
  document.addEventListener("keyup", e => console.log(e));

  render(() => <App />, document.getElementById("root")!);
});
