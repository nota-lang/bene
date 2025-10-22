import "./block-links.scss";

function initBlockLinks() {
  const sections = document.querySelectorAll<HTMLElement>("section");
  sections.forEach((section, i) => {
    const updates = Array.from(section.childNodes)
      .filter(node => node instanceof HTMLElement)
      .map<[HTMLAnchorElement, HTMLElement]>((node, j) => {
        const el = node as HTMLElement;
        const id = el.id !== "" ? el.id : `block-${i + 1}-${j + 1}`;
        const outerAnchor = document.createElement("a");
        const innerAnchor = document.createElement("a");
        innerAnchor.innerText = "§";
        innerAnchor.setAttribute("href", `#${id}`);

        outerAnchor.appendChild(innerAnchor);
        outerAnchor.classList.add("block-link");
        outerAnchor.setAttribute("id", id);
        return [outerAnchor, el];
      });
    updates.forEach(([anchor, node]) => {
      section.insertBefore(anchor, node);
    });
  });
}

initBlockLinks();
