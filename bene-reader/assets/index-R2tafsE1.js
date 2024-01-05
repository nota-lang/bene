(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) {
    return;
  }
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) {
    processPreload(link);
  }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") {
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.tagName === "LINK" && node.rel === "modulepreload")
          processPreload(node);
      }
    }
  }).observe(document, { childList: true, subtree: true });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity)
      fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy)
      fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials")
      fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous")
      fetchOpts.credentials = "omit";
    else
      fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep)
      return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
})();
const equalFn = (a, b) => a === b;
const signalOptions = {
  equals: equalFn
};
let runEffects = runQueue;
const STALE = 1;
const PENDING = 2;
const UNOWNED = {
  owned: null,
  cleanups: null,
  context: null,
  owner: null
};
var Owner = null;
let Transition = null;
let Listener = null;
let Updates = null;
let Effects = null;
let ExecCount = 0;
function createRoot(fn, detachedOwner) {
  const listener = Listener, owner = Owner, unowned = fn.length === 0, current = detachedOwner === void 0 ? owner : detachedOwner, root = unowned ? UNOWNED : {
    owned: null,
    cleanups: null,
    context: current ? current.context : null,
    owner: current
  }, updateFn = unowned ? fn : () => fn(() => untrack(() => cleanNode(root)));
  Owner = root;
  Listener = null;
  try {
    return runUpdates(updateFn, true);
  } finally {
    Listener = listener;
    Owner = owner;
  }
}
function createSignal(value, options) {
  options = options ? Object.assign({}, signalOptions, options) : signalOptions;
  const s = {
    value,
    observers: null,
    observerSlots: null,
    comparator: options.equals || void 0
  };
  const setter = (value2) => {
    if (typeof value2 === "function") {
      value2 = value2(s.value);
    }
    return writeSignal(s, value2);
  };
  return [readSignal.bind(s), setter];
}
function createRenderEffect(fn, value, options) {
  const c = createComputation(fn, value, false, STALE);
  updateComputation(c);
}
function createEffect(fn, value, options) {
  runEffects = runUserEffects;
  const c = createComputation(fn, value, false, STALE);
  if (!options || !options.render)
    c.user = true;
  Effects ? Effects.push(c) : updateComputation(c);
}
function createMemo(fn, value, options) {
  options = options ? Object.assign({}, signalOptions, options) : signalOptions;
  const c = createComputation(fn, value, true, 0);
  c.observers = null;
  c.observerSlots = null;
  c.comparator = options.equals || void 0;
  updateComputation(c);
  return readSignal.bind(c);
}
function untrack(fn) {
  if (Listener === null)
    return fn();
  const listener = Listener;
  Listener = null;
  try {
    return fn();
  } finally {
    Listener = listener;
  }
}
function onMount(fn) {
  createEffect(() => untrack(fn));
}
function readSignal() {
  if (this.sources && this.state) {
    if (this.state === STALE)
      updateComputation(this);
    else {
      const updates = Updates;
      Updates = null;
      runUpdates(() => lookUpstream(this), false);
      Updates = updates;
    }
  }
  if (Listener) {
    const sSlot = this.observers ? this.observers.length : 0;
    if (!Listener.sources) {
      Listener.sources = [this];
      Listener.sourceSlots = [sSlot];
    } else {
      Listener.sources.push(this);
      Listener.sourceSlots.push(sSlot);
    }
    if (!this.observers) {
      this.observers = [Listener];
      this.observerSlots = [Listener.sources.length - 1];
    } else {
      this.observers.push(Listener);
      this.observerSlots.push(Listener.sources.length - 1);
    }
  }
  return this.value;
}
function writeSignal(node, value, isComp) {
  let current = node.value;
  if (!node.comparator || !node.comparator(current, value)) {
    node.value = value;
    if (node.observers && node.observers.length) {
      runUpdates(() => {
        for (let i = 0; i < node.observers.length; i += 1) {
          const o = node.observers[i];
          const TransitionRunning = Transition && Transition.running;
          if (TransitionRunning && Transition.disposed.has(o))
            ;
          if (TransitionRunning ? !o.tState : !o.state) {
            if (o.pure)
              Updates.push(o);
            else
              Effects.push(o);
            if (o.observers)
              markDownstream(o);
          }
          if (!TransitionRunning)
            o.state = STALE;
        }
        if (Updates.length > 1e6) {
          Updates = [];
          if (false)
            ;
          throw new Error();
        }
      }, false);
    }
  }
  return value;
}
function updateComputation(node) {
  if (!node.fn)
    return;
  cleanNode(node);
  const time = ExecCount;
  runComputation(
    node,
    node.value,
    time
  );
}
function runComputation(node, value, time) {
  let nextValue;
  const owner = Owner, listener = Listener;
  Listener = Owner = node;
  try {
    nextValue = node.fn(value);
  } catch (err) {
    if (node.pure) {
      {
        node.state = STALE;
        node.owned && node.owned.forEach(cleanNode);
        node.owned = null;
      }
    }
    node.updatedAt = time + 1;
    return handleError(err);
  } finally {
    Listener = listener;
    Owner = owner;
  }
  if (!node.updatedAt || node.updatedAt <= time) {
    if (node.updatedAt != null && "observers" in node) {
      writeSignal(node, nextValue);
    } else
      node.value = nextValue;
    node.updatedAt = time;
  }
}
function createComputation(fn, init, pure, state = STALE, options) {
  const c = {
    fn,
    state,
    updatedAt: null,
    owned: null,
    sources: null,
    sourceSlots: null,
    cleanups: null,
    value: init,
    owner: Owner,
    context: Owner ? Owner.context : null,
    pure
  };
  if (Owner === null)
    ;
  else if (Owner !== UNOWNED) {
    {
      if (!Owner.owned)
        Owner.owned = [c];
      else
        Owner.owned.push(c);
    }
  }
  return c;
}
function runTop(node) {
  if (node.state === 0)
    return;
  if (node.state === PENDING)
    return lookUpstream(node);
  if (node.suspense && untrack(node.suspense.inFallback))
    return node.suspense.effects.push(node);
  const ancestors = [node];
  while ((node = node.owner) && (!node.updatedAt || node.updatedAt < ExecCount)) {
    if (node.state)
      ancestors.push(node);
  }
  for (let i = ancestors.length - 1; i >= 0; i--) {
    node = ancestors[i];
    if (node.state === STALE) {
      updateComputation(node);
    } else if (node.state === PENDING) {
      const updates = Updates;
      Updates = null;
      runUpdates(() => lookUpstream(node, ancestors[0]), false);
      Updates = updates;
    }
  }
}
function runUpdates(fn, init) {
  if (Updates)
    return fn();
  let wait = false;
  if (!init)
    Updates = [];
  if (Effects)
    wait = true;
  else
    Effects = [];
  ExecCount++;
  try {
    const res = fn();
    completeUpdates(wait);
    return res;
  } catch (err) {
    if (!wait)
      Effects = null;
    Updates = null;
    handleError(err);
  }
}
function completeUpdates(wait) {
  if (Updates) {
    runQueue(Updates);
    Updates = null;
  }
  if (wait)
    return;
  const e = Effects;
  Effects = null;
  if (e.length)
    runUpdates(() => runEffects(e), false);
}
function runQueue(queue) {
  for (let i = 0; i < queue.length; i++)
    runTop(queue[i]);
}
function runUserEffects(queue) {
  let i, userLength = 0;
  for (i = 0; i < queue.length; i++) {
    const e = queue[i];
    if (!e.user)
      runTop(e);
    else
      queue[userLength++] = e;
  }
  for (i = 0; i < userLength; i++)
    runTop(queue[i]);
}
function lookUpstream(node, ignore) {
  node.state = 0;
  for (let i = 0; i < node.sources.length; i += 1) {
    const source = node.sources[i];
    if (source.sources) {
      const state = source.state;
      if (state === STALE) {
        if (source !== ignore && (!source.updatedAt || source.updatedAt < ExecCount))
          runTop(source);
      } else if (state === PENDING)
        lookUpstream(source, ignore);
    }
  }
}
function markDownstream(node) {
  for (let i = 0; i < node.observers.length; i += 1) {
    const o = node.observers[i];
    if (!o.state) {
      o.state = PENDING;
      if (o.pure)
        Updates.push(o);
      else
        Effects.push(o);
      o.observers && markDownstream(o);
    }
  }
}
function cleanNode(node) {
  let i;
  if (node.sources) {
    while (node.sources.length) {
      const source = node.sources.pop(), index = node.sourceSlots.pop(), obs = source.observers;
      if (obs && obs.length) {
        const n = obs.pop(), s = source.observerSlots.pop();
        if (index < obs.length) {
          n.sourceSlots[s] = index;
          obs[index] = n;
          source.observerSlots[index] = s;
        }
      }
    }
  }
  if (node.owned) {
    for (i = node.owned.length - 1; i >= 0; i--)
      cleanNode(node.owned[i]);
    node.owned = null;
  }
  if (node.cleanups) {
    for (i = node.cleanups.length - 1; i >= 0; i--)
      node.cleanups[i]();
    node.cleanups = null;
  }
  node.state = 0;
}
function castError(err) {
  if (err instanceof Error)
    return err;
  return new Error(typeof err === "string" ? err : "Unknown error", {
    cause: err
  });
}
function handleError(err, owner = Owner) {
  const error = castError(err);
  throw error;
}
function createComponent(Comp, props) {
  return untrack(() => Comp(props || {}));
}
function reconcileArrays(parentNode, a, b) {
  let bLength = b.length, aEnd = a.length, bEnd = bLength, aStart = 0, bStart = 0, after = a[aEnd - 1].nextSibling, map = null;
  while (aStart < aEnd || bStart < bEnd) {
    if (a[aStart] === b[bStart]) {
      aStart++;
      bStart++;
      continue;
    }
    while (a[aEnd - 1] === b[bEnd - 1]) {
      aEnd--;
      bEnd--;
    }
    if (aEnd === aStart) {
      const node = bEnd < bLength ? bStart ? b[bStart - 1].nextSibling : b[bEnd - bStart] : after;
      while (bStart < bEnd)
        parentNode.insertBefore(b[bStart++], node);
    } else if (bEnd === bStart) {
      while (aStart < aEnd) {
        if (!map || !map.has(a[aStart]))
          a[aStart].remove();
        aStart++;
      }
    } else if (a[aStart] === b[bEnd - 1] && b[bStart] === a[aEnd - 1]) {
      const node = a[--aEnd].nextSibling;
      parentNode.insertBefore(b[bStart++], a[aStart++].nextSibling);
      parentNode.insertBefore(b[--bEnd], node);
      a[aEnd] = b[bEnd];
    } else {
      if (!map) {
        map = /* @__PURE__ */ new Map();
        let i = bStart;
        while (i < bEnd)
          map.set(b[i], i++);
      }
      const index = map.get(a[aStart]);
      if (index != null) {
        if (bStart < index && index < bEnd) {
          let i = aStart, sequence = 1, t;
          while (++i < aEnd && i < bEnd) {
            if ((t = map.get(a[i])) == null || t !== index + sequence)
              break;
            sequence++;
          }
          if (sequence > index - bStart) {
            const node = a[aStart];
            while (bStart < index)
              parentNode.insertBefore(b[bStart++], node);
          } else
            parentNode.replaceChild(b[bStart++], a[aStart++]);
        } else
          aStart++;
      } else
        a[aStart++].remove();
    }
  }
}
function render(code, element, init, options = {}) {
  let disposer;
  createRoot((dispose) => {
    disposer = dispose;
    element === document ? code() : insert(element, code(), element.firstChild ? null : void 0, init);
  }, options.owner);
  return () => {
    disposer();
    element.textContent = "";
  };
}
function template(html, isCE, isSVG) {
  let node;
  const create = () => {
    const t = document.createElement("template");
    t.innerHTML = html;
    return isSVG ? t.content.firstChild.firstChild : t.content.firstChild;
  };
  const fn = isCE ? () => untrack(() => document.importNode(node || (node = create()), true)) : () => (node || (node = create())).cloneNode(true);
  fn.cloneNode = fn;
  return fn;
}
function setAttribute(node, name, value) {
  if (value == null)
    node.removeAttribute(name);
  else
    node.setAttribute(name, value);
}
function use(fn, element, arg) {
  return untrack(() => fn(element, arg));
}
function insert(parent, accessor, marker, initial) {
  if (marker !== void 0 && !initial)
    initial = [];
  if (typeof accessor !== "function")
    return insertExpression(parent, accessor, initial, marker);
  createRenderEffect((current) => insertExpression(parent, accessor(), current, marker), initial);
}
function insertExpression(parent, value, current, marker, unwrapArray) {
  while (typeof current === "function")
    current = current();
  if (value === current)
    return current;
  const t = typeof value, multi = marker !== void 0;
  parent = multi && current[0] && current[0].parentNode || parent;
  if (t === "string" || t === "number") {
    if (t === "number")
      value = value.toString();
    if (multi) {
      let node = current[0];
      if (node && node.nodeType === 3) {
        node.data = value;
      } else
        node = document.createTextNode(value);
      current = cleanChildren(parent, current, marker, node);
    } else {
      if (current !== "" && typeof current === "string") {
        current = parent.firstChild.data = value;
      } else
        current = parent.textContent = value;
    }
  } else if (value == null || t === "boolean") {
    current = cleanChildren(parent, current, marker);
  } else if (t === "function") {
    createRenderEffect(() => {
      let v = value();
      while (typeof v === "function")
        v = v();
      current = insertExpression(parent, v, current, marker);
    });
    return () => current;
  } else if (Array.isArray(value)) {
    const array = [];
    const currentArray = current && Array.isArray(current);
    if (normalizeIncomingArray(array, value, current, unwrapArray)) {
      createRenderEffect(() => current = insertExpression(parent, array, current, marker, true));
      return () => current;
    }
    if (array.length === 0) {
      current = cleanChildren(parent, current, marker);
      if (multi)
        return current;
    } else if (currentArray) {
      if (current.length === 0) {
        appendNodes(parent, array, marker);
      } else
        reconcileArrays(parent, current, array);
    } else {
      current && cleanChildren(parent);
      appendNodes(parent, array);
    }
    current = array;
  } else if (value.nodeType) {
    if (Array.isArray(current)) {
      if (multi)
        return current = cleanChildren(parent, current, marker, value);
      cleanChildren(parent, current, null, value);
    } else if (current == null || current === "" || !parent.firstChild) {
      parent.appendChild(value);
    } else
      parent.replaceChild(value, parent.firstChild);
    current = value;
  } else
    ;
  return current;
}
function normalizeIncomingArray(normalized, array, current, unwrap) {
  let dynamic = false;
  for (let i = 0, len = array.length; i < len; i++) {
    let item = array[i], prev = current && current[i], t;
    if (item == null || item === true || item === false)
      ;
    else if ((t = typeof item) === "object" && item.nodeType) {
      normalized.push(item);
    } else if (Array.isArray(item)) {
      dynamic = normalizeIncomingArray(normalized, item, prev) || dynamic;
    } else if (t === "function") {
      if (unwrap) {
        while (typeof item === "function")
          item = item();
        dynamic = normalizeIncomingArray(
          normalized,
          Array.isArray(item) ? item : [item],
          Array.isArray(prev) ? prev : [prev]
        ) || dynamic;
      } else {
        normalized.push(item);
        dynamic = true;
      }
    } else {
      const value = String(item);
      if (prev && prev.nodeType === 3 && prev.data === value)
        normalized.push(prev);
      else
        normalized.push(document.createTextNode(value));
    }
  }
  return dynamic;
}
function appendNodes(parent, array, marker = null) {
  for (let i = 0, len = array.length; i < len; i++)
    parent.insertBefore(array[i], marker);
}
function cleanChildren(parent, current, marker, replacement) {
  if (marker === void 0)
    return parent.textContent = "";
  const node = replacement || document.createTextNode("");
  if (current.length) {
    let inserted = false;
    for (let i = current.length - 1; i >= 0; i--) {
      const el = current[i];
      if (node !== el) {
        const isParent = el.parentNode === parent;
        if (!inserted && !i)
          isParent ? parent.replaceChild(node, el) : parent.insertBefore(node, marker);
        else
          isParent && el.remove();
      } else
        inserted = true;
    }
  } else
    parent.insertBefore(node, marker);
  return [node];
}
const componentScriptUrl = "" + new URL("bene-components.iife-xT-jfp_E.js", import.meta.url).href;
const _tmpl$ = /* @__PURE__ */ template(`<div class=epub><iframe class=epub-nav referrerpolicy=no-referrer></iframe><iframe class=epub-content referrerpolicy=no-referrer sandbox="allow-same-origin allow-scripts">`), _tmpl$2 = /* @__PURE__ */ template(`<pre style=padding:5px>Waiting for epub...`), _tmpl$3 = /* @__PURE__ */ template(`<pre style=padding:5px>`);
let epubUrl = (rendition, href) => `epub-content/${rendition.root ? rendition.root + "/" : ""}${href}`;
function EpubView(props) {
  let [renditionIndex] = createSignal(0);
  let rendition = () => props.data.renditions[renditionIndex()];
  let [chapterIndex, _setChapterIndex] = createSignal(0);
  let chapterId = () => rendition().package.spine.itemref[chapterIndex()]["@idref"];
  let chapterUrl = () => {
    let id = chapterId();
    let rend = rendition();
    let items = rend.package.manifest.item;
    let href = items.find((item) => item["@id"] == id)["@href"];
    return epubUrl(rend, href);
  };
  let navUrl = () => {
    let rend = rendition();
    let items = rend.package.manifest.item;
    let href = items.find((item) => item["@properties"] ? item["@properties"].split(" ").includes("nav") : false)["@href"];
    return epubUrl(rend, href);
  };
  let contentIframe;
  let navIframe;
  onMount(() => {
    navIframe.addEventListener("load", () => {
      let navDoc = navIframe.contentDocument;
      navDoc.addEventListener("click", (event) => {
        event.preventDefault();
        if (event.target && "tagName" in event.target && event.target.tagName == "a") {
          contentIframe.contentWindow.location.href = event.target.href;
        }
      });
    });
    contentIframe.addEventListener("load", () => {
      let contentDoc = contentIframe.contentDocument;
      let script = contentDoc.createElement("script");
      script.setAttribute("type", "text/javascript");
      script.setAttribute("src", componentScriptUrl);
      contentDoc.body.appendChild(script);
    });
  });
  return (() => {
    const _el$ = _tmpl$(), _el$2 = _el$.firstChild, _el$3 = _el$2.nextSibling;
    const _ref$ = navIframe;
    typeof _ref$ === "function" ? use(_ref$, _el$2) : navIframe = _el$2;
    const _ref$2 = contentIframe;
    typeof _ref$2 === "function" ? use(_ref$2, _el$3) : contentIframe = _el$3;
    createRenderEffect((_p$) => {
      const _v$ = navUrl(), _v$2 = chapterUrl();
      _v$ !== _p$._v$ && setAttribute(_el$2, "src", _p$._v$ = _v$);
      _v$2 !== _p$._v$2 && setAttribute(_el$3, "src", _p$._v$2 = _v$2);
      return _p$;
    }, {
      _v$: void 0,
      _v$2: void 0
    });
    return _el$;
  })();
}
function App() {
  let [epub, setEpub] = createSignal(void 0);
  onMount(() => {
    window.addEventListener("message", (event) => {
      let message = event.data;
      console.log("Child received message", message);
      if (message.type == "loaded-epub") {
        setEpub(message.data);
      }
    });
    window.parent.postMessage({
      type: "ready"
    }, "*");
  });
  return createMemo((() => {
    const _c$ = createMemo(() => epub() === void 0);
    return () => _c$() ? _tmpl$2() : (() => {
      const _c$2 = createMemo(() => epub().status == "error");
      return () => _c$2() ? (() => {
        const _el$5 = _tmpl$3();
        insert(_el$5, () => epub().error.toString());
        return _el$5;
      })() : createComponent(EpubView, {
        get data() {
          return epub().data;
        }
      });
    })();
  })());
}
window.addEventListener("load", () => {
  render(() => createComponent(App, {}), document.getElementById("root"));
});
//# sourceMappingURL=index-R2tafsE1.js.map
