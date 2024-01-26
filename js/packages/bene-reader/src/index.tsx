import { debounce, throttle } from "@solid-primitives/scheduled";
import componentStyleUrl from "bene-components/dist/style.css?url";
import componentScriptUrl from "bene-components?url";
import _ from "lodash";
import {
  createContext,
  createEffect,
  createSignal,
  on,
  onMount,
  useContext,
} from "solid-js";
import { SetStoreFunction, createStore } from "solid-js/store";
import { render } from "solid-js/web";

import navCssUrl from "../styles/nav.scss?worker&url";

// import { Rendition, commands } from "./bindings";

// type Result<T, E> = { status: "ok"; data: T } | { status: "error"; error: E };
// type Epub = { renditions: Rendition[] };

function insertJs(doc: Document, url: string) {
  let script = doc.createElement("script");
  script.setAttribute("type", "text/javascript");
  script.setAttribute("src", url);
  doc.body.appendChild(script);
}

function insertCss(doc: Document, url: string) {
  let link = doc.createElement("link");
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

interface State {
  renditionIndex: number;
  chapterIndex: number;
  fontSize: number;
  showNav: boolean;
  width: number;
  pageInfo?: PageInfo;
  epub: any;
  url?: URL;
  initialPath?: string;

  rendition(): any;
  chapterId(): string;
}

let epubUrl = (rendition: any, href: string) =>
  `epub-content/${rendition.root ? rendition.root + "/" : ""}${href}`;

let StateContext = createContext<[State, SetStoreFunction<State>] | undefined>(
  undefined
);

const DEBOUNCE_TIME = 250;

function Toolbar() {
  let [state, setState] = useContext(StateContext)!;

  function setFont(delta: number) {
    let fontSize = Math.max(state.fontSize + delta, 1);
    setState({ fontSize });
  }

  function setPage(delta: number) {
    let pageInfo = state.pageInfo;
    if (!pageInfo) return;
    let currentPage = _.clamp(
      pageInfo.currentPage + delta,
      1,
      pageInfo.numPages
    );

    pageInfo.container.scrollTo({
      top: pageInfo.pageHeight * (currentPage - 1),
    });

    setState({
      pageInfo: {
        ...pageInfo,
        currentPage,
      },
    });
  }

  function downloadEpub(url: URL) {
    let a = document.createElement("a");
    a.href = url.toString();
    a.download = _.last(url.pathname.split("/"))!;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div class="toolbar">
      <div class="toolbar-left">
        <button
          class="toolbar-button sidebar-toggle"
          aria-label="Show navigation"
          onClick={() => setState({ showNav: !state.showNav })}
        />
        <div class="toolbar-button-spacer" />
        <button
          class="toolbar-button page-up"
          aria-label="Previous page"
          onClick={() => setPage(-1)}
        />
        <div class="split-toolbar-button-separator" />
        <button
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
          class="toolbar-button zoom-out"
          aria-label="Reduce font size"
          onClick={() => setFont(-1)}
        />
        <div class="split-toolbar-button-separator" />
        <button
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
            let fontSize = parseInt(e.target.value);
            if (!isNaN(fontSize)) setState({ fontSize });
          }, DEBOUNCE_TIME)}
        />
        <span class="label" aria-label="Font size unit">
          px
        </span>
      </div>
      <div class="toolbar-right">
        {state.url ? (
          <button
            class="toolbar-button download"
            aria-label="Download EPUB"
            onClick={() => downloadEpub(state.url!)}
          />
        ) : null}
      </div>
    </div>
  );
}

function Nav(props: { navigateEvent: EventTarget }) {
  let [state] = useContext(StateContext)!;
  let navUrl = () => {
    let rend = state.rendition();
    let items = rend.package.manifest.item!;
    let href = items.find((item: any) =>
      item["@properties"]
        ? item["@properties"].split(" ").includes("nav")
        : false
    )!["@href"];
    return epubUrl(rend, href);
  };

  let iframeRef: HTMLIFrameElement | undefined;
  onMount(() => {
    let iframe = iframeRef!;

    iframe.addEventListener("load", () => {
      let navDoc = iframe.contentDocument!;
      insertJs(navDoc, navCssUrl);

      navDoc.querySelectorAll("nav a").forEach(node =>
        node.addEventListener("click", event => {
          event.preventDefault();
          let href = (event.target as any).href;
          props.navigateEvent.dispatchEvent(
            new CustomEvent("navigate", { detail: href })
          );
        })
      );

      let navEl = navDoc.querySelector<HTMLElement>("nav")!;
      let navWidth = getComputedStyle(iframe).getPropertyValue("--nav-width");
      // TODO: make this react to changes in nav-width
      navEl.style.width = navWidth;
    });
  });

  return (
    <iframe
      class="nav"
      classList={{ show: state.showNav }}
      aria-label="Document navigation"
      ref={iframeRef}
      src={navUrl()}
      referrerPolicy="no-referrer"
    />
  );
}

function Content(props: { navigateEvent: EventTarget }) {
  let [state, setState] = useContext(StateContext)!;
  let [styleEl, setStyleEl] = createSignal<HTMLStyleElement | undefined>(
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

  let chapterUrl = () => {
    if (state.initialPath) return state.initialPath;
    let id = state.chapterId();
    let rend = state.rendition();
    let items = rend.package.manifest.item!;
    let href = items.find((item: any) => item["@id"] == id)!["@href"];
    return epubUrl(rend, href);
  };

  let iframeRef: HTMLIFrameElement | undefined;

  onMount(() => {
    let iframe = iframeRef!;

    const SCROLL_KEY = "bene-scroll-info";
    interface ScrollInfo {
      scrollTop: number;
      docHeight: number;
    }

    let initializedScroll = chapterUrl().includes("#");
    let savedScrollStr = localStorage.getItem(SCROLL_KEY);
    let savedScroll =
      savedScrollStr !== null
        ? (JSON.parse(savedScrollStr) as ScrollInfo)
        : undefined;

    function updatePageInfo() {
      let container = iframe.contentWindow!;
      let doc = iframe.contentDocument!.body;
      let pageHeight = iframe.getBoundingClientRect().height;
      let docHeight = doc.getBoundingClientRect().height;
      let numPages = Math.ceil(docHeight / pageHeight);
      let currentPage =
        container.scrollY + pageHeight >= docHeight
          ? numPages
          : 1 + Math.floor(container.scrollY / pageHeight);

      currentPage = _.clamp(currentPage, 1, numPages);
      let pages: PageInfo = {
        numPages,
        pageHeight,
        currentPage,
        container,
      };
      if (!_.isEqual(pages, state.pageInfo)) setState({ pageInfo: pages });

      if (
        savedScroll &&
        !initializedScroll &&
        savedScroll.docHeight == docHeight
      ) {
        container.scrollTo({ top: savedScroll.scrollTop });
        initializedScroll = true;
      }

      let scrollInfo: ScrollInfo = {
        scrollTop: container.scrollY,
        docHeight,
      };
      localStorage.setItem(SCROLL_KEY, JSON.stringify(scrollInfo));
    }

    function injectReaderStylesAndScripts(contentDoc: Document) {
      insertCss(contentDoc, componentStyleUrl);

      let styleEl = contentDoc.createElement("style");
      updateStyleEl(styleEl);
      contentDoc.head.appendChild(styleEl);
      setStyleEl(styleEl);

      insertJs(contentDoc, componentScriptUrl);
    }

    function registerPageInfoCallbacks(
      iframe: HTMLIFrameElement,
      contentDoc: Document
    ) {
      let pageObserver = new ResizeObserver(() => updatePageInfo());
      pageObserver.observe(iframe);
      pageObserver.observe(contentDoc.body);

      const SCROLL_CALLBACK_DELAY = 30;
      contentDoc.addEventListener(
        "scroll",
        throttle(() => updatePageInfo(), SCROLL_CALLBACK_DELAY)
      );
    }

    function updateAnchors(contentWindow: any, contentDoc: Document) {
      contentWindow.addEventListener("popstate", () => {
        window.parent.postMessage(
          {
            type: "navigate",
            data: contentWindow.location.href,
          },
          "*"
        );
      });

      function updateAnchor(a: HTMLAnchorElement) {
        if (!a.href) return;

        let url = new URL(a.href);
        if (url.host != window.location.host) {
          // Need to add target="blank" to all anchors, or else external navigation will
          // occur within the reader's iframe.
          a.setAttribute("target", "blank");
        }
      }

      function updateAll(container: HTMLElement) {
        let anchors = container.querySelectorAll<HTMLAnchorElement>("a[href]");
        anchors.forEach(updateAnchor);
      }

      updateAll(contentDoc.documentElement);

      let observer = new MutationObserver(records =>
        records.forEach(record =>
          record.addedNodes.forEach(added => {
            if (added instanceof contentWindow.HTMLElement)
              updateAll(added as any);
          })
        )
      );
      observer.observe(contentDoc.documentElement, {
        subtree: true,
        childList: true,
      });
    }

    function handleTocNavigation(contentWindow: Window) {
      props.navigateEvent.addEventListener("navigate", e => {
        let url = (e as CustomEvent<string>).detail;
        contentWindow.location.href = url;
      });
    }

    iframe.addEventListener("load", () => {
      let contentWindow = iframe.contentWindow!;
      let contentDoc = iframe.contentDocument!;

      injectReaderStylesAndScripts(contentDoc);
      registerPageInfoCallbacks(iframe, contentDoc);
      updateAnchors(contentWindow, contentDoc);
      handleTocNavigation(contentWindow);

      let article = contentDoc.querySelector<HTMLElement>("article")!;
      let handleRoot = contentDoc.createElement("resize-handle");
      article.appendChild(handleRoot);
    });
  });

  createEffect(() => {
    let el = styleEl();
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
      aria-label="Document content"
      ref={iframeRef}
      src={chapterUrl()}
      referrerPolicy="no-referrer"
    />
  );
}

function Viewer() {
  let navigateEvent = new EventTarget();
  return (
    <div class="viewer">
      <Nav navigateEvent={navigateEvent} />
      <Content navigateEvent={navigateEvent} />
    </div>
  );
}

function EpubView(props: { data: /*Epub*/ any }) {
  let [state, setState] = createStore<State>({
    renditionIndex: 0,
    chapterIndex: 0,
    fontSize: 16,
    showNav: false,
    width: 800,
    epub: props.data.metadata,
    url: props.data.url ? new URL(props.data.url) : undefined,
    initialPath: props.data.path,

    rendition() {
      return props.data.metadata.renditions[this.renditionIndex];
    },

    chapterId() {
      return this.rendition().package.spine.itemref![this.chapterIndex][
        "@idref"
      ];
    },
  });

  createEffect(() => {
    setState({
      epub: props.data.metadata,
      url: props.data.url ? new URL(props.data.url) : undefined,
      initialPath: props.data.path,
    });
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
      window.parent.postMessage(
        {
          type: "user-upload",
          data: file,
        },
        "*"
      );
    }
  });
}

const LOADING_THRESHOLD = 500;
const LOADING_LONG_THRESHOLD = 5000;

function App() {
  let [epub, setEpub] = createSignal<any>(undefined);
  let [stillWaiting, setStillWaiting] = createSignal(false);
  let [stillWaitingLong, setStillWaitingLong] = createSignal(false);
  setTimeout(() => setStillWaiting(true), LOADING_THRESHOLD);
  setTimeout(() => setStillWaitingLong(true), LOADING_LONG_THRESHOLD);

  onMount(() => {
    window.addEventListener("message", event => {
      let message = event.data;
      console.debug("Received message from window:", message);
      if (message.type == "loaded-epub") {
        setEpub(message.data);
      }
    });
    window.parent.postMessage({ type: "ready" }, "*");
    registerDropEvents();
  });

  return (
    <>
      {epub() === undefined ? (
        <>
          <div class="loader-container" classList={{ show: stillWaiting() }}>
            <div class="loader">Loading...</div>
          </div>
          {stillWaitingLong() ? (
            <div style="max-width:500px;margin:0 auto">
              If the document is not loading, it's probably a bug in my Service
              Worker that I'm still trying to fix (sorry!). To work around the
              bug, you either need to close any other tabs of this document (in
              Google Chrome), or try a different browser.
            </div>
          ) : null}
        </>
      ) : epub().status == "error" ? (
        <pre style="padding:5px">{epub().error.toString()}</pre>
      ) : (
        <EpubView data={epub().data} />
      )}
    </>
  );
}

window.addEventListener("load", () => {
  render(() => <App />, document.getElementById("root")!);
});
