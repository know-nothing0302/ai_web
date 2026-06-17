/**
 * 反馈修复验收测试 — fb-refix-20260617-1700
 *
 * 验证:
 * 1. 文章详情页正常加载（文章 5ec246ad...）
 * 2. 截断 URL https://www.edu 不渲染为可点击链接
 * 3. 关键 API 端点可达
 * 4. API 拒绝过短的 originalUrl
 *
 * 用法: E2E_BASE_URL=https://idapps.xzhmu.edu.cn/ai-web \
 *        npx playwright test e2e/fb-refix-20260617-1700.spec.ts
 */

import { test, expect } from "@playwright/test";
import { assertPageLoads } from "./auth.helpers";

const BASE = process.env.E2E_BASE_URL ?? "";
const ARTICLE_WITH_TRUNCATED_URL = "/articles/5ec246ad-ade1-4164-8672-e328386b8d0e";

test("修复验证 — 截断 URL 不渲染为可点击链接", async ({ page }) => {
  await assertPageLoads(page, ARTICLE_WITH_TRUNCATED_URL);

  const h1 = page.locator("h1");
  await expect(h1).toBeVisible({ timeout: 10000 });

  // 验证显示"原文链接格式异常"提示（而非可点击链接）
  const brokenHint = page.locator("text=原文链接格式异常");
  await expect(brokenHint).toBeVisible({ timeout: 5000 });

  // 验证不存在指向截断 URL 的 <a> 链接
  await expect(page.locator(`a[href="https://www.edu"]`)).toHaveCount(0);
});

test("修复验证 — 关键 API 端点可达", async ({ page }) => {
  await assertPageLoads(page, "/");

  const apis = ["/api/health", "/api/auth/me", "/api/articles?page=1&pageSize=3"];
  for (const api of apis) {
    const resp = await page.request.get(`${BASE}${api}`);
    expect(resp.status()).toBe(200);
  }
});

test("修复验证 — API 拒绝过短 originalUrl", async ({ page }) => {
  await assertPageLoads(page, "/");

  // 尝试通过 API 创建文章时传入截断 URL — 应被 400 拒绝
  const resp = await page.request.post(`${BASE}/api/articles`, {
    data: {
      title: "E2E 测试文章",
      content: "测试内容",
      originalUrl: "https://www.edu",
      status: "draft",
    },
  });
  expect(resp.status()).toBe(400);
  const body = await resp.json();
  expect(body.message).toContain("参数错误");
});
