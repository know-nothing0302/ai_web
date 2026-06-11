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
  serviceBase: process.env.E2E_BASE_URL ?? "",
  username: process.env.E2E_CAS_USERNAME || "",
  password: process.env.E2E_CAS_PASSWORD || "",
};

// 运行时校验：缺少凭据时明确报错
if (!CAS_CONFIG.username || !CAS_CONFIG.password) {
  throw new Error(
    "E2E_CAS_USERNAME / E2E_CAS_PASSWORD 环境变量未设置。\n" +
    "请在运行测试前 export 这两个变量，或创建 e2e/.env.e2e 文件。"
  );
}

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
    new RegExp(process.env.E2E_CAS_HOST || "authserver"),
    { timeout: 5000 }
  ).then(() => true).catch(() => false);

  if (onCasPage) {
    // 3. 真实 CAS 登录 — 需要点击"登录"按钮触发 JS 加密，不可用 Enter
    await page.waitForLoadState("domcontentloaded");
    const usernameInput = page.locator("#username");
    const passwordInput = page.locator("#password");
    const loginBtn = page.locator("#login_submit");
    await usernameInput.waitFor({ state: "visible", timeout: 10000 });
    await usernameInput.fill(CAS_CONFIG.username);
    await passwordInput.fill(CAS_CONFIG.password);

    // CAS 用 <a id="login_submit" href="javascript:void(0);"> 作为登录按钮，
    // 依赖 JS 对 #password 做 pwdEncryptSalt 加密后写入 #saltPassword 再提交表单。
    // fill() 不触发 input 事件，可能加密不执行 → Enter 提交的是明文密码 → CAS 拒绝。
    // 必须 click 登录按钮触发完整的 JS 事件链。
    await loginBtn.click();

    // 等 CAS 处理（可能显示错误提示或重定向）
    await page.waitForTimeout(3000);
  }

  // 4. 等待回到应用
  await page.waitForURL(new RegExp(process.env.E2E_APP_HOST || ""), { timeout: 20000 });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(3000);

  // 5. 验证已登录
  if (page.url().includes("authserver")) {
    throw new Error(`CAS 登录失败：仍在 CAS 页面 ${page.url()}`);
  }

  // 6. 保存 browser state
  await page.context().storageState({ path: AUTH_FILE });
});
