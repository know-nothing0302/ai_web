/**
 * CAS 调试测试 — 简化版，加 trace 和详细日志
 */
import { test, expect } from "@playwright/test";

const CAS = {
  username: process.env.E2E_CAS_USERNAME || "",
  password: process.env.E2E_CAS_PASSWORD || "",
};

const APP = "https://idapps.xzhmu.edu.cn/ai-web";

test("CAS 完整流程调试", async ({ browser }) => {
  test.setTimeout(90000);

  // 全新 context，无任何 cookie
  const context = await browser.newContext();

  // 开启 trace
  await context.tracing.start({ screenshots: true, snapshots: true });

  const page = await context.newPage();

  // 记录所有网络请求
  const requests: string[] = [];
  page.on('request', req => {
    if (req.url().includes('cas') || req.url().includes('auth') || req.url().includes('login')) {
      requests.push(`REQ: ${req.method()} ${req.url().substring(0, 120)}`);
    }
  });
  page.on('response', res => {
    if (res.url().includes('cas') || res.url().includes('auth') || res.url().includes('login')) {
      requests.push(`RES: ${res.status()} ${res.url().substring(0, 100)} Location:${res.headers()['location'] || '-'} Set-Cookie:${res.headers()['set-cookie']?.substring(0, 60) || '-'}`);
    }
  });

  console.log("STEP 1: 访问 /subscription");
  await page.goto(`${APP}/subscription`, { timeout: 15000, waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  const currentUrl = page.url();
  console.log(`AFTER GOTO: ${currentUrl}`);

  if (currentUrl.includes("authserver")) {
    console.log("STEP 2: 在 CAS 登录页");

    // 尝试找密码登录链接
    const pwdLinks = [
      'a:has-text("账号密码")',
      'a:has-text("帐户登录")',
      'a:has-text("账号登录")',
      'text=账号',
      '#pwdLogin',
      '.pwd-login',
    ];

    for (const selector of pwdLinks) {
      try {
        const el = page.locator(selector).first();
        if (await el.isVisible({ timeout: 2000 })) {
          console.log(`找到密码登录入口: ${selector}`);
          await el.click();
          await page.waitForTimeout(1000);
          break;
        }
      } catch {}
    }

    // 检查是否有用户名输入框
    const hasUsername = await page.locator("#username").isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`#username 可见: ${hasUsername}`);

    if (hasUsername) {
      console.log("STEP 3: 填写凭据");
      await page.locator("#username").fill(CAS.username);
      await page.locator("#password").fill(CAS.password);
      console.log("STEP 4: 提交");
      await page.locator("#password").press("Enter");

      // 等待应用 URL 或继续 CAS
      try {
        await page.waitForURL(/idapps\.xzhmu\.edu\.cn/, { timeout: 20000 });
        console.log(`STEP 5: 回到应用: ${page.url()}`);
      } catch {
        console.log(`STEP 5: 仍在 CAS: ${page.url()}`);
      }

      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(5000);
      console.log(`FINAL URL: ${page.url()}`);
    }
  }

  // 输出网络请求摘要
  console.log("\n=== NETWORK TRACE ===");
  for (const r of requests) console.log(r);

  // 保存 trace
  await context.tracing.stop({ path: "e2e/traces/cas-debug-trace.zip" });

  await context.close();
});
