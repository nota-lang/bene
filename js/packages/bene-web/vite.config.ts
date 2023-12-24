import fs from "fs-extra";
import path from "path";
import { Plugin, defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import topLevelAwait from "vite-plugin-top-level-await";
import wasm from "vite-plugin-wasm";

let copyBeneReaderPlugin: Plugin = {
  name: "copyBeneReader",
  writeBundle() {
    let intvl = setInterval(() => {
      if (fs.pathExistsSync("node_modules/bene-reader/dist/index.html")) {
        fs.copy("node_modules/bene-reader/dist", "dist/bene-reader");
        const ZIPS = [
          "PLAI-3-2-2.epub",
          "epub3-samples/wasteland.epub",
          "epub3-samples/moby-dick.epub",
        ];
        for (let zip of ZIPS) {
          fs.copy(`../../../epubs/${zip}`, `dist/epubs/${path.basename(zip)}`);
        }

        clearInterval(intvl);
      }
    }, 100);
  },
};

export default defineConfig(({ mode }) => ({
  plugins: [solidPlugin(), copyBeneReaderPlugin],
  base: "./",
  define: {
    "process.env.NODE_ENV": JSON.stringify(mode),
  },
  resolve: {
    alias: {
      "rs-utils": "./rs-utils/pkg"
    }
  },
  test: {
    environment: "jsdom",
    deps: {
      inline: [/^(?!.*vitest).*$/],
    },
  },
  worker: {
    rollupOptions: {
      output: {
        file: "dist/worker.js",
      },
    },
  },
}));
