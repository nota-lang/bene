import type { Item } from "bene-types";
import { onMount } from "solid-js";
import navCssUrl from "../styles/nav.scss?url";
import { type DocState, epubUrl, insertCss, useDocState } from ".";

export function findNavItem(state: DocState): Item | undefined {
  const rend = state.rendition();
  const items = rend.package.manifest.item;
  return items.find((item: Item) =>
    item["@properties"] ? item["@properties"].split(" ").includes("nav") : false
  );
}

export function Nav(props: { navigateEvent: EventTarget; navItem: Item }) {
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
