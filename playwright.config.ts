import { defineConfig } from "@playwright/test";

const testPort = Number(process.env.MOBILE_RUNTIME_TEST_PORT ?? 4174);

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  timeout: 20_000,
  // On a loaded CI runner, roughly one page in ~300 stops responding for the
  // whole test timeout (2026-10-05: page.reload, 2026-10-07: a click's
  // stability check), each time on a different test that passes on retry and
  // locally under repetition. A single retry keeps such a stall from blocking
  // the Pages deployment; Playwright still reports the test as "flaky" and
  // keeps the failed attempt's trace in the CI artifact for diagnosis.
  retries: process.env.CI ? 1 : 0,
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit-smoke", grep: /@webkit-smoke/, use: { browserName: "webkit" } },
  ],
  use: {
    baseURL: `http://127.0.0.1:${testPort}`,
    viewport: { width: 1100, height: 1100 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npm run dev -- --port ${testPort}`,
    url: `http://127.0.0.1:${testPort}/tests/runtime-fixture.html`,
    reuseExistingServer: process.env.MOBILE_RUNTIME_TEST_PORT == null,
  },
});
