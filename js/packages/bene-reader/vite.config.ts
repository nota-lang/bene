import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig(({ mode }) => ({
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
