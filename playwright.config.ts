import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

// Runs against the production build (npm run build first), served like GitHub Pages under /fumble-and-glory/.
export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["json", { outputFile: "reports/playwright.json" }]],
  use: {
    baseURL: `http://localhost:${PORT}/fumble-and-glory/`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "phone", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/fumble-and-glory/`,
    reuseExistingServer: !process.env.CI,
  },
});
