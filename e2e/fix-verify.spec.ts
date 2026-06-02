/**
 * 反馈修复参数化验收测试
 *
 * 读取 test-config.json，逐页验证修复效果。
 * CC 无需复制模板、无需写代码，只需跑一条命令：
 *   npx playwright test e2e/fix-verify.spec.ts
 *
 * config 格式见 e2e/test-config.schema.json
 */

import { test, expect } from "@playwright/test";
import { casLogin, assertPageLoads } from "./auth.setup";
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
  protected: boolean;
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
      `测试配置文件不存在: ${CONFIG_PATH}\n` +
      `请确保 fb-review.sh 已生成该文件。`
    );
  }
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  const cfg = JSON.parse(raw) as TestConfig;

  if (!cfg.pages || cfg.pages.length === 0) {
    throw new Error("test-config.json: pages 数组为空");
  }

  return cfg;
}

// ── 执行单个检查 ──

async function runCheck(page: import("@playwright/test").Page, check: PageCheck): Promise<void> {
  switch (check.type) {
    case "visible":
      await expect(
        page.locator(check.selector!),
        `[${check.desc}] 元素应可见: ${check.selector}`
      ).toBeVisible({ timeout: 5000 });
      break;

    case "text":
      await expect(
        page.locator(`text=${check.value}`).first(),
        `[${check.desc}] 应包含文字: ${check.value}`
      ).toBeVisible({ timeout: 5000 });
      break;

    case "count":
      await expect(
        page.locator(check.selector!),
        `[${check.desc}] 元素数量应为 ${check.value}: ${check.selector}`
      ).toHaveCount(check.value as number);
      break;

    case "url":
      await expect(page, `[${check.desc}] URL 应包含: ${check.value}`).toHaveURL(
        new RegExp(String(check.value)),
        { timeout: 5000 }
      );
      break;
  }
}

// ── 测试套件 ──

const cfg = loadConfig();

test.describe(`反馈修复验收 — ${cfg.task_id}`, () => {
  // 1. CAS 认证
  test("认证 — CAS 登录成功", async ({ page }) => {
    test.setTimeout(60000);
    await casLogin(page, "/");

    // 验证已登录：页面不在 CAS 登录页
    const url = page.url();
    expect(url).toContain("idapps.xzhmu.edu.cn");
    expect(url).not.toContain("authserver");
  });

  // 2. 逐页验证
  for (const pageCfg of cfg.pages) {
    const label = pageCfg.title || pageCfg.path;
    const safeName = pageCfg.path.replace(/[^a-zA-Z0-9]/g, "-").substring(0, 40);

    test(`页面加载 — ${label} (${pageCfg.path})`, async ({ page }) => {
      test.setTimeout(60000);

      if (pageCfg.protected) {
        await casLogin(page, pageCfg.path);
      } else {
        await page.goto(`https://idapps.xzhmu.edu.cn/ai-web${pageCfg.path}`, {
          timeout: 15000,
        });
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(2000);
      }

      await assertPageLoads(page, pageCfg.path);
    });

    // 3. 自定义断言（如存在）
    if (pageCfg.checks.length > 0) {
      test(`功能验证 — ${label}`, async ({ page }) => {
        test.setTimeout(60000);

        if (pageCfg.protected) {
          await casLogin(page, pageCfg.path);
        } else {
          await page.goto(
            `https://idapps.xzhmu.edu.cn/ai-web${pageCfg.path}`,
            { timeout: 15000 }
          );
          await page.waitForLoadState("domcontentloaded");
          await page.waitForTimeout(2000);
        }

        for (const check of pageCfg.checks) {
          await runCheck(page, check);
        }
      });
    }
  }

  // 4. API 端点检查
  if (cfg.api_endpoints && cfg.api_endpoints.length > 0) {
    test("无副作用 — 关键 API 端点可达", async ({ page }) => {
      await casLogin(page, "/");

      for (const ep of cfg.api_endpoints) {
        const url = ep.startsWith("http")
          ? ep
          : `https://idapps.xzhmu.edu.cn/ai-web${ep}`;
        const resp = await page.request.get(url);
        expect(resp.status(), `API ${ep} 返回 ${resp.status()}`).toBe(200);
      }
    });
  }
});
