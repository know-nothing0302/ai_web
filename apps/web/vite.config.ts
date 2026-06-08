import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ command }) => ({
  base: command === "serve" ? "/" : "/ai-web/",
  plugins: [vue(), tailwindcss()],
  build: {
    target: "es2019",
  },
  server: {
    port: 5173,
    allowedHosts: ["idapps.xzhmu.edu.cn"],
    proxy: {
      "/ai-web/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ai-web/, ""),
      },
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
}));
