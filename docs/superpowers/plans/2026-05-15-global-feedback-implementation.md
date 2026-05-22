# Global Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a global right-side feedback entry with a lightweight modal, a persisted backend feedback API, and traceable logs.

**Architecture:** The backend gets a dedicated `feedback` module, typed store access, and a new `feedback_entries` table persisted in Postgres. The frontend keeps the interaction lightweight by rendering a right-edge label and modal inside `App.vue`, while `services/api.ts` exposes a single typed submit method.

**Tech Stack:** Vue 3, TypeScript, Axios, Express 5, Zod, PostgreSQL, existing custom logger/store layer

---

## File Map

- Create: `apps/api/src/modules/feedback/routes.ts`
- Create: `apps/api/src/scripts/test_feedback_routes.ts`
- Create: `apps/web/src/components/FeedbackPanel.vue`
- Modify: `apps/api/sql/001_init.sql`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/lib/db.ts`
- Modify: `apps/api/src/lib/store.ts`
- Modify: `apps/api/src/lib/types.ts`
- Modify: `apps/web/src/App.vue`
- Modify: `apps/web/src/services/api.ts`

### Task 1: Persist Feedback And Expose API

**Files:**
- Create: `apps/api/src/modules/feedback/routes.ts`
- Create: `apps/api/src/scripts/test_feedback_routes.ts`
- Modify: `apps/api/sql/001_init.sql`
- Modify: `apps/api/src/lib/db.ts`
- Modify: `apps/api/src/lib/store.ts`
- Modify: `apps/api/src/lib/types.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write the failing API smoke test**

Create `apps/api/src/scripts/test_feedback_routes.ts`:

```ts
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";

import { env } from "../config/env";
import { app } from "../app";
import { initDb, closeDb } from "../lib/db";

const run = async (): Promise<void> => {
  env.devAuthBypass = true;
  await initDb();
  const server = app.listen(0);
  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}/api/feedback`;

    const createResponse = await fetch(baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "ux",
        content: "右侧反馈入口很好找，但希望提交成功后提示更轻一点。",
        contact: "tester@example.com",
        pageRoute: "/articles/mock-id",
        pageTitle: "文章详情",
      }),
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    assert.equal(created.type, "ux");
    assert.equal(created.pageRoute, "/articles/mock-id");

    const invalidResponse = await fetch(baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "ux",
        content: "",
        pageRoute: "/articles/mock-id",
        pageTitle: "文章详情",
      }),
    });
    assert.equal(invalidResponse.status, 400);
  } finally {
    server.close();
    await closeDb();
  }
};

void run();
```

- [ ] **Step 2: Run the test to confirm it fails**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/api exec tsx src/scripts/test_feedback_routes.ts
```

Expected:

```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
404 !== 201
```

- [ ] **Step 3: Add storage types, SQL schema, store methods, and feedback route**

Modify `apps/api/src/lib/types.ts` to add a dedicated feedback model:

```ts
export type FeedbackType = "bug" | "ux" | "content" | "other";

export interface FeedbackEntry {
  id: string;
  userId: string;
  type: FeedbackType;
  content: string;
  contact?: string;
  pageRoute: string;
  pageTitle: string;
  source: string;
  createdAt: string;
}
```

Append to both `apps/api/sql/001_init.sql` and `apps/api/src/lib/db.ts` schema SQL:

```sql
CREATE TABLE IF NOT EXISTS feedback_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(64) NOT NULL,
  type VARCHAR(32) NOT NULL CHECK (type IN ('bug', 'ux', 'content', 'other')),
  content TEXT NOT NULL,
  contact VARCHAR(255),
  page_route VARCHAR(500) NOT NULL,
  page_title VARCHAR(200) NOT NULL,
  source VARCHAR(64) NOT NULL DEFAULT 'web_feedback',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_entries_user_created_at
  ON feedback_entries(user_id, created_at DESC);
```

Add to `apps/api/src/lib/store.ts`:

```ts
interface FeedbackEntryRow {
  id: string;
  user_id: string;
  type: "bug" | "ux" | "content" | "other";
  content: string;
  contact: string | null;
  page_route: string;
  page_title: string;
  source: string;
  created_at: string;
}

const mapFeedbackEntry = (row: FeedbackEntryRow): FeedbackEntry => ({
  id: row.id,
  userId: row.user_id,
  type: row.type,
  content: row.content,
  contact: row.contact ?? undefined,
  pageRoute: row.page_route,
  pageTitle: row.page_title,
  source: row.source,
  createdAt: row.created_at,
});

export const feedbackStore = {
  async create(input: {
    userId: string;
    type: "bug" | "ux" | "content" | "other";
    content: string;
    contact?: string;
    pageRoute: string;
    pageTitle: string;
    source: string;
  }): Promise<FeedbackEntry> {
    const result = await query<FeedbackEntryRow>(
      `
      INSERT INTO feedback_entries (
        user_id, type, content, contact, page_route, page_title, source
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [
        input.userId,
        input.type,
        input.content,
        input.contact ?? null,
        input.pageRoute,
        input.pageTitle,
        input.source,
      ]
    );
    return mapFeedbackEntry(result.rows[0]);
  },
};
```

Create `apps/api/src/modules/feedback/routes.ts`:

```ts
import { Router } from "express";
import { z } from "zod";

import { logger } from "../../lib/logger";
import { feedbackStore } from "../../lib/store";
import { requireAuth } from "../../middleware/auth";

const createSchema = z.object({
  type: z.enum(["bug", "ux", "content", "other"]),
  content: z.string().trim().min(1).max(4000),
  contact: z.string().trim().max(255).optional(),
  pageRoute: z.string().trim().min(1).max(500),
  pageTitle: z.string().trim().min(1).max(200),
});

export const feedbackRouter = Router();

feedbackRouter.post("/", requireAuth, async (request, response) => {
  const parsed = createSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const userId = request.session.user?.id;
  if (!userId) {
    response.status(401).json({ message: "未登录" });
    return;
  }

  logger.info("feedback.submit.start", {
    userId,
    pageRoute: parsed.data.pageRoute,
    pageTitle: parsed.data.pageTitle,
    type: parsed.data.type,
    stage: "create",
  });

  try {
    const item = await feedbackStore.create({
      userId,
      type: parsed.data.type,
      content: parsed.data.content,
      contact: parsed.data.contact,
      pageRoute: parsed.data.pageRoute,
      pageTitle: parsed.data.pageTitle,
      source: "web_feedback",
    });
    logger.info("feedback.submit.success", {
      userId,
      feedbackId: item.id,
      pageRoute: item.pageRoute,
      type: item.type,
      stage: "create",
    });
    response.status(201).json(item);
  } catch (error) {
    logger.error("feedback.submit.failed", {
      userId,
      pageRoute: parsed.data.pageRoute,
      pageTitle: parsed.data.pageTitle,
      type: parsed.data.type,
      stage: "create",
      error,
    });
    response.status(500).json({ message: "反馈提交失败，请稍后重试" });
  }
});
```

Register the router in `apps/api/src/app.ts`:

```ts
import { feedbackRouter } from "./modules/feedback/routes";

app.use("/api/feedback", feedbackRouter);
```

- [ ] **Step 4: Run migration/build/test and verify success**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/api run db:migrate
npm --prefix /opt/idapps/ai_web/apps/api run build
npm --prefix /opt/idapps/ai_web/apps/api exec tsx src/scripts/test_feedback_routes.ts
```

Expected:

```text
数据库迁移完成
```

and the test script exits without assertion errors.

- [ ] **Step 5: Commit**

Run:

```bash
git -C /opt/idapps/ai_web status || true
git -C /opt/idapps/ai_web add apps/api/sql/001_init.sql apps/api/src/app.ts apps/api/src/lib/db.ts apps/api/src/lib/store.ts apps/api/src/lib/types.ts apps/api/src/modules/feedback/routes.ts apps/api/src/scripts/test_feedback_routes.ts
git -C /opt/idapps/ai_web commit -m "feat: add global feedback api" || true
```

Expected:

```text
If /opt/idapps/ai_web is not a Git repository, the first command reports that state and the add/commit commands are skipped by the shell. If Git is available, a commit named "feat: add global feedback api" is created.
```

### Task 2: Add Right-Side Entry And Feedback Modal

**Files:**
- Create: `apps/web/src/components/FeedbackPanel.vue`
- Modify: `apps/web/src/App.vue`
- Modify: `apps/web/src/services/api.ts`

- [ ] **Step 1: Add the typed web API contract first**

Modify `apps/web/src/services/api.ts`:

```ts
export interface FeedbackPayload {
  type: "bug" | "ux" | "content" | "other";
  content: string;
  contact?: string;
  pageRoute: string;
  pageTitle: string;
}

export const submitFeedback = async (payload: FeedbackPayload): Promise<void> => {
  await request.post("/feedback", payload);
};
```

- [ ] **Step 2: Build the modal component with local validation**

Create `apps/web/src/components/FeedbackPanel.vue`:

```vue
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { X } from "lucide-vue-next";

const props = defineProps<{
  visible: boolean;
  pageRoute: string;
  pageTitle: string;
  submitting: boolean;
}>();

const emit = defineEmits<{
  close: [];
  submit: [payload: { type: "bug" | "ux" | "content" | "other"; content: string; contact?: string }];
}>();

const type = ref<"bug" | "ux" | "content" | "other">("ux");
const content = ref("");
const contact = ref("");

const canSubmit = computed(() => content.value.trim().length > 0 && !props.submitting);

watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      type.value = "ux";
      content.value = "";
      contact.value = "";
    }
  }
);
</script>
```

Use a template with:

```vue
<div v-if="visible" class="fixed inset-0 z-[70] flex items-center justify-center bg-[#0f4069]/18 px-4">
  <section class="w-full max-w-lg rounded-3xl border border-[#b3e5fc] bg-white p-6 shadow-xl">
    <header class="mb-4 flex items-center justify-between">
      <h2 class="text-lg font-semibold text-[#0f4069]">意见反馈</h2>
      <button type="button" class="rounded-xl p-2 hover:bg-[#f3f8fc]" @click="emit('close')">
        <X class="h-4 w-4" />
      </button>
    </header>
    <select v-model="type" class="input-ai mb-3">
      <option value="bug">问题报错</option>
      <option value="ux">体验建议</option>
      <option value="content">内容建议</option>
      <option value="other">其他</option>
    </select>
    <textarea v-model="content" rows="6" class="input-ai mb-3" placeholder="请描述你的问题或建议"></textarea>
    <input v-model="contact" class="input-ai mb-4" placeholder="联系方式（选填）" />
    <div class="text-xs text-[#6e89a3]">当前页面：{{ pageTitle }}（{{ pageRoute }}）</div>
    <div class="mt-4 flex justify-end gap-3">
      <button type="button" class="btn-secondary" @click="emit('close')">取消</button>
      <button type="button" class="btn-primary" :disabled="!canSubmit" @click="emit('submit', { type, content, contact: contact || undefined })">提交</button>
    </div>
  </section>
</div>
```

- [ ] **Step 3: Wire the right-edge label and submit flow in `App.vue`**

Modify `apps/web/src/App.vue` to add state and handlers:

```ts
import FeedbackPanel from "./components/FeedbackPanel.vue";
import { submitFeedback } from "./services/api";

const feedbackOpen = ref(false);
const feedbackSubmitting = ref(false);
const appMessage = ref("");

const openFeedback = (): void => {
  feedbackOpen.value = true;
};

const handleFeedbackSubmit = async (payload: {
  type: "bug" | "ux" | "content" | "other";
  content: string;
  contact?: string;
}): Promise<void> => {
  feedbackSubmitting.value = true;
  try {
    await submitFeedback({
      ...payload,
      pageRoute: route.fullPath,
      pageTitle: document.title || route.name?.toString() || "当前页面",
    });
    appMessage.value = "反馈已提交，感谢你的建议";
    feedbackOpen.value = false;
  } catch {
    appMessage.value = "反馈提交失败，请稍后重试";
  } finally {
    feedbackSubmitting.value = false;
    window.setTimeout(() => {
      appMessage.value = "";
    }, 3000);
  }
};
```

Render the right-side entry and panel in the template:

```vue
<button
  type="button"
  class="fixed right-0 top-1/2 z-50 -translate-y-1/2 rounded-l-2xl border border-r-0 border-[#b3e5fc] bg-white/92 px-2 py-4 text-sm font-medium text-[#0f4069] shadow-[0_10px_24px_-18px_rgba(15,64,105,0.45)] transition-all duration-300 hover:-translate-x-1 hover:bg-white"
  style="writing-mode: vertical-rl; text-orientation: mixed;"
  @click="openFeedback"
>
  意见反馈
</button>

<FeedbackPanel
  :visible="feedbackOpen"
  :page-route="route.fullPath"
  :page-title="document.title || '当前页面'"
  :submitting="feedbackSubmitting"
  @close="feedbackOpen = false"
  @submit="handleFeedbackSubmit"
/>
```

- [ ] **Step 4: Build the web app and manually verify the flow**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/web run build
```

Expected:

```text
vue-tsc -b && vite build
```

and the build completes without TypeScript or Vite errors.

Then manually verify:

```text
1. 右侧出现窄标签“意见反馈”。
2. 点击后弹出表单。
3. 空反馈内容不能提交。
4. 提交成功后弹层关闭并显示轻提示。
5. 提交失败时保留用户输入。
```

- [ ] **Step 5: Commit**

Run:

```bash
git -C /opt/idapps/ai_web status || true
git -C /opt/idapps/ai_web add apps/web/src/App.vue apps/web/src/components/FeedbackPanel.vue apps/web/src/services/api.ts
git -C /opt/idapps/ai_web commit -m "feat: add global feedback entry" || true
```

Expected:

```text
If Git is available, a commit named "feat: add global feedback entry" is created. If the workspace is not a Git repository, the shell reports that state and continues.
```

## Self-Review

- **Spec coverage:** This plan covers the right-side narrow label, lightweight modal, feedback fields, server persistence, success/failure behavior, and audit logs.
- **Placeholder scan:** No `TODO`/`TBD` markers remain; each command and file path is explicit.
- **Type consistency:** Backend and frontend both use the same feedback field names: `type`, `content`, `contact`, `pageRoute`, `pageTitle`.
