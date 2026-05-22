# Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build analytics event collection, internal and external stats APIs, and an admin dashboard for `ai_web` without disrupting existing article, push, feedback, subscription, or page-agent flows.

**Architecture:** Add one new `analytics_events` table, record browser-only events from the web app, record trusted business events from existing backend success paths, then expose aggregated stats through a new `stats` module split into internal admin routes and external token-protected read-only routes. Keep analytics writes best-effort so failures only log and never block the main business action.

**Tech Stack:** Express 5, TypeScript, Vue 3, Axios, Zod, PostgreSQL, existing store/auth/env layers, `tsx` verification scripts, Markdown docs

---

## File Map

- Create: `apps/api/src/modules/stats/routes.ts`
- Create: `apps/api/src/modules/stats/service.ts`
- Create: `apps/api/src/scripts/test_stats_internal_routes.ts`
- Create: `apps/api/src/scripts/test_stats_external_routes.ts`
- Create: `apps/api/docs/stats_external_api.md`
- Create: `apps/api/docs/stats_api_ops.md`
- Modify: `apps/api/sql/001_init.sql`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/src/lib/store.ts`
- Modify: `apps/api/src/lib/types.ts`
- Modify: `apps/api/src/middleware/auth.ts`
- Modify: `apps/api/src/modules/articles/routes.ts`
- Modify: `apps/api/src/modules/feedback/routes.ts`
- Modify: `apps/api/src/modules/page_agent/routes.ts`
- Modify: `apps/api/src/modules/page_agent/service.ts`
- Modify: `apps/api/src/modules/push/service.ts`
- Modify: `apps/api/src/modules/subscriptions/routes.ts`
- Modify: `apps/web/src/router.ts`
- Modify: `apps/web/src/services/api.ts`
- Modify: `apps/web/src/views/AdminPage.vue`
- Modify: `apps/web/src/views/ArticleDetailPage.vue`

## Implementation Notes

- This workspace currently does not appear to be attached to a Git repository, so do not block implementation on commit steps.
- Follow the project’s existing validation pattern with `tsx` smoke scripts plus `npm run build` and `npm run typecheck`.
- Reuse the existing `requireAdminOrFeedbackReadToken` pattern to implement a dedicated `requireAdminOrStatsExternalReadToken` middleware rather than overloading `requireAdminOrInternalToken`.
- Keep high-cardinality dimensions in real columns and use `event_payload` only for low-frequency supporting fields.

### Task 1: Add Analytics Schema, Types, And Store Primitives

**Files:**
- Modify: `apps/api/sql/001_init.sql`
- Modify: `apps/api/src/lib/types.ts`
- Modify: `apps/api/src/lib/store.ts`
- Create: `apps/api/src/scripts/test_stats_internal_routes.ts`

- [ ] **Step 1: Write the failing internal stats smoke script**

Create `apps/api/src/scripts/test_stats_internal_routes.ts` with the first failing expectation for the missing internal route:

```ts
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";

import { app } from "../app";
import { closeDb, initDb } from "../lib/db";

const run = async (): Promise<void> => {
  await initDb();
  const server = app.listen(0);
  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/stats/overview`
    );
    assert.equal(response.status, 401);
  } finally {
    server.close();
    await closeDb();
  }
};

void run();
```

- [ ] **Step 2: Run the script to confirm the route is missing**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/api exec tsx src/scripts/test_stats_internal_routes.ts
```

Expected:

```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
404 !== 401
```

- [ ] **Step 3: Add analytics table and indexes to the SQL bootstrap**

Modify `apps/api/sql/001_init.sql` by inserting the analytics schema after `feedback_entries` and before the existing index block:

```sql
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(32) NOT NULL
    CHECK (event_type IN ('page', 'article', 'push', 'subscription', 'feedback', 'agent')),
  event_name VARCHAR(64) NOT NULL
    CHECK (
      event_name IN (
        'page_view',
        'article_view',
        'article_published',
        'push_sent',
        'push_failed',
        'subscription_updated',
        'feedback_created',
        'page_agent_conversation_created',
        'page_agent_message_created'
      )
    ),
  user_id VARCHAR(64),
  session_id VARCHAR(128),
  page_route VARCHAR(500),
  page_title VARCHAR(200),
  article_id UUID,
  channel_code VARCHAR(64),
  source_module VARCHAR(64) NOT NULL,
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_occurred_at
  ON analytics_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_name_occurred_at
  ON analytics_events(event_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_channel_occurred_at
  ON analytics_events(channel_code, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_article_occurred_at
  ON analytics_events(article_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_occurred_at
  ON analytics_events(user_id, occurred_at DESC);
```

- [ ] **Step 4: Add analytics domain types**

Modify `apps/api/src/lib/types.ts` by appending these definitions after `FeedbackEntry`:

```ts
export type AnalyticsEventType =
  | "page"
  | "article"
  | "push"
  | "subscription"
  | "feedback"
  | "agent";

export type AnalyticsEventName =
  | "page_view"
  | "article_view"
  | "article_published"
  | "push_sent"
  | "push_failed"
  | "subscription_updated"
  | "feedback_created"
  | "page_agent_conversation_created"
  | "page_agent_message_created";

export interface AnalyticsEvent {
  id: string;
  eventType: AnalyticsEventType;
  eventName: AnalyticsEventName;
  userId?: string;
  sessionId?: string;
  pageRoute?: string;
  pageTitle?: string;
  articleId?: string;
  channelCode?: string;
  sourceModule: string;
  eventPayload: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
}

export interface StatsOverview {
  pv: number;
  uv: number;
  articleViews: number;
  articlesPublished: number;
  pushTotal: number;
  pushSuccess: number;
  pushFailed: number;
  pushSuccessRate: number;
  feedbackCount: number;
  pageAgentConversationCount: number;
  pageAgentMessageCount: number;
  enabledSubscriptionCount: number;
}
```

- [ ] **Step 5: Add the analytics store create method and mapping**

Modify `apps/api/src/lib/store.ts` by adding the row mapper and new store export near the other store declarations:

```ts
interface AnalyticsEventRow {
  id: string;
  event_type: "page" | "article" | "push" | "subscription" | "feedback" | "agent";
  event_name:
    | "page_view"
    | "article_view"
    | "article_published"
    | "push_sent"
    | "push_failed"
    | "subscription_updated"
    | "feedback_created"
    | "page_agent_conversation_created"
    | "page_agent_message_created";
  user_id: string | null;
  session_id: string | null;
  page_route: string | null;
  page_title: string | null;
  article_id: string | null;
  channel_code: string | null;
  source_module: string;
  event_payload: Record<string, unknown> | null;
  occurred_at: string;
  created_at: string;
}

const mapAnalyticsEvent = (row: AnalyticsEventRow): AnalyticsEvent => ({
  id: row.id,
  eventType: row.event_type,
  eventName: row.event_name,
  userId: row.user_id ?? undefined,
  sessionId: row.session_id ?? undefined,
  pageRoute: row.page_route ?? undefined,
  pageTitle: row.page_title ?? undefined,
  articleId: row.article_id ?? undefined,
  channelCode: row.channel_code ?? undefined,
  sourceModule: row.source_module,
  eventPayload: row.event_payload ?? {},
  occurredAt: row.occurred_at,
  createdAt: row.created_at,
});

export const analyticsEventStore = {
  async create(input: {
    eventType: AnalyticsEvent["eventType"];
    eventName: AnalyticsEvent["eventName"];
    userId?: string;
    sessionId?: string;
    pageRoute?: string;
    pageTitle?: string;
    articleId?: string;
    channelCode?: string;
    sourceModule: string;
    eventPayload?: Record<string, unknown>;
    occurredAt?: string;
  }): Promise<AnalyticsEvent> {
    const result = await query<AnalyticsEventRow>(
      `
      INSERT INTO analytics_events (
        event_type,
        event_name,
        user_id,
        session_id,
        page_route,
        page_title,
        article_id,
        channel_code,
        source_module,
        event_payload,
        occurred_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
      RETURNING *
      `,
      [
        input.eventType,
        input.eventName,
        input.userId ?? null,
        input.sessionId ?? null,
        input.pageRoute ?? null,
        input.pageTitle ?? null,
        input.articleId ?? null,
        input.channelCode ?? null,
        input.sourceModule,
        JSON.stringify(input.eventPayload ?? {}),
        input.occurredAt ?? new Date().toISOString(),
      ]
    );
    return mapAnalyticsEvent(result.rows[0]);
  },
};
```

- [ ] **Step 6: Run the API build to verify the new schema and types compile**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/api run build
```

Expected:

```text
> api@1.0.0 build
> tsc -p tsconfig.json
```

### Task 2: Add Analytics Config, Auth Guard, And External Route Smoke Coverage

**Files:**
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/src/middleware/auth.ts`
- Create: `apps/api/src/scripts/test_stats_external_routes.ts`

- [ ] **Step 1: Write the failing external stats smoke script**

Create `apps/api/src/scripts/test_stats_external_routes.ts`:

```ts
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";

import { app } from "../app";
import { closeDb, initDb } from "../lib/db";

const run = async (): Promise<void> => {
  await initDb();
  const server = app.listen(0);
  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/stats/external/overview`
    );
    assert.equal(response.status, 401);
  } finally {
    server.close();
    await closeDb();
  }
};

void run();
```

- [ ] **Step 2: Run the script to confirm the external route is missing**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/api exec tsx src/scripts/test_stats_external_routes.ts
```

Expected:

```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
404 !== 401
```

- [ ] **Step 3: Add the external stats token to env**

Modify `apps/api/src/config/env.ts` by appending one new field near `feedbackExternalReadToken`:

```ts
  statsExternalReadToken: process.env.STATS_EXTERNAL_READ_TOKEN ?? "",
```

- [ ] **Step 4: Add a dedicated external stats auth middleware**

Modify `apps/api/src/middleware/auth.ts` by appending this middleware after `requireAdminOrFeedbackReadToken`:

```ts
export const requireAdminOrStatsExternalReadToken = (
  request: Request,
  response: Response,
  next: NextFunction
): void => {
  const user = getRequestUser(request);
  if (user?.role === "admin") {
    next();
    return;
  }

  const requestToken = extractInternalAuthToken(request);
  if (!requestToken) {
    response.status(401).json({ message: "未登录，且缺少统计读取令牌" });
    return;
  }

  if (!env.statsExternalReadToken || requestToken !== env.statsExternalReadToken) {
    response.status(403).json({ message: "统计读取令牌无效" });
    return;
  }

  next();
};
```

- [ ] **Step 5: Expand the external smoke script to assert unauthorized and forbidden behavior**

Replace `apps/api/src/scripts/test_stats_external_routes.ts` with:

```ts
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";

import { app } from "../app";
import { env } from "../config/env";
import { closeDb, initDb } from "../lib/db";

const run = async (): Promise<void> => {
  env.statsExternalReadToken = "stats-read-token";
  env.devAuthBypass = false;

  await initDb();
  const server = app.listen(0);
  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}/api/stats/external/overview`;

    const unauthorized = await fetch(baseUrl);
    assert.equal(unauthorized.status, 401);

    const forbidden = await fetch(baseUrl, {
      headers: {
        "x-internal-auth-token": "wrong-token",
      },
    });
    assert.equal(forbidden.status, 403);
  } finally {
    server.close();
    await closeDb();
  }
};

void run();
```

- [ ] **Step 6: Re-run the script and confirm it still fails because the route is not mounted yet**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/api exec tsx src/scripts/test_stats_external_routes.ts
```

Expected:

```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
404 !== 401
```

### Task 3: Add Stats Aggregation Service And Internal/External Stats Routes

**Files:**
- Create: `apps/api/src/modules/stats/routes.ts`
- Create: `apps/api/src/modules/stats/service.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/lib/store.ts`
- Modify: `apps/api/src/scripts/test_stats_internal_routes.ts`
- Modify: `apps/api/src/scripts/test_stats_external_routes.ts`

- [ ] **Step 1: Expand the internal smoke script to define overview expectations**

Replace `apps/api/src/scripts/test_stats_internal_routes.ts` with:

```ts
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";

import { app } from "../app";
import { closeDb, initDb } from "../lib/db";
import { analyticsEventStore, subscriptionStore } from "../lib/store";

const run = async (): Promise<void> => {
  await initDb();

  await analyticsEventStore.create({
    eventType: "page",
    eventName: "page_view",
    userId: "u-1",
    pageRoute: "/",
    pageTitle: "AI徐医",
    sourceModule: "test",
  });
  await analyticsEventStore.create({
    eventType: "article",
    eventName: "article_view",
    userId: "u-1",
    articleId: "00000000-0000-0000-0000-000000000001",
    channelCode: "daily-ai-summary",
    sourceModule: "test",
  });
  await analyticsEventStore.create({
    eventType: "feedback",
    eventName: "feedback_created",
    userId: "u-1",
    sourceModule: "test",
  });
  await subscriptionStore.upsertByUser("u-1", {
    channelCodes: ["daily-ai-summary"],
    categories: ["每日AI摘要"],
    frequency: "daily",
    qywxUserId: "u-1",
    qywxUserName: "User 1",
    enabled: true,
  });

  const server = app.listen(0);
  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/stats/overview`
    );
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.pv >= 1, true);
    assert.equal(body.uv >= 1, true);
    assert.equal(body.articleViews >= 1, true);
    assert.equal(body.feedbackCount >= 1, true);
    assert.equal(body.enabledSubscriptionCount >= 1, true);
  } finally {
    server.close();
    await closeDb();
  }
};

void run();
```

- [ ] **Step 2: Expand the external smoke script to define success expectations**

Replace `apps/api/src/scripts/test_stats_external_routes.ts` with:

```ts
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";

import { app } from "../app";
import { env } from "../config/env";
import { closeDb, initDb } from "../lib/db";
import { analyticsEventStore } from "../lib/store";

const run = async (): Promise<void> => {
  env.statsExternalReadToken = "stats-read-token";
  env.devAuthBypass = false;

  await initDb();
  await analyticsEventStore.create({
    eventType: "page",
    eventName: "page_view",
    userId: "u-2",
    pageRoute: "/",
    pageTitle: "AI徐医",
    sourceModule: "test",
  });

  const server = app.listen(0);
  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}/api/stats/external/overview`;

    const unauthorized = await fetch(baseUrl);
    assert.equal(unauthorized.status, 401);

    const forbidden = await fetch(baseUrl, {
      headers: {
        "x-internal-auth-token": "wrong-token",
      },
    });
    assert.equal(forbidden.status, 403);

    const success = await fetch(baseUrl, {
      headers: {
        "x-internal-auth-token": "stats-read-token",
      },
    });
    assert.equal(success.status, 200);

    const body = await success.json();
    assert.equal(body.pv >= 1, true);
    assert.equal(body.generatedAt.length > 0, true);
    assert.equal("enabledSubscriptionCount" in body, false);
  } finally {
    server.close();
    await closeDb();
  }
};

void run();
```

- [ ] **Step 3: Add aggregate query helpers to `analyticsEventStore`**

Modify `apps/api/src/lib/store.ts` by appending these methods inside `analyticsEventStore`:

```ts
  async countByEventName(input: {
    eventName: AnalyticsEvent["eventName"];
    startAt?: string;
    endAt?: string;
    channelCode?: string;
  }): Promise<number> {
    const values: unknown[] = [input.eventName];
    const conditions = ["event_name = $1"];
    if (input.startAt) {
      values.push(input.startAt);
      conditions.push(`occurred_at >= $${values.length}::timestamptz`);
    }
    if (input.endAt) {
      values.push(input.endAt);
      conditions.push(`occurred_at <= $${values.length}::timestamptz`);
    }
    if (input.channelCode) {
      values.push(input.channelCode);
      conditions.push(`channel_code = $${values.length}`);
    }
    const result = await query<{ total: string }>(
      `
      SELECT COUNT(*)::text AS total
      FROM analytics_events
      WHERE ${conditions.join(" AND ")}
      `,
      values
    );
    return Number(result.rows[0]?.total ?? 0);
  },

  async countDistinctUsers(input: {
    startAt?: string;
    endAt?: string;
    channelCode?: string;
  }): Promise<number> {
    const values: unknown[] = [];
    const conditions = ["user_id IS NOT NULL"];
    if (input.startAt) {
      values.push(input.startAt);
      conditions.push(`occurred_at >= $${values.length}::timestamptz`);
    }
    if (input.endAt) {
      values.push(input.endAt);
      conditions.push(`occurred_at <= $${values.length}::timestamptz`);
    }
    if (input.channelCode) {
      values.push(input.channelCode);
      conditions.push(`channel_code = $${values.length}`);
    }
    const result = await query<{ total: string }>(
      `
      SELECT COUNT(DISTINCT user_id)::text AS total
      FROM analytics_events
      WHERE ${conditions.join(" AND ")}
      `,
      values
    );
    return Number(result.rows[0]?.total ?? 0);
  },
```

- [ ] **Step 4: Create the stats service**

Create `apps/api/src/modules/stats/service.ts`:

```ts
import { analyticsEventStore, query, subscriptionStore } from "../../lib/store";
import { StatsOverview } from "../../lib/types";

const toPercent = (success: number, total: number): number =>
  total === 0 ? 0 : Number(((success / total) * 100).toFixed(2));

const countEnabledSubscriptions = async (): Promise<number> => {
  const result = await query<{ total: string }>(
    `
    SELECT COUNT(*)::text AS total
    FROM subscriptions
    WHERE enabled = TRUE
    `
  );
  return Number(result.rows[0]?.total ?? 0);
};

export const statsService = {
  async getOverview(input: {
    startAt?: string;
    endAt?: string;
    channelCode?: string;
  }): Promise<StatsOverview> {
    const [pv, uv, articleViews, articlesPublished, pushSuccess, pushFailed, feedbackCount] =
      await Promise.all([
        analyticsEventStore.countByEventName({
          eventName: "page_view",
          startAt: input.startAt,
          endAt: input.endAt,
          channelCode: input.channelCode,
        }),
        analyticsEventStore.countDistinctUsers(input),
        analyticsEventStore.countByEventName({
          eventName: "article_view",
          startAt: input.startAt,
          endAt: input.endAt,
          channelCode: input.channelCode,
        }),
        analyticsEventStore.countByEventName({
          eventName: "article_published",
          startAt: input.startAt,
          endAt: input.endAt,
          channelCode: input.channelCode,
        }),
        analyticsEventStore.countByEventName({
          eventName: "push_sent",
          startAt: input.startAt,
          endAt: input.endAt,
          channelCode: input.channelCode,
        }),
        analyticsEventStore.countByEventName({
          eventName: "push_failed",
          startAt: input.startAt,
          endAt: input.endAt,
          channelCode: input.channelCode,
        }),
        analyticsEventStore.countByEventName({
          eventName: "feedback_created",
          startAt: input.startAt,
          endAt: input.endAt,
        }),
      ]);

    const pushTotal = pushSuccess + pushFailed;
    return {
      pv,
      uv,
      articleViews,
      articlesPublished,
      pushTotal,
      pushSuccess,
      pushFailed,
      pushSuccessRate: toPercent(pushSuccess, pushTotal),
      feedbackCount,
      pageAgentConversationCount: await analyticsEventStore.countByEventName({
        eventName: "page_agent_conversation_created",
        startAt: input.startAt,
        endAt: input.endAt,
      }),
      pageAgentMessageCount: await analyticsEventStore.countByEventName({
        eventName: "page_agent_message_created",
        startAt: input.startAt,
        endAt: input.endAt,
      }),
      enabledSubscriptionCount: await countEnabledSubscriptions(),
    };
  },
};
```

- [ ] **Step 5: Create the stats routes and mount them**

Create `apps/api/src/modules/stats/routes.ts`:

```ts
import { Router } from "express";
import { z } from "zod";

import { requireAdmin, requireAdminOrStatsExternalReadToken } from "../../middleware/auth";
import { statsService } from "./service";

const overviewQuerySchema = z.object({
  startAt: z.string().datetime({ offset: true }).optional(),
  endAt: z.string().datetime({ offset: true }).optional(),
  channelCode: z.string().trim().min(1).optional(),
});

export const statsRouter = Router();

statsRouter.get("/overview", requireAdmin, async (request, response) => {
  const parsed = overviewQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const summary = await statsService.getOverview(parsed.data);
  response.json(summary);
});

statsRouter.get("/external/overview", requireAdminOrStatsExternalReadToken, async (request, response) => {
  const parsed = overviewQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const summary = await statsService.getOverview(parsed.data);
  response.json({
    pv: summary.pv,
    uv: summary.uv,
    articleViews: summary.articleViews,
    articlesPublished: summary.articlesPublished,
    pushTotal: summary.pushTotal,
    pushSuccess: summary.pushSuccess,
    pushFailed: summary.pushFailed,
    pushSuccessRate: summary.pushSuccessRate,
    feedbackCount: summary.feedbackCount,
    pageAgentConversationCount: summary.pageAgentConversationCount,
    pageAgentMessageCount: summary.pageAgentMessageCount,
    generatedAt: new Date().toISOString(),
  });
});
```

Modify `apps/api/src/app.ts`:

```ts
import { statsRouter } from "./modules/stats/routes";

app.use("/api/stats", statsRouter);
```

- [ ] **Step 6: Run both smoke scripts and the API build**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/api exec tsx src/scripts/test_stats_internal_routes.ts
npm --prefix /opt/idapps/ai_web/apps/api exec tsx src/scripts/test_stats_external_routes.ts
npm --prefix /opt/idapps/ai_web/apps/api run build
```

Expected:

```text
[no output from the two scripts]
> api@1.0.0 build
> tsc -p tsconfig.json
```

### Task 4: Add Backend Analytics Recording For Existing Business Flows

**Files:**
- Modify: `apps/api/src/modules/articles/routes.ts`
- Modify: `apps/api/src/modules/subscriptions/routes.ts`
- Modify: `apps/api/src/modules/feedback/routes.ts`
- Modify: `apps/api/src/modules/page_agent/routes.ts`
- Modify: `apps/api/src/modules/page_agent/service.ts`
- Modify: `apps/api/src/modules/push/service.ts`
- Modify: `apps/api/src/lib/store.ts`

- [ ] **Step 1: Add a best-effort analytics recorder helper**

Modify `apps/api/src/lib/store.ts` by appending a helper export after `analyticsEventStore`:

```ts
export const recordAnalyticsEventSafely = async (input: {
  eventType: AnalyticsEvent["eventType"];
  eventName: AnalyticsEvent["eventName"];
  userId?: string;
  sessionId?: string;
  pageRoute?: string;
  pageTitle?: string;
  articleId?: string;
  channelCode?: string;
  sourceModule: string;
  eventPayload?: Record<string, unknown>;
}): Promise<void> => {
  try {
    await analyticsEventStore.create(input);
  } catch (error) {
    logger.error("analytics.event.write.failed", {
      eventType: input.eventType,
      eventName: input.eventName,
      sourceModule: input.sourceModule,
      userId: input.userId,
      articleId: input.articleId,
      channelCode: input.channelCode,
      error,
    });
  }
};
```

- [ ] **Step 2: Record article, subscription, and feedback events**

Modify the success paths in the route files with these snippets:

In `apps/api/src/modules/articles/routes.ts` after published article creation and publish transition:

```ts
  if (item.status === "published") {
    await recordAnalyticsEventSafely({
      eventType: "article",
      eventName: "article_published",
      userId: item.createdByUserId,
      articleId: item.id,
      channelCode: item.channelCode,
      sourceModule: "articles.routes",
      eventPayload: {
        status: item.status,
      },
    });
  }
```

In `apps/api/src/modules/subscriptions/routes.ts` after `subscriptionStore.upsertByUser(...)`:

```ts
  await recordAnalyticsEventSafely({
    eventType: "subscription",
    eventName: "subscription_updated",
    userId: sessionUser.id,
    sourceModule: "subscriptions.routes",
    eventPayload: {
      frequency: parsed.data.frequency,
      enabled: parsed.data.enabled,
      channelCodes: parsed.data.channelCodes,
    },
  });
```

In `apps/api/src/modules/feedback/routes.ts` after feedback creation:

```ts
  await recordAnalyticsEventSafely({
    eventType: "feedback",
    eventName: "feedback_created",
    userId,
    pageRoute: parsed.data.pageRoute,
    pageTitle: parsed.data.pageTitle,
    sourceModule: "feedback.routes",
    eventPayload: {
      type: parsed.data.type,
      source: "web_feedback",
    },
  });
```

- [ ] **Step 3: Record page-agent and push events**

Modify the existing success paths with these snippets:

In `apps/api/src/modules/page_agent/routes.ts` after conversation creation:

```ts
  await recordAnalyticsEventSafely({
    eventType: "agent",
    eventName: "page_agent_conversation_created",
    userId,
    pageRoute: conversation.route,
    pageTitle: conversation.pageTitle,
    sourceModule: "page_agent.routes",
    eventPayload: {
      pageType: conversation.pageType,
      conversationId: conversation.id,
    },
  });
```

In `apps/api/src/modules/page_agent/service.ts` immediately after user and assistant message persistence:

```ts
  await recordAnalyticsEventSafely({
    eventType: "agent",
    eventName: "page_agent_message_created",
    userId,
    pageRoute: input.route,
    pageTitle: input.pageTitle,
    sourceModule: "page_agent.service",
    eventPayload: {
      conversationId: input.conversationId,
      role: "user",
      messageType: "question",
    },
  });
```

```ts
  await recordAnalyticsEventSafely({
    eventType: "agent",
    eventName: "page_agent_message_created",
    userId,
    pageRoute: input.route,
    pageTitle: input.pageTitle,
    sourceModule: "page_agent.service",
    eventPayload: {
      conversationId: input.conversationId,
      role: "assistant",
      messageType: "answer",
    },
  });
```

In `apps/api/src/modules/push/service.ts` after `pushRecordStore.markSuccess(...)` and `pushRecordStore.markFailed(...)`:

```ts
    await recordAnalyticsEventSafely({
      eventType: "push",
      eventName: "push_sent",
      userId: input.subscription.userId,
      articleId: input.article.id,
      channelCode: input.article.channelCode,
      sourceModule: "push.service",
      eventPayload: {
        recordId: record.id,
        deliveryMode: input.deliveryMode ?? "user",
      },
    });
```

```ts
    await recordAnalyticsEventSafely({
      eventType: "push",
      eventName: "push_failed",
      userId: input.subscription.userId,
      articleId: input.article.id,
      channelCode: input.article.channelCode,
      sourceModule: "push.service",
      eventPayload: {
        recordId: record.id,
        deliveryMode: input.deliveryMode ?? "user",
        errorMessage: getErrorMessage(error),
      },
    });
```

- [ ] **Step 4: Run typecheck to catch signature mismatches in all touched flows**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/api run typecheck
```

Expected:

```text
> api@1.0.0 typecheck
> tsc -p tsconfig.json --noEmit
```

### Task 5: Add Browser Event Tracking And Client API Helpers

**Files:**
- Modify: `apps/web/src/services/api.ts`
- Modify: `apps/web/src/router.ts`
- Modify: `apps/web/src/views/ArticleDetailPage.vue`

- [ ] **Step 1: Add the client-side analytics request helpers**

Modify `apps/web/src/services/api.ts` by appending these types and helpers near the existing API exports:

```ts
export interface StatsOverviewResponse {
  pv: number;
  uv: number;
  articleViews: number;
  articlesPublished: number;
  pushTotal: number;
  pushSuccess: number;
  pushFailed: number;
  pushSuccessRate: number;
  feedbackCount: number;
  pageAgentConversationCount: number;
  pageAgentMessageCount: number;
  enabledSubscriptionCount: number;
}

export const reportPageView = async (payload: {
  pageRoute: string;
  pageTitle: string;
}): Promise<void> => {
  await request.post("/stats/events/page-view", payload);
};

export const reportArticleView = async (payload: {
  articleId: string;
  channelCode: string;
  pageRoute: string;
  pageTitle: string;
}): Promise<void> => {
  await request.post("/stats/events/article-view", payload);
};

export const getStatsOverview = async (params?: {
  startAt?: string;
  endAt?: string;
  channelCode?: string;
}): Promise<StatsOverviewResponse> => {
  const result = await request.get<StatsOverviewResponse>("/stats/overview", { params });
  return result.data;
};
```

- [ ] **Step 2: Add backend endpoints for browser event reporting**

Modify `apps/api/src/modules/stats/routes.ts` by appending these routes:

```ts
const pageEventSchema = z.object({
  pageRoute: z.string().trim().min(1).max(500),
  pageTitle: z.string().trim().min(1).max(200),
});

const articleEventSchema = pageEventSchema.extend({
  articleId: z.uuid(),
  channelCode: z.string().trim().min(1).max(64),
});

statsRouter.post("/events/page-view", requireAuth, async (request, response) => {
  const parsed = pageEventSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const userId = request.session.user?.id;
  await recordAnalyticsEventSafely({
    eventType: "page",
    eventName: "page_view",
    userId,
    sessionId: request.sessionID,
    pageRoute: parsed.data.pageRoute,
    pageTitle: parsed.data.pageTitle,
    sourceModule: "stats.routes",
  });
  response.status(204).send();
});

statsRouter.post("/events/article-view", requireAuth, async (request, response) => {
  const parsed = articleEventSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const userId = request.session.user?.id;
  await recordAnalyticsEventSafely({
    eventType: "article",
    eventName: "article_view",
    userId,
    sessionId: request.sessionID,
    pageRoute: parsed.data.pageRoute,
    pageTitle: parsed.data.pageTitle,
    articleId: parsed.data.articleId,
    channelCode: parsed.data.channelCode,
    sourceModule: "stats.routes",
  });
  response.status(204).send();
});
```

- [ ] **Step 3: Report page and article views from the web app**

Modify `apps/web/src/router.ts`:

```ts
import { getCurrentUser, reportPageView } from "./services/api";

let lastTrackedRoute = "";

router.afterEach((to) => {
  const routeKey = to.fullPath;
  if (routeKey === lastTrackedRoute) {
    return;
  }
  lastTrackedRoute = routeKey;
  void reportPageView({
    pageRoute: to.fullPath,
    pageTitle: typeof to.meta.title === "string" ? to.meta.title : defaultTitle,
  }).catch(() => undefined);
});
```

Modify `apps/web/src/views/ArticleDetailPage.vue` after article data load success:

```ts
import { getArticle, reportArticleView } from "../services/api";

await reportArticleView({
  articleId: article.value.id,
  channelCode: article.value.channelCode,
  pageRoute: route.fullPath,
  pageTitle: article.value.title,
}).catch(() => undefined);
```

- [ ] **Step 4: Run frontend and backend type checks**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/api run typecheck
npm --prefix /opt/idapps/ai_web/apps/web run build
```

Expected:

```text
> api@1.0.0 typecheck
> tsc -p tsconfig.json --noEmit

> web@... build
> vite build
```

### Task 6: Add Admin Dashboard Overview Panel

**Files:**
- Modify: `apps/web/src/views/AdminPage.vue`
- Modify: `apps/web/src/services/api.ts`

- [ ] **Step 1: Add the dashboard state and loader to `AdminPage.vue`**

Modify `apps/web/src/views/AdminPage.vue` near the existing refs and mounted hook:

```ts
import { getStatsOverview } from "../services/api";

const statsLoading = ref(false);
const statsOverview = ref<StatsOverviewResponse | null>(null);

const loadStatsOverview = async (): Promise<void> => {
  statsLoading.value = true;
  try {
    statsOverview.value = await getStatsOverview();
  } finally {
    statsLoading.value = false;
  }
};
```

Update the mounted flow:

```ts
onMounted(async () => {
  const hasAccess = await checkAccess();
  if (hasAccess) {
    await Promise.all([loadChannels(), loadArticles(), loadStatsOverview()]);
  }
});
```

- [ ] **Step 2: Add a compact overview card section**

Insert this section near the top of the `AdminPage.vue` template after the access check block:

```vue
<section
  v-if="!accessDenied"
  class="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
>
  <div class="glass-panel rounded-2xl border p-5">
    <p class="text-sm text-[#4f6b8a]">页面浏览量</p>
    <p class="mt-2 text-2xl font-bold text-[#0f4069]">
      {{ statsLoading ? "--" : statsOverview?.pv ?? 0 }}
    </p>
  </div>
  <div class="glass-panel rounded-2xl border p-5">
    <p class="text-sm text-[#4f6b8a]">访问用户数</p>
    <p class="mt-2 text-2xl font-bold text-[#0f4069]">
      {{ statsLoading ? "--" : statsOverview?.uv ?? 0 }}
    </p>
  </div>
  <div class="glass-panel rounded-2xl border p-5">
    <p class="text-sm text-[#4f6b8a]">推送成功率</p>
    <p class="mt-2 text-2xl font-bold text-[#0f4069]">
      {{ statsLoading ? "--" : `${statsOverview?.pushSuccessRate ?? 0}%` }}
    </p>
  </div>
  <div class="glass-panel rounded-2xl border p-5">
    <p class="text-sm text-[#4f6b8a]">反馈提交量</p>
    <p class="mt-2 text-2xl font-bold text-[#0f4069]">
      {{ statsLoading ? "--" : statsOverview?.feedbackCount ?? 0 }}
    </p>
  </div>
</section>
```

- [ ] **Step 3: Refresh the dashboard after article mutations**

Modify the success paths in `submit`, `toggleArticleStatus`, and `removeArticle` to reload the overview after content changes:

```ts
    await Promise.all([loadArticles(), loadStatsOverview()]);
```

- [ ] **Step 4: Build the web app and manually inspect the dashboard page**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/web run build
```

Expected:

```text
> web@... build
> vite build
```

Then manually verify in the browser:

```text
/admin shows four overview cards with non-breaking empty-state values.
```

### Task 7: Add Trends, External Docs, And Final Verification

**Files:**
- Modify: `apps/api/src/modules/stats/service.ts`
- Modify: `apps/api/src/modules/stats/routes.ts`
- Create: `apps/api/docs/stats_external_api.md`
- Create: `apps/api/docs/stats_api_ops.md`
- Modify: `apps/api/src/scripts/test_stats_internal_routes.ts`
- Modify: `apps/api/src/scripts/test_stats_external_routes.ts`

- [ ] **Step 1: Add trend and ranking service methods**

Modify `apps/api/src/modules/stats/service.ts` by appending these minimal first-pass methods:

```ts
  async getDailyTrend(input: {
    startAt: string;
    endAt: string;
  }): Promise<Array<{ date: string; pv: number; uv: number; articleViews: number }>> {
    return analyticsEventStore.listDailyTrend(input);
  },
```

Modify `apps/api/src/lib/store.ts` by appending a daily trend query:

```ts
  async listDailyTrend(input: {
    startAt: string;
    endAt: string;
  }): Promise<Array<{ date: string; pv: number; uv: number; articleViews: number }>> {
    const result = await query<{
      date: string;
      pv: string;
      uv: string;
      article_views: string;
    }>(
      `
      SELECT
        to_char(date_trunc('day', occurred_at AT TIME ZONE 'Asia/Shanghai'), 'YYYY-MM-DD') AS date,
        COUNT(*) FILTER (WHERE event_name = 'page_view')::text AS pv,
        COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'page_view' AND user_id IS NOT NULL)::text AS uv,
        COUNT(*) FILTER (WHERE event_name = 'article_view')::text AS article_views
      FROM analytics_events
      WHERE occurred_at >= $1::timestamptz
        AND occurred_at <= $2::timestamptz
      GROUP BY 1
      ORDER BY 1 ASC
      `,
      [input.startAt, input.endAt]
    );
    return result.rows.map((row) => ({
      date: row.date,
      pv: Number(row.pv),
      uv: Number(row.uv),
      articleViews: Number(row.article_views),
    }));
  },
```

- [ ] **Step 2: Add the `trends` route for both internal and external access**

Modify `apps/api/src/modules/stats/routes.ts`:

```ts
const trendQuerySchema = z.object({
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
});

statsRouter.get("/trends", requireAdmin, async (request, response) => {
  const parsed = trendQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  response.json({
    items: await statsService.getDailyTrend(parsed.data),
  });
});

statsRouter.get("/external/trends", requireAdminOrStatsExternalReadToken, async (request, response) => {
  const parsed = trendQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  response.json({
    items: await statsService.getDailyTrend(parsed.data),
    generatedAt: new Date().toISOString(),
  });
});
```

- [ ] **Step 3: Update the smoke scripts to cover the new trend route**

Append these assertions in both route scripts:

```ts
    const trends = await fetch(
      `http://127.0.0.1:${address.port}/api/stats/trends?startAt=2026-01-01T00:00:00.000Z&endAt=2026-12-31T23:59:59.000Z`
    );
    assert.equal(trends.status, 200);
```

```ts
    const trends = await fetch(
      `http://127.0.0.1:${address.port}/api/stats/external/trends?startAt=2026-01-01T00:00:00.000Z&endAt=2026-12-31T23:59:59.000Z`,
      {
        headers: {
          "x-internal-auth-token": "stats-read-token",
        },
      }
    );
    assert.equal(trends.status, 200);
```

- [ ] **Step 4: Write the caller and ops docs**

Create `apps/api/docs/stats_external_api.md`:

```md
# 统计外部读取接口文档

## 接口地址

- `GET /api/stats/external/overview`
- `GET /api/stats/external/trends`

## 鉴权方式

```bash
STATS_EXTERNAL_READ_TOKEN=<your-token>
```

请求头支持：

```bash
x-internal-auth-token: <token>
```

或：

```bash
Authorization: Bearer <token>
```

## overview 查询参数

- `startAt`：可选，ISO 时间
- `endAt`：可选，ISO 时间
- `channelCode`：可选，栏目编码

## trends 查询参数

- `startAt`：必填，ISO 时间
- `endAt`：必填，ISO 时间

## 返回示例

```json
{
  "pv": 10,
  "uv": 3,
  "articleViews": 5,
  "articlesPublished": 2,
  "pushTotal": 4,
  "pushSuccess": 3,
  "pushFailed": 1,
  "pushSuccessRate": 75,
  "feedbackCount": 1,
  "pageAgentConversationCount": 2,
  "pageAgentMessageCount": 6,
  "generatedAt": "2026-05-18T08:00:00.000Z"
}
```
```

Create `apps/api/docs/stats_api_ops.md`:

```md
# 统计内部接口说明

## 管理接口

- `GET /api/stats/overview`
- `GET /api/stats/trends`

## 鉴权

- 仅管理员可访问

## 用途

- 管理页概览卡片
- 管理页趋势图
- 运维排障和对账
```

- [ ] **Step 5: Run final verification**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/api exec tsx src/scripts/test_stats_internal_routes.ts
npm --prefix /opt/idapps/ai_web/apps/api exec tsx src/scripts/test_stats_external_routes.ts
npm --prefix /opt/idapps/ai_web/apps/api run build
npm --prefix /opt/idapps/ai_web/apps/api run typecheck
npm --prefix /opt/idapps/ai_web/apps/web run build
```

Expected:

```text
[no output from the two scripts]
> api@1.0.0 build
> tsc -p tsconfig.json
> api@1.0.0 typecheck
> tsc -p tsconfig.json --noEmit
> web@... build
> vite build
```

## Self-Review

- Spec coverage: The plan covers analytics schema, browser event reporting, backend event recording, internal stats APIs, external token-protected stats APIs, admin dashboard updates, and internal/external docs.
- Placeholder scan: No `TODO`, `TBD`, or vague “handle appropriately” instructions remain.
- Type consistency: The plan consistently uses `analytics_events`, `/api/stats/*`, `/api/stats/external/*`, `STATS_EXTERNAL_READ_TOKEN`, `requireAdminOrStatsExternalReadToken`, and `recordAnalyticsEventSafely`.
