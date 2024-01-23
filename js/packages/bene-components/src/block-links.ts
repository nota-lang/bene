import "./block-links.scss";

function initBlockLinks() {
  let sections = document.querySelectorAll<HTMLElement>("section");
  sections.forEach((section, i) => {
    let updates = Array.from(section.childNodes)
      .filter(node => node instanceof HTMLElement)
      .map<[HTMLAnchorElement, HTMLElement]>((node, j) => {
        let el = node as HTMLElement;
        let id = el.id !== "" ? el.id : `block-${i + 1}-${j + 1}`;
        let outerAnchor = document.createElement("a");
        let innerAnchor = document.createElement("a");
        innerAnchor.innerText = "§";
        innerAnchor.setAttribute("href", `#${id}`);

        outerAnchor.appendChild(innerAnchor);
        outerAnchor.classList.add("block-link");
        outerAnchor.setAttribute("id", id);
        return [outerAnchor, el];
      });
    updates.forEach(([anchor, node]) => section.insertBefore(anchor, node));
  });
}

initBlockLinks();
