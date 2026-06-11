/**
 * 反馈修复验收测试 — fb-group-20260607-1500
 *
 * 修复：Page Agent 打开时不再自动加载上次会话，展示历史列表由用户主动选择
 */

import { test, expect } from "@playwright/test";
import { assertPageLoads } from "./auth.helpers";

test("修复验证 — 文章页正常加载，PageAgent 入口可见", async ({ page }) => {
  await assertPageLoads(page, "/articles/c33454b0-d4e2-4dd8-b2cd-cd458235085f");

  // PageAgent 悬浮按钮可见
  const launcher = page.locator("button", { hasText: /AI 智能分析与搜索/ });
  await expect(launcher).toBeVisible({ timeout: 10000 });
});

test("修复验证 — PageAgent 打开时不自动加载历史消息，展示历史列表或空状态", async ({ page }) => {
  await assertPageLoads(page, "/articles/c33454b0-d4e2-4dd8-b2cd-cd458235085f");

  // 点击 PageAgent 启动按钮
  const launcher = page.locator("button", { hasText: /AI 智能分析与搜索/ });
  await launcher.click();
  await page.waitForTimeout(2000);

  // 验证：不应有旧对话消息气泡
  // auto-load 已移除，面板应显示"历史对话"列表或空状态提示
  const historyLabel = page.locator("text=历史对话");
  const emptyHint = page.locator("text=可以直接问当前页面内容");
  const hasHistoryOrEmpty = (await historyLabel.isVisible().catch(() => false)) ||
    (await emptyHint.isVisible().catch(() => false));

  expect(hasHistoryOrEmpty).toBeTruthy();

  // 截图留证
  await page.screenshot({ path: "e2e/screenshots/fb-group-20260607-1500-panel.png" });
});

test("修复验证 — 关闭 Panel 后重新打开仍是列表视图（无残留旧消息）", async ({ page }) => {
  await assertPageLoads(page, "/articles/c33454b0-d4e2-4dd8-b2cd-cd458235085f");

  const launcher = page.locator("button", { hasText: /AI 智能分析与搜索/ });

  // 第一次打开
  await launcher.click();
  await page.waitForTimeout(2000);

  // 验证面板已打开（用 textarea 作为面板特有标识）
  const textarea = page.locator("textarea[placeholder*='问当前页面']");
  await expect(textarea).toBeVisible({ timeout: 5000 });

  // 关闭面板 — 使用 header 中带 X icon 的关闭按钮
  const closeBtn = page.locator("header button:has(svg.lucide-x)");
  await expect(closeBtn).toBeVisible({ timeout: 3000 });
  await closeBtn.click();
  await page.waitForTimeout(1000);

  // 验证面板已关闭（textarea 不可见）
  await expect(textarea).not.toBeVisible({ timeout: 5000 });

  // 重新打开
  await launcher.click();
  await page.waitForTimeout(2000);

  // 验证：重新打开后仍然显示历史列表或空状态（不是旧消息）
  const historyLabel = page.locator("text=历史对话");
  const emptyHint = page.locator("text=可以直接问当前页面内容");
  const hasHistoryOrEmpty = (await historyLabel.isVisible().catch(() => false)) ||
    (await emptyHint.isVisible().catch(() => false));

  expect(hasHistoryOrEmpty).toBeTruthy();
});

test("修复验证 — 无副作用（关键端点可达）", async ({ page }) => {
  await assertPageLoads(page, "/");

  const apis = ["/api/health", "/api/auth/me", "/api/articles?page=1&pageSize=3"];
  for (const api of apis) {
    const resp = await page.request.get(`${process.env.E2E_BASE_URL}${api}`);
    expect(resp.status()).toBe(200);
  }
});
