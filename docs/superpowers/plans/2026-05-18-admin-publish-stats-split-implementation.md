# Admin Publish And Stats Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the current admin page into a lighter `内容发布` page and a dedicated `统计信息` page, while adding a lightweight stats status endpoint so administrators can verify analytics collection is active.

**Architecture:** Reuse the existing analytics storage and stats aggregation module, then add one small `status` endpoint for collection health. On the web side, move the current mixed `AdminPage.vue` into two focused views: `AdminPublishPage.vue` keeps article publishing features only, and `AdminStatsPage.vue` loads only stats-related requests with a default `近7天` range.

**Tech Stack:** Express 5, TypeScript, Vue 3, Axios, Zod, PostgreSQL, existing stats module, existing admin allowlist checks, `tsx` smoke scripts, Vite build

---

## File Map

- Create: `apps/web/src/views/AdminPublishPage.vue`
- Create: `apps/web/src/views/AdminStatsPage.vue`
- Modify: `apps/api/src/lib/types.ts`
- Modify: `apps/api/src/lib/store.ts`
- Modify: `apps/api/src/modules/stats/service.ts`
- Modify: `apps/api/src/modules/stats/routes.ts`
- Modify: `apps/api/src/scripts/test_stats_internal_routes.ts`
- Modify: `apps/web/src/services/api.ts`
- Modify: `apps/web/src/router.ts`
- Modify: `apps/web/src/App.vue`
- Modify: `apps/web/src/views/AdminPage.vue`

## Implementation Notes

- This workspace still does not appear to be attached to a Git repository, so do not block on commit steps.
- Keep the scope limited to internal admin pages. Do not add external `status` routes or new analytics event types.
- Prefer copying the current `AdminPage.vue` into two focused pages, then deleting the mixed responsibility from the old route wiring.
- Reuse the existing frontend allowlist check to avoid widening admin access while you split the page.

### Task 1: Add Lightweight Stats Status Endpoint And Verification

**Files:**
- Modify: `apps/api/src/lib/types.ts`
- Modify: `apps/api/src/lib/store.ts`
- Modify: `apps/api/src/modules/stats/service.ts`
- Modify: `apps/api/src/modules/stats/routes.ts`
- Modify: `apps/api/src/scripts/test_stats_internal_routes.ts`

- [ ] **Step 1: Add a failing `status` assertion to the internal smoke script**

Modify `apps/api/src/scripts/test_stats_internal_routes.ts` by appending this request after the existing `rankings` assertions:

```ts
    const status = await fetch(`http://127.0.0.1:${address.port}/api/stats/status`);
    assert.equal(status.status, 200);
```

- [ ] **Step 2: Run the smoke script to confirm the route is missing**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/api exec tsx src/scripts/test_stats_internal_routes.ts
```

Expected:

```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
404 !== 200
```

- [ ] **Step 3: Add stats status types**

Modify `apps/api/src/lib/types.ts` by appending these definitions after `StatsRankings`:

```ts
export interface StatsStatus {
  latestEventAt?: string;
  totalEvents: number;
  todayEventCount: number;
}
```

- [ ] **Step 4: Add store-level status queries**

Modify `apps/api/src/lib/store.ts` by appending these methods inside `analyticsEventStore`:

```ts
  async getStatus(): Promise<{
    latestEventAt?: string;
    totalEvents: number;
    todayEventCount: number;
  }> {
    const result = await query<{
      latest_event_at: string | null;
      total_events: string;
      today_event_count: string;
    }>(
      `
      WITH today_start AS (
        SELECT date_trunc('day', NOW() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai' AS value
      )
      SELECT
        MAX(occurred_at) AS latest_event_at,
        COUNT(*)::text AS total_events,
        COUNT(*) FILTER (
          WHERE occurred_at >= (SELECT value FROM today_start)
        )::text AS today_event_count
      FROM analytics_events
      `
    );

    return {
      latestEventAt: result.rows[0]?.latest_event_at ?? undefined,
      totalEvents: Number(result.rows[0]?.total_events ?? 0),
      todayEventCount: Number(result.rows[0]?.today_event_count ?? 0),
    };
  },
```

- [ ] **Step 5: Expose the status service and route**

Modify `apps/api/src/modules/stats/service.ts` by appending this method:

```ts
  async getStatus(): Promise<StatsStatus> {
    return analyticsEventStore.getStatus();
  },
```

Also update the import:

```ts
import {
  StatsDistributions,
  StatsOverview,
  StatsRankings,
  StatsStatus,
} from "../../lib/types";
```

Modify `apps/api/src/modules/stats/routes.ts` by appending this route near the other internal stats routes:

```ts
statsRouter.get("/status", requireAdmin, async (_request, response) => {
  response.json(await statsService.getStatus());
});
```

- [ ] **Step 6: Upgrade the smoke assertions and verify**

Replace the new `status` assertion in `apps/api/src/scripts/test_stats_internal_routes.ts` with:

```ts
    const status = await fetch(`http://127.0.0.1:${address.port}/api/stats/status`);
    assert.equal(status.status, 200);
    const statusBody = await status.json();
    assert.equal(typeof statusBody.totalEvents, "number");
    assert.equal(typeof statusBody.todayEventCount, "number");
    assert.equal("latestEventAt" in statusBody, true);
```

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/api exec tsx src/scripts/test_stats_internal_routes.ts
npm --prefix /opt/idapps/ai_web/apps/api run build
npm --prefix /opt/idapps/ai_web/apps/api run typecheck
```

Expected:

```text
[no output from the script]
> api@1.0.0 build
> tsc -p tsconfig.json
> api@1.0.0 typecheck
> tsc -p tsconfig.json --noEmit
```

### Task 2: Split Routing, Navigation, And Content Publish Page

**Files:**
- Create: `apps/web/src/views/AdminPublishPage.vue`
- Modify: `apps/web/src/router.ts`
- Modify: `apps/web/src/App.vue`
- Modify: `apps/web/src/views/AdminPage.vue`

- [ ] **Step 1: Copy the current admin page into a dedicated publish page**

Create `apps/web/src/views/AdminPublishPage.vue` by copying the current `apps/web/src/views/AdminPage.vue` content as the starting point.

The new file should keep the current imports and script setup initially:

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from "vue";
import { Sparkles, Rocket, Edit3, RefreshCw, ListChecks, Filter, ChevronLeft, ChevronRight } from "lucide-vue-next";
import { useRoute } from "vue-router";
// keep the rest of the existing AdminPage imports and logic for the first copy
</script>
```

- [ ] **Step 2: Remove stats-only state and requests from the publish page**

Modify `apps/web/src/views/AdminPublishPage.vue` by deleting stats-specific state and loaders:

```ts
const statsLoading = ref(false);
const statsOverview = ref<StatsOverviewResponse | null>(null);
const statsRange = ref<"today" | "last7days" | "last30days">("today");
const statsTrendItems = ref<StatsTrendItem[]>([]);
const statsDistributions = ref<StatsDistributionsResponse | null>(null);
const statsRankings = ref<StatsRankingsResponse | null>(null);
```

Delete the stats helper block:

```ts
const getShanghaiDateParts = ...
const toShanghaiStartAt = ...
const resolveStatsRange = ...
const loadStatsDashboard = async (): Promise<void> => { ... }
```

Update the article mutation success paths so they only reload article data:

```ts
    await loadArticles();
```

Update `onMounted` to remove stats loading:

```ts
onMounted(async () => {
  const hasAccess = await checkAccess();
  if (hasAccess) {
    await Promise.all([loadChannels(), loadArticles()]);
  }
});
```

- [ ] **Step 3: Remove stats markup and rename content text**

Modify `apps/web/src/views/AdminPublishPage.vue` by removing the stats overview cards and the entire “统计看板” section from the template.

Update these user-facing strings:

```ts
      message.value = "无权限访问内容发布，请联系管理员开通";
```

```ts
      pageTitle: "内容发布",
```

```vue
          内容发布
```

```vue
        当前账号（{{ currentUserId || "未知用户" }}）不在内容发布允许名单内。
```

- [ ] **Step 4: Wire the new publish route and navigation labels**

Modify `apps/web/src/router.ts`:

```ts
import AdminPublishPage from "./views/AdminPublishPage.vue";
import AdminStatsPage from "./views/AdminStatsPage.vue";

const routes = [
  { path: "/", component: ArticlesPage, meta: { title: defaultTitle } },
  { path: "/articles/:id", component: ArticleDetailPage, meta: { title: `${defaultTitle} - 文章详情` } },
  { path: "/push-digests/today", component: TodayPushDigestPage, meta: { title: `${defaultTitle} - 今日推送` } },
  { path: "/subscription", component: SubscriptionPage, meta: { title: `${defaultTitle} - 智能订阅` } },
  { path: "/admin", redirect: "/admin/publish" },
  { path: "/admin/publish", component: AdminPublishPage, meta: { title: `${defaultTitle} - 内容发布` } },
  { path: "/admin/stats", component: AdminStatsPage, meta: { title: `${defaultTitle} - 统计信息` } },
];
```

Modify `apps/web/src/App.vue`:

```ts
const navItems = [
  { path: "/", name: "资讯发现", icon: FileText },
  { path: "/subscription", name: "智能订阅", icon: Bell },
  { path: "/admin/publish", name: "内容发布", icon: Settings },
  { path: "/admin/stats", name: "统计信息", icon: BarChart3 },
];
```

Also update the import list in `App.vue` to include `BarChart3`.

- [ ] **Step 5: Convert the old mixed page into a compatibility shell**

Modify `apps/web/src/views/AdminPage.vue` so it no longer contains the mixed admin implementation. Replace the full file with a redirect shell:

```vue
<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();

onMounted(() => {
  void router.replace("/admin/publish");
});
</script>

<template>
  <div class="glass-panel rounded-2xl border p-8 text-center text-[#4f6b8a]">
    正在跳转到内容发布...
  </div>
</template>
```

- [ ] **Step 6: Build the web app to verify the split route wiring**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/web run build
```

Expected:

```text
> web@0.0.0 build
> vue-tsc -b && vite build
```

### Task 3: Build Dedicated Stats Page And Final Verification

**Files:**
- Create: `apps/web/src/views/AdminStatsPage.vue`
- Modify: `apps/web/src/services/api.ts`
- Modify: `apps/web/src/router.ts`
- Modify: `apps/web/src/App.vue`
- Modify: `apps/api/src/scripts/test_stats_internal_routes.ts`

- [ ] **Step 1: Add client helpers for stats status**

Modify `apps/web/src/services/api.ts` by appending this type and helper after the existing stats exports:

```ts
export interface StatsStatusResponse {
  latestEventAt?: string;
  totalEvents: number;
  todayEventCount: number;
}

export const getStatsStatus = async (): Promise<StatsStatusResponse> => {
  const result = await request.get<StatsStatusResponse>("/stats/status");
  return result.data;
};
```

- [ ] **Step 2: Create the dedicated stats page**

Create `apps/web/src/views/AdminStatsPage.vue` with this initial implementation:

```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { BarChart3 } from "lucide-vue-next";

import {
  getCurrentUser,
  getStatsDistributions,
  getStatsOverview,
  getStatsRankings,
  getStatsStatus,
  getStatsTrends,
  type StatsDistributionsResponse,
  type StatsOverviewResponse,
  type StatsRankingsResponse,
  type StatsStatusResponse,
  type StatsTrendItem,
} from "../services/api";

const currentUserId = ref("");
const accessDenied = ref(false);
const statsLoading = ref(false);
const statsRange = ref<"last7days" | "last30days" | "today">("last7days");
const statsOverview = ref<StatsOverviewResponse | null>(null);
const statsTrendItems = ref<StatsTrendItem[]>([]);
const statsDistributions = ref<StatsDistributionsResponse | null>(null);
const statsRankings = ref<StatsRankingsResponse | null>(null);
const statsStatus = ref<StatsStatusResponse | null>(null);

const statsRangeOptions = [
  { label: "近7天", value: "last7days" },
  { label: "近30天", value: "last30days" },
  { label: "今天", value: "today" },
] as const;

const topChannelViews = computed(() => statsDistributions.value?.channelViews.items ?? []);
const topChannelPublishes = computed(() => statsDistributions.value?.channelPublishes.items ?? []);
const topChannelPushes = computed(() => statsDistributions.value?.channelPushes.items ?? []);
const topFeedbackTypes = computed(() => statsDistributions.value?.feedbackTypes.items ?? []);
const topArticles = computed(() => statsRankings.value?.topArticles.items ?? []);
const topChannels = computed(() => statsRankings.value?.topChannels.items ?? []);

const getShanghaiDateParts = (value: Date): { year: number; month: number; day: number } => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(value);
  return {
    year: Number(parts.find((item) => item.type === "year")?.value ?? "1970"),
    month: Number(parts.find((item) => item.type === "month")?.value ?? "01"),
    day: Number(parts.find((item) => item.type === "day")?.value ?? "01"),
  };
};

const toShanghaiStartAt = (year: number, month: number, day: number): string =>
  new Date(Date.UTC(year, month - 1, day) - 8 * 60 * 60 * 1000).toISOString();

const resolveStatsRange = (
  value: "last7days" | "last30days" | "today"
): { startAt: string; endAt: string } => {
  const now = new Date();
  const { year, month, day } = getShanghaiDateParts(now);
  const baseDate = new Date(Date.UTC(year, month - 1, day));

  if (value === "last7days") {
    baseDate.setUTCDate(baseDate.getUTCDate() - 6);
  } else if (value === "last30days") {
    baseDate.setUTCDate(baseDate.getUTCDate() - 29);
  }

  return {
    startAt: toShanghaiStartAt(
      baseDate.getUTCFullYear(),
      baseDate.getUTCMonth() + 1,
      baseDate.getUTCDate()
    ),
    endAt: now.toISOString(),
  };
};

const formatDateTime = (value?: string): string => {
  if (!value) {
    return "暂无";
  }
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const checkAccess = async (): Promise<boolean> => {
  try {
    const user = await getCurrentUser();
    const allowList = new Set(["100002013029"]);
    const userId = user?.id?.trim() ?? "";
    const username = user?.username?.trim() ?? "";
    currentUserId.value = userId || username;
    if (!user || (!allowList.has(userId) && !allowList.has(username))) {
      accessDenied.value = true;
      return false;
    }
    accessDenied.value = false;
    return true;
  } catch {
    accessDenied.value = true;
    return false;
  }
};

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
  } finally {
    statsLoading.value = false;
  }
};

onMounted(async () => {
  const hasAccess = await checkAccess();
  if (hasAccess) {
    await loadStatsPage();
  }
});

watch(statsRange, async () => {
  if (!accessDenied.value) {
    await loadStatsPage();
  }
});
</script>

<template>
  <div class="max-w-6xl mx-auto space-y-8">
    <section
      v-if="accessDenied"
      class="glass-panel rounded-2xl border p-8 text-center"
    >
      <h2 class="text-lg font-semibold text-[#0f4069]">无权限访问</h2>
      <p class="text-[#4f6b8a] mt-2">
        当前账号（{{ currentUserId || "未知用户" }}）不在统计信息允许名单内。
      </p>
    </section>

    <template v-else>
      <section class="glass-panel rounded-3xl border p-6 md:p-8 shadow-sm">
        <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 class="flex items-center gap-3 text-3xl font-bold text-[#0f4069]">
              <BarChart3 class="h-8 w-8 text-[#0288d1]" />
              统计信息
            </h1>
            <p class="mt-2 text-[#4f6b8a]">
              管理员查看访问、浏览、发布、推送和反馈统计的专用页面
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="option in statsRangeOptions"
              :key="option.value"
              type="button"
              class="rounded-full border px-4 py-2 text-sm transition-colors"
              :class="
                statsRange === option.value
                  ? 'border-[#0288d1] bg-[#e1f5fe] text-[#0277bd]'
                  : 'border-[#b3e5fc] text-[#4f6b8a] hover:border-[#4fc3f7]'
              "
              @click="statsRange = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
```

- [ ] **Step 3: Extend the stats page template with cards, status, distributions, and rankings**

Append this block inside the `v-else` template section in `apps/web/src/views/AdminStatsPage.vue`:

```vue
      <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div class="glass-panel rounded-2xl border p-5">
          <p class="text-sm text-[#4f6b8a]">当前统计范围</p>
          <p class="mt-2 text-xl font-bold text-[#0f4069]">
            {{ statsRangeOptions.find((item) => item.value === statsRange)?.label }}
          </p>
        </div>
        <div class="glass-panel rounded-2xl border p-5">
          <p class="text-sm text-[#4f6b8a]">最近采集时间</p>
          <p class="mt-2 text-xl font-bold text-[#0f4069]">
            {{ formatDateTime(statsStatus?.latestEventAt) }}
          </p>
        </div>
        <div class="glass-panel rounded-2xl border p-5">
          <p class="text-sm text-[#4f6b8a]">累计事件数</p>
          <p class="mt-2 text-xl font-bold text-[#0f4069]">
            {{ statsStatus?.totalEvents ?? 0 }}
          </p>
        </div>
        <div class="glass-panel rounded-2xl border p-5">
          <p class="text-sm text-[#4f6b8a]">今日事件数</p>
          <p class="mt-2 text-xl font-bold text-[#0f4069]">
            {{ statsStatus?.todayEventCount ?? 0 }}
          </p>
        </div>
      </section>

      <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div class="glass-panel rounded-2xl border p-5">
          <p class="text-sm text-[#4f6b8a]">页面浏览量</p>
          <p class="mt-2 text-2xl font-bold text-[#0f4069]">{{ statsLoading ? "--" : statsOverview?.pv ?? 0 }}</p>
        </div>
        <div class="glass-panel rounded-2xl border p-5">
          <p class="text-sm text-[#4f6b8a]">访问用户数</p>
          <p class="mt-2 text-2xl font-bold text-[#0f4069]">{{ statsLoading ? "--" : statsOverview?.uv ?? 0 }}</p>
        </div>
        <div class="glass-panel rounded-2xl border p-5">
          <p class="text-sm text-[#4f6b8a]">文章浏览量</p>
          <p class="mt-2 text-2xl font-bold text-[#0f4069]">{{ statsLoading ? "--" : statsOverview?.articleViews ?? 0 }}</p>
        </div>
        <div class="glass-panel rounded-2xl border p-5">
          <p class="text-sm text-[#4f6b8a]">文章发布量</p>
          <p class="mt-2 text-2xl font-bold text-[#0f4069]">{{ statsLoading ? "--" : statsOverview?.articlesPublished ?? 0 }}</p>
        </div>
        <div class="glass-panel rounded-2xl border p-5">
          <p class="text-sm text-[#4f6b8a]">推送总量</p>
          <p class="mt-2 text-2xl font-bold text-[#0f4069]">{{ statsLoading ? "--" : statsOverview?.pushTotal ?? 0 }}</p>
        </div>
        <div class="glass-panel rounded-2xl border p-5">
          <p class="text-sm text-[#4f6b8a]">推送成功率</p>
          <p class="mt-2 text-2xl font-bold text-[#0f4069]">{{ statsLoading ? "--" : `${statsOverview?.pushSuccessRate ?? 0}%` }}</p>
        </div>
        <div class="glass-panel rounded-2xl border p-5">
          <p class="text-sm text-[#4f6b8a]">反馈提交量</p>
          <p class="mt-2 text-2xl font-bold text-[#0f4069]">{{ statsLoading ? "--" : statsOverview?.feedbackCount ?? 0 }}</p>
        </div>
        <div class="glass-panel rounded-2xl border p-5">
          <p class="text-sm text-[#4f6b8a]">启用订阅数</p>
          <p class="mt-2 text-2xl font-bold text-[#0f4069]">{{ statsLoading ? "--" : statsOverview?.enabledSubscriptionCount ?? 0 }}</p>
        </div>
      </section>

      <section class="glass-panel rounded-3xl border p-6 md:p-8 shadow-sm">
        <div class="grid gap-4 xl:grid-cols-2">
          <div class="rounded-2xl border border-[#d8edf9] bg-white/80 p-5">
            <h3 class="text-base font-semibold text-[#0f4069]">每日趋势</h3>
            <div v-if="statsTrendItems.length === 0" class="mt-4 text-sm text-[#6e89a3]">
              {{ statsLoading ? "加载中..." : "当前时间范围暂无统计数据" }}
            </div>
            <div v-else class="mt-4 overflow-x-auto">
              <table class="min-w-full text-sm text-[#355878]">
                <thead>
                  <tr class="border-b border-[#e1f5fe] text-left text-[#4f6b8a]">
                    <th class="px-2 py-2">日期</th>
                    <th class="px-2 py-2">PV</th>
                    <th class="px-2 py-2">UV</th>
                    <th class="px-2 py-2">文章浏览量</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in statsTrendItems" :key="item.date" class="border-b border-[#f1faff]">
                    <td class="px-2 py-2">{{ item.date }}</td>
                    <td class="px-2 py-2">{{ item.pv }}</td>
                    <td class="px-2 py-2">{{ item.uv }}</td>
                    <td class="px-2 py-2">{{ item.articleViews }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div class="rounded-2xl border border-[#d8edf9] bg-white/80 p-5">
              <h3 class="text-base font-semibold text-[#0f4069]">栏目浏览分布</h3>
              <div v-if="topChannelViews.length === 0" class="mt-4 text-sm text-[#6e89a3]">暂无统计数据</div>
              <div v-else class="mt-4 space-y-3">
                <div v-for="item in topChannelViews" :key="item.key" class="flex items-center justify-between text-sm">
                  <span class="text-[#355878]">{{ item.label }}</span>
                  <span class="font-semibold text-[#0f4069]">{{ item.value }}</span>
                </div>
              </div>
            </div>

            <div class="rounded-2xl border border-[#d8edf9] bg-white/80 p-5">
              <h3 class="text-base font-semibold text-[#0f4069]">栏目发布分布</h3>
              <div v-if="topChannelPublishes.length === 0" class="mt-4 text-sm text-[#6e89a3]">暂无统计数据</div>
              <div v-else class="mt-4 space-y-3">
                <div v-for="item in topChannelPublishes" :key="item.key" class="flex items-center justify-between text-sm">
                  <span class="text-[#355878]">{{ item.label }}</span>
                  <span class="font-semibold text-[#0f4069]">{{ item.value }}</span>
                </div>
              </div>
            </div>

            <div class="rounded-2xl border border-[#d8edf9] bg-white/80 p-5">
              <h3 class="text-base font-semibold text-[#0f4069]">栏目推送分布</h3>
              <div v-if="topChannelPushes.length === 0" class="mt-4 text-sm text-[#6e89a3]">暂无统计数据</div>
              <div v-else class="mt-4 space-y-3">
                <div v-for="item in topChannelPushes" :key="item.key" class="flex items-center justify-between text-sm">
                  <span class="text-[#355878]">{{ item.label }}</span>
                  <span class="font-semibold text-[#0f4069]">{{ item.value }}</span>
                </div>
              </div>
            </div>

            <div class="rounded-2xl border border-[#d8edf9] bg-white/80 p-5">
              <h3 class="text-base font-semibold text-[#0f4069]">反馈类型分布</h3>
              <div v-if="topFeedbackTypes.length === 0" class="mt-4 text-sm text-[#6e89a3]">暂无统计数据</div>
              <div v-else class="mt-4 space-y-3">
                <div v-for="item in topFeedbackTypes" :key="item.key" class="flex items-center justify-between text-sm">
                  <span class="text-[#355878]">{{ item.label }}</span>
                  <span class="font-semibold text-[#0f4069]">{{ item.value }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-6 grid gap-4 xl:grid-cols-2">
          <div class="rounded-2xl border border-[#d8edf9] bg-white/80 p-5">
            <h3 class="text-base font-semibold text-[#0f4069]">热门文章</h3>
            <div v-if="topArticles.length === 0" class="mt-4 text-sm text-[#6e89a3]">暂无统计数据</div>
            <div v-else class="mt-4 space-y-3">
              <div v-for="item in topArticles" :key="item.articleId" class="flex items-start justify-between gap-4 text-sm">
                <div class="min-w-0">
                  <p class="truncate font-medium text-[#355878]">{{ item.title }}</p>
                  <p class="mt-1 text-xs text-[#6e89a3]">{{ item.channelName }}</p>
                </div>
                <span class="shrink-0 font-semibold text-[#0f4069]">{{ item.viewCount }}</span>
              </div>
            </div>
          </div>

          <div class="rounded-2xl border border-[#d8edf9] bg-white/80 p-5">
            <h3 class="text-base font-semibold text-[#0f4069]">热门栏目</h3>
            <div v-if="topChannels.length === 0" class="mt-4 text-sm text-[#6e89a3]">暂无统计数据</div>
            <div v-else class="mt-4 space-y-3">
              <div v-for="item in topChannels" :key="item.channelCode" class="flex items-center justify-between text-sm">
                <span class="text-[#355878]">{{ item.channelName }}</span>
                <span class="font-semibold text-[#0f4069]">{{ item.viewCount }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
```

- [ ] **Step 4: Add a final API smoke assertion and verify builds**

Append this check to `apps/api/src/scripts/test_stats_internal_routes.ts` after parsing the status body:

```ts
    assert.equal(statusBody.totalEvents >= 1, true);
```

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/api exec tsx src/scripts/test_stats_internal_routes.ts
npm --prefix /opt/idapps/ai_web/apps/api run build
npm --prefix /opt/idapps/ai_web/apps/api run typecheck
npm --prefix /opt/idapps/ai_web/apps/web run build
```

Expected:

```text
[no output from the script]
> api@1.0.0 build
> tsc -p tsconfig.json
> api@1.0.0 typecheck
> tsc -p tsconfig.json --noEmit
> web@0.0.0 build
> vue-tsc -b && vite build
```

- [ ] **Step 5: Manually verify routing and performance behavior**

Manual verification checklist:

```text
1. Open /admin and confirm it redirects to /admin/publish.
2. Confirm the top navigation shows 内容发布 and 统计信息.
3. Confirm /admin/publish retains article extraction, AI optimization, publishing, and article management.
4. Confirm /admin/publish no longer shows any stats cards or stats tables.
5. Open /admin/stats and confirm the default range is 近7天.
6. Confirm /admin/stats shows recent collection time, event totals, overview cards, trends, distributions, and rankings.
7. Open an article detail page, return to /admin/stats, and confirm latestEventAt updates after a new article view is recorded.
```

## Self-Review

- Spec coverage: The plan covers route split, navigation rename, dedicated publish page, dedicated stats page, `stats/status`, admin-only access, performance improvement by removing publish-page stats requests, and verification.
- Placeholder scan: No `TODO`, `TBD`, or deferred implementation markers remain.
- Type consistency: The plan consistently uses `/admin/publish`, `/admin/stats`, `StatsStatus`, `getStatsStatus`, `AdminPublishPage.vue`, and `AdminStatsPage.vue`.
