import tippy, { roundArrow } from "tippy.js";

import "./dfn-links.scss";

const TIPPY_THEME = "light-border";

function initDefinitionLinks() {
  let definitionEls = document.querySelectorAll("dfn");
  let definitions: { [id: string]: string } = {};
  definitionEls.forEach(el => {
    let parent = el.closest<HTMLElement>("dfn-container, p");
    if (parent === null) {
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
    let content = definitions[id];
    if (content === undefined) {
      console.warn("Missing definition for reference", id);
      return;
    }
    tippy(link, {
      content,
      arrow: roundArrow,
      theme: TIPPY_THEME,
      placement: "auto",
      interactive: true,
      delay: [200, 0],
      touch: ["hold", 500],
    });
  });
}

initDefinitionLinks();
