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

  // 0. 如果已有有效 auth state（cookie 未过期），跳过 CAS 登录直接复用
  if (fs.existsSync(AUTH_FILE)) {
    const raw = fs.readFileSync(AUTH_FILE, "utf-8").trim();
    if (raw.startsWith("{")) {
      const state = JSON.parse(raw);
      if (state.cookies?.length > 0 || state.origins?.length > 0) {
        // 只检查有过期时间的 cookie（session cookie 的 expires=-1 视为有效）
        const now = Date.now() / 1000;
        const expiries = state.cookies
          .map((c: any) => c.expires)
          .filter((e: number) => e > 0);
        // 所有有过期时间的 cookie 都未过期（留 5 分钟缓冲）→ 复用
        const allValid = expiries.length === 0 || expiries.every((e: number) => e > now + 300);
        if (allValid) {
          const info = expiries.length > 0
            ? `最早过期: ${new Date(Math.min(...expiries) * 1000).toISOString()}`
            : "session cookies only";
          console.log(`跳过 CAS 登录 — 复用已有 auth state（${info}）`);
          return;
        }
        console.log(`auth state 已过期，重新登录`);
      }
    }
  }

  const authDir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // 1. 导航到 CAS 登录入口
  await page.goto(`${CAS_CONFIG.serviceBase}/api/auth/cas/login?redirect=%2F`);

  // 2. 检测是否需要 CAS 登录（bypass 开启时不会跳转 CAS）
  const onCasPage = await page.waitForURL(
    /authserver\.xzhmu\.edu\.cn/,
    { timeout: 5000 }
  ).then(() => true).catch(() => false);

  if (onCasPage) {
    // 3. 真实 CAS 登录 — 填写表单
    await page.waitForLoadState("domcontentloaded");
    const usernameInput = page.locator("#username");
    const passwordInput = page.locator("#password");
    await usernameInput.waitFor({ state: "visible", timeout: 10000 });
    await usernameInput.fill(CAS_CONFIG.username);
    await passwordInput.fill(CAS_CONFIG.password);

    // ⚠️ CAS 登录按钮是 javascript:void(0)，必须用 Enter 提交
    await passwordInput.press("Enter");
  }

  // 4. 等待回到应用
  await page.waitForURL(/idapps\.xzhmu\.edu\.cn/, { timeout: 20000 });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(3000);

  // 5. 验证已登录
  if (page.url().includes("authserver")) {
    throw new Error(`CAS 登录失败：仍在 CAS 页面 ${page.url()}`);
  }

  // 6. 保存 browser state
  await page.context().storageState({ path: AUTH_FILE });
});
