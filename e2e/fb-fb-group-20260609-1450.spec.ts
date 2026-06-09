/**
 * 反馈修复验收测试 — fb-group-20260609-1450
 *
 * 修复：CAS 认证后保留原始请求路径
 * 问题：直接访问 /subscription 未登录时，经 CAS 认证后跳回首页而非订阅页
 * 修复：将 redirect 路径存入 session，避免 CAS Server 清除 service URL 上的额外查询参数
 */

import { test, expect } from "@playwright/test";
import { assertPageLoads } from "./auth.helpers";

// ── #1: 直接访问 /subscription 经认证后到达订阅页 ──

test("修复验证 — 直接访问订阅页经 CAS 认证后正确到达", async ({ page }) => {
  // 使用 casLogin 模式：先访问 /subscription 触发 CAS 登录流程
  // 认证完成后应停留在 /subscription 页面而非被重定向到首页
  await assertPageLoads(page, "/subscription");

  // 验证 URL 确实是 /subscription（不是首页 /）
  expect(page.url()).toContain("/subscription");

  // 页面标题可见
  const title = page.locator("h1:has-text('智能订阅中心')");
  await expect(title).toBeVisible({ timeout: 10000 });

  // 截图留证
  await page.screenshot({ path: "e2e/screenshots/fb-group-20260609-1450-subscription.png" });
});

// ── #2: 核心功能 — 订阅页关键元素可见 ──

test("修复验证 — 订阅页核心功能可用", async ({ page }) => {
  await assertPageLoads(page, "/subscription");

  // 保存按钮可见
  const saveBtn = page.locator("button:has-text('保存配置')");
  await expect(saveBtn).toBeVisible({ timeout: 10000 });

  // 推送频率选项可见
  await expect(page.locator("text=发文即推")).toBeVisible({ timeout: 5000 });
  await expect(page.locator("text=AI 汇总")).toBeVisible({ timeout: 5000 });
  await expect(page.locator("text=精华提炼")).toBeVisible({ timeout: 5000 });

  // 确认仍在订阅页
  expect(page.url()).toContain("/subscription");
});

// ── #3: 无副作用 ──

test("修复验证 — 无副作用（关键端点可达）", async ({ page }) => {
  await assertPageLoads(page, "/");

  const apis = [
    "/api/health",
    "/api/auth/me",
    "/api/articles?page=1&pageSize=3",
  ];
  for (const api of apis) {
    const resp = await page.request.get(`https://idapps.xzhmu.edu.cn/ai-web${api}`);
    expect(resp.status()).toBe(200);
  }
});
