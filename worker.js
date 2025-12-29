(function() {
  "use strict";
  let wasm;
  let cachedUint8ArrayMemory0 = null;
  function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
      cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
  }
  let cachedTextDecoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
  cachedTextDecoder.decode();
  const MAX_SAFARI_DECODE_BYTES = 2146435072;
  let numBytesDecoded = 0;
  function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
      cachedTextDecoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
      cachedTextDecoder.decode();
      numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
  }
  function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
  }
  function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
  }
  let WASM_VECTOR_LEN = 0;
  const cachedTextEncoder = new TextEncoder();
  if (!("encodeInto" in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function(arg, view) {
      const buf = cachedTextEncoder.encode(arg);
      view.set(buf);
      return {
        read: arg.length,
        written: buf.length
      };
    };
  }
  function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === void 0) {
      const buf = cachedTextEncoder.encode(arg);
      const ptr2 = malloc(buf.length, 1) >>> 0;
      getUint8ArrayMemory0().subarray(ptr2, ptr2 + buf.length).set(buf);
      WASM_VECTOR_LEN = buf.length;
      return ptr2;
    }
    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;
    const mem = getUint8ArrayMemory0();
    let offset = 0;
    for (; offset < len; offset++) {
      const code = arg.charCodeAt(offset);
      if (code > 127) break;
      mem[ptr + offset] = code;
    }
    if (offset !== len) {
      if (offset !== 0) {
        arg = arg.slice(offset);
      }
      ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
      const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
      const ret = cachedTextEncoder.encodeInto(arg, view);
      offset += ret.written;
      ptr = realloc(ptr, len, offset, 1) >>> 0;
    }
    WASM_VECTOR_LEN = offset;
    return ptr;
  }
  let cachedDataViewMemory0 = null;
  function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || cachedDataViewMemory0.buffer.detached === void 0 && cachedDataViewMemory0.buffer !== wasm.memory.buffer) {
      cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
  }
  function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
  }
  function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_export_3.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
  }
  function load_epub(data) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.load_epub(ptr0, len0);
    if (ret[2]) {
      throw takeFromExternrefTable0(ret[1]);
    }
    return EpubCtxt.__wrap(ret[0]);
  }
  function guess_mime_type(url) {
    let deferred2_0;
    let deferred2_1;
    try {
      const ptr0 = passStringToWasm0(url, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len0 = WASM_VECTOR_LEN;
      const ret = wasm.guess_mime_type(ptr0, len0);
      deferred2_0 = ret[0];
      deferred2_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
  }
  const EpubCtxtFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
  }, unregister: () => {
  } } : new FinalizationRegistry((ptr) => wasm.__wbg_epubctxt_free(ptr >>> 0, 1));
  class EpubCtxt {
    static __wrap(ptr) {
      ptr = ptr >>> 0;
      const obj = Object.create(EpubCtxt.prototype);
      obj.__wbg_ptr = ptr;
      EpubCtxtFinalization.register(obj, obj.__wbg_ptr, obj);
      return obj;
    }
    __destroy_into_raw() {
      const ptr = this.__wbg_ptr;
      this.__wbg_ptr = 0;
      EpubCtxtFinalization.unregister(this);
      return ptr;
    }
    free() {
      const ptr = this.__destroy_into_raw();
      wasm.__wbg_epubctxt_free(ptr, 0);
    }
    /**
     * @returns {string}
     */
    metadata() {
      let deferred1_0;
      let deferred1_1;
      try {
        const ret = wasm.epubctxt_metadata(this.__wbg_ptr);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
      } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
      }
    }
    /**
     * @param {string} path
     * @returns {Uint8Array}
     */
    read_file(path) {
      const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len0 = WASM_VECTOR_LEN;
      const ret = wasm.epubctxt_read_file(this.__wbg_ptr, ptr0, len0);
      if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
      }
      return takeFromExternrefTable0(ret[0]);
    }
  }
  if (Symbol.dispose) EpubCtxt.prototype[Symbol.dispose] = EpubCtxt.prototype.free;
  const EXPECTED_RESPONSE_TYPES = /* @__PURE__ */ new Set(["basic", "cors", "default"]);
  async function __wbg_load(module, imports) {
    if (typeof Response === "function" && module instanceof Response) {
      if (typeof WebAssembly.instantiateStreaming === "function") {
        try {
          return await WebAssembly.instantiateStreaming(module, imports);
        } catch (e) {
          const validResponse = module.ok && EXPECTED_RESPONSE_TYPES.has(module.type);
          if (validResponse && module.headers.get("Content-Type") !== "application/wasm") {
            console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);
          } else {
            throw e;
          }
        }
      }
      const bytes = await module.arrayBuffer();
      return await WebAssembly.instantiate(bytes, imports);
    } else {
      const instance = await WebAssembly.instantiate(module, imports);
      if (instance instanceof WebAssembly.Instance) {
        return { instance, module };
      } else {
        return instance;
      }
    }
  }
  function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbg_Error_e17e777aac105295 = function(arg0, arg1) {
      const ret = Error(getStringFromWasm0(arg0, arg1));
      return ret;
    };
    imports.wbg.__wbg_error_7534b8e9a36f1ab4 = function(arg0, arg1) {
      let deferred0_0;
      let deferred0_1;
      try {
        deferred0_0 = arg0;
        deferred0_1 = arg1;
        console.error(getStringFromWasm0(arg0, arg1));
      } finally {
        wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
      }
    };
    imports.wbg.__wbg_new_8a6f238a6ece86ea = function() {
      const ret = new Error();
      return ret;
    };
    imports.wbg.__wbg_newfromslice_074c56947bd43469 = function(arg0, arg1) {
      const ret = new Uint8Array(getArrayU8FromWasm0(arg0, arg1));
      return ret;
    };
    imports.wbg.__wbg_stack_0ed75d68575b0f3c = function(arg0, arg1) {
      const ret = arg1.stack;
      const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len1 = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
      getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbg_wbindgenthrow_451ec1a8469d7eb6 = function(arg0, arg1) {
      throw new Error(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbindgen_init_externref_table = function() {
      const table = wasm.__wbindgen_export_3;
      const offset = table.grow(4);
      table.set(0, void 0);
      table.set(offset + 0, void 0);
      table.set(offset + 1, null);
      table.set(offset + 2, true);
      table.set(offset + 3, false);
    };
    return imports;
  }
  function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
  }
  async function __wbg_init(module_or_path) {
    if (wasm !== void 0) return wasm;
    if (typeof module_or_path !== "undefined") {
      if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
        ({ module_or_path } = module_or_path);
      } else {
        console.warn("using deprecated parameters for the initialization function; pass a single object instead");
      }
    }
    if (typeof module_or_path === "undefined") {
      module_or_path = new URL("" + new URL("assets/rs_utils_bg-C2EosZ7u.wasm", self.location.href).href, self.location.href);
    }
    const imports = __wbg_get_imports();
    if (typeof module_or_path === "string" || typeof Request === "function" && module_or_path instanceof Request || typeof URL === "function" && module_or_path instanceof URL) {
      module_or_path = fetch(module_or_path);
    }
    const { instance, module } = await __wbg_load(await module_or_path, imports);
    return __wbg_finalize_init(instance, module);
  }
  let globalSelf = self;
  let currentEpub;
  let currentScope;
  let logChannel = new BroadcastChannel("log-channel");
  let log = (...args) => logChannel.postMessage(args.map((arg) => arg.toString()).join("	"));
  globalSelf.addEventListener("install", (event) => {
    async function handler() {
      log("Installed");
      globalSelf.skipWaiting();
      await __wbg_init();
      log("Initialized");
    }
    event.waitUntil(handler());
  });
  globalSelf.addEventListener("activate", (event) => {
    async function handler() {
      log("Activated");
      await globalSelf.clients.claim();
      log("Claimed");
    }
    event.waitUntil(handler());
  });
  globalSelf.addEventListener("fetch", (event) => {
    if (!currentEpub) {
      log("Ignoring request due to no loaded EPUB");
      return;
    }
    if (!currentScope) {
      log("Ignoring request due to no current scope");
      return;
    }
    const EPUB_PATH = "bene-reader/epub-content/";
    let epubBaseUrl = currentScope + EPUB_PATH;
    if (event.request.url.startsWith(epubBaseUrl)) {
      let path = event.request.url.slice(epubBaseUrl.length);
      path = path.split("#")[0];
      let contents = currentEpub.read_file(path);
      let mimeType = guess_mime_type(path);
      event.respondWith(
        new Response(contents, {
          status: 200,
          headers: {
            "Content-Type": mimeType
          }
        })
      );
      log(
        "Handling request for",
        event.request.url,
        "with guessed type",
        mimeType
      );
    } else {
      log("Ignoring request for", event.request.url);
    }
  });
  globalSelf.addEventListener("message", (event) => {
    async function handler() {
      let message = event.data;
      if (message.type === "new-epub") {
        let { data, scope, url, path } = message.data;
        log("Attempting to load new epub");
        await __wbg_init();
        try {
          currentEpub = load_epub(data);
        } catch (e) {
          log("Failed to load EPUB with error: ", e);
          return;
        }
        currentScope = scope;
        let metadata = JSON.parse(currentEpub.metadata());
        let clients = await globalSelf.clients.matchAll();
        log("Loaded new epub, broadcasting to window");
        for (let client of clients) {
          let message2 = {
            type: "loaded-epub",
            data: {
              metadata,
              url,
              path
            }
          };
          client.postMessage(message2);
        }
      }
    }
    event.waitUntil(handler());
  });
})();
//# sourceMappingURL=worker.js.map
