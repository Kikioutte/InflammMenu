import { defineConfig } from "@playwright/test";

const testPort = Number(process.env.PWA_TEST_PORT ?? 4175);

export default defineConfig({
  testDir: "./tests",
  testMatch: "pwa-state.spec.ts",
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${testPort}`,
    viewport: { width: 390, height: 844 },
    serviceWorkers: "allow",
  },
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${testPort} --base /InflammMenu/ --outDir dist/pages`,
    url: `http://127.0.0.1:${testPort}/InflammMenu/`,
    reuseExistingServer: false,
  },
});
