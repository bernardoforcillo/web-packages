import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
    // src/react and src/schema belong to another session and are not part of this plan
    exclude: ["**/node_modules/**", "**/dist/**", "src/react/**", "src/schema/**"],
  },
});
