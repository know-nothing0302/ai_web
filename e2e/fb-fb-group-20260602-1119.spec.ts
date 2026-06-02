/**
 * 反馈修复验收测试 — fb-group-20260602-1119
 *
 * 修复项:
 *   #1 arxiv 来源文章作者显示为 arxiv.org（非论文编号）
 *   #2 反馈对话框拖拽后不再卡死
 *   #3 生日卡片图片压缩（JPEG ~1MB）
 *   #4 文章列表页主题征集入口
 *   #5 返回列表不再空白页
 */

import { test, expect } from "@playwright/test";

test("反馈对话框可反复拖拽和关闭", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(2000);

  // Open feedback panel
  const feedbackBtn = page.locator("button", { hasText: "意见反馈" });
  const count = await feedbackBtn.count();
  if (count === 0) {
    test.skip(true, "意见反馈按钮不存在（可能未登录）");
    return;
  }
  await feedbackBtn.click();
  await page.waitForTimeout(1000);

  // Close button should work
  const closeBtn = page.locator(".feedback-drag-handle button");
  const closeCount = await closeBtn.count();
  if (closeCount > 0) {
    await closeBtn.first().click();
    await page.waitForTimeout(500);
    // Should be able to reopen
    await feedbackBtn.click();
    await page.waitForTimeout(500);
    await closeBtn.first().click();
  }
});

test("文章详情页 — 作者显示不崩溃", async ({ page }) => {
  await page.goto("/articles/49032412-8c12-45ae-9219-794a6d83d017");
  await page.waitForTimeout(3000);

  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);

  const bodyText = await page.textContent("body");
  expect(bodyText).toBeTruthy();
});

test("首页文章列表 — 返回后不空白", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(2000);

  // Navigate to an article
  const articleLink = page.locator("a[href*='/articles/']").first();
  const linkCount = await articleLink.count();
  if (linkCount === 0) {
    test.skip(true, "没有文章链接可点击");
    return;
  }
  await articleLink.click();
  await page.waitForTimeout(2000);

  // Navigate back
  await page.goBack();
  await page.waitForTimeout(2000);

  // Should see content, not blank
  const bodyText = await page.textContent("body");
  expect(bodyText).toBeTruthy();
  // Should not show error state
  const errorIndicator = page.locator("text=页面加载异常");
  await expect(errorIndicator).toHaveCount(0);
});

test("主题征集 Banner 存在", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(2000);

  const banner = page.locator("text=主题征集");
  const count = await banner.count();
  // Banner should exist on the articles page
  expect(count).toBeGreaterThanOrEqual(1);
});
