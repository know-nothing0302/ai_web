/**
 * 反馈修复验收测试 — fb-refix-20260618-1055
 *
 * 验证：文章详情页正文字体为 18px（text-lg）。
 * 公开页面无需 CAS 认证。
 *
 * 用法：npx playwright test e2e/fb-refix-20260618-1055.spec.ts
 */

import { test, expect } from "@playwright/test";

const ARTICLE_PATH = "/articles/74718ce8-d520-45f4-b66d-63009135e6a0";
const BASE = process.env.E2E_BASE_URL ?? "";

test("页面加载 — 文章详情页正常渲染", async ({ page }) => {
  await page.goto(`${BASE}${ARTICLE_PATH}`, { timeout: 15000 });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);

  // URL 正确跳转到目标文章
  await expect(page).toHaveURL(new RegExp(ARTICLE_PATH), { timeout: 5000 });

  // 文章正文区域可见
  await expect(page.locator(".article-content-area")).toBeVisible({ timeout: 5000 });
});

test("核心修复 — 段落 font-size 为 18px", async ({ page }) => {
  await page.goto(`${BASE}${ARTICLE_PATH}`, { timeout: 15000 });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);

  // 正文段落 computed font-size 应为 18px（text-lg）
  const p = page.locator(".article-content-area p").first();
  const fontSize = await p.evaluate(el => getComputedStyle(el).fontSize);
  expect(fontSize, `段落 font-size 期望 18px，实际 ${fontSize}`).toBe("18px");
});

test("副作用检查 — 列表项 font-size（如存在）也为 18px", async ({ page }) => {
  await page.goto(`${BASE}${ARTICLE_PATH}`, { timeout: 15000 });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);

  // 该文章可能不包含列表，仅在存在 <li> 时验证
  const liCount = await page.locator(".article-content-area li").count();
  if (liCount > 0) {
    const li = page.locator(".article-content-area li").first();
    const fontSize = await li.evaluate(el => getComputedStyle(el).fontSize);
    expect(fontSize, `列表项 font-size 期望 18px，实际 ${fontSize}`).toBe("18px");
  } else {
    // 无列表项则跳过，不作为失败
    test.skip();
  }
});

test("无副作用 — 关键 API 端点可达", async ({ page }) => {
  await page.goto(`${BASE}/`, { timeout: 15000 });
  const apis = ["/api/health", "/api/auth/me", "/api/articles?page=1&pageSize=3"];
  for (const api of apis) {
    const url = api.startsWith("http") ? api : `${BASE}${api}`;
    const resp = await page.request.get(url);
    expect(resp.status(), `API ${api} → ${resp.status()}`).toBe(200);
  }
});
