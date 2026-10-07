import { defineConfig } from "@playwright/test";

const testPort = Number(process.env.PWA_TEST_PORT ?? 4175);

export default defineConfig({
  testDir: "./tests",
  testMatch: ["pwa-state.spec.ts", "responsive-images.pwa.spec.ts", "responsive-layout.pwa.spec.ts"],
  timeout: 60_000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  // Keep the earlier browser-suite results: this run would otherwise empty
  // test-results/ and drop the traces of tests reported as flaky.
  outputDir: "test-results/pwa",
  use: {
    baseURL: `http://127.0.0.1:${testPort}`,
    viewport: { width: 390, height: 844 },
    serviceWorkers: "allow",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${testPort} --base /InflammMenu/ --outDir dist/pages`,
    url: `http://127.0.0.1:${testPort}/InflammMenu/`,
    reuseExistingServer: false,
  },
});
