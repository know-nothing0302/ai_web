/**
 * CAS 页面诊断 — 截图 + DOM 分析
 */
import { test } from "@playwright/test";
import * as fs from "fs";

const APP = "https://idapps.xzhmu.edu.cn/ai-web";

test("CAS 页面结构诊断", async ({ page }) => {
  test.setTimeout(30000);

  // 直接访问 CAS login endpoint
  await page.goto(`${APP}/api/auth/cas/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  // 截图
  await page.screenshot({ path: "e2e/screenshots/cas-page.png", fullPage: true });

  // 输出页面基本信息
  const title = await page.title();
  const url = page.url();
  console.log(`TITLE: ${title}`);
  console.log(`URL: ${url}`);

  // 检查所有可能的登录表单元素
  const selectors = [
    "#username", "#password",
    "#pwdLogin", "#accountLogin",
    ".pwd-login-btn", ".account-login",
    "a:has-text('账号密码')", "a:has-text('账号登录')", "a:has-text('帐户登录')",
    "[data-type='pwd']", ".login-type-switch",
    "#qrLogin", "#wechatLogin",
  ];

  console.log("\n=== 元素检查 ===");
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      const count = await el.count();
      const visible = count > 0 ? await el.isVisible().catch(() => false) : false;
      const text = count > 0 ? await el.textContent().catch(() => "(no text)") : "";
      console.log(`${sel}: count=${count} visible=${visible} text="${text.substring(0, 40)}"`);
    } catch {
      console.log(`${sel}: ERROR`);
    }
  }

  // 输出 body 内部 HTML 结构（前 3000 字符）
  const html = await page.content();
  console.log("\n=== BODY HTML (first 3000 chars) ===");
  console.log(html.substring(html.indexOf("<body"), html.indexOf("<body") + 3000));

  await page.close();
});
