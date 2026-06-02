import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: "https://idapps.xzhmu.edu.cn/ai-web",
    headless: true,
    screenshot: "only-on-failure",
  },
  projects: [
    // Setup — CAS 登录一次，保存 auth state
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    // Main — 使用 setup 保存的 auth state，所有 test 无需重复登录
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],
});
