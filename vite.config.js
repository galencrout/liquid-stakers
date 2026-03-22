import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        liquidStakers: resolve(__dirname, "liquid-stakers.html"),
        ethChomp: resolve(__dirname, "eth-chomp.html"),
        csmRunner: resolve(__dirname, "csm-runner.html"),
      },
    },
  },
});
