/**
 * 反馈修复参数化验收测试
 *
 * 依赖 setup project 的 CAS 认证状态（login once, all tests authenticated）。
 * 读取 test-config.json，逐页验证修复效果。
 *
 * 用法：npx playwright test e2e/fix-verify.spec.ts
 *   （setup 自动先执行 CAS 登录，无需手动认证）
 */

import { test, expect } from "@playwright/test";
import { assertPageLoads } from "./auth.helpers";
import * as fs from "fs";
import * as path from "path";

// ── 类型定义 ──

interface PageCheck {
  type: "visible" | "text" | "count" | "url";
  selector?: string;
  value?: string | number;
  desc: string;
}

interface PageConfig {
  path: string;
  title?: string;
  checks: PageCheck[];
}

interface TestConfig {
  task_id: string;
  pages: PageConfig[];
  api_endpoints?: string[];
}

// ── 加载配置 ──

const CONFIG_PATH = path.resolve(__dirname, "test-config.json");

function loadConfig(): TestConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      `测试配置文件不存在: ${CONFIG_PATH}\n请确保 fb-review.sh 已生成该文件。`
    );
  }
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  const cfg = JSON.parse(raw) as TestConfig;
  if (!cfg.pages || cfg.pages.length === 0) {
    throw new Error("test-config.json: pages 数组为空");
  }
  return cfg;
}

// ── 导航辅助（已认证，直接 goto）──────────────────────────

const BASE = "https://idapps.xzhmu.edu.cn/ai-web";

async function gotoPage(page: import("@playwright/test").Page, pagePath: string) {
  await page.goto(`${BASE}${pagePath}`, { timeout: 15000 });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);
}

// ── Check 执行 ────────────────────────────────────────────

async function runCheck(page: import("@playwright/test").Page, check: PageCheck) {
  switch (check.type) {
    case "visible":
      await expect(page.locator(check.selector!), `[${check.desc}]`).toBeVisible({ timeout: 5000 });
      break;
    case "text":
      await expect(page.locator(`text=${check.value}`).first(), `[${check.desc}]`).toBeVisible({ timeout: 5000 });
      break;
    case "count":
      await expect(page.locator(check.selector!), `[${check.desc}]`).toHaveCount(check.value as number);
      break;
    case "url":
      await expect(page, `[${check.desc}]`).toHaveURL(new RegExp(String(check.value)), { timeout: 5000 });
      break;
  }
}

// ── Test Suite ────────────────────────────────────────────

const cfg = loadConfig();

test.describe(`反馈修复验收 — ${cfg.task_id}`, () => {

  // 1. 逐页验证（已认证，所有页面直接加载）
  // 去重：相同 path 只测一次（避免 Playwright duplicate test title 错误）
  const seen = new Set<string>();
  const uniquePages: (PageConfig & { _idx: number })[] = [];
  for (let i = 0; i < cfg.pages.length; i++) {
    const key = cfg.pages[i].path;
    if (!seen.has(key)) {
      seen.add(key);
      uniquePages.push({ ...cfg.pages[i], _idx: i + 1 });
    }
  }

  for (const pageCfg of uniquePages) {
    const label = pageCfg.title || pageCfg.path;

    test(`[${pageCfg._idx}] 页面加载 — ${label} (${pageCfg.path})`, async ({ page }) => {
      test.setTimeout(60000);
      await gotoPage(page, pageCfg.path);
      await assertPageLoads(page, pageCfg.path);
    });

    if (pageCfg.checks && pageCfg.checks.length > 0) {
      test(`[${pageCfg._idx}] 功能验证 — ${label}`, async ({ page }) => {
        test.setTimeout(60000);
        await gotoPage(page, pageCfg.path);
        for (const check of pageCfg.checks) {
          await runCheck(page, check);
        }
      });
    }
  }

  // 2. 无副作用 — API 检查
  if (cfg.api_endpoints && cfg.api_endpoints.length > 0) {
    test("无副作用 — 关键 API 端点可达", async ({ page }) => {
      await gotoPage(page, "/");
      for (const ep of cfg.api_endpoints) {
        const url = ep.startsWith("http") ? ep : `${BASE}${ep}`;
        const resp = await page.request.get(url);
        expect(resp.status(), `API ${ep} → ${resp.status()}`).toBe(200);
      }
    });
  }
});
