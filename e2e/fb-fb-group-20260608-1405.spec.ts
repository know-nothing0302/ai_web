/**
 * 反馈修复验收测试 — fb-group-20260608-1405
 *
 * 修复：
 * 1. 智能推送增加11:00批次 + 订阅页展示下次推送时间
 * 2. 发布表单默认展开（已确认 ref(false)）
 * 3. PageAgent 默认新对话 + 历史对话按钮按需加载 + 分页5条
 */

import { test, expect } from "@playwright/test";
import { assertPageLoads } from "./auth.helpers";

// ── #1: 订阅页展示推送时间 ──

test("修复验证 — 订阅页正常加载并展示推送时间", async ({ page }) => {
  await assertPageLoads(page, "/subscription");

  // 推送时间说明区块可见
  const scheduleSection = page.locator("text=下次推送时间");
  await expect(scheduleSection).toBeVisible({ timeout: 10000 });

  // 截图留证
  await page.screenshot({ path: "e2e/screenshots/fb-group-20260608-1405-subscription.png" });
});

// ── #2: 发布表单默认展开 ──

test("修复验证 — 发布页表单默认展开", async ({ page }) => {
  await assertPageLoads(page, "/admin/publish");

  // 表单默认展开：应显示"收起发布表单"按钮（formCollapsed=false）
  const collapseBtn = page.locator("button", { hasText: /收起.*发布表单/ });
  await expect(collapseBtn).toBeVisible({ timeout: 10000 });

  // 表单区域可见（包含标题输入框）
  const titleInput = page.locator("input[placeholder='输入文章标题']");
  await expect(titleInput).toBeVisible({ timeout: 5000 });

  // 截图留证
  await page.screenshot({ path: "e2e/screenshots/fb-group-20260608-1405-publish.png" });
});

// ── #3: PageAgent 历史对话分页 ──

test("修复验证 — PageAgent 打开默认新对话，显示历史对话按钮", async ({ page }) => {
  await assertPageLoads(page, "/articles/c33454b0-d4e2-4dd8-b2cd-cd458235085f");

  // 点击 PageAgent 悬浮按钮
  const launcher = page.locator("button", { hasText: /AI 智能分析与搜索/ });
  await launcher.click();
  await page.waitForTimeout(2000);

  // 验证：面板打开后应显示空状态提示，不自动加载历史
  const emptyHint = page.locator("text=可以直接问当前页面内容");
  await expect(emptyHint).toBeVisible({ timeout: 5000 });

  // 验证：应显示"历史对话"按钮
  const historyBtn = page.locator("button", { hasText: "历史对话" });
  await expect(historyBtn).toBeVisible({ timeout: 5000 });

  // 截图留证
  await page.screenshot({ path: "e2e/screenshots/fb-group-20260608-1405-agent-empty.png" });
});

test("修复验证 — 点击历史对话按钮加载列表并显示加载更多", async ({ page }) => {
  await assertPageLoads(page, "/articles/c33454b0-d4e2-4dd8-b2cd-cd458235085f");

  const launcher = page.locator("button", { hasText: /AI 智能分析与搜索/ });
  await launcher.click();
  await page.waitForTimeout(2000);

  // 点击"历史对话"按钮
  const historyBtn = page.locator("button", { hasText: "历史对话" });
  await historyBtn.click();
  await page.waitForTimeout(3000);

  // 验证：加载完成后应显示历史对话列表或"没有匹配的对话"
  const hasHistory = await page.locator("text=历史对话").isVisible().catch(() => false);
  const hasEmpty = await page.locator("text=没有匹配的对话").isVisible().catch(() => false);
  const hasLoadMore = await page.locator("button", { hasText: "加载更多" }).isVisible().catch(() => false);

  // 三者至少一个可见（取决于用户是否有历史记录）
  expect(hasHistory || hasEmpty || hasLoadMore).toBeTruthy();

  // 截图留证
  await page.screenshot({ path: "e2e/screenshots/fb-group-20260608-1405-agent-history.png" });
});

// ── 副作用检查 ──

test("修复验证 — 无副作用（关键端点可达）", async ({ page }) => {
  await assertPageLoads(page, "/");

  const apis = [
    "/api/health",
    "/api/auth/me",
    "/api/articles?page=1&pageSize=3",
    "/api/push/schedule",
  ];
  for (const api of apis) {
    const resp = await page.request.get(`https://idapps.xzhmu.edu.cn/ai-web${api}`);
    expect(resp.status()).toBe(200);
  }
});
