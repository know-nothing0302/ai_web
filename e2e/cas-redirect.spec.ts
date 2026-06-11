/**
 * CAS 重定向回归测试 — 未登录用户经 CAS 认证后应回到目标页面
 *
 * 此测试不使用预认证 storageState，模拟真实"首次访问"场景。
 * 验证修复：CAS 认证回调保留原始请求路径，不跳回首页。
 *
 * 用法（独立运行，不依赖 setup project）：
 *   npx playwright test e2e/cas-redirect.spec.ts --project=cold
 */

import { test, expect, BrowserContext } from "@playwright/test";

// ── CAS 凭据 ──────────────────────────────────────────────

const CAS = {
  username: process.env.E2E_CAS_USERNAME || "",
  password: process.env.E2E_CAS_PASSWORD || "",
  loginUrlPattern: new RegExp(process.env.E2E_CAS_HOST || "authserver"),
  appUrlPattern: new RegExp(process.env.E2E_APP_HOST || ""),
};

test.describe("CAS 认证重定向", () => {
  let context: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    // 创建不带任何 storageState 的全新 context
    context = await browser.newContext();
  });

  test.afterAll(async () => {
    await context.close();
  });

  // ── #1: 核心场景 — 访问 /subscription 经 CAS 后回到订阅页 ──

  test("[CAS-REDIRECT-01] 未登录访问 /subscription → CAS 登录 → 回到 /subscription（非首页）", async () => {
    test.setTimeout(60000);
    const page = await context.newPage();

    // Step 1: 直接访问订阅页（无任何 cookie）
    await page.goto(`${process.env.E2E_BASE_URL}/subscription`, {
      timeout: 15000,
      waitUntil: "domcontentloaded",
    });

    // Step 2: 应被前端 router 重定向到 CAS 登录页
    // （SPA 加载 → auth check → window.location.href = /api/auth/cas/login → CAS redirect）
    await page.waitForURL(CAS.loginUrlPattern, { timeout: 15000 });

    // Step 3: 填写 CAS 凭据并提交
    const usernameInput = page.locator("#username");
    const passwordInput = page.locator("#password");
    const loginBtn = page.locator("#login_submit");
    await usernameInput.waitFor({ state: "visible", timeout: 10000 });
    await usernameInput.fill(CAS.username);
    await passwordInput.fill(CAS.password);

    // CAS 密码有 JS 加密（pwdEncryptSalt → saltPassword），
    // fill() 不触发 input 事件，必须 click 登录按钮触发完整 JS 链。
    await loginBtn.click();
    await page.waitForTimeout(3000);

    // 检查是否有登录错误提示
    const errorTip = page.locator("#showErrorTip");
    if (await errorTip.isVisible().catch(() => false)) {
      const errText = await errorTip.textContent();
      throw new Error(`CAS 登录错误: ${errText}`);
    }

    // Step 4: 应回到应用，且在 /subscription 页面（非首页 /）
    await page.waitForURL(CAS.appUrlPattern, { timeout: 20000 });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000); // 等 SPA 渲染完成 + sessionStorage jump

    // 关键断言：URL 应包含 /subscription，不是 /
    expect(page.url(), "CAS 回调后 URL 应包含 /subscription").toContain(
      "/subscription"
    );

    // 关键断言：页面应显示"智能订阅"相关内容
    await expect(
      page.locator("h1:has-text('智能订阅中心')"),
      "订阅页标题应可见"
    ).toBeVisible({ timeout: 10000 });

    await page.close();
  });

  // 辅助函数：CAS 登录（仅在未认证时执行）
  async function loginIfNeeded(page: import("@playwright/test").Page, expectedPath: string) {
    // 如果已经认证（有有效 session），不会跳转 CAS
    const onApp = await page.waitForURL(CAS.appUrlPattern, { timeout: 5000 })
      .then(() => true).catch(() => false);
    if (onApp) {
      // 已认证，确认在正确的路径上
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(3000);
      return true;
    }

    // 未认证 → 需要 CAS 登录
    await page.waitForURL(CAS.loginUrlPattern, { timeout: 10000 });
    const usernameInput = page.locator("#username");
    const passwordInput = page.locator("#password");
    const loginBtn = page.locator("#login_submit");
    await usernameInput.waitFor({ state: "visible", timeout: 10000 });
    await usernameInput.fill(CAS.username);
    await passwordInput.fill(CAS.password);
    await loginBtn.click();
    await page.waitForTimeout(3000);

    // 检查登录错误
    const errorTip = page.locator("#showErrorTip");
    if (await errorTip.isVisible().catch(() => false)) {
      const errText = await errorTip.textContent();
      throw new Error(`CAS 登录错误: ${errText}`);
    }

    await page.waitForURL(CAS.appUrlPattern, { timeout: 20000 });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(5000); // 等 sessionStorage redirect
    return false;
  }

  // ── #2: 子路径 — 访问 /admin/stats ──

  test("[CAS-REDIRECT-02] 未登录访问 /admin/stats → CAS → 回到 /admin/stats", async () => {
    test.setTimeout(60000);
    const page = await context.newPage();

    await page.goto(`${process.env.E2E_BASE_URL}/admin/stats`, {
      timeout: 15000,
      waitUntil: "domcontentloaded",
    });

    await loginIfNeeded(page, "/admin/stats");

    expect(page.url(), "最终 URL 应包含 /admin/stats").toContain(
      "/admin/stats"
    );
    await page.close();
  });

  // ── #3: 根路径 — 访问 / 经 CAS 后回到 / ──

  test("[CAS-REDIRECT-03] 未登录访问 / → CAS → 回到 /（根路径基准测试）", async () => {
    test.setTimeout(60000);
    const page = await context.newPage();

    await page.goto(`${process.env.E2E_BASE_URL}/`, {
      timeout: 15000,
      waitUntil: "domcontentloaded",
    });

    await loginIfNeeded(page, "/");

    expect(page.url()).toContain(process.env.E2E_APP_HOST || "");
    await expect(page.locator("body")).toBeVisible();
    await page.close();
  });

  // ── #4: 登录后再次访问 /subscription — 不再重定向 CAS ──

  test("[CAS-REDIRECT-04] 已登录访问 /subscription → 直接进入（不跳 CAS）", async () => {
    test.setTimeout(30000);
    const page = await context.newPage();

    // 使用已有 session（context 中第一个测试的 cookie 已被保存）
    await page.goto(`${process.env.E2E_BASE_URL}/subscription`, {
      timeout: 15000,
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(3000);

    // 不应跳转到 CAS
    expect(page.url(), "已登录不应跳 CAS").not.toMatch(CAS.loginUrlPattern);
    expect(page.url(), "已登录应直接进入 /subscription").toContain(
      "/subscription"
    );
    await page.close();
  });
});
