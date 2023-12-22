import fs from "fs-extra";
import { Plugin, defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

let copyBeneReaderPlugin: Plugin = {
  name: "copyBeneReader",
  writeBundle() {
    let intvl = setInterval(() => {
      if (fs.pathExistsSync("node_modules/bene-reader/dist/index.html")) {        
        fs.copy("node_modules/bene-reader/dist", "dist/bene-reader");
        clearInterval(intvl);
      }
    }, 100);
  },
};

export default defineConfig(({ mode }) => ({
  plugins: [solidPlugin(), copyBeneReaderPlugin],
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
