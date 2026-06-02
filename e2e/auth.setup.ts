/**
 * CAS 认证 Setup Project
 *
 * 在所有测试之前运行一次 CAS 登录，保存 browser storage state。
 * 后续所有 test 共享此认证状态 — login once, all tests authenticated.
 */

import { test as setup } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

const CAS_CONFIG = {
  serviceBase: "https://idapps.xzhmu.edu.cn/ai-web",
  username: "790020260042",
  password: "Py9W_mb4hE-NJwz",
};

const AUTH_FILE = path.resolve(__dirname, ".auth", "user.json");

setup("CAS 登录 — 保存认证状态", async ({ page }) => {
  setup.setTimeout(60000);

  const authDir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // 1. 导航到 CAS 登录入口
  await page.goto(`${CAS_CONFIG.serviceBase}/api/auth/cas/login?redirect=%2F`);

  // 2. 等待跳转到 CAS 登录页面
  await page.waitForURL(/authserver\.xzhmu\.edu\.cn/, { timeout: 10000 });
  await page.waitForLoadState("domcontentloaded");

  // 3. 填写登录表单（账号密码表单与扫码页并存，无需切换标签页）
  const usernameInput = page.locator("#username");
  const passwordInput = page.locator("#password");
  await usernameInput.waitFor({ state: "visible", timeout: 10000 });
  await usernameInput.fill(CAS_CONFIG.username);
  await passwordInput.fill(CAS_CONFIG.password);

  // 4. 提交 — 按 Enter 键
  await passwordInput.press("Enter");

  // 5. 等待回调完成
  await page.waitForURL(/idapps\.xzhmu\.edu\.cn/, { timeout: 15000 });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(3000);

  // 6. 验证已登录
  if (page.url().includes("authserver")) {
    throw new Error(`CAS 登录失败：仍在 CAS 页面 ${page.url()}`);
  }

  // 7. 保存 browser state
  await page.context().storageState({ path: AUTH_FILE });
});
