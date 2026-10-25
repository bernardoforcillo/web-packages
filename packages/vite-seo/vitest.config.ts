import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
    // src/react e src/schema appartengono a un'altra sessione e non fanno parte di questo piano
    exclude: ["**/node_modules/**", "**/dist/**", "src/react/**", "src/schema/**"],
  },
});
