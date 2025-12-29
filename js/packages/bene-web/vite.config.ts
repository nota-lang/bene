import path from "node:path";
import fg from "fast-glob";
import { defineConfig, type Plugin } from "vite";
import solidPlugin from "vite-plugin-solid";

// Ensures that bene-web rebuilds when bene-reader rebuilds
let watchPublicPlugin: Plugin = {
  name: "watch-public-plugin",
  async buildStart() {
    let files = await fg("public/**/*");
    for (let file of files) {
      this.addWatchFile(path.resolve(file));
    }
  }
};

export default defineConfig(({ mode }) => ({
  plugins: [solidPlugin(), watchPublicPlugin],
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
      inline: [/^(?!.*vitest).*$/]
    }
  },
  worker: {
    rollupOptions: {
      output: {
        file: "dist/worker.js"
      }
    }
  }
}));
