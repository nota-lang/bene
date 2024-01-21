import fg from "fast-glob";
import path from "path";
import { Plugin, defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

const TEST_EPUB: string | undefined = "bene-tests/portable-epubs.epub";

// Ensures that bene-web rebuilds when bene-reader rebuilds
let watchPublicPlugin: Plugin = {
  name: "watch-public-plugin",
  async buildStart() {
    let files = await fg("public/**/*");
    for (let file of files) {      
      this.addWatchFile(path.resolve(file));
    }
  },
};

export default defineConfig(({ mode }) => ({
  plugins: [solidPlugin(), watchPublicPlugin],
  base: "./",
  define: {
    "process.env.NODE_ENV": JSON.stringify(mode),
    TEST_EPUB: JSON.stringify(TEST_EPUB ? path.basename(TEST_EPUB) : undefined),
  },
  resolve: {
    alias: {
      "rs-utils": "./rs-utils/pkg",
    },
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
