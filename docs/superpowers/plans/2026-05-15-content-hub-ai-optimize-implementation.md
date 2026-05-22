# Content Hub AI Optimize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single `AI 优化建议` action in Content Hub that generates title, summary, channel, and formatted-content suggestions, previews them, and applies them only after explicit user confirmation.

**Architecture:** The backend exposes one aggregated `/api/articles/ai-optimize` endpoint backed by a focused service that calls the existing LLM provider once and returns a structured suggestion object. The frontend keeps current form fields as the source of truth and stores AI suggestions in a separate preview state until the user clicks apply.

**Tech Stack:** Vue 3, TypeScript, Axios, Express 5, Zod, existing DeepSeek/AiXy integration, existing Content Hub `AdminPage.vue`

---

## File Map

- Create: `apps/api/src/modules/articles/ai_optimize_service.ts`
- Create: `apps/api/src/scripts/test_article_ai_optimize_flow.ts`
- Modify: `apps/api/src/modules/articles/routes.ts`
- Modify: `apps/web/src/services/api.ts`
- Modify: `apps/web/src/views/AdminPage.vue`

### Task 1: Add Aggregated Backend AI Optimize Endpoint

**Files:**
- Create: `apps/api/src/modules/articles/ai_optimize_service.ts`
- Create: `apps/api/src/scripts/test_article_ai_optimize_flow.ts`
- Modify: `apps/api/src/modules/articles/routes.ts`

- [ ] **Step 1: Write the failing API flow script**

Create `apps/api/src/scripts/test_article_ai_optimize_flow.ts`:

```ts
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import axios from "axios";

import { env } from "../config/env";
import { app } from "../app";
import { initDb, closeDb } from "../lib/db";

const run = async (): Promise<void> => {
  env.devAuthBypass = true;
  process.env.DEEPSEEK_API_BASE_URL = "http://127.0.0.1:65535/mock";

  const originalPost = axios.post;
  axios.post = (async (url, body, config) => {
    if (String(url).includes("/v1/chat/completions")) {
      return {
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  suggestedTitle: "医学 AI 诊断应用观察",
                  suggestedSummary: "文章概括了医学 AI 在诊断场景中的进展、价值与落地重点。",
                  suggestedChannelCode: "medical-frontier",
                  optimizedContent: "## 应用进展\n\n**医学 AI** 正在推动诊断效率提升。\n\n## 实践重点\n\n需要同步关注数据治理与落地规范。",
                  notes: "已补齐小标题并优化段落结构",
                }),
              },
            },
          ],
        },
      } as Awaited<ReturnType<typeof axios.post>>;
    }
    return originalPost(url, body, config);
  }) as typeof axios.post;

  await initDb();
  const server = app.listen(0);
  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/api/articles/ai-optimize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "手工整理稿",
        content: "医学 AI 正在用于影像识别、风险预测和诊断支持，但原稿结构比较松散。",
        summary: "",
        channelCode: "",
        originalUrl: "https://example.com/manual",
      }),
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.suggestedChannelCode, "medical-frontier");
    assert.match(result.optimizedContent, /## 应用进展/);
  } finally {
    axios.post = originalPost;
    server.close();
    await closeDb();
  }
};

void run();
```

- [ ] **Step 2: Run the script and confirm it fails before the route exists**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/api exec tsx src/scripts/test_article_ai_optimize_flow.ts
```

Expected:

```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
404 !== 200
```

- [ ] **Step 3: Implement the optimize service and route**

Create `apps/api/src/modules/articles/ai_optimize_service.ts`:

```ts
import axios from "axios";

import { env } from "../../config/env";
import { logger } from "../../lib/logger";

export interface ArticleAiOptimizeInput {
  title?: string;
  content: string;
  summary?: string;
  channelCode?: string;
  originalUrl?: string;
  requestUserId?: string;
}

export interface ArticleAiOptimizeResult {
  suggestedTitle?: string;
  suggestedSummary?: string;
  suggestedChannelCode?: string;
  optimizedContent?: string;
  notes?: string;
}

const cleanThinkContent = (content: unknown): string => {
  const normalized = String(content ?? "");
  return normalized.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
};

export const optimizeArticleDraft = async (
  input: ArticleAiOptimizeInput
): Promise<ArticleAiOptimizeResult> => {
  logger.info("article.ai_optimize.start", {
    userId: input.requestUserId,
    channelCode: input.channelCode || "",
    contentLength: input.content.length,
  });

  const response = await axios.post(
    `${env.deepseekApiBaseUrl}/v1/chat/completions`,
    {
      model: env.deepseekModel,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "你是内容中枢编辑助手。输出 JSON，字段仅包含 suggestedTitle、suggestedSummary、suggestedChannelCode、optimizedContent、notes。",
        },
        {
          role: "user",
          content: JSON.stringify(input),
        },
      ],
    },
    {
      headers: env.deepseekApiKey ? { Authorization: `Bearer ${env.deepseekApiKey}` } : undefined,
      timeout: 60000,
    }
  );

  const raw = cleanThinkContent(response.data?.choices?.[0]?.message?.content);
  const parsed = JSON.parse(raw) as ArticleAiOptimizeResult;
  logger.info("article.ai_optimize.success", {
    userId: input.requestUserId,
    suggestedChannelCode: parsed.suggestedChannelCode || "",
    optimizedContentLength: parsed.optimizedContent?.length ?? 0,
  });
  return parsed;
};
```

Modify `apps/api/src/modules/articles/routes.ts`:

```ts
import { optimizeArticleDraft } from "./ai_optimize_service";

const aiOptimizeSchema = z.object({
  title: z.string().trim().max(180).optional(),
  content: z.string().trim().min(1),
  summary: z.string().trim().max(400).optional(),
  channelCode: z.string().trim().max(64).optional(),
  originalUrl: z.string().trim().url().max(1000).optional().or(z.literal("")),
});

articleRouter.post("/ai-optimize", requireContentHubOperator, async (request, response) => {
  const parsed = aiOptimizeSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  try {
    const result = await optimizeArticleDraft({
      ...parsed.data,
      originalUrl: parsed.data.originalUrl || undefined,
      requestUserId: request.session.user?.id,
    });
    response.json(result);
  } catch (error) {
    logger.error("article.ai_optimize.failed", {
      userId: request.session.user?.id,
      channelCode: parsed.data.channelCode,
      contentLength: parsed.data.content.length,
      error,
    });
    response.status(502).json({ message: "AI 优化失败，请重试" });
  }
});
```

- [ ] **Step 4: Run build and flow verification**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/api run build
npm --prefix /opt/idapps/ai_web/apps/api exec tsx src/scripts/test_article_ai_optimize_flow.ts
```

Expected:

```text
The TypeScript build succeeds and the flow script exits without assertion errors.
```

- [ ] **Step 5: Commit**

Run:

```bash
git -C /opt/idapps/ai_web status || true
git -C /opt/idapps/ai_web add apps/api/src/modules/articles/ai_optimize_service.ts apps/api/src/modules/articles/routes.ts apps/api/src/scripts/test_article_ai_optimize_flow.ts
git -C /opt/idapps/ai_web commit -m "feat: add article ai optimize api" || true
```

Expected:

```text
If Git is available, a commit named "feat: add article ai optimize api" is created. If the workspace is not a Git repository, the shell reports that state and continues.
```

### Task 2: Add Preview State And Apply Flow In Content Hub

**Files:**
- Modify: `apps/web/src/services/api.ts`
- Modify: `apps/web/src/views/AdminPage.vue`

- [ ] **Step 1: Add the web API types before wiring the page**

Modify `apps/web/src/services/api.ts`:

```ts
export interface ArticleAiOptimizePayload {
  title?: string;
  content: string;
  summary?: string;
  channelCode?: string;
  originalUrl?: string;
}

export interface ArticleAiOptimizeResult {
  suggestedTitle?: string;
  suggestedSummary?: string;
  suggestedChannelCode?: string;
  optimizedContent?: string;
  notes?: string;
}

export const optimizeArticleDraftByAi = async (
  payload: ArticleAiOptimizePayload
): Promise<ArticleAiOptimizeResult> => {
  const result = await request.post<ArticleAiOptimizeResult>("/articles/ai-optimize", payload);
  return result.data;
};
```

- [ ] **Step 2: Introduce separate preview state in `AdminPage.vue`**

Modify the imports and reactive state:

```ts
import {
  createArticle,
  deleteArticle,
  extractArticleFromUrl,
  getCurrentUser,
  listArticles,
  listChannels,
  optimizeArticleDraftByAi,
  summarizeByAiXy,
  updateArticle,
  type Article,
  type ArticleAiOptimizeResult,
  type Channel,
} from "../services/api";

const aiPreview = ref<ArticleAiOptimizeResult | null>(null);
const loadingAiOptimize = ref(false);

const canOptimizeContent = computed(() => content.value.trim().length > 0);
```

Add the request and apply handlers:

```ts
const handleAiOptimize = async (): Promise<void> => {
  if (!content.value.trim()) {
    return;
  }
  loadingAiOptimize.value = true;
  try {
    aiPreview.value = await optimizeArticleDraftByAi({
      title: title.value.trim() || undefined,
      content: content.value,
      summary: summary.value.trim() || undefined,
      channelCode: channelCode.value || undefined,
      originalUrl: originalUrl.value.trim() || undefined,
    });
  } catch (error: any) {
    message.value = error.response?.data?.message || "AI 优化失败，请重试";
    setTimeout(() => (message.value = ""), 3000);
  } finally {
    loadingAiOptimize.value = false;
  }
};

const applyAiPreview = (): void => {
  if (!aiPreview.value) {
    return;
  }
  if (aiPreview.value.suggestedTitle) title.value = aiPreview.value.suggestedTitle;
  if (aiPreview.value.suggestedSummary) summary.value = aiPreview.value.suggestedSummary;
  if (aiPreview.value.suggestedChannelCode) channelCode.value = aiPreview.value.suggestedChannelCode;
  if (aiPreview.value.optimizedContent) content.value = aiPreview.value.optimizedContent;
  aiPreview.value = null;
};

const dismissAiPreview = (): void => {
  aiPreview.value = null;
};
```

- [ ] **Step 3: Render the button and preview block without replacing the existing publish actions**

Insert a new secondary action near the edit form:

```vue
<button
  v-if="canOptimizeContent"
  type="button"
  class="w-full btn-secondary py-3"
  :disabled="loadingAiOptimize || loadingSave || loadingExtract"
  @click="handleAiOptimize"
>
  {{ loadingAiOptimize ? "优化中..." : "AI 优化建议" }}
</button>
```

Render the preview panel in `AdminPage.vue`:

```vue
<section
  v-if="aiPreview"
  class="glass-panel rounded-3xl border border-[#b3e5fc] p-6 shadow-sm"
>
  <div class="flex items-center justify-between gap-3">
    <h3 class="text-lg font-semibold text-[#0f4069]">AI 优化预览</h3>
    <span class="text-xs text-[#6e89a3]">{{ aiPreview.notes || "请确认后再应用到表单" }}</span>
  </div>

  <div class="mt-4 space-y-4 text-sm text-[#355878]">
    <div v-if="aiPreview.suggestedTitle">
      <p class="mb-1 text-xs text-[#6e89a3]">建议标题</p>
      <p class="rounded-2xl bg-white/80 px-4 py-3">{{ aiPreview.suggestedTitle }}</p>
    </div>
    <div v-if="aiPreview.suggestedSummary">
      <p class="mb-1 text-xs text-[#6e89a3]">建议摘要</p>
      <p class="rounded-2xl bg-white/80 px-4 py-3">{{ aiPreview.suggestedSummary }}</p>
    </div>
    <div v-if="aiPreview.suggestedChannelCode">
      <p class="mb-1 text-xs text-[#6e89a3]">建议栏目</p>
      <p class="rounded-2xl bg-white/80 px-4 py-3">{{ resolveChannelName(aiPreview.suggestedChannelCode) }}</p>
    </div>
    <div v-if="aiPreview.optimizedContent">
      <p class="mb-1 text-xs text-[#6e89a3]">优化后正文</p>
      <textarea
        :value="aiPreview.optimizedContent"
        readonly
        rows="12"
        class="w-full rounded-2xl border border-[#d8edf9] bg-white/80 p-4"
      ></textarea>
    </div>
  </div>

  <div class="mt-5 flex justify-end gap-3">
    <button type="button" class="btn-secondary" @click="dismissAiPreview">取消</button>
    <button type="button" class="btn-primary" @click="applyAiPreview">应用到表单</button>
  </div>
</section>
```

- [ ] **Step 4: Build and manually verify the preview flow**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/web run build
```

Expected:

```text
vue-tsc -b && vite build
```

Then manually verify:

```text
1. 正文为空时不显示“AI 优化建议”按钮。
2. 正文有内容时显示按钮。
3. 点击后先出现预览，不直接覆盖标题/摘要/栏目/正文。
4. 点击“应用到表单”后才更新表单值。
5. 点击“取消”或请求失败时，原表单保持不变。
```

- [ ] **Step 5: Commit**

Run:

```bash
git -C /opt/idapps/ai_web status || true
git -C /opt/idapps/ai_web add apps/web/src/services/api.ts apps/web/src/views/AdminPage.vue
git -C /opt/idapps/ai_web commit -m "feat: add content hub ai preview flow" || true
```

Expected:

```text
If Git is available, a commit named "feat: add content hub ai preview flow" is created. If the workspace is not a Git repository, the shell reports that state and continues.
```

## Self-Review

- **Spec coverage:** The plan covers the single-button trigger, aggregated backend response, preview-before-apply behavior, and non-destructive failure handling.
- **Placeholder scan:** All tasks include explicit file paths, code, and commands; no open placeholders remain.
- **Type consistency:** The same suggestion field names are used end-to-end: `suggestedTitle`, `suggestedSummary`, `suggestedChannelCode`, `optimizedContent`, `notes`.
