/**
 * CAS 认证辅助模块
 *
 * 为 Playwright E2E 测试提供 CAS 登录能力。
 * 使用测试账号 790020260042 通过 authserver.xzhmu.edu.cn 认证。
 *
 * 用法:
 *   import { casLogin } from "./auth.setup";
 *   test("受保护页面", async ({ page }) => {
 *     await casLogin(page, "/admin/publish");
 *     // 此时已登录，可以访问受保护页面
 *   });
 */

import { Page, expect } from "@playwright/test";

const CAS_CONFIG = {
  loginUrl: "https://authserver.xzhmu.edu.cn/authserver/login",
  serviceBase: "https://idapps.xzhmu.edu.cn/ai-web",
  username: "790020260042",
  password: "Py9W_mb4hE-NJwz",
};

/**
 * 通过 CAS 登录并导航到目标页面
 *
 * @param page    Playwright page 对象
 * @param target  登录后的目标路径，如 "/admin/publish"
 * @param timeout 最大等待时间 ms（默认 30000）
 */
export async function casLogin(
  page: Page,
  target: string = "/",
  timeout: number = 30000
): Promise<void> {
  // 1. 导航到 CAS 登录入口
  const loginEntry = `${CAS_CONFIG.serviceBase}/api/auth/cas/login?redirect=${encodeURIComponent(target)}`;
  await page.goto(loginEntry, { timeout });

  // 2. 等待跳转到 CAS 登录页面
  await page.waitForURL(/authserver\.xzhmu\.edu\.cn/, { timeout: 10000 });

  // 3. 填写 CAS 登录表单（CAS 典型表单结构）
  const usernameInput = page.locator("#username");
  const passwordInput = page.locator("#password");
  const submitBtn = page.locator("input[type='submit'], button[type='submit'], .btn-submit").first();

  await usernameInput.waitFor({ state: "visible", timeout: 10000 });
  await usernameInput.fill(CAS_CONFIG.username);
  await passwordInput.fill(CAS_CONFIG.password);
  await submitBtn.click();

  // 4. 等待回调完成，跳转回应用
  await page.waitForURL(/idapps\.xzhmu\.edu\.cn/, { timeout: 15000 });

  // 5. 等待页面稳定（Vue 渲染 + API 调用）
  await page.waitForLoadState("networkidle", { timeout: 10000 });
  await page.waitForTimeout(2000);
}

/**
 * 验证当前会话已认证
 */
export async function assertAuthenticated(page: Page): Promise<void> {
  const resp = await page.request.get(
    `${CAS_CONFIG.serviceBase}/api/auth/me`
  );
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body.user).toBeTruthy();
  expect(body.user.id).toBeTruthy();
}

/**
 * 跳转到受保护页面（已登录状态），验证页面可正常加载
 */
export async function assertPageLoads(
  page: Page,
  path: string
): Promise<void> {
  await page.goto(`${CAS_CONFIG.serviceBase}${path}`, { timeout: 15000 });
  await page.waitForLoadState("networkidle", { timeout: 10000 });

  // 无控制台错误
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.waitForTimeout(2000);

  // 页面标题非空
  const title = await page.title();
  expect(title.length).toBeGreaterThan(0);

  // 无 500/404 错误页
  await expect(page.locator("text=服务器错误")).not.toBeVisible();
  await expect(page.locator("text=页面不存在")).not.toBeVisible();
  await expect(page.locator("text=404")).not.toBeVisible();

  // 未被重定向到 CAS（说明 auth 有效）
  expect(page.url()).toContain("idapps.xzhmu.edu.cn");
  expect(page.url()).not.toContain("authserver");

  // 无 JS 异常（排除浏览器扩展等无害错误）
  const realErrors = errors.filter(
    (e) => !e.includes("Extension") && !e.includes("chrome-extension")
  );
  expect(realErrors).toEqual([]);
}
