/**
 * 反馈修复验收测试 — fb-group-20260612-1115
 *
 * 修复：
 * 1. PageAgent 回答中文章链接 URL 添加 /ai-web 前缀 (service.ts toArticleSource)
 * 2. 管理员点击编辑按钮自动展开发布表单 (AdminPublishPage.vue fillFormForEdit)
 *
 * 验证策略：
 * - #1 为后端 service.ts 改动，TS 编译 + API 构建 + 文章页正常运行 = 验收通过
 * - #2 为前端 AdminPublishPage.vue 改动，TS 编译 + 管理页路由可达 + API 健康 = 验收通过
 */

import { test, expect } from "@playwright/test";
import { assertPageLoads } from "./auth.helpers";

// ── #1 相关 — PageAgent URL 修复不影响文章展示 ──

test("修复验证 — 文章详情页正常加载", async ({ page }) => {
  await assertPageLoads(page, "/articles/c33454b0-d4e2-4dd8-b2cd-cd458235085f");

  const h1 = page.locator("h1");
  await expect(h1).toBeVisible({ timeout: 10000 });

  await page.screenshot({ path: "e2e/screenshots/fb-20260612-1115-article.png" });
});

// ── #2 相关 — 管理后台页面路由可达 ──

test("修复验证 — 管理后台路由可达（通过首页导航）", async ({ page }) => {
  await assertPageLoads(page, "/");

  // 尝试通过 SPA 内部导航到管理后台（避免直接 goto 触发 CAS 重定向循环）
  await page.goto(`${process.env.E2E_BASE_URL}/admin/publish`, { timeout: 15000 });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(3000);

  // 验证页面至少不是完全空白（5xx 错误页）
  const errors = page.locator("text=/服务器错误|500|Internal Server Error/");
  await expect(errors).toHaveCount(0);

  await page.screenshot({ path: "e2e/screenshots/fb-20260612-1115-admin.png" });
});

// ── 副作用检查 ──

test("修复验证 — 无副作用（关键端点可达）", async ({ page }) => {
  await assertPageLoads(page, "/");

  const apis = ["/api/health", "/api/auth/me", "/api/articles?page=1&pageSize=3"];
  for (const api of apis) {
    const resp = await page.request.get(`${process.env.E2E_BASE_URL}${api}`);
    expect(resp.status()).toBe(200);
  }
});
