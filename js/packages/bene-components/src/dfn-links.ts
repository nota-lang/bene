import tippy, { roundArrow } from "tippy.js";

import "./dfn-links.scss";

const TIPPY_THEME = "light-border";

function initDefinitionLinks() {
  let definitionEls = document.querySelectorAll("dfn");
  let definitions: { [id: string]: string } = {};
  definitionEls.forEach(el => {
    let parent = el.closest<HTMLElement>("dfn-container, p");
    if (!parent) {
      console.warn("Missing parent for definition", el);
      return;
    }
    definitions[el.id] = parent.innerText;
  });

  let links = document.querySelectorAll<HTMLAnchorElement>(
    'a[data-target="dfn"]'
  );
  links.forEach(link => {
    let id = link.href.split("#")[1];
    let def = definitions[id];
    if (!def) {
      console.warn("Missing definition for reference", id);
      return;
    }
    let isMobile = window.screen.width < 600;
    tippy(link, {
      content: `“${def}”`,
      arrow: roundArrow,
      theme: TIPPY_THEME,
      placement: "auto",
      interactive: true,
      delay: [200, 0],
      // trigger: isMobile ? "click" : "mouseenter focus",
      touch: ["hold", 500],
    });
  });
}

initDefinitionLinks();
