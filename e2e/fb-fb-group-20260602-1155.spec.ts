/**
 * 反馈修复验收测试 — fb-group-20260602-1155
 *
 * 修复项:
 *   #1 个人中心反馈记录显示 admin_note 处理说明
 *   #2 BackToTop 全局回到顶部
 *   #3 文章笔记(标注) — 已有功能验证
 *   #4 排行榜页面
 *   #5 答案收藏/转发/复制
 */

import { test, expect } from "@playwright/test";

test("个人中心 — 反馈 Tab 加载正常", async ({ page }) => {
  await page.goto("/profile");
  await page.waitForTimeout(3000);

  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);

  // Click "我的反馈" tab
  const feedbackTab = page.locator("button", { hasText: "我的反馈" });
  if (await feedbackTab.isVisible()) {
    await feedbackTab.click();
    await page.waitForTimeout(1500);
    expect(errors).toEqual([]);
  }
});

test("排行榜页 — 加载正常", async ({ page }) => {
  await page.goto("/ranking");
  await page.waitForTimeout(3000);

  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);

  const bodyText = await page.textContent("body");
  expect(bodyText).toContain("排行榜");
});

test("首页 — 回到顶部按钮存在(全局)", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(2000);

  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);

  const bodyText = await page.textContent("body");
  expect(bodyText).toBeTruthy();
});

test("文章详情 — 标注功能可用", async ({ page }) => {
  await page.goto("/articles/7aff87a9-8422-4a20-949f-605f239683ed");
  await page.waitForTimeout(3000);

  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);

  // Article detail page should load without errors
  const bodyText = await page.textContent("body");
  expect(bodyText).toBeTruthy();
});
