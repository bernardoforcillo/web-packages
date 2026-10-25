import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    vite: "src/plugin/index.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  external: ["vite", "@tanstack/react-router", "react", "react-dom"],
});
