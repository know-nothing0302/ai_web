/**
 * 反馈修复验收测试 — fb-group-20260609-2235
 * 修复: 移动端 "AI在徐医" 标题换行变形
 *
 * 注意: 测试连接生产服务器，CSS 变更部署后生效。
 * 此处验证核心行为：元素可见、单行渲染、页面无报错。
 */

import { test, expect } from "@playwright/test";

test("修复验证 — 文章详情页加载正常", async ({ page }) => {
  const targetPath = "/articles/dc081db8-6b13-48b5-ba83-bd81eefcade0";

  await page.goto(`${process.env.E2E_BASE_URL}${targetPath}`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);

  // 验证 "AI在徐医" 标题可见
  const brand = page.locator("header span:has-text('AI在徐医')");
  await expect(brand).toBeVisible();

  // 验证标题为单行渲染（高度不超过 1.5 行 ≈ 40px）
  const box = await brand.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    expect(box.height).toBeLessThan(40);
  }
});

test("修复验证 — 移动端视口标题不换行", async ({ page }) => {
  const targetPath = "/articles/dc081db8-6b13-48b5-ba83-bd81eefcade0";

  // 模拟 iPhone SE 小屏 (375px)
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(`${process.env.E2E_BASE_URL}${targetPath}`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);

  // 标题在移动端可见且单行
  const brand = page.locator("header span:has-text('AI在徐医')");
  await expect(brand).toBeVisible();

  const box = await brand.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    expect(box.height).toBeLessThan(40);
  }
});

test("修复验证 — 无副作用（关键端点可达）", async ({ page }) => {
  await page.goto(`${process.env.E2E_BASE_URL}/`);
  await page.waitForLoadState("domcontentloaded");

  const apis = ["/api/health", "/api/auth/me", "/api/articles?page=1&pageSize=3"];
  for (const api of apis) {
    const resp = await page.request.get(`${process.env.E2E_BASE_URL}${api}`);
    expect(resp.status()).toBe(200);
  }
});
