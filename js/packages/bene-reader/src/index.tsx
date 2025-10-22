import componentScriptUrl from "bene-components?url";
import { debounce, throttle } from "@solid-primitives/scheduled";
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

interface DocState {
  renditionIndex: number;
  chapterIndex: number;
  fontSize: number;
  showNav: boolean;
  width: number;
  pageInfo?: PageInfo;
  epub: Epub;
  url?: URL;
  initialPath?: string;

  rendition(): Rendition;
  chapterId(): string;
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

const DEBOUNCE_TIME = 250;

function ToolbarInner() {
  let [state, setState] = useDocState();
  function setFont(delta: number) {
    const fontSize = Math.max(state.fontSize + delta, 1);
    setState({ fontSize });
  }

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
              class="toolbar-button sidebar-toggle"
              aria-label="Show navigation"
              onClick={() => setState({ showNav: !state.showNav })}
            />
            <div class="toolbar-button-spacer" />
          </>
        )}
        <button
          type="button"
          class="toolbar-button page-up"
          aria-label="Previous page"
          onClick={() => setPage(-1)}
        />
        <div class="split-toolbar-button-separator" />
        <button
          type="button"
          class="toolbar-button page-down"
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
          class="toolbar-button zoom-out"
          aria-label="Reduce font size"
          onClick={() => setFont(-1)}
        />
        <div class="split-toolbar-button-separator" />
        <button
          type="button"
          class="toolbar-button zoom-in"
          aria-label="Increase font size"
          onClick={() => setFont(1)}
        />
        <input
          type="number"
          class="scale-input"
          aria-label="Set font size"
          value={state.fontSize}
          onInput={debounce(e => {
            const fontSize = parseInt(e.target.value, 10);
            if (!Number.isNaN(fontSize)) setState({ fontSize });
          }, DEBOUNCE_TIME)}
        />
        <span class="label" aria-label="Font size unit">
          px
        </span>
      </div>
      <div class="toolbar-right">
        {state.url ? (
          <button
            type="button"
            class="toolbar-button download"
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
      const contentWindow = iframe.contentWindow as any;
      insertCss(navDoc, navCssUrl);

      navDoc.querySelectorAll("nav a").forEach(node => {
        node.addEventListener("click", event => {
          event.preventDefault();
          if (!(event.target instanceof contentWindow.HTMLAnchorElement))
            return;
          props.navigateEvent.dispatchEvent(
            new CustomEvent("navigate", { detail: (event.target as any).href })
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

function Content(props: { navigateEvent: EventTarget }) {
  const [state, setState] = useDocState();
  const [styleEl, setStyleEl] = createSignal<HTMLStyleElement | undefined>(
    undefined
  );

  function updateStyleEl(el: HTMLStyleElement) {
    el.innerText = `
      html {
        font-size: ${state.fontSize}px;        
      }

      article {
        max-width: ${state.width}px;
      }
      `;
  }

  const chapterUrl = () => {
    if (state.initialPath) return state.initialPath;
    const id = state.chapterId();
    const rend = state.rendition();
    const items = rend.package.manifest.item!;
    const href = items.find((item: Item) => item["@id"] === id)!["@href"];
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
        contentWindow.location.href = url;
      });
    }

    iframe.addEventListener("load", () => {
      const contentWindow = iframe.contentWindow!;
      const contentDoc = iframe.contentDocument!;

      injectReaderStylesAndScripts(contentDoc);
      registerPageInfoCallbacks(iframe, contentDoc);
      updateAnchors(contentWindow, contentDoc);
      handleTocNavigation(contentWindow);

      const article = contentDoc.querySelector<HTMLElement>("article");
      if (!article) {
        log.warn("Missing <article> element, not a valid portable EPUB");
        return;
      }

      const handleRoot = contentDoc.createElement("resize-handle");
      article.appendChild(handleRoot);
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

  // const [stillWaiting, setStillWaiting] = createSignal(false);
  // const [stillWaitingLong, setStillWaitingLong] = createSignal(false);
  // setTimeout(() => setStillWaiting(true), LOADING_THRESHOLD);
  // setTimeout(() => setStillWaitingLong(true), LOADING_LONG_THRESHOLD);

  return (
    <div class="loader-container">
      {state.type === "error" ? (
        <pre>{state.error}</pre>
      ) : (
        <>Drag an EPUB file into the window.</>
      )}
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
              fontSize: 16,
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
  render(() => <App />, document.getElementById("root")!);
});
