import { defineConfig } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

// 加载 e2e/.env.e2e（本地凭据文件，gitignored）
const envFile = path.resolve(__dirname, "e2e", ".env.e2e");
if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

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
