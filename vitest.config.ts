import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      include: ["tests/unit/**/*.test.ts"],
      coverage: {
        provider: "v8",
        include: ["src/**/*.ts"],
        exclude: ["src/vite-env.d.ts"],
        // lcov for SonarCloud, json-summary for the README badge
        reporter: ["text", "lcov", "json-summary"],
      },
    },
  }),
);
