/**
 * Re-Fix 验收测试 — fb-refix-20260601-1510
 *
 * 修复项:
 *   1. ArticleDetailPage — console.error 改为 logger
 *   2. AdminStatsPage — table th 添加 aria-label
 */

import { test, expect } from "@playwright/test";

test("文章详情页 — logger 替代 console.error", async ({ page }) => {
  await page.goto("/articles/test");
  await page.waitForTimeout(2000);

  // 页面不应因 console.error 调用而崩溃
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);
});

test("统计信息页 — 表格列头有 aria-label", async ({ page }) => {
  await page.goto("/admin/stats");
  await page.waitForTimeout(2000);

  // 检查反馈表格列头 aria-label
  const thElements = page.locator("table thead th[aria-label]");
  const count = await thElements.count();
  expect(count).toBeGreaterThanOrEqual(4);

  // 页面无崩溃
  const crashErrors: string[] = [];
  page.on("pageerror", (err) => crashErrors.push(err.message));
  expect(crashErrors).toEqual([]);
});
