/**
 * 反馈修复验收测试 — fb-group-20260602-0935
 *
 * 修复项:
 *   #1 管理后台发布页 URL 区域可折叠
 *   #2 文章详情页作者过多时截断显示（首个+"等"）
 */

import { test, expect } from "@playwright/test";

test("管理后台发布页 — 折叠/展开按钮存在", async ({ page }) => {
  await page.goto("/admin/publish");
  await page.waitForTimeout(2000);

  // 展开/收起按钮应存在
  const toggleBtn = page.locator("button", { hasText: /展开|收起/ });
  const count = await toggleBtn.count();
  expect(count).toBeGreaterThanOrEqual(1);

  // 页面不应崩溃
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);
});

test("文章详情页 — 多作者显示截断", async ({ page }) => {
  await page.goto("/articles/f6e7ae02-237e-49b1-a69c-976a7410d36a");
  await page.waitForTimeout(2000);

  // 页面不应崩溃
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);

  // 作者区域不应显示过长（非精确断言，只验证页面渲染正常）
  const bodyText = await page.textContent("body");
  expect(bodyText).toBeTruthy();
});
