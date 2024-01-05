import fg from "fast-glob";
import path from "path";
import { Plugin, defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

// Ensures that bene-desktop rebuilds when bene-reader rebuilds
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
  appType: "mpa",
  base: "./",
  define: {
    "process.env.NODE_ENV": JSON.stringify(mode),
  },
  test: {
    environment: "jsdom",
    deps: {
      inline: [/^(?!.*vitest).*$/],
    },
  },
}));
