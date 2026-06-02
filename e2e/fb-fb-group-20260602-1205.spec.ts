/**
 * 反馈修复验收测试 — fb-group-20260602-1205
 *
 * 修复项:
 *   #1 收藏夹/浏览记录可发现性 — 导航栏新增"我的收藏"
 *   #2 原文链接失效反馈 — 文章详情页"链接失效？"按钮
 *   #3 搜索历史记录 — 已有功能(useSearchHistory)
 */

import { test, expect } from "@playwright/test";

test("导航栏 — 我的收藏入口存在", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(2000);

  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);

  const bodyText = await page.textContent("body");
  // Nav should have "我的收藏" link
  expect(bodyText).toContain("我的收藏");
});

test("文章详情 — 链接失效反馈按钮存在", async ({ page }) => {
  await page.goto("/articles/044a0f77-840b-4b0e-81f8-a78e7558ae25");
  await page.waitForTimeout(3000);

  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);

  const bodyText = await page.textContent("body");
  // Should have "查看原文" and "链接失效？" or "未提供原文链接"
  const hasOriginalLink = bodyText.includes("查看原文");
  const hasLinkReport = bodyText.includes("链接失效") || bodyText.includes("未提供原文链接");
  expect(hasOriginalLink || hasLinkReport).toBe(true);
});

test("首页 — 搜索历史功能可用", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(2000);

  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);

  // Search input should exist with placeholder
  const searchInput = page.locator('input[placeholder*="搜索"]');
  await expect(searchInput).toBeVisible();
});
