import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/csp-phase9-staging",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 40_000,
  globalTimeout: 6 * 60_000,
  reporter: [["line"]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    browserName: "chromium",
    headless: true,
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000/login",
    reuseExistingServer: false,
    timeout: 90_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
