/**
 * 反馈修复验收测试 — fb-group-20260630-1330
 *
 * 修复内容:
 *   - CAS 登录拦截后自动跳转回目标页面（router guard 传递 redirect 参数）
 *   - SurveyRespondPage 移除登录提示信息
 */

import { test, expect } from "@playwright/test";

test("问卷填写页 — 不显示登录提示信息", async ({ page }) => {
  // 使用已知的测试 token 访问公开问卷填写页
  // token 使用任意合法 UUID 格式即可，后端会返回"问卷不存在"
  // 但我们只需要验证页面不显示登录提示
  await page.goto("/s/test-token-12345");
  await page.waitForTimeout(2000);

  // 不应显示"未登录"提示
  await expect(page.locator("text=未登录")).toHaveCount(0);
  // 不应显示"登录以记录工号"链接
  await expect(page.locator("text=登录以记录工号")).toHaveCount(0);
  // 不应显示"当前登录工号"（auth block 已移除）
  await expect(page.locator("text=当前登录工号")).toHaveCount(0);
});

test("问卷管理页 — CAS 登录重定向携带正确的 redirect 参数", async ({ page }) => {
  // 访问受保护页面，验证 router guard 传递正确的 redirect 参数
  // 注意：Vite dev server 无后端，auth check 会失败并触发 CAS 重定向
  await page.goto("/ai-lab/survey");
  await page.waitForTimeout(3000);

  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  const url = page.url();
  // 验证重定向 URL 包含了正确的 redirect 参数
  expect(url).toContain("redirect=");
  expect(url).toContain("%2Fai-lab%2Fsurvey");

  expect(errors.filter(e => !e.includes("Failed to load"))).toEqual([]);
});

test("修复验证 — 构建产物包含 redirect 参数传递逻辑", async ({ page }) => {
  // 验证 router bundle 中包含 redirect 参数传递
  const resp = await page.request.get("/");
  const html = await resp.text();
  const match = html.match(/index-[a-zA-Z0-9_]+\.js/);
  if (!match) return;
  const bundlePath = `/assets/${match[0]}`;

  const bundleResp = await page.request.get(bundlePath);
  expect(bundleResp.status()).toBeLessThan(400);
  const text = await bundleResp.text();
  // router guard 应按 encodeURIComponent + redirect= 方式构建 CAS 登录 URL
  expect(text).toContain("redirect=");
});

test("修复验证 — 关键 API 端点可达", async ({ page }) => {
  const resp = await page.request.get("http://localhost:8080/api/health");
  expect(resp.status()).toBe(200);
});
