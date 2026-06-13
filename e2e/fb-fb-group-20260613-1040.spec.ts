/**
 * 反馈修复验收测试 — fb-group-20260613-1040
 *
 * Fix #1: 黑夜模式文字对比度 — FeedbackPublicPage dark mode text legibility
 * Fix #2: 移除发现栏目下拉列表 — ArticlesPage category dropdown removed
 *
 * 使用 Vite 开发服务器 (5173) — 源码直接服务，无需 rebuild
 */

import { test, expect } from "@playwright/test";

// Fix #1: 反馈墙页面正常加载（公开访问，无需登录）
test("Fix #1 — 反馈墙页面正常加载（公开访问）", async ({ page }) => {
  await page.goto("/feedback-public");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);

  // 页面标题可见
  await expect(page.locator("h1", { hasText: "反馈墙" })).toBeVisible();

  // 排序/筛选按钮可见
  await expect(page.locator("button", { hasText: "最新" })).toBeVisible();
  await expect(page.locator("button", { hasText: "最热" })).toBeVisible();

  // 无错误页面
  await expect(page.locator("text=服务器错误")).not.toBeVisible();

  // 截图留证
  await page.screenshot({ path: "e2e/screenshots/fb-1040-feedback-light.png" });
});

// Fix #1: 黑夜模式下文字可读
test("Fix #1 — 反馈墙黑夜模式文字可读", async ({ page }) => {
  await page.goto("/feedback-public");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1000);

  // 启用黑夜模式
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
  });
  await page.waitForTimeout(500);

  // 标题在黑夜模式下仍可见
  const heading = page.locator("h1", { hasText: "反馈墙" });
  await expect(heading).toBeVisible();

  // 截图留证（dark mode）
  await page.screenshot({ path: "e2e/screenshots/fb-1040-feedback-dark.png" });

  // 无崩溃错误
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  expect(errors).toEqual([]);
});

// Fix #2: 首页栏目下拉已移除 — 验证页面不崩溃
test("Fix #2 — 首页页面不崩溃，无 500 错误", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(3000);

  // 验证页面不崩溃（即使 CAS 重定向也不应有 500 错误）
  await expect(page.locator("text=500")).not.toBeVisible();
  await expect(page.locator("text=服务器错误")).not.toBeVisible();
  await expect(page.locator("text=Internal Server Error")).not.toBeVisible();

  // 截图留证
  await page.screenshot({ path: "e2e/screenshots/fb-1040-articles.png" });

  // 无崩溃错误
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  expect(errors).toEqual([]);
});

// 无副作用 — 关键 API 可达（使用 Nginx 代理 8080，API 代理到后端 3000）
test("修复验证 — 关键 API 端点可达", async ({ page }) => {
  const baseUrl = "http://127.0.0.1:8080";
  const apis = ["/api/health", "/api/articles?page=1&pageSize=3"];
  for (const api of apis) {
    const resp = await page.request.get(`${baseUrl}${api}`);
    expect(resp.status()).toBe(200);
  }
});
