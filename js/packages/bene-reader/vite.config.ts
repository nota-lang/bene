import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig(({ mode }) => ({
  plugins: [solidPlugin()],
  base: "./",
  define: {
    "process.env.NODE_ENV": JSON.stringify(mode)
  },
  build: {
    rollupOptions: {
      input: ["./index.html", "./styles/content.scss"],
      output: {
        assetFileNames: asset => {
          if (asset.names.includes("content.css")) return "content.css";
          return "assets/[name]-[hash][extname]";
        }
      }
    }
  },
  test: {
    environment: "jsdom",
    deps: {
      inline: [/^(?!.*vitest).*$/]
    }
  }
}));
