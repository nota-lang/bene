import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";

export default defineConfig(({mode}) => ({
  plugins: [wasm()],
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
