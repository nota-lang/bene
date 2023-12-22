import fs from "fs";
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

let manifest = JSON.parse(fs.readFileSync("package.json", "utf-8"));
export default defineConfig(({mode}) => ({
  plugins: [solidPlugin()],
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
