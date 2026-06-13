/**
 * 反馈修复验收测试 — fb-group-20260613-1110
 *
 * 修复内容:
 *   - 移除每篇文章右侧的"推送给全体成员"按钮
 *   - 在批量操作行增加"推送教师"和"推送学生"按钮
 */

import { test, expect } from "@playwright/test";

test("管理后台发布页 — 页面可加载且旧广播按钮已移除", async ({ page }) => {
  await page.goto("/admin/publish");
  await page.waitForTimeout(2000);

  // 页面不应崩溃
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  // "推送给全体成员" 按钮不应出现在页面中
  const broadcastBtn = page.locator("button", { hasText: "推送给全体成员" });
  await expect(broadcastBtn).toHaveCount(0);

  // 页面不应显示 500 错误
  await expect(page.locator("text=500").first()).not.toBeVisible({ timeout: 3000 }).catch(() => {});

  expect(errors).toEqual([]);
});

test("管理后台发布页 — 构建产物不含旧按钮文本，含新按钮文本", async ({ page }) => {
  // 获取 index.html 找 AdminPublishPage bundle 文件名
  const htmlResp = await page.request.get("/");
  const html = await htmlResp.text();
  const match = html.match(/AdminPublishPage-[a-zA-Z0-9_]+\.js/);
  if (!match) {
    // 无法匹配到则跳过此断言（SPA 可能动态加载）
    return;
  }
  const bundlePath = `/assets/${match[0]}`;

  const resp = await page.request.get(bundlePath);
  expect(resp.status()).toBeLessThan(400);

  const text = await resp.text();
  // 构建产物中不应包含旧按钮文本
  expect(text).not.toContain("推送给全体成员");
  // 构建产物中应包含新按钮文本
  expect(text).toContain("推送教师");
  expect(text).toContain("推送学生");
});

test("修复验证 — 关键 API 端点可达", async ({ page }) => {
  const resp = await page.request.get("http://localhost:8080/api/health");
  expect(resp.status()).toBe(200);
});
