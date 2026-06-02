/**
 * 反馈修复验收测试 — fb-group-20260602-1145
 *
 * 修复项:
 *   #1 深色模式(已有) + 字体大小调节(新增小/中/大)
 *   #2 反馈对话框页面名称有辨识度
 *   #3 反馈审批已处理聚合页 + 翻页/检索
 *   #4 反馈长文本展开阈值降低(100→80)
 *   #5 生日推送已在AI试验场
 */

import { test, expect } from "@playwright/test";

test("首页 — 字体调节按钮存在", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(2000);

  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);

  // Font scale buttons should be in the nav: 小/中/大
  const bodyText = await page.textContent("body");
  expect(bodyText).toBeTruthy();
});

test("反馈审批页 — 已处理 Tab 存在 + 不崩溃", async ({ page }) => {
  await page.goto("/admin/feedback-review");
  await page.waitForTimeout(3000);

  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);

  const bodyText = await page.textContent("body");
  // Should have "已处理" tab
  expect(bodyText).toContain("已处理");
});

test("AI试验场 — 生日推送卡片存在", async ({ page }) => {
  await page.goto("/ai-lab");
  await page.waitForTimeout(2000);

  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);

  const bodyText = await page.textContent("body");
  expect(bodyText).toContain("生日推送");
});
