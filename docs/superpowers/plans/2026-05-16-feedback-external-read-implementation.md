# Feedback External Read Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a token-protected external feedback read API with basic filters, pagination, and a practical usage document for third-party callers.

**Architecture:** Keep the feature inside the existing `feedback` module by adding one read-only `GET /api/feedback/external` route, a focused store query, and a dedicated auth guard that accepts either admin sessions or a dedicated external-read token. Validate behavior with one smoke script that exercises unauthorized, forbidden, and successful filtered reads, then publish a concise Markdown API document for callers.

**Tech Stack:** Express 5, TypeScript, Zod, PostgreSQL, existing store/auth/env layers, tsx script validation, Markdown docs

---

## File Map

- Create: `apps/api/src/scripts/test_feedback_external_routes.ts`
- Create: `apps/api/docs/feedback_external_api.md`
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/src/lib/store.ts`
- Modify: `apps/api/src/middleware/auth.ts`
- Modify: `apps/api/src/modules/feedback/routes.ts`

### Task 1: Add External Read Config And Auth Guard

**Files:**
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/src/middleware/auth.ts`

- [ ] **Step 1: Write the failing auth smoke case in the route script**

Create `apps/api/src/scripts/test_feedback_external_routes.ts` with an unauthorized expectation before any implementation:

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
      `http://127.0.0.1:${address.port}/api/feedback/external`
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
npm --prefix /opt/idapps/ai_web/apps/api exec tsx src/scripts/test_feedback_external_routes.ts
```

Expected:

```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
404 !== 401
```

- [ ] **Step 3: Add the dedicated environment variable**

Modify `apps/api/src/config/env.ts` by appending one new config field near other auth-related env values:

```ts
  feedbackExternalReadToken: process.env.FEEDBACK_EXTERNAL_READ_TOKEN ?? "",
```

- [ ] **Step 4: Add a dedicated feedback read auth middleware**

Modify `apps/api/src/middleware/auth.ts` by adding a focused middleware after `requireAdminOrInternalToken`:

```ts
export const requireAdminOrFeedbackReadToken = (
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
    response.status(401).json({ message: "未登录，且缺少反馈读取令牌" });
    return;
  }

  if (!env.feedbackExternalReadToken || requestToken !== env.feedbackExternalReadToken) {
    response.status(403).json({ message: "反馈读取令牌无效" });
    return;
  }

  next();
};
```

- [ ] **Step 5: Re-run the script and confirm it still fails on the missing route**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/api exec tsx src/scripts/test_feedback_external_routes.ts
```

Expected:

```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
404 !== 401
```

### Task 2: Add Filtered Feedback Query And External Route

**Files:**
- Modify: `apps/api/src/lib/store.ts`
- Modify: `apps/api/src/modules/feedback/routes.ts`
- Modify: `apps/api/src/scripts/test_feedback_external_routes.ts`

- [ ] **Step 1: Expand the smoke script to define the full expected behavior**

Replace `apps/api/src/scripts/test_feedback_external_routes.ts` with:

```ts
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";

import { app } from "../app";
import { env } from "../config/env";
import { closeDb, initDb } from "../lib/db";
import { feedbackStore } from "../lib/store";

const run = async (): Promise<void> => {
  env.feedbackExternalReadToken = "feedback-read-token";
  env.devAuthBypass = false;

  await initDb();

  await feedbackStore.create({
    userId: "tester-1",
    type: "ux",
    content: "希望右侧反馈入口成功提示更轻一些。",
    contact: "tester@example.com",
    pageRoute: "/articles/alpha",
    pageTitle: "文章详情",
    source: "web_feedback",
  });

  await feedbackStore.create({
    userId: "tester-2",
    type: "bug",
    content: "列表页翻页时有短暂闪烁。",
    contact: "ops@example.com",
    pageRoute: "/articles/beta",
    pageTitle: "列表页",
    source: "web_feedback",
  });

  const server = app.listen(0);
  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}/api/feedback/external`;

    const unauthorized = await fetch(baseUrl);
    assert.equal(unauthorized.status, 401);

    const forbidden = await fetch(baseUrl, {
      headers: {
        "x-internal-auth-token": "wrong-token",
      },
    });
    assert.equal(forbidden.status, 403);

    const success = await fetch(`${baseUrl}?type=ux&page=1&pageSize=10`, {
      headers: {
        "x-internal-auth-token": "feedback-read-token",
      },
    });
    assert.equal(success.status, 200);

    const body = await success.json();
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].type, "ux");
    assert.equal(body.items[0].contact, "tester@example.com");
    assert.equal(body.pagination.page, 1);
    assert.equal(body.pagination.pageSize, 10);
    assert.ok(body.pagination.total >= 1);
  } finally {
    server.close();
    await closeDb();
  }
};

void run();
```

- [ ] **Step 2: Run the script to confirm the new assertions fail**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/api exec tsx src/scripts/test_feedback_external_routes.ts
```

Expected:

```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
404 !== 401
```

- [ ] **Step 3: Add the filtered store query**

Modify `apps/api/src/lib/store.ts` by adding the filter types and list method next to the existing `feedbackStore.create()` logic:

```ts
interface FeedbackListFilters {
  type?: FeedbackType;
  startAt?: string;
  endAt?: string;
  page: number;
  pageSize: number;
}

interface FeedbackListResult {
  items: FeedbackEntry[];
  total: number;
}

  async list(filters: FeedbackListFilters): Promise<FeedbackListResult> {
    const conditions: string[] = [];
    const values: Array<string | number> = [];

    if (filters.type) {
      values.push(filters.type);
      conditions.push(`type = $${values.length}`);
    }
    if (filters.startAt) {
      values.push(filters.startAt);
      conditions.push(`created_at >= $${values.length}::timestamptz`);
    }
    if (filters.endAt) {
      values.push(filters.endAt);
      conditions.push(`created_at <= $${values.length}::timestamptz`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (filters.page - 1) * filters.pageSize;

    values.push(filters.pageSize);
    const limitPlaceholder = `$${values.length}`;
    values.push(offset);
    const offsetPlaceholder = `$${values.length}`;

    const itemsResult = await query<FeedbackEntryRow>(
      `
      SELECT id, user_id, type, content, contact, page_route, page_title, source, created_at
      FROM feedback_entries
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limitPlaceholder}
      OFFSET ${offsetPlaceholder}
      `,
      values
    );

    const countValues = values.slice(0, values.length - 2);
    const countResult = await query<{ total: string }>(
      `
      SELECT COUNT(*)::text AS total
      FROM feedback_entries
      ${whereClause}
      `,
      countValues
    );

    return {
      items: itemsResult.rows.map(mapFeedbackEntry),
      total: Number(countResult.rows[0]?.total ?? 0),
    };
  },
```

- [ ] **Step 4: Add the external route with query validation and logging**

Modify `apps/api/src/modules/feedback/routes.ts`:

```ts
import { requireAdminOrFeedbackReadToken, requireAuth } from "../../middleware/auth";

const listSchema = z.object({
  type: z.enum(["bug", "ux", "content", "other"]).optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

feedbackRouter.get(
  "/external",
  requireAdminOrFeedbackReadToken,
  async (request, response) => {
    const parsed = listSchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
      return;
    }

    logger.info("feedback.external.read.start", {
      type: parsed.data.type,
      startAt: parsed.data.startAt,
      endAt: parsed.data.endAt,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      stage: "list",
    });

    try {
      const result = await feedbackStore.list(parsed.data);
      logger.info("feedback.external.read.success", {
        type: parsed.data.type,
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
      logger.error("feedback.external.read.failed", {
        type: parsed.data.type,
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        stage: "list",
        error,
      });
      response.status(500).json({ message: "反馈查询失败" });
    }
  }
);
```

- [ ] **Step 5: Run the script and confirm it passes**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/api exec tsx src/scripts/test_feedback_external_routes.ts
```

Expected:

```text
[no output]
```

- [ ] **Step 6: Run the API build**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/api run build
```

Expected:

```text
> api@... build
> tsc -p tsconfig.json
```

### Task 3: Publish External API Usage Document

**Files:**
- Create: `apps/api/docs/feedback_external_api.md`

- [ ] **Step 1: Write the caller-facing API document**

Create `apps/api/docs/feedback_external_api.md`:

```md
# 用户反馈外部读取接口文档

## 接口地址

- `GET /api/feedback/external`

## 鉴权方式

请求头支持两种写法：

```bash
x-internal-auth-token: <token>
```

或：

```bash
Authorization: Bearer <token>
```

环境变量：

```bash
FEEDBACK_EXTERNAL_READ_TOKEN=<your-token>
```

## 查询参数

- `type`：可选，`bug | ux | content | other`
- `startAt`：可选，ISO 时间字符串
- `endAt`：可选，ISO 时间字符串
- `page`：可选，默认 `1`
- `pageSize`：可选，默认 `20`，最大 `100`

## 返回示例

```json
{
  "items": [
    {
      "id": "uuid",
      "type": "ux",
      "content": "希望右侧反馈入口成功提示更轻一些。",
      "contact": "tester@example.com",
      "pageRoute": "/articles/alpha",
      "pageTitle": "文章详情",
      "source": "web_feedback",
      "createdAt": "2026-05-16T08:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1
  }
}
```

## 错误码

- `400`：参数错误
- `401`：缺少反馈读取令牌
- `403`：反馈读取令牌无效
- `500`：反馈查询失败

## curl 示例

```bash
curl --request GET \
  --url 'http://localhost:3000/api/feedback/external?type=ux&page=1&pageSize=20' \
  --header 'x-internal-auth-token: <token>'
```
```

- [ ] **Step 2: Verify the doc reads cleanly**

Read:

```bash
sed -n '1,220p' /opt/idapps/ai_web/apps/api/docs/feedback_external_api.md
```

Expected:

```text
# 用户反馈外部读取接口文档
```

### Task 4: Final Verification And Delivery

**Files:**
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/src/lib/store.ts`
- Modify: `apps/api/src/middleware/auth.ts`
- Modify: `apps/api/src/modules/feedback/routes.ts`
- Create: `apps/api/src/scripts/test_feedback_external_routes.ts`
- Create: `apps/api/docs/feedback_external_api.md`

- [ ] **Step 1: Check diagnostics for the edited files**

Check:

```text
file:///opt/idapps/ai_web/apps/api/src/config/env.ts
file:///opt/idapps/ai_web/apps/api/src/lib/store.ts
file:///opt/idapps/ai_web/apps/api/src/middleware/auth.ts
file:///opt/idapps/ai_web/apps/api/src/modules/feedback/routes.ts
file:///opt/idapps/ai_web/apps/api/src/scripts/test_feedback_external_routes.ts
file:///opt/idapps/ai_web/apps/api/docs/feedback_external_api.md
```

Expected:

```text
No new diagnostics in the edited files.
```

- [ ] **Step 2: Generate a delivery token**

Run:

```bash
python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(32))
PY
```

Expected:

```text
<generated token>
```

- [ ] **Step 3: Prepare the handoff summary**

Include in the final handoff:

```text
1. Edited files list
2. Validation commands that passed
3. The generated FEEDBACK_EXTERNAL_READ_TOKEN value
4. The doc path apps/api/docs/feedback_external_api.md
5. A curl example that uses the generated token
```

## Self-Review

- Spec coverage: The plan covers the dedicated route, external token auth, basic filters, pagination, caller docs, and token delivery.
- Placeholder scan: No `TODO`, `TBD`, or vague “handle appropriately” instructions remain.
- Type consistency: The route, auth middleware, store query, doc, and delivery token all use the same `FEEDBACK_EXTERNAL_READ_TOKEN` name and `GET /api/feedback/external` path.
