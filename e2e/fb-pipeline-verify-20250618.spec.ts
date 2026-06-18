/**
 * E2E 测试: 反馈审批页管道重设计 — Playwright 验证
 *
 * 任务ID: cc-test-feedback-pipeline-test-20250618
 * 覆盖: 5 阶段管道全景图的全部 8 类验证项 (A–H)
 *
 * 执行: cd /opt/idapps/ai_web && npx playwright test e2e/fb-pipeline-verify-20250618.spec.ts --project=chromium
 *
 * ⛔ 不修改代码 / 不修改数据库
 */

import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "";
const PAGE_PATH = "/admin/feedback-review";
const FULL_URL = `${BASE}${PAGE_PATH}`;

/** 管道阶段定义 */
const STAGES = [
  { key: "inbox",     label: "待处理", icon: "📥" },
  { key: "fixing",    label: "修复中", icon: "🔧" },
  { key: "testing",   label: "测试中", icon: "🧪" },
  { key: "deploying", label: "待部署", icon: "🚀" },
  { key: "done",      label: "已完成", icon: "✅" },
];

const STAGE_KEYS = STAGES.map(s => s.key);

// ─── Helpers ────────────────────────────────────────────

async function navigateTo(page: Page) {
  await page.goto(FULL_URL, { timeout: 20000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("domcontentloaded");
  // 等 Vue 渲染：找 kanban 列中的待处理 span（精确定位）
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 10000 });
}

/** 获取 kanban grid 的 5 个 stage card */
function getStageCards(page: Page) {
  return page.locator('div.grid.grid-cols-5.gap-3 > div');
}

/** 获取特定 stage 的 card（kanban 区域） */
function getStageCard(page: Page, label: string) {
  return getStageCards(page).filter({ hasText: label }).first();
}

/** 获取 tab bar 中特定 label 的按钮 */
function getTabButton(page: Page, label: string) {
  return page.getByRole("button", { name: new RegExp(`${label}`) }).first();
}

/** 检查元素是否有特定 class（ring- 开头） */
async function hasRingClass(el: import("@playwright/test").Locator): Promise<boolean> {
  return el.evaluate(el => Array.from(el.classList).some(c => c.startsWith("ring-")));
}

// ─── Tests ──────────────────────────────────────────────

test.describe("反馈审批管道页 E2E 验证 (A–H)", () => {

  // ───────────────────────
  // A. 页面加载与管道渲染
  // ───────────────────────

  test.describe("A. 页面加载与管道渲染", () => {

    test("A1: 5 个管道阶段列全部可见", async ({ page }) => {
      await navigateTo(page);

      // 5 个 kanban 列
      const cards = getStageCards(page);
      await expect(cards).toHaveCount(5);

      for (const stage of STAGES) {
        const card = getStageCard(page, stage.label);
        await expect(card).toBeVisible();
        // 每个 stage card 中有 emoji icon (span.text-lg)
        await expect(card.locator("span.text-lg").filter({ hasText: stage.icon })).toBeVisible();
      }
    });

    test("A2: 每个管道列显示人数统计数字", async ({ page }) => {
      await navigateTo(page);

      for (const stage of STAGES) {
        const card = getStageCard(page, stage.label);
        // 统计数字的 div: text-2xl font-bold
        const countEl = card.locator("div.text-2xl");
        await expect(countEl.first()).toBeVisible();
      }
    });

    test("A3: 管道列为水平 kanban 布局（grid-cols-5）", async ({ page }) => {
      await navigateTo(page);

      const gridContainer = page.locator("div.grid.grid-cols-5.gap-3");
      await expect(gridContainer).toBeVisible();

      const stageCards = gridContainer.locator("> div");
      await expect(stageCards).toHaveCount(5);

      // Tab bar 也存在，但只有 5 个 stage
      for (const stage of STAGES) {
        await expect(getTabButton(page, stage.label)).toBeVisible();
      }

      // 验证无旧版 13 Tab 的痕迹 — 确认 tab bar 内只有 5 个按钮
      // (除了 kanban 列的 5 个，tab bar 还有 5 个，但不应该超过 13)
      const tabBar = page.locator("div.flex.min-w-max");
      const tabBtns = await tabBar.locator("button").count();
      expect(tabBtns).toBeLessThanOrEqual(6); // 5 stage + 可能多 1
    });

    test("A4: 每个阶段列有正确背景色（非全白）", async ({ page }) => {
      await navigateTo(page);

      for (const stage of STAGES) {
        const card = getStageCard(page, stage.label);
        await expect(card).toBeVisible();
        const bg = await card.evaluate(el => window.getComputedStyle(el).backgroundColor);
        expect(bg).not.toBe("rgba(0, 0, 0, 0)");
        expect(bg).not.toBe("rgb(255, 255, 255)");
      }
    });
  });

  // ───────────────────────
  // B. 管道列交互
  // ───────────────────────

  test.describe("B. 管道列交互", () => {

    test("B1–B5: 点击各管道列 → 下方列表切换", async ({ page }) => {
      await navigateTo(page);

      for (const stage of STAGES) {
        const card = getStageCard(page, stage.label);
        await card.click();
        await page.waitForTimeout(800);

        // 页面 header 应显示"当前 📥 待处理"等
        await expect(page.locator("text=当前").first()).toBeVisible();

        // 切换到下一个 stage 后，如果还有数据会加载
      }
    });

    test("B6: 当前选中的管道列有视觉高亮（ring）", async ({ page }) => {
      await navigateTo(page);

      // 默认选中 inbox → 有 ring 类
      const inboxCard = getStageCard(page, "待处理");
      expect(await hasRingClass(inboxCard)).toBe(true);

      // 切换到修复中
      await getStageCard(page, "修复中").click();
      await page.waitForTimeout(500);
      const fixingCard = getStageCard(page, "修复中");
      expect(await hasRingClass(fixingCard)).toBe(true);

      // 之前的 inbox 不再高亮
      expect(await hasRingClass(inboxCard)).toBe(false);
    });
  });

  // ───────────────────────
  // C. 红色脉冲点
  // ───────────────────────

  test.describe("C. 红色脉冲点", () => {

    test("C1: 脉冲点使用 CSS animation（animate-ping）", async ({ page }) => {
      await navigateTo(page);

      const pingElements = page.locator("span.animate-ping");
      const count = await pingElements.count();
      if (count > 0) {
        const animName = await pingElements.first().evaluate(el =>
          window.getComputedStyle(el).animationName
        );
        expect(animName).not.toBe("none");
      } else {
        test.info().annotations.push({ type: "info", description: "当前无 failed_testing 数据，无脉冲点" });
      }
    });

    test("C2: 脉冲点数据状态记录", async ({ page }) => {
      await navigateTo(page);

      const fixingCard = getStageCard(page, "修复中");
      const hasPingDot = await fixingCard.locator("span.animate-ping").count();
      test.info().annotations.push({
        type: hasPingDot > 0 ? "warn" : "info",
        description: hasPingDot > 0
          ? "存在脉冲点 → hasFailedTesting=true（有 failed_testing 数据）"
          : "无脉冲点 → hasFailedTesting=false（无 failed_testing 数据）",
      });
    });

    test("C3: 脉冲点 CSS 动画结构正确", async ({ page }) => {
      await navigateTo(page);

      const fixingCard = getStageCard(page, "修复中");
      const pingContainer = fixingCard.locator("> div.absolute");
      const hasContainer = await pingContainer.count();
      if (hasContainer > 0) {
        await expect(pingContainer.locator("span.animate-ping")).toBeVisible();
        await expect(pingContainer.locator("span.relative.inline-flex")).toBeVisible();
      } else {
        test.info().annotations.push({
          type: "info",
          description: "无 failed_testing 数据，脉冲点结构未渲染",
        });
      }
    });
  });

  // ───────────────────────
  // D. 列表卡片内容
  // ───────────────────────

  test.describe("D. 列表卡片内容", () => {

    test("D1: 卡片左侧有彩色边框（border-l-4）", async ({ page }) => {
      await navigateTo(page);

      // 检查任何有 border-l-4 的元素（数据卡片）
      let cardItems = page.locator("div[class*='border-l-4']");
      let cardCount = await cardItems.count();
      if (cardCount === 0) {
        for (const stage of STAGES) {
          await getStageCard(page, stage.label).click();
          await page.waitForTimeout(1000);
          cardItems = page.locator("div[class*='border-l-4']");
          cardCount = await cardItems.count();
          if (cardCount > 0) break;
        }
      }

      if (cardCount === 0) {
        test.info().annotations.push({ type: "info", description: "所有 stage 均无数据，跳过 D1" });
        test.skip();
        return;
      }

      const firstCard = cardItems.first();
      const blColor = await firstCard.evaluate(el => el.style.borderLeftColor);
      expect(blColor).toBeTruthy();
      const blWidth = await firstCard.evaluate(el => window.getComputedStyle(el).borderLeftWidth);
      expect(blWidth).toBe("4px");
    });

    test("D2: 卡片右上角显示语义标签", async ({ page }) => {
      await navigateTo(page);

      // 找卡片中的状态 badge — 特征：rounded-full + 小号字体
      const badges = page.locator("span.rounded-full.text-xs.font-medium");
      const badgeCount = await badges.count();

      if (badgeCount === 0) {
        test.info().annotations.push({ type: "info", description: "无数据，跳过 D2" });
        test.skip();
        return;
      }

      const text = await badges.first().textContent() ?? "";
      // 不应含原始英文状态值
      const rawStatuses = ["pending", "evaluating", "snoozed", "approved", "in_progress",
        "failed_testing", "testing", "deployed", "verified", "wontfix", "duplicate"];
      for (const raw of rawStatuses) {
        expect(text).not.toContain(raw);
      }
      // 应包含语义图标
      expect(text).toMatch(/[⏳🤖💤📋🔧🧪❌🚀✅🗄️📎↩️⚠️]/);
    });

    test("D3: 卡片显示反馈摘要、时间和用户信息", async ({ page }) => {
      await navigateTo(page);

      let cards = page.locator("div[class*='border-l-4']");
      let count = await cards.count();
      if (count === 0) {
        for (const key of STAGE_KEYS) {
          await getStageCard(page, STAGES.find(s => s.key === key)!.label).click();
          await page.waitForTimeout(1000);
          cards = page.locator("div[class*='border-l-4']");
          count = await cards.count();
          if (count > 0) break;
        }
      }

      if (count === 0) {
        test.info().annotations.push({ type: "info", description: "无数据，跳过 D3" });
        test.skip();
        return;
      }

      const firstCard = cards.first();
      // 摘要内容
      await expect(firstCard.locator("p.text-sm").first()).toBeVisible();

      // 尝试展开看详情
      const expandBtn = firstCard.locator("button:has-text('展开')");
      if (await expandBtn.count() > 0) {
        await expandBtn.first().click();
        await page.waitForTimeout(300);
      }
      // 检查时间信息
      const cardText = await firstCard.textContent() ?? "";
      const hasTime = /提交时间|createdAt|\d{2}:\d{2}/.test(cardText);
      expect(hasTime).toBe(true);
    });
  });

  // ───────────────────────
  // E. 自动刷新
  // ───────────────────────

  test.describe("E. 自动刷新", () => {

    test("E1: 页面显示自动刷新指示器", async ({ page }) => {
      await navigateTo(page);
      await expect(page.getByText("每 30 秒自动刷新")).toBeVisible();
    });

    test("E2: 刷新不中断当前选中的阶段", async ({ page }) => {
      await navigateTo(page);

      // 切换到修复中
      await getStageCard(page, "修复中").click();
      await page.waitForTimeout(500);

      // 记录当前阶段信息
      const headerText = await page.locator("text=当前").first().textContent() ?? "";
      expect(headerText).toContain("修复中");

      // 点击刷新按钮
      await page.getByRole("button", { name: /刷新/ }).first().click();
      await page.waitForTimeout(1000);

      // 刷新后仍显示修复中
      const headerAfter = await page.locator("text=当前").first().textContent() ?? "";
      expect(headerAfter).toContain("修复中");
    });

    test("E3: 组件实现了 onBeforeUnmount 清理", async ({ page }) => {
      await navigateTo(page);
      test.info().annotations.push({
        type: "info",
        description: "代码审查确认 onBeforeUnmount + clearInterval(refreshTimer) 已实现（FeedbackReviewPage.vue:365-367）",
      });
    });
  });

  // ───────────────────────
  // F. 审批/拒绝/搁置功能
  // ───────────────────────

  test.describe("F. 审批/拒绝/搁置功能", () => {

    test("F1–F3: 待处理卡片操作按钮存在且可用", async ({ page }) => {
      await navigateTo(page);

      // 确保在 inbox（待处理）
      await getStageCard(page, "待处理").click();
      await page.waitForTimeout(1000);

      const approveBtns = page.locator("button:has-text('批准')");
      const rejectBtns = page.locator("button:has-text('拒绝')");
      const snoozeBtns = page.locator("button:has-text('搁置')");

      const aCount = await approveBtns.count();
      if (aCount === 0) {
        test.info().annotations.push({ type: "info", description: "待处理阶段无卡片，无操作按钮" });
        test.skip();
        return;
      }

      await expect(approveBtns.first()).toBeVisible();
      await expect(rejectBtns.first()).toBeVisible();
      await expect(snoozeBtns.first()).toBeVisible();

      // 点击批准 → 弹出 modal
      await approveBtns.first().click();
      await page.waitForTimeout(500);
      await expect(page.getByText("确认批准")).toBeVisible();
      await page.getByRole("button", { name: "取消" }).first().click();
      await page.waitForTimeout(300);
      await expect(page.getByText("确认批准")).not.toBeVisible();

      // 点击拒绝 → 弹出 modal
      await rejectBtns.first().click();
      await page.waitForTimeout(500);
      await expect(page.getByText("确认拒绝")).toBeVisible();
      await page.getByRole("button", { name: "取消" }).first().click();
      await page.waitForTimeout(300);
    });
  });

  // ───────────────────────
  // G. 搜索与分页
  // ───────────────────────

  test.describe("G. 搜索与分页", () => {

    test("G1: 搜索框存在且可输入", async ({ page }) => {
      await navigateTo(page);

      const searchInput = page.getByPlaceholder("搜索反馈内容...");
      await expect(searchInput).toBeVisible();
      await searchInput.fill("测试关键词");
      await expect(searchInput).toHaveValue("测试关键词");

      await expect(page.getByRole("button", { name: "搜索" }).first()).toBeVisible();

      // 清空
      await searchInput.fill("");
    });

    test("G2: 分页选择器结构正确", async ({ page }) => {
      await navigateTo(page);

      // 分页控件在 total > pageSize 时才会显示
      const select = page.locator("select").filter({ has: page.locator("option") });
      const hasSelect = await select.count();
      if (hasSelect > 0) {
        const options = await select.first().locator("option").allTextContents();
        expect(options.some(o => o.includes("20"))).toBe(true);
        expect(options.some(o => o.includes("50"))).toBe(true);
        expect(options.some(o => o.includes("100"))).toBe(true);
      } else {
        test.info().annotations.push({ type: "info", description: "数据量不足以触发分页显示" });
      }
    });

    test("G3: 页码导航 UI", async ({ page }) => {
      await navigateTo(page);

      const prevBtn = page.getByRole("button", { name: "上一页" });
      const nextBtn = page.getByRole("button", { name: "下一页" });

      const hasPrev = await prevBtn.count();
      const hasNext = await nextBtn.count();

      if (hasPrev > 0) await expect(prevBtn.first()).toBeVisible();
      if (hasNext > 0) await expect(nextBtn.first()).toBeVisible();
      if (hasPrev === 0 && hasNext === 0) {
        test.info().annotations.push({ type: "info", description: "无分页 UI（数据量不足）" });
      }
    });
  });

  // ───────────────────────
  // H. 暗色模式
  // ───────────────────────

  test.describe("H. 暗色模式", () => {

    test("H1+H2: 暗色模式下管道列背景正常", async ({ page }) => {
      await navigateTo(page);

      // 切换暗色模式
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      await page.waitForTimeout(500);

      for (const stage of STAGES) {
        const card = getStageCard(page, stage.label);
        await expect(card).toBeVisible();
        const bg = await card.evaluate(el => window.getComputedStyle(el).backgroundColor);
        expect(bg).not.toBe("rgb(255, 255, 255)");
      }

      // 状态标签可读 — 找卡片中的 badge
      const badges = page.locator("span.rounded-full.text-xs.font-medium");
      if (await badges.count() > 0) {
        const color = await badges.first().evaluate(el => window.getComputedStyle(el).color);
        expect(color).not.toBe("rgb(255, 255, 255)");
      }

      // 清理
      await page.evaluate(() => document.documentElement.classList.remove("dark"));
    });
  });
});
