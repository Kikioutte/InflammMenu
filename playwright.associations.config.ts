import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "food-associations.spec.ts", timeout: 30_000,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4175", serviceWorkers: "block" },
  projects: [
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1100, height: 1000 } } },
    { name: "mobile", use: { browserName: "chromium", viewport: { width: 390, height: 844 } } },
    { name: "webkit", use: { browserName: "webkit", viewport: { width: 390, height: 844 } } },
  ],
});
