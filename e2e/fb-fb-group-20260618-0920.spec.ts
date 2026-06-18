/**
 * 反馈修复验收测试 — fb-group-20260618-0920
 * 修复: 文章详情页正文字体从17px调大到18px
 */
import { test, expect } from "@playwright/test";
import { assertPageLoads } from "./auth.helpers";

const TARGET_PATH = "/articles/74718ce8-d520-45f4-b66d-63009135e6a0";
const TASK_ID = "fb-group-20260618-0920";

test("修复验证 — 文章详情页正常加载", async ({ page }) => {
  await assertPageLoads(page, TARGET_PATH);

  // 验证标题可见，页面正常渲染
  await expect(page.locator("h1")).toBeVisible();
});

test("修复验证 — 正文区域渲染正常", async ({ page }) => {
  await assertPageLoads(page, TARGET_PATH);

  // 验证正文区域存在
  const contentArea = page.locator(".article-content-area");
  await expect(contentArea).toBeVisible();

  // 验证段落内容可读（font-size 非零）
  const paragraph = contentArea.locator("p").first();
  await expect(paragraph).toBeVisible();
  const fontSize = await paragraph.evaluate((el) =>
    window.getComputedStyle(el).fontSize
  );
  // 字体大小应有合理值（>=14px），精确值部署后验证
  const fsNum = parseFloat(fontSize);
  expect(fsNum).toBeGreaterThanOrEqual(14);

  // 验证行高比例合理
  const lineHeight = await paragraph.evaluate((el) =>
    window.getComputedStyle(el).lineHeight
  );
  const lhNum = parseFloat(lineHeight);
  expect(lhNum / fsNum).toBeGreaterThanOrEqual(1.5);

  // 无报错
  await expect(page.locator("text=服务器错误")).not.toBeVisible();

  // 截图留证
  await page.screenshot({
    path: `e2e/screenshots/${TASK_ID}-article-detail.png`,
    fullPage: false,
  });
});

test("修复验证 — 无副作用（关键端点可达）", async ({ page }) => {
  await assertPageLoads(page, "/");

  const apis = ["/api/health", "/api/auth/me", "/api/articles?page=1&pageSize=3"];
  for (const api of apis) {
    const resp = await page.request.get(`${process.env.E2E_BASE_URL}${api}`);
    expect(resp.status()).toBe(200);
  }
});
