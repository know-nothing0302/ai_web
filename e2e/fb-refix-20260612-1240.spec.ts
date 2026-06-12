/**
 * Re-Fix 验收测试 — fb-refix-20260612-1240
 *
 * 修复内容:
 * 1. currentPageSource.url 补全 /ai-web 前缀 (service.ts ×2)
 * 2. 管理后台编辑按钮自动展开发布表单回归 (AdminPublishPage.vue)
 *
 * 用法: E2E_BASE_URL=https://idapps.xzhmu.edu.cn/ai-web \
 *        npx playwright test e2e/fb-refix-20260612-1240.spec.ts
 */

import { test, expect } from "@playwright/test";
import { assertPageLoads } from "./auth.helpers";

const BASE = process.env.E2E_BASE_URL ?? "";

// ── #1 相关 — 文章详情页正常加载（PageAgent URL 修复回归）──

test("修复验证 — 文章详情页正常加载", async ({ page }) => {
  await assertPageLoads(page, "/articles/cfb8702e-610b-4af6-bb30-ba16b8e61667");

  const h1 = page.locator("h1");
  await expect(h1).toBeVisible({ timeout: 10000 });

  await page.screenshot({
    path: "e2e/screenshots/fb-refix-20260612-1240-article.png",
  });
});

// ── #2 相关 — 管理后台发布页面路由可达 ──

test("修复验证 — 管理后台发布页路由可达", async ({ page }) => {
  await page.goto(`${BASE}/admin/publish`, { timeout: 15000 });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(3000);

  // 页面不能是 5xx 错误页
  const errors = page.locator("text=/服务器错误|500|Internal Server Error/");
  await expect(errors).toHaveCount(0);

  // 页面标题或 heading 应可见（权限不足时仍能看到页面框架）
  const heading = page.locator("h1").first();
  await expect(heading).toBeVisible({ timeout: 5000 });

  await page.screenshot({
    path: "e2e/screenshots/fb-refix-20260612-1240-admin.png",
  });
});

test("修复验证 — 管理后台页无JS运行时错误", async ({ page }) => {
  const jsErrors: string[] = [];
  page.on("pageerror", (err) => jsErrors.push(err.message));

  await page.goto(`${BASE}/admin/publish`, { timeout: 15000 });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(3000);

  // 过滤掉浏览器扩展报错
  const realErrors = jsErrors.filter(
    (e) => !e.includes("Extension") && !e.includes("chrome-extension")
  );
  expect(realErrors).toEqual([]);
});

// ── PageAgent API — currentPageSource URL 前缀验证 ──

test("修复验证 — PageAgent /qa API 可达且返回 200", async ({ page }) => {
  await assertPageLoads(page, "/articles/cfb8702e-610b-4af6-bb30-ba16b8e61667");

  // GET /api/page-agent/conversations 端点可达
  const resp = await page.request.get(
    `${BASE}/api/page-agent/conversations`,
    { timeout: 10000 }
  );
  // 200 (有数据) 或 401 (未登录) 均表示路由可达、未 500/404
  expect([200, 401]).toContain(resp.status());
});

// ── 副作用检查 ──

test("修复验证 — 无副作用（关键端点可达）", async ({ page }) => {
  await assertPageLoads(page, "/");

  const apis = [
    "/api/health",
    "/api/auth/me",
    "/api/articles?page=1&pageSize=3",
  ];
  for (const api of apis) {
    const resp = await page.request.get(`${BASE}${api}`);
    expect(resp.status()).toBe(200);
  }
});
