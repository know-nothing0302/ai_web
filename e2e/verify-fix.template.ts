/**
 * 反馈修复验收测试模板 — CAS 认证版
 *
 * CC 使用时：
 * 1. 复制此文件为 e2e/fb-{task_id}.spec.ts
 * 2. 替换 {{PAGE_PATH}} 为目标页面路由（受保护页面用 casLogin 登录）
 * 3. 替换 {{PAGE_TITLE}} 为页面标题关键词（如"管理后台""文章详情"）
 * 4. 根据修复内容在 "核心功能可用" 测试中添加验证断言
 * 5. 运行: cd /opt/idapps/ai_web && npx playwright test e2e/fb-{task_id}.spec.ts
 *
 * CAS 测试账号: 790020260042 / Py9W_mb4hE-NJwz
 * 未受保护页面（如公开文章页）直接用 page.goto()
 * 受保护页面（如 /admin/*）需先 casLogin(page, "{{PAGE_PATH}}")
 */

import { test, expect } from "@playwright/test";
import { casLogin, assertAuthenticated, assertPageLoads } from "./auth.setup";

test("认证 — CAS 登录成功", async ({ page }) => {
  await casLogin(page, "/");
  await assertAuthenticated(page);
});

test("修复验证 — 页面正常加载（已认证）", async ({ page }) => {
  const targetPath = "{{PAGE_PATH}}";

  // CAS 登录 → 导航到目标页面
  await casLogin(page, targetPath);

  // 页面可正常渲染
  await assertPageLoads(page, targetPath);
});

test("修复验证 — 核心功能可用", async ({ page }) => {
  const targetPath = "{{PAGE_PATH}}";

  // CAS 登录 → 导航到目标页面
  await casLogin(page, targetPath);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);

  // ── CC 在此添加具体验证逻辑 ──
  // 示例: 验证按钮存在
  // await expect(page.locator("button", { hasText: /展开|收起/ })).toBeVisible();
  //
  // 示例: 验证文字渲染
  // await expect(page.locator("text={{PAGE_TITLE}}")).toBeVisible();
  //
  // 示例: 验证无 500 错误页面
  // await expect(page.locator("text=服务器错误")).not.toBeVisible();
  //
  // 示例: 验证 API 调用成功
  // const resp = page.waitForResponse(
  //   r => r.url().includes("/api/") && r.status() === 200,
  //   { timeout: 10000 }
  // );
  // await expect((await resp).ok()).toBeTruthy();
  //
  // 示例: 截图留证
  // await page.screenshot({ path: "e2e/screenshots/{{TASK_ID}}-{{PAGE_SLUG}}.png" });
  // ────────────────────────────────
});

test("修复验证 — 无副作用（关键端点可达）", async ({ page }) => {
  await casLogin(page, "/");
  await assertPageLoads(page, "/");

  // 验证关键 API 端点可达
  const apis = ["/api/health", "/api/auth/me", "/api/articles?page=1&pageSize=3"];
  for (const api of apis) {
    const resp = await page.request.get(`https://idapps.xzhmu.edu.cn/ai-web${api}`);
    expect(resp.status()).toBe(200);
  }
});
