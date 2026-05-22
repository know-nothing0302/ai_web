# Analytics Dashboard Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing internal analytics dashboard so `/admin` can switch time ranges and display overview, daily trends, distributions, and rankings without adding a chart library.

**Architecture:** Reuse the current `stats` module and `analytics_events` data model, then add two internal aggregation endpoints for distributions and rankings. On the web side, extend `AdminPage.vue` with a single time-range state that drives overview, trend, distribution, and ranking requests in parallel while keeping the existing content-management area unaffected.

**Tech Stack:** Express 5, TypeScript, Vue 3, Axios, Zod, PostgreSQL, existing `stats` module, `tsx` smoke scripts, Vite build

---

## File Map

- Modify: `apps/api/src/lib/store.ts`
- Modify: `apps/api/src/modules/stats/service.ts`
- Modify: `apps/api/src/modules/stats/routes.ts`
- Modify: `apps/api/src/lib/types.ts`
- Modify: `apps/api/src/scripts/test_stats_internal_routes.ts`
- Modify: `apps/web/src/services/api.ts`
- Modify: `apps/web/src/views/AdminPage.vue`

## Implementation Notes

- This workspace still does not appear to be attached to a Git repository, so do not block on commit steps.
- Keep the scope limited to the internal admin dashboard; do not add `/api/stats/external/distributions` or `/api/stats/external/rankings`.
- Do not add a chart library. Use simple cards, tables, and lightweight visual emphasis with existing styles.
- Reuse existing verification style: `tsx` smoke script for the API plus `npm run build` and `npm run typecheck`.

### Task 1: Add Internal Distribution And Ranking Aggregations

**Files:**
- Modify: `apps/api/src/lib/types.ts`
- Modify: `apps/api/src/lib/store.ts`
- Modify: `apps/api/src/modules/stats/service.ts`
- Modify: `apps/api/src/modules/stats/routes.ts`
- Modify: `apps/api/src/scripts/test_stats_internal_routes.ts`

- [ ] **Step 1: Extend the internal smoke script with failing distribution and ranking assertions**

Modify `apps/api/src/scripts/test_stats_internal_routes.ts` by appending the following requests after the existing `trends` assertion:

```ts
    const distributions = await fetch(
      `http://127.0.0.1:${address.port}/api/stats/distributions?startAt=2026-01-01T00:00:00.000Z&endAt=2026-12-31T23:59:59.000Z`
    );
    assert.equal(distributions.status, 200);

    const rankings = await fetch(
      `http://127.0.0.1:${address.port}/api/stats/rankings?startAt=2026-01-01T00:00:00.000Z&endAt=2026-12-31T23:59:59.000Z&limit=5`
    );
    assert.equal(rankings.status, 200);
```

- [ ] **Step 2: Run the smoke script to verify the new routes are missing**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/api exec tsx src/scripts/test_stats_internal_routes.ts
```

Expected:

```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
404 !== 200
```

- [ ] **Step 3: Add stats response types for distributions and rankings**

Modify `apps/api/src/lib/types.ts` by appending these types after `StatsOverview`:

```ts
export interface StatsMetricItem {
  key: string;
  label: string;
  value: number;
}

export interface StatsMetricGroup {
  items: StatsMetricItem[];
}

export interface StatsArticleRankingItem {
  articleId: string;
  title: string;
  channelCode: string;
  channelName: string;
  viewCount: number;
}

export interface StatsChannelRankingItem {
  channelCode: string;
  channelName: string;
  viewCount: number;
}

export interface StatsDistributions {
  channelViews: StatsMetricGroup;
  channelPublishes: StatsMetricGroup;
  channelPushes: StatsMetricGroup;
  feedbackTypes: StatsMetricGroup;
}

export interface StatsRankings {
  topArticles: { items: StatsArticleRankingItem[] };
  topChannels: { items: StatsChannelRankingItem[] };
}
```

- [ ] **Step 4: Add store-level aggregation helpers**

Modify `apps/api/src/lib/store.ts` by appending these methods inside `analyticsEventStore`:

```ts
  async listChannelMetricGroups(input: {
    eventName: AnalyticsEvent["eventName"];
    startAt: string;
    endAt: string;
  }): Promise<Array<{ key: string; label: string; value: number }>> {
    const result = await query<{
      key: string;
      label: string;
      value: string;
    }>(
      `
      SELECT
        analytics.channel_code AS key,
        COALESCE(channels.name, analytics.channel_code) AS label,
        COUNT(*)::text AS value
      FROM analytics_events analytics
      LEFT JOIN article_channels channels
        ON channels.code = analytics.channel_code
      WHERE analytics.event_name = $1
        AND analytics.channel_code IS NOT NULL
        AND analytics.occurred_at >= $2::timestamptz
        AND analytics.occurred_at <= $3::timestamptz
      GROUP BY analytics.channel_code, channels.name
      ORDER BY COUNT(*) DESC, analytics.channel_code ASC
      `,
      [input.eventName, input.startAt, input.endAt]
    );
    return result.rows.map((row) => ({
      key: row.key,
      label: row.label,
      value: Number(row.value),
    }));
  },

  async listFeedbackTypeMetrics(input: {
    startAt: string;
    endAt: string;
  }): Promise<Array<{ key: string; label: string; value: number }>> {
    const result = await query<{
      key: string;
      value: string;
    }>(
      `
      SELECT
        COALESCE(event_payload->>'type', 'unknown') AS key,
        COUNT(*)::text AS value
      FROM analytics_events
      WHERE event_name = 'feedback_created'
        AND occurred_at >= $1::timestamptz
        AND occurred_at <= $2::timestamptz
      GROUP BY COALESCE(event_payload->>'type', 'unknown')
      ORDER BY COUNT(*) DESC, key ASC
      `,
      [input.startAt, input.endAt]
    );
    return result.rows.map((row) => ({
      key: row.key,
      label: row.key,
      value: Number(row.value),
    }));
  },

  async listTopArticles(input: {
    startAt: string;
    endAt: string;
    limit: number;
  }): Promise<
    Array<{
      articleId: string;
      title: string;
      channelCode: string;
      channelName: string;
      viewCount: number;
    }>
  > {
    const result = await query<{
      article_id: string;
      title: string;
      channel_code: string;
      channel_name: string | null;
      view_count: string;
    }>(
      `
      SELECT
        analytics.article_id,
        articles.title,
        articles.channel_code,
        COALESCE(channels.name, articles.channel_code) AS channel_name,
        COUNT(*)::text AS view_count
      FROM analytics_events analytics
      INNER JOIN articles
        ON articles.id = analytics.article_id
      LEFT JOIN article_channels channels
        ON channels.code = articles.channel_code
      WHERE analytics.event_name = 'article_view'
        AND analytics.article_id IS NOT NULL
        AND analytics.occurred_at >= $1::timestamptz
        AND analytics.occurred_at <= $2::timestamptz
      GROUP BY analytics.article_id, articles.title, articles.channel_code, channels.name
      ORDER BY COUNT(*) DESC, articles.title ASC
      LIMIT $3
      `,
      [input.startAt, input.endAt, input.limit]
    );
    return result.rows.map((row) => ({
      articleId: row.article_id,
      title: row.title,
      channelCode: row.channel_code,
      channelName: row.channel_name ?? row.channel_code,
      viewCount: Number(row.view_count),
    }));
  },

  async listTopChannels(input: {
    startAt: string;
    endAt: string;
    limit: number;
  }): Promise<Array<{ channelCode: string; channelName: string; viewCount: number }>> {
    const result = await query<{
      channel_code: string;
      channel_name: string | null;
      view_count: string;
    }>(
      `
      SELECT
        analytics.channel_code,
        COALESCE(channels.name, analytics.channel_code) AS channel_name,
        COUNT(*)::text AS view_count
      FROM analytics_events analytics
      LEFT JOIN article_channels channels
        ON channels.code = analytics.channel_code
      WHERE analytics.event_name = 'article_view'
        AND analytics.channel_code IS NOT NULL
        AND analytics.occurred_at >= $1::timestamptz
        AND analytics.occurred_at <= $2::timestamptz
      GROUP BY analytics.channel_code, channels.name
      ORDER BY COUNT(*) DESC, analytics.channel_code ASC
      LIMIT $3
      `,
      [input.startAt, input.endAt, input.limit]
    );
    return result.rows.map((row) => ({
      channelCode: row.channel_code,
      channelName: row.channel_name ?? row.channel_code,
      viewCount: Number(row.view_count),
    }));
  },
```

- [ ] **Step 5: Add service and route methods for distributions and rankings**

Modify `apps/api/src/modules/stats/service.ts` by appending these methods:

```ts
  async getDistributions(input: {
    startAt: string;
    endAt: string;
  }): Promise<StatsDistributions> {
    const [channelViews, channelPublishes, channelPushes, feedbackTypes] =
      await Promise.all([
        analyticsEventStore.listChannelMetricGroups({
          eventName: "article_view",
          startAt: input.startAt,
          endAt: input.endAt,
        }),
        analyticsEventStore.listChannelMetricGroups({
          eventName: "article_published",
          startAt: input.startAt,
          endAt: input.endAt,
        }),
        analyticsEventStore.listChannelMetricGroups({
          eventName: "push_sent",
          startAt: input.startAt,
          endAt: input.endAt,
        }),
        analyticsEventStore.listFeedbackTypeMetrics(input),
      ]);

    return {
      channelViews: { items: channelViews },
      channelPublishes: { items: channelPublishes },
      channelPushes: { items: channelPushes },
      feedbackTypes: { items: feedbackTypes },
    };
  },

  async getRankings(input: {
    startAt: string;
    endAt: string;
    limit: number;
  }): Promise<StatsRankings> {
    const [topArticles, topChannels] = await Promise.all([
      analyticsEventStore.listTopArticles(input),
      analyticsEventStore.listTopChannels(input),
    ]);
    return {
      topArticles: { items: topArticles },
      topChannels: { items: topChannels },
    };
  },
```

Modify `apps/api/src/modules/stats/routes.ts` by appending these schemas and routes:

```ts
const rankingQuerySchema = z.object({
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

statsRouter.get("/distributions", requireAdmin, async (request, response) => {
  const parsed = trendQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  response.json(await statsService.getDistributions(parsed.data));
});

statsRouter.get("/rankings", requireAdmin, async (request, response) => {
  const parsed = rankingQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  response.json(await statsService.getRankings(parsed.data));
});
```

- [ ] **Step 6: Update the smoke script to verify response bodies and run verification**

Replace the added assertions in `apps/api/src/scripts/test_stats_internal_routes.ts` with:

```ts
    const distributions = await fetch(
      `http://127.0.0.1:${address.port}/api/stats/distributions?startAt=2026-01-01T00:00:00.000Z&endAt=2026-12-31T23:59:59.000Z`
    );
    assert.equal(distributions.status, 200);
    const distributionsBody = await distributions.json();
    assert.equal(Array.isArray(distributionsBody.channelViews.items), true);

    const rankings = await fetch(
      `http://127.0.0.1:${address.port}/api/stats/rankings?startAt=2026-01-01T00:00:00.000Z&endAt=2026-12-31T23:59:59.000Z&limit=5`
    );
    assert.equal(rankings.status, 200);
    const rankingsBody = await rankings.json();
    assert.equal(Array.isArray(rankingsBody.topArticles.items), true);
    assert.equal(Array.isArray(rankingsBody.topChannels.items), true);
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

### Task 2: Add Admin Time-Range State And Client API Extensions

**Files:**
- Modify: `apps/web/src/services/api.ts`
- Modify: `apps/web/src/views/AdminPage.vue`

- [ ] **Step 1: Add failing frontend build pressure by referencing missing helpers**

Modify `apps/web/src/views/AdminPage.vue` imports and state declarations to reference new API methods and dashboard data:

```ts
import {
  getStatsDistributions,
  getStatsOverview,
  getStatsRankings,
  getStatsTrends,
  type StatsDistributionsResponse,
  type StatsOverviewResponse,
  type StatsRankingsResponse,
  type StatsTrendItem,
} from "../services/api";

const statsRange = ref<"today" | "last7days" | "last30days">("today");
const statsTrendItems = ref<StatsTrendItem[]>([]);
const statsDistributions = ref<StatsDistributionsResponse | null>(null);
const statsRankings = ref<StatsRankingsResponse | null>(null);
```

- [ ] **Step 2: Run the web build to confirm the new API surface does not exist yet**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/web run build
```

Expected:

```text
error TS2305: Module '"../services/api"' has no exported member 'getStatsTrends'
```

- [ ] **Step 3: Add the shared request/response types and request helpers**

Modify `apps/web/src/services/api.ts` by appending these types and methods after `getStatsOverview`:

```ts
export interface StatsTrendItem {
  date: string;
  pv: number;
  uv: number;
  articleViews: number;
}

export interface StatsDistributionsResponse {
  channelViews: { items: Array<{ key: string; label: string; value: number }> };
  channelPublishes: { items: Array<{ key: string; label: string; value: number }> };
  channelPushes: { items: Array<{ key: string; label: string; value: number }> };
  feedbackTypes: { items: Array<{ key: string; label: string; value: number }> };
}

export interface StatsRankingsResponse {
  topArticles: {
    items: Array<{
      articleId: string;
      title: string;
      channelCode: string;
      channelName: string;
      viewCount: number;
    }>;
  };
  topChannels: {
    items: Array<{
      channelCode: string;
      channelName: string;
      viewCount: number;
    }>;
  };
}

export const getStatsTrends = async (params: {
  startAt: string;
  endAt: string;
}): Promise<StatsTrendItem[]> => {
  const result = await request.get<{ items: StatsTrendItem[] }>("/stats/trends", { params });
  return result.data.items;
};

export const getStatsDistributions = async (params: {
  startAt: string;
  endAt: string;
}): Promise<StatsDistributionsResponse> => {
  const result = await request.get<StatsDistributionsResponse>("/stats/distributions", {
    params,
  });
  return result.data;
};

export const getStatsRankings = async (params: {
  startAt: string;
  endAt: string;
  limit?: number;
}): Promise<StatsRankingsResponse> => {
  const result = await request.get<StatsRankingsResponse>("/stats/rankings", { params });
  return result.data;
};
```

- [ ] **Step 4: Add the shared time-range resolution helper and stats loader**

Modify `apps/web/src/views/AdminPage.vue` by inserting these helpers near `loadStatsOverview`:

```ts
const resolveStatsRange = (
  value: "today" | "last7days" | "last30days"
): { startAt: string; endAt: string } => {
  const now = new Date();
  const endAt = now.toISOString();
  const chinaNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  const start = new Date(chinaNow);

  if (value === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (value === "last7days") {
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
  }

  return {
    startAt: new Date(start.getTime() - start.getTimezoneOffset() * 60000).toISOString(),
    endAt,
  };
};

const loadStatsDashboard = async (): Promise<void> => {
  const params = resolveStatsRange(statsRange.value);
  statsLoading.value = true;
  try {
    const [overview, trends, distributions, rankings] = await Promise.all([
      getStatsOverview(params),
      getStatsTrends(params),
      getStatsDistributions(params),
      getStatsRankings({ ...params, limit: 5 }),
    ]);
    statsOverview.value = overview;
    statsTrendItems.value = trends;
    statsDistributions.value = distributions;
    statsRankings.value = rankings;
  } finally {
    statsLoading.value = false;
  }
};
```

- [ ] **Step 5: Replace overview-only reloads with dashboard reloads and verify build**

Modify `onMounted`, article mutation success paths, and refresh actions to call `loadStatsDashboard()` instead of `loadStatsOverview()`.

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/web run build
```

Expected:

```text
> web@0.0.0 build
> vue-tsc -b && vite build
```

### Task 3: Render The Enhanced Dashboard And Final Verification

**Files:**
- Modify: `apps/web/src/views/AdminPage.vue`
- Modify: `apps/api/src/scripts/test_stats_internal_routes.ts`

- [ ] **Step 1: Add a failing API assertion for empty-safe ranking/distribution payloads**

Append these body checks in `apps/api/src/scripts/test_stats_internal_routes.ts` after parsing `distributionsBody` and `rankingsBody`:

```ts
    assert.equal("feedbackTypes" in distributionsBody, true);
    assert.equal("topArticles" in rankingsBody, true);
```

- [ ] **Step 2: Add the dashboard UI sections**

Modify `apps/web/src/views/AdminPage.vue` by appending these computed helpers near the other computed values:

```ts
const statsRangeOptions = [
  { label: "今天", value: "today" },
  { label: "近7天", value: "last7days" },
  { label: "近30天", value: "last30days" },
] as const;

const topChannelViews = computed(() => statsDistributions.value?.channelViews.items ?? []);
const topChannelPublishes = computed(() => statsDistributions.value?.channelPublishes.items ?? []);
const topChannelPushes = computed(() => statsDistributions.value?.channelPushes.items ?? []);
const topFeedbackTypes = computed(() => statsDistributions.value?.feedbackTypes.items ?? []);
const topArticles = computed(() => statsRankings.value?.topArticles.items ?? []);
const topChannels = computed(() => statsRankings.value?.topChannels.items ?? []);
```

Insert this block in the `AdminPage.vue` template after the existing overview cards and before the article editor panel:

```vue
<section v-if="!accessDenied" class="glass-panel rounded-3xl border p-6 md:p-8 shadow-sm">
  <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
    <div>
      <h2 class="text-lg font-semibold text-[#0f4069]">统计看板</h2>
      <p class="mt-1 text-sm text-[#4f6b8a]">按时间范围查看趋势、分布和热门排行</p>
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

  <div class="mt-6 grid gap-4 xl:grid-cols-2">
    <div class="rounded-2xl border border-[#d8edf9] bg-white/80 p-5">
      <h3 class="text-base font-semibold text-[#0f4069]">每日趋势</h3>
      <div v-if="statsTrendItems.length === 0" class="mt-4 text-sm text-[#6e89a3]">
        暂无统计数据
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

- [ ] **Step 3: Trigger stats reload on time-range changes**

Modify `apps/web/src/views/AdminPage.vue` by adding this watcher after `onMounted`:

```ts
watch(
  statsRange,
  async () => {
    if (accessDenied.value) {
      return;
    }
    await loadStatsDashboard();
  }
);
```

Also update the overview card section to show the additional metrics:

```vue
<div class="glass-panel rounded-2xl border p-5">
  <p class="text-sm text-[#4f6b8a]">文章浏览量</p>
  <p class="mt-2 text-2xl font-bold text-[#0f4069]">
    {{ statsLoading ? "--" : statsOverview?.articleViews ?? 0 }}
  </p>
</div>
<div class="glass-panel rounded-2xl border p-5">
  <p class="text-sm text-[#4f6b8a]">文章发布量</p>
  <p class="mt-2 text-2xl font-bold text-[#0f4069]">
    {{ statsLoading ? "--" : statsOverview?.articlesPublished ?? 0 }}
  </p>
</div>
<div class="glass-panel rounded-2xl border p-5">
  <p class="text-sm text-[#4f6b8a]">推送总量</p>
  <p class="mt-2 text-2xl font-bold text-[#0f4069]">
    {{ statsLoading ? "--" : statsOverview?.pushTotal ?? 0 }}
  </p>
</div>
<div class="glass-panel rounded-2xl border p-5">
  <p class="text-sm text-[#4f6b8a]">启用订阅数</p>
  <p class="mt-2 text-2xl font-bold text-[#0f4069]">
    {{ statsLoading ? "--" : statsOverview?.enabledSubscriptionCount ?? 0 }}
  </p>
</div>
```

- [ ] **Step 4: Run the final verification set**

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

Then manually verify:

```text
/admin can switch 今天、近7天、近30天 and updates overview, trends, distributions, and rankings without affecting the article management area.
```

## Self-Review

- Spec coverage: The plan covers time-range switching, internal distributions and rankings endpoints, client API extensions, admin dashboard rendering, empty states, and verification.
- Placeholder scan: No `TODO`, `TBD`, or deferred implementation notes remain.
- Type consistency: The plan consistently uses `getStatsDistributions`, `getStatsRankings`, `StatsDistributions`, `StatsRankings`, `today`, `last7days`, and `last30days`.
