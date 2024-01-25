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

import contentCssUrl from "../styles/content.scss?worker&url";
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
  container: HTMLDivElement;
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
          onClick={() => setState({ showNav: !state.showNav })}
        />
        <div class="toolbar-button-spacer" />
        <button class="toolbar-button page-up" onClick={() => setPage(-1)} />
        <div class="split-toolbar-button-separator" />
        <button class="toolbar-button page-down" onClick={() => setPage(1)} />
        <input
          type="number"
          class="page-input"
          value={state.pageInfo?.currentPage}
        />
        <span class="label">of {state.pageInfo?.numPages ?? "-"}</span>
      </div>
      <div class="toolbar-middle">
        <button class="toolbar-button zoom-out" onClick={() => setFont(-1)} />
        <div class="split-toolbar-button-separator" />
        <button class="toolbar-button zoom-in" onClick={() => setFont(1)} />
        <input
          type="number"
          class="scale-input"
          value={state.fontSize}
          onInput={debounce(e => {
            let fontSize = parseInt(e.target.value);
            if (!isNaN(fontSize)) setState({ fontSize });
          }, DEBOUNCE_TIME)}
        />
        <span class="label">px</span>
      </div>
      <div class="toolbar-right">
        {state.url ? (
          <button
            class="toolbar-button download"
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

      let htmlEl = navDoc.documentElement;

      let iframeObserver = new ResizeObserver(() => {
        let height = htmlEl.getBoundingClientRect().height;
        iframe.style.height = height + "px";
      });
      iframeObserver.observe(htmlEl);
    });
  });

  return (
    <div classList={{ nav: true, hidden: !state.showNav }}>
      <div class="nav-frame">
        <iframe ref={iframeRef} src={navUrl()} referrerPolicy="no-referrer" />
      </div>
    </div>
  );
}

function ResizeHandle() {
  let [_state, setState] = useContext(StateContext)!;
  let handleRef: HTMLDivElement | undefined;

  function onMouseDown(event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();

    let handleBounds = handleRef!.getBoundingClientRect();
    let deltaX = handleBounds.right - event.x;

    let iframes = document.querySelectorAll<HTMLIFrameElement>("iframe");
    iframes.forEach(iframe => {
      iframe.style.pointerEvents = "none";
    });

    function onMouseMove(event: MouseEvent) {
      let width = Math.abs(event.x + deltaX - window.innerWidth / 2) * 2;
      setState({ width });
    }

    function onMouseUp() {
      iframes.forEach(iframe => {
        iframe.style.pointerEvents = "auto";
      });
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  return (
    <div
      class="resize-handle-container"
      onMouseDown={onMouseDown}
      ref={handleRef}
    >
      <div class="resize-handle" />
    </div>
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

  let containerRef: HTMLDivElement | undefined;
  let iframeRef: HTMLIFrameElement | undefined;

  onMount(() => {
    let container = containerRef!;
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
      let pageHeight = container.getBoundingClientRect().height;
      let docHeight = iframe.getBoundingClientRect().height;
      let numPages = Math.ceil(docHeight / pageHeight);
      let currentPage =
        container.scrollTop + pageHeight >= docHeight
          ? numPages
          : 1 + Math.floor(container.scrollTop / pageHeight);
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
        scrollTop: container.scrollTop,
        docHeight,
      };
      localStorage.setItem(SCROLL_KEY, JSON.stringify(scrollInfo));
    }

    function injectReaderStylesAndScripts(contentDoc: Document) {
      insertJs(contentDoc, contentCssUrl);
      insertCss(contentDoc, componentStyleUrl);

      let styleEl = contentDoc.createElement("style");
      updateStyleEl(styleEl);
      contentDoc.head.appendChild(styleEl);
      setStyleEl(styleEl);

      insertJs(contentDoc, componentScriptUrl);
    }

    function matchFrameHeightToDocHeight(contentDoc: Document) {
      let htmlEl = contentDoc.documentElement;
      let iframeObserver = new ResizeObserver(() => {
        let height = htmlEl.getBoundingClientRect().height;
        iframe.style.height = height + "px";
      });
      iframeObserver.observe(htmlEl);
    }

    function registerPageInfoCallbacks(
      container: HTMLDivElement,
      iframe: HTMLIFrameElement
    ) {
      let pageObserver = new ResizeObserver(() => updatePageInfo());
      pageObserver.observe(container);
      pageObserver.observe(iframe);

      const SCROLL_CALLBACK_DELAY = 30;
      container.addEventListener(
        "scroll",
        throttle(() => updatePageInfo(), SCROLL_CALLBACK_DELAY)
      );
    }

    function updateAnchors(contentWindow: any, contentDoc: Document) {
      function updateAnchor(a: HTMLAnchorElement) {
        if (!a.href) return;

        let url = new URL(a.href);
        if (url.host != window.location.host) {
          // Need to add target="blank" to all anchors, or else external navigation will
          // occur within the reader's iframe.
          a.setAttribute("target", "blank");
        } else {
          a.addEventListener("click", () => {
            window.parent.postMessage(
              {
                type: "navigate",
                data: a.href,
              },
              "*"
            );
          });
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
      matchFrameHeightToDocHeight(contentDoc);
      registerPageInfoCallbacks(container, iframe);
      updateAnchors(contentWindow, contentDoc);
      handleTocNavigation(contentWindow);
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
    <div ref={containerRef} class="content">
      <div class="content-frame" style={{ "max-width": `${state.width}px` }}>
        <ResizeHandle />
        <iframe
          ref={iframeRef}
          src={chapterUrl()}
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
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

const LOADING_THRESHOLD = 250;

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

function App() {
  let [epub, setEpub] = createSignal<any>(undefined);
  let [stillWaiting, setStillWaiting] = createSignal(false);
  setTimeout(() => setStillWaiting(true), LOADING_THRESHOLD);

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
        stillWaiting() ? (
          <pre style="padding:5px">(waiting for document to load...)</pre>
        ) : null
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
