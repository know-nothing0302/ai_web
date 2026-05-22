# Stats Visibility And Feedback Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide `内容发布` and `统计信息` from ordinary users, and add a lightweight recent-feedback list plus feedback detail dialog to the `统计信息` page.

**Architecture:** Keep the existing allowlist/operator rule as the single source of truth for admin-like visibility. On the API side, add one internal feedback list route that reuses the existing feedback store and returns full row data for the latest 10 records in the selected time range. On the web side, filter the top navigation by the current user, then extend `AdminStatsPage.vue` with one feedback block and an in-page detail dialog without adding new routes.

**Tech Stack:** Express 5, TypeScript, Vue 3, Axios, Zod, existing auth middleware, existing feedback store, `tsx` smoke scripts, Vite build

---

## File Map

- Modify: `apps/api/src/middleware/auth.ts`
- Modify: `apps/api/src/modules/feedback/routes.ts`
- Create: `apps/api/src/scripts/test_feedback_admin_routes.ts`
- Modify: `apps/web/src/services/api.ts`
- Modify: `apps/web/src/App.vue`
- Modify: `apps/web/src/views/AdminStatsPage.vue`

## Implementation Notes

- This workspace is still not attached to a Git repository, so skip commit steps.
- Keep permissions consistent with the current content publish allowlist/operator logic.
- Do not create a standalone feedback page or a feedback detail route.
- Do not expand the feedback feature into filtering UIs, export, or workflow processing.
- Reuse the existing feedback list response shape so the frontend can open details from list data directly.

### Task 1: Add Internal Feedback Read Route With TDD

**Files:**
- Modify: `apps/api/src/middleware/auth.ts`
- Modify: `apps/api/src/modules/feedback/routes.ts`
- Create: `apps/api/src/scripts/test_feedback_admin_routes.ts`

- [ ] **Step 1: Create a failing admin-feedback smoke script**

Create `apps/api/src/scripts/test_feedback_admin_routes.ts`:

```ts
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";

import { app } from "../app";
import { env } from "../config/env";
import { closeDb, initDb } from "../lib/db";
import { feedbackStore } from "../lib/store";

const run = async (): Promise<void> => {
  env.devAuthBypass = true;
  await initDb();

  await feedbackStore.create({
    userId: "100002013029",
    type: "bug",
    content: "统计页反馈详情测试",
    contact: "wechat:test",
    pageRoute: "/admin/stats",
    pageTitle: "统计信息",
    source: "test",
  });

  const server = app.listen(0);
  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/feedback/admin?page=1&pageSize=10`
    );
    assert.equal(response.status, 200);
  } finally {
    server.close();
    await closeDb();
  }
};

void run();
```

- [ ] **Step 2: Run the new smoke script and verify RED**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/api exec tsx src/scripts/test_feedback_admin_routes.ts
```

Expected:

```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
404 !== 200
```

- [ ] **Step 3: Expose a dedicated feedback read permission alias**

Modify `apps/api/src/middleware/auth.ts` below `requireStatsReader`:

```ts
export const requireFeedbackReader = requireStatsReader;
```

- [ ] **Step 4: Add the internal feedback list route**

Update the middleware import in `apps/api/src/modules/feedback/routes.ts`:

```ts
import {
  requireAdminOrFeedbackReadToken,
  requireAuth,
  requireFeedbackReader,
} from "../../middleware/auth";
```

Append this route before `feedbackRouter.post("/")`:

```ts
feedbackRouter.get("/admin", requireFeedbackReader, async (request, response) => {
  const parsed = listSchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }

  logger.info("feedback.admin.read.start", {
    type: parsed.data.type,
    startAt: parsed.data.startAt,
    endAt: parsed.data.endAt,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    stage: "list",
  });

  try {
    const result = await feedbackStore.list(parsed.data);
    logger.info("feedback.admin.read.success", {
      type: parsed.data.type,
      startAt: parsed.data.startAt,
      endAt: parsed.data.endAt,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      total: result.total,
      returnedCount: result.items.length,
      stage: "list",
    });
    response.json({
      items: result.items,
      pagination: {
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        total: result.total,
      },
    });
  } catch (error) {
    logger.error("feedback.admin.read.failed", {
      type: parsed.data.type,
      startAt: parsed.data.startAt,
      endAt: parsed.data.endAt,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      stage: "list",
      error,
    });
    response.status(500).json({ message: "反馈查询失败" });
  }
});
```

- [ ] **Step 5: Upgrade the smoke assertions**

Replace the simple `200` assertion in `apps/api/src/scripts/test_feedback_admin_routes.ts` with:

```ts
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/feedback/admin?page=1&pageSize=10`
    );
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(Array.isArray(body.items), true);
    assert.equal(body.items.length >= 1, true);
    assert.equal(body.items[0].content, "统计页反馈详情测试");
    assert.equal(body.items[0].pageTitle, "统计信息");
    assert.equal(body.pagination.page, 1);
    assert.equal(body.pagination.pageSize, 10);
```

- [ ] **Step 6: Run API verification**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/api exec tsx src/scripts/test_feedback_admin_routes.ts
npm --prefix /opt/idapps/ai_web/apps/api exec tsx src/scripts/test_stats_internal_routes.ts
npm --prefix /opt/idapps/ai_web/apps/api run build
npm --prefix /opt/idapps/ai_web/apps/api run typecheck
```

Expected:

```text
[no output from the smoke scripts]
> api@1.0.0 build
> tsc -p tsconfig.json
> api@1.0.0 typecheck
> tsc -p tsconfig.json --noEmit
```

### Task 2: Hide Management Navigation For Ordinary Users

**Files:**
- Modify: `apps/web/src/App.vue`
- Modify: `apps/web/src/services/api.ts`

- [ ] **Step 1: Add a reusable frontend allowlist helper**

Append this type and helper near the `User` interface in `apps/web/src/services/api.ts`:

```ts
const operatorAllowList = new Set(["100002013029"]);

export const canAccessAdminViews = (user: User | null): boolean => {
  if (!user) {
    return false;
  }
  if (user.role === "admin") {
    return true;
  }
  const userId = user.id?.trim() ?? "";
  const username = user.username?.trim() ?? "";
  return operatorAllowList.has(userId) || operatorAllowList.has(username);
};
```

- [ ] **Step 2: Replace static navigation items with permission-aware items**

Update the import line in `apps/web/src/App.vue`:

```ts
import {
  askPageAgent,
  canAccessAdminViews,
  createPageAgentConversation,
  getCurrentUser,
  submitFeedback,
} from "./services/api";
```

Add these refs and computed values below `currentPageTitle`:

```ts
const currentUser = ref<Awaited<ReturnType<typeof getCurrentUser>>>(null);

const navItems = computed(() => {
  const items = [
    { path: "/", name: "资讯发现", icon: FileText },
    { path: "/subscription", name: "智能订阅", icon: Bell },
  ];

  if (canAccessAdminViews(currentUser.value)) {
    items.push(
      { path: "/admin/publish", name: "内容发布", icon: Settings },
      { path: "/admin/stats", name: "统计信息", icon: BarChart3 }
    );
  }

  return items;
});
```

Delete the old static `navItems` array:

```ts
const navItems = [
  { path: "/", name: "资讯发现", icon: FileText },
  { path: "/subscription", name: "智能订阅", icon: Bell },
  { path: "/admin/publish", name: "内容发布", icon: Settings },
  { path: "/admin/stats", name: "统计信息", icon: BarChart3 },
];
```

- [ ] **Step 3: Load the current user once for navigation visibility**

Replace the existing `onMounted` in `apps/web/src/App.vue` with:

```ts
onMounted(async () => {
  window.setTimeout(() => {
    pageAgentIntroActive.value = false;
  }, 1800);

  try {
    currentUser.value = await getCurrentUser();
  } catch {
    currentUser.value = null;
  }
});
```

- [ ] **Step 4: Build the web app to verify the navigation change**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/web run build
```

Expected:

```text
> web@0.0.0 build
> vue-tsc -b && vite build
```

### Task 3: Add Recent Feedback List And Detail Dialog To Stats Page

**Files:**
- Modify: `apps/web/src/services/api.ts`
- Modify: `apps/web/src/views/AdminStatsPage.vue`

- [ ] **Step 1: Add feedback list response types and client helper**

Append these exports in `apps/web/src/services/api.ts` after `submitFeedback`:

```ts
export interface FeedbackListItem {
  id: string;
  userId: string;
  type: "bug" | "ux" | "content" | "other";
  content: string;
  contact?: string;
  pageRoute: string;
  pageTitle: string;
  source: string;
  createdAt: string;
}

export interface FeedbackListResponse {
  items: FeedbackListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

export const getAdminFeedbackList = async (params: {
  startAt?: string;
  endAt?: string;
  type?: "bug" | "ux" | "content" | "other";
  page?: number;
  pageSize?: number;
}): Promise<FeedbackListResponse> => {
  const result = await request.get<FeedbackListResponse>("/feedback/admin", { params });
  return result.data;
};
```

- [ ] **Step 2: Add feedback state to the stats page**

Update the import list in `apps/web/src/views/AdminStatsPage.vue`:

```ts
import {
  getAdminFeedbackList,
  getCurrentUser,
  getStatsDistributions,
  getStatsOverview,
  getStatsRankings,
  getStatsStatus,
  getStatsTrends,
  type FeedbackListItem,
  type StatsDistributionsResponse,
  type StatsOverviewResponse,
  type StatsRankingsResponse,
  type StatsStatusResponse,
  type StatsTrendItem,
} from "../services/api";
```

Append these refs below `statsStatus`:

```ts
const feedbackLoading = ref(false);
const feedbackError = ref("");
const feedbackItems = ref<FeedbackListItem[]>([]);
const selectedFeedback = ref<FeedbackListItem | null>(null);
```

Add these helpers below `formatDateTime`:

```ts
const formatFeedbackType = (value: FeedbackListItem["type"]): string => {
  if (value === "bug") {
    return "问题报错";
  }
  if (value === "content") {
    return "内容建议";
  }
  if (value === "other") {
    return "其他";
  }
  return "体验建议";
};

const summarizeFeedback = (value: string): string => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 48) {
    return normalized;
  }
  return `${normalized.slice(0, 48)}...`;
};
```

- [ ] **Step 3: Load recent feedback alongside the existing stats requests**

Append this loader above `loadStatsPage`:

```ts
const loadFeedbackList = async (
  params: { startAt: string; endAt: string }
): Promise<void> => {
  feedbackLoading.value = true;
  feedbackError.value = "";
  try {
    const result = await getAdminFeedbackList({
      ...params,
      page: 1,
      pageSize: 10,
    });
    feedbackItems.value = result.items;
    if (
      selectedFeedback.value &&
      !result.items.some((item) => item.id === selectedFeedback.value?.id)
    ) {
      selectedFeedback.value = null;
    }
  } catch {
    feedbackItems.value = [];
    feedbackError.value = "反馈加载失败，请稍后重试";
    selectedFeedback.value = null;
  } finally {
    feedbackLoading.value = false;
  }
};
```

Replace `loadStatsPage` with:

```ts
const loadStatsPage = async (): Promise<void> => {
  const params = resolveStatsRange(statsRange.value);
  statsLoading.value = true;
  try {
    const [overview, trends, distributions, rankings, status] = await Promise.all([
      getStatsOverview(params),
      getStatsTrends(params),
      getStatsDistributions(params),
      getStatsRankings({ ...params, limit: 5 }),
      getStatsStatus(),
    ]);
    statsOverview.value = overview;
    statsTrendItems.value = trends;
    statsDistributions.value = distributions;
    statsRankings.value = rankings;
    statsStatus.value = status;
    await loadFeedbackList(params);
  } finally {
    statsLoading.value = false;
  }
};
```

- [ ] **Step 4: Extend the template with a feedback block and dialog**

Append this block after the existing rankings section in `apps/web/src/views/AdminStatsPage.vue`:

```vue
      <section class="glass-panel rounded-3xl border p-6 shadow-sm md:p-8">
        <div class="flex items-center justify-between gap-4">
          <div>
            <h3 class="text-lg font-semibold text-[#0f4069]">用户反馈</h3>
            <p class="mt-1 text-sm text-[#6e89a3]">查看当前统计范围内最近提交的反馈</p>
          </div>
          <p class="text-sm text-[#4f6b8a]">最近 10 条</p>
        </div>

        <div v-if="feedbackError" class="mt-4 rounded-2xl border border-[#ffd6d6] bg-[#fff7f7] px-4 py-3 text-sm text-[#b54747]">
          {{ feedbackError }}
        </div>

        <div
          v-else-if="feedbackLoading"
          class="mt-4 rounded-2xl border border-[#d8edf9] bg-white/80 px-4 py-6 text-sm text-[#6e89a3]"
        >
          反馈加载中...
        </div>

        <div
          v-else-if="feedbackItems.length === 0"
          class="mt-4 rounded-2xl border border-[#d8edf9] bg-white/80 px-4 py-6 text-sm text-[#6e89a3]"
        >
          当前时间范围暂无反馈记录
        </div>

        <div v-else class="mt-4 overflow-x-auto">
          <table class="min-w-full text-sm text-[#355878]">
            <thead>
              <tr class="border-b border-[#e1f5fe] text-left text-[#4f6b8a]">
                <th class="px-2 py-2">提交时间</th>
                <th class="px-2 py-2">类型</th>
                <th class="px-2 py-2">页面</th>
                <th class="px-2 py-2">内容摘要</th>
                <th class="px-2 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in feedbackItems"
                :key="item.id"
                class="border-b border-[#f1faff]"
              >
                <td class="px-2 py-3">{{ formatDateTime(item.createdAt) }}</td>
                <td class="px-2 py-3">{{ formatFeedbackType(item.type) }}</td>
                <td class="px-2 py-3">{{ item.pageTitle || item.pageRoute }}</td>
                <td class="px-2 py-3">{{ summarizeFeedback(item.content) }}</td>
                <td class="px-2 py-3 text-right">
                  <button
                    type="button"
                    class="rounded-full border border-[#b3e5fc] px-3 py-1 text-xs text-[#0277bd] transition-colors hover:border-[#4fc3f7] hover:bg-[#e1f5fe]"
                    @click="selectedFeedback = item"
                  >
                    查看详情
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div
        v-if="selectedFeedback"
        class="fixed inset-0 z-[70] flex items-center justify-center bg-[#0f4069]/18 px-4"
      >
        <section class="w-full max-w-2xl rounded-3xl border border-[#b3e5fc] bg-white p-6 shadow-xl">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="text-lg font-semibold text-[#0f4069]">反馈详情</h3>
              <p class="mt-1 text-sm text-[#6e89a3]">
                {{ formatFeedbackType(selectedFeedback.type) }} · {{ formatDateTime(selectedFeedback.createdAt) }}
              </p>
            </div>
            <button
              type="button"
              class="rounded-xl px-3 py-2 text-sm text-[#4f6b8a] transition-colors hover:bg-[#f3f8fc] hover:text-[#0f4069]"
              @click="selectedFeedback = null"
            >
              关闭
            </button>
          </div>

          <div class="mt-5 space-y-4 text-sm text-[#355878]">
            <div>
              <p class="text-[#6e89a3]">反馈内容</p>
              <p class="mt-1 whitespace-pre-wrap rounded-2xl bg-[#f8fbfe] px-4 py-3">
                {{ selectedFeedback.content }}
              </p>
            </div>
            <div class="grid gap-4 md:grid-cols-2">
              <div>
                <p class="text-[#6e89a3]">页面标题</p>
                <p class="mt-1">{{ selectedFeedback.pageTitle || "暂无" }}</p>
              </div>
              <div>
                <p class="text-[#6e89a3]">页面路由</p>
                <p class="mt-1 break-all">{{ selectedFeedback.pageRoute || "暂无" }}</p>
              </div>
              <div>
                <p class="text-[#6e89a3]">联系方式</p>
                <p class="mt-1">{{ selectedFeedback.contact || "未填写" }}</p>
              </div>
              <div>
                <p class="text-[#6e89a3]">用户 ID</p>
                <p class="mt-1">{{ selectedFeedback.userId }}</p>
              </div>
            </div>
          </div>
        </section>
      </div>
```

- [ ] **Step 5: Run web verification**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/web run build
```

Expected:

```text
> web@0.0.0 build
> vue-tsc -b && vite build
```

### Task 4: Final Verification

**Files:**
- Verify only

- [ ] **Step 1: Check diagnostics for edited files**

Run diagnostics on:

- `apps/api/src/middleware/auth.ts`
- `apps/api/src/modules/feedback/routes.ts`
- `apps/api/src/scripts/test_feedback_admin_routes.ts`
- `apps/web/src/services/api.ts`
- `apps/web/src/App.vue`
- `apps/web/src/views/AdminStatsPage.vue`

Expected:

```text
No new errors introduced by this change set
```

- [ ] **Step 2: Run final command set**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/api exec tsx src/scripts/test_feedback_admin_routes.ts
npm --prefix /opt/idapps/ai_web/apps/api exec tsx src/scripts/test_stats_internal_routes.ts
npm --prefix /opt/idapps/ai_web/apps/api run build
npm --prefix /opt/idapps/ai_web/apps/api run typecheck
npm --prefix /opt/idapps/ai_web/apps/web run build
```

Expected:

```text
[no output from the smoke scripts]
> api@1.0.0 build
> tsc -p tsconfig.json
> api@1.0.0 typecheck
> tsc -p tsconfig.json --noEmit
> web@0.0.0 build
> vue-tsc -b && vite build
```

- [ ] **Step 3: Manually verify the user-visible behavior**

Manual verification checklist:

```text
1. Log in as an ordinary user and confirm the top navigation only shows 资讯发现 and 智能订阅.
2. Confirm an ordinary user opening /admin/publish or /admin/stats still sees 无权限访问.
3. Log in as allowlist/operator user and confirm 内容发布 and 统计信息 are visible again.
4. Open /admin/stats and confirm a 用户反馈 block appears below the existing statistics sections.
5. Confirm the block shows the latest 10 feedback records for the selected time range.
6. Click 查看详情 and confirm the modal shows content, contact, page title, page route, created time, and user ID.
7. Switch the stats range and confirm the feedback list refreshes with the new range.
8. Confirm feedback loading failure, if simulated, does not break the rest of the stats page.
```

## Self-Review

- Spec coverage: The plan covers ordinary-user navigation hiding, route guard behavior preservation, internal feedback read API, feedback list loading, feedback detail dialog, and final verification.
- Placeholder scan: No `TODO`, `TBD`, or deferred implementation markers remain.
- Type consistency: The plan consistently uses `requireFeedbackReader`, `GET /api/feedback/admin`, `canAccessAdminViews`, `getAdminFeedbackList`, `feedbackItems`, and `selectedFeedback`.
