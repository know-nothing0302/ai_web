/**
 * 反馈修复验收测试 — fb-group-20260619-1015
 * 修复: 反馈审批页展开详情中显示反馈者学工号和姓名
 */
import { test, expect } from "@playwright/test";
import { assertPageLoads } from "./auth.helpers";

const TARGET_PATH = "/admin/feedback-review";
const TASK_ID = "fb-group-20260619-1015";

test("修复验证 — 反馈审批页正常加载", async ({ page }) => {
  await assertPageLoads(page, TARGET_PATH);

  // 页面标题可见
  await expect(page.locator("h1")).toContainText("反馈审批");
});

test("修复验证 — 管道看板渲染正常", async ({ page }) => {
  await assertPageLoads(page, TARGET_PATH);

  // 5 阶段管道看板应渲染
  const kanban = page.locator(".grid.grid-cols-5");
  await expect(kanban).toBeVisible();

  // 各阶段 tab 按钮可见（用 getByRole 避免 strict mode）
  await expect(page.getByRole("button", { name: /待处理/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /修复中/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /已完成/ })).toBeVisible();
});

test("修复验证 — 反馈详情 API 返回 userDisplayName 字段", async ({ page }) => {
  // 验证 /api/feedback/admin 返回数据包含 userDisplayName 字段（学工号对应姓名）
  const resp = await page.request.get(
    `${process.env.E2E_BASE_URL}/api/feedback/admin?page=1&pageSize=1&includeEval=true`
  );
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body).toHaveProperty("items");
  expect(Array.isArray(body.items)).toBe(true);
  // 有数据时验证 userDisplayName 字段存在
  if (body.items.length > 0) {
    const item = body.items[0];
    expect(item).toHaveProperty("userDisplayName");
    expect(item).toHaveProperty("userId");
  }
});

test("修复验证 — 无副作用（关键端点可达）", async ({ page }) => {
  await assertPageLoads(page, "/");

  const apis = ["/api/health", "/api/auth/me", "/api/articles?page=1&pageSize=3"];
  for (const api of apis) {
    const resp = await page.request.get(`${process.env.E2E_BASE_URL}${api}`);
    expect(resp.status()).toBe(200);
  }
});
