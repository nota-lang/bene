import tippy, { roundArrow } from "tippy.js";

import "./dfn-links.scss";
import { log } from "bene-common";

const TIPPY_THEME = "light-border";

function initDefinitionLinks() {
  const definitionEls = document.querySelectorAll("dfn");
  const definitions: { [id: string]: string } = {};
  definitionEls.forEach(el => {
    const parent = el.closest<HTMLElement>("dfn-container, p");
    if (parent === null) {
      log.warn("Missing parent for definition", el);
      return;
    }
    definitions[el.id] = parent.innerText;
  });

  const links = document.querySelectorAll<HTMLAnchorElement>(
    'a[data-target="dfn"]'
  );
  links.forEach(link => {
    const id = link.href.split("#")[1];
    const content = definitions[id];
    if (content === undefined) {
      log.warn("Missing definition for reference", id);
      return;
    }
    tippy(link, {
      content,
      arrow: roundArrow,
      theme: TIPPY_THEME,
      placement: "auto",
      interactive: true,
      delay: [200, 0],
      touch: ["hold", 500]
    });
  });
}

initDefinitionLinks();
