import { debounce, throttle } from "@solid-primitives/scheduled";
import componentScriptUrl from "bene-components?url";
import _ from "lodash";
import normalizeCssUrl from "normalize.css?url";
import {
  createContext,
  createEffect,
  createMemo,
  createResource,
  createSignal,
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
  let style = doc.createElement("link");
  style.setAttribute("rel", "stylesheet");
  style.setAttribute("type", "text/css");
  style.setAttribute("href", url);
  doc.body.appendChild(style);
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
  pageInfo?: PageInfo;
  epub: any;
  url: URL;

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

  function downloadEpub() {
    let a = document.createElement("a");
    a.href = state.url.toString();
    a.download = _.last(state.url.pathname.split("/"))!;
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
      <div class="toolbar -middle">
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
        <button
          class="toolbar-button download"
          onClick={() => downloadEpub()}
        />
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

function Content(props: { navigateEvent: EventTarget }) {
  let [state, setState] = useContext(StateContext)!;
  let [styleEl, setStyleEl] = createSignal<HTMLStyleElement | undefined>(
    undefined
  );

  let chapterUrl = () => {
    let id = state.chapterId();
    let rend = state.rendition();
    let items = rend.package.manifest.item!;
    let href = items.find((item: any) => item["@id"] == id)!["@href"];
    return epubUrl(rend, href);
  };

  let containerRef: HTMLDivElement | undefined;
  let frameRef: HTMLDivElement | undefined;
  let iframeRef: HTMLIFrameElement | undefined;

  onMount(() => {
    let container = containerRef!;
    let frame = frameRef!;
    let iframe = iframeRef!;

    function updatePageInfo() {
      let pageHeight = container.getBoundingClientRect().height;
      let docHeight = frame.getBoundingClientRect().height;
      let numPages = Math.ceil(docHeight / pageHeight);
      let currentPage =
        container.scrollTop + pageHeight >= docHeight
          ? numPages
          : 1 + Math.floor(container.scrollTop / pageHeight);
      let pages: PageInfo = {
        numPages,
        pageHeight,
        currentPage,
        container,
      };
      if (!_.isEqual(pages, state.pageInfo)) setState({ pageInfo: pages });
    }

    props.navigateEvent.addEventListener("navigate", e => {
      let contentWindow = iframe.contentWindow!;

      let url = (e as CustomEvent<string>).detail;
      contentWindow.location.href = url;
    });

    iframe.addEventListener("load", () => {
      let contentDoc = iframe.contentDocument!;
      insertJs(contentDoc, componentScriptUrl);
      insertCss(contentDoc, normalizeCssUrl);

      let htmlEl = contentDoc.documentElement;

      let iframeObserver = new ResizeObserver(() => {
        let height = htmlEl.getBoundingClientRect().height;
        iframe.style.height = height + "px";
      });
      iframeObserver.observe(htmlEl);

      let pageObserver = new ResizeObserver(() => updatePageInfo());
      pageObserver.observe(container);
      pageObserver.observe(frame);

      const SCROLL_CALLBACK_DELAY = 30;
      container.addEventListener(
        "scroll",
        throttle(() => updatePageInfo(), SCROLL_CALLBACK_DELAY)
      );

      let styleEl = contentDoc.createElement("style");
      contentDoc.body.appendChild(styleEl);
      setStyleEl(styleEl);
    });
  });

  createEffect(() => {
    let el = styleEl();
    if (!el) return;

    el.innerText = `
body {
  font-size: ${state.fontSize}px;
}    
`;
  });

  return (
    <div ref={containerRef} class="content">
      <div ref={frameRef} class="content-frame">
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
  let [state] = useContext(StateContext)!;
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
    epub: props.data.metadata,
    url: new URL(props.data.url),

    rendition() {
      return props.data.metadata.renditions[this.renditionIndex];
    },

    chapterId() {
      return this.rendition().package.spine.itemref![this.chapterIndex][
        "@idref"
      ];
    },
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

function App() {
  let [epub, setEpub] = createSignal<any>(undefined);
  let [stillWaiting, setStillWaiting] = createSignal(false);
  setTimeout(() => setStillWaiting(true), LOADING_THRESHOLD);

  onMount(() => {
    window.addEventListener("message", event => {
      let message = event.data;
      console.log("Received message from service worker:", message);
      if (message.type == "loaded-epub") {
        setEpub(message.data);
      }
    });
    window.parent.postMessage({ type: "ready" }, "*");
  });

  return (
    <>
      {epub() === undefined ? (
        stillWaiting() ? (
          <pre style="padding:5px">Waiting for epub...</pre>
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
