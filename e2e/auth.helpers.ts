/**
 * Auth helpers — 可被任何 spec 文件安全 import
 * 不含 test() 定义，不在 Playwright 的 project dependency 隔离范围内
 */

import { Page, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "";

/**
 * 导航到目标页面并验证加载正常
 * 依赖 setup project 提供的 auth state，无需再登录
 */
export async function assertPageLoads(page: Page, path: string): Promise<void> {
  await page.goto(`${BASE}${path}`, { timeout: 15000 });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);

  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.waitForTimeout(2000);

  const title = await page.title();
  expect(title.length).toBeGreaterThan(0);

  await expect(page.locator("text=服务器错误")).not.toBeVisible();
  await expect(page.locator("text=页面不存在")).not.toBeVisible();

  expect(page.url()).not.toContain("authserver");

  const realErrors = errors.filter(
    (e) => !e.includes("Extension") && !e.includes("chrome-extension")
  );
  expect(realErrors).toEqual([]);
}
