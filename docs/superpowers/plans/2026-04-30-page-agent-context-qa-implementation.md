# Page Agent Context QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `ai_web` 落地第一阶段 page agent 页面上下文问答能力，实现全站入口、页面上下文上传、DeepSeek 主问答链路、站内检索补充与来源链接返回。

**Architecture:** 前端统一入口负责采集当前页面的结构化上下文并调用新的业务问答接口；后端新增 `page-agent` 模块负责请求校验、页面分流、站内文章检索、DeepSeek 编排和日志记录。保留现有 `page-agent` 兼容接口不作为主链路，新的实现优先通过显式的业务接口交付可控能力。

**Tech Stack:** Vue 3、TypeScript、Express、Zod、Axios、PostgreSQL、DeepSeek Chat Completions、现有 Session 鉴权

---

## 文件结构

### 后端新增

- `apps/api/src/modules/page_agent/routes.ts`
  - Page Agent 业务接口路由，挂载 `POST /api/page-agent/qa`
- `apps/api/src/modules/page_agent/service.ts`
  - 问答编排主逻辑，负责页面分流、站内检索、调用 DeepSeek
- `apps/api/src/modules/page_agent/types.ts`
  - Page Context、请求体、响应体的类型定义
- `apps/api/src/modules/page_agent/prompts.ts`
  - DeepSeek 系统提示词与消息拼装
- `apps/api/src/scripts/test_page_agent_flow.ts`
  - 轻量脚本测试页面上下文问答服务

### 后端修改

- `apps/api/src/app.ts`
  - 注册新的 `pageAgentRouter`
- `apps/api/src/lib/store.ts`
  - 为站内检索补充一个受限的文章搜索方法
- `apps/api/src/lib/types.ts`
  - 增加后端侧 Page Agent 相关类型
- `apps/api/src/config/env.ts`
  - 仅在需要时补充 Page Agent 相关环境变量读取；若不新增变量则不改

### 前端新增

- `apps/web/src/page_agent/types.ts`
  - 前端 Page Context 与 API 响应类型
- `apps/web/src/page_agent/context.ts`
  - 根据路由和页面数据构建统一 Page Context
- `apps/web/src/components/PageAgentPanel.vue`
  - 自定义问答面板
- `apps/web/src/components/PageAgentLauncher.vue`
  - 全站统一入口按钮

### 前端修改

- `apps/web/src/services/api.ts`
  - 增加 `askPageAgent()` 请求方法
- `apps/web/src/App.vue`
  - 从第三方 `page-agent` 面板切换到自定义入口和面板
- `apps/web/src/views/ArticleDetailPage.vue`
  - 暴露详情页上下文给 Page Agent
- `apps/web/src/views/ArticlesPage.vue`
  - 暴露列表页上下文给 Page Agent
- `apps/web/src/views/SubscriptionPage.vue`
  - 暴露订阅页上下文给 Page Agent
- `apps/web/src/views/AdminPage.vue`
  - 暴露内容中枢页上下文给 Page Agent

### 测试与验证

- `apps/api/src/scripts/test_page_agent_flow.ts`
- 可能复用现有前端构建检查命令

## 任务拆分

### Task 1: 定义后端 Page Agent 类型与提示词

**Files:**
- Create: `apps/api/src/modules/page_agent/types.ts`
- Create: `apps/api/src/modules/page_agent/prompts.ts`
- Modify: `apps/api/src/lib/types.ts`

- [ ] **Step 1: 写出后端类型定义**

```ts
export type PageType = "article_detail" | "article_list" | "subscription" | "admin";

export interface PageAgentRequestBody {
  question: string;
  pageType: PageType;
  route: string;
  pageTitle: string;
  selectionText?: string;
  context: Record<string, unknown>;
}

export interface PageAgentSource {
  type: "current_page" | "article";
  title: string;
  url: string;
  articleId?: string;
  originalUrl?: string;
  summary?: string;
}

export interface PageAgentResponse {
  answer: string;
  sources: PageAgentSource[];
  meta: {
    usedCurrentPage: boolean;
    usedSiteSearch: boolean;
    model: string;
  };
}
```

- [ ] **Step 2: 在共享类型文件补充导出**

```ts
export type PageAgentPageType =
  | "article_detail"
  | "article_list"
  | "subscription"
  | "admin";
```

- [ ] **Step 3: 写出提示词拼装函数**

```ts
import { PageAgentRequestBody, PageAgentSource } from "./types";

export const buildPageAgentSystemPrompt = (): string => `
你是 AI徐医 站内页面问答助手。
规则：
- 优先根据当前页面信息回答。
- 当前页面不足时，才可参考站内检索结果。
- 不得编造文章标题、站内链接、原文链接、页面状态、用户配置。
- 若无法确认，请明确说当前页面和站内结果无法确认。
- 回答简洁清楚，适合教师、学生和管理人员理解。
`;

export const buildPageAgentUserPrompt = (
  input: PageAgentRequestBody,
  searchSources: PageAgentSource[]
): string => JSON.stringify(
  {
    question: input.question,
    pageType: input.pageType,
    route: input.route,
    pageTitle: input.pageTitle,
    selectionText: input.selectionText ?? "",
    context: input.context,
    searchSources,
  },
  null,
  2
);
```

- [ ] **Step 4: 运行类型检查前的基础验证**

Run: `sed -n '1,200p' /opt/idapps/ai_web/apps/api/src/modules/page_agent/types.ts`
Expected: 输出新建的类型定义，无空文件

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/page_agent/types.ts apps/api/src/modules/page_agent/prompts.ts apps/api/src/lib/types.ts
git commit -m "feat: add page agent backend types"
```

### Task 2: 实现后端站内检索与问答编排服务

**Files:**
- Create: `apps/api/src/modules/page_agent/service.ts`
- Modify: `apps/api/src/lib/store.ts`

- [ ] **Step 1: 为文章存储增加受限搜索方法**

```ts
async searchPublished(input: {
  keyword?: string;
  channelCode?: string;
  limit: number;
}): Promise<Article[]> {
  const values: unknown[] = ["published"];
  const conditions = ["articles.status = $1"];
  if (input.channelCode) {
    values.push(input.channelCode);
    conditions.push(`articles.channel_code = $${values.length}`);
  }
  if (input.keyword) {
    values.push(`%${input.keyword}%`);
    conditions.push(
      `(articles.title ILIKE $${values.length} OR articles.summary ILIKE $${values.length} OR articles.content ILIKE $${values.length})`
    );
  }
  values.push(Math.max(1, Math.min(input.limit, 5)));
  const result = await query<ArticleRow>(
    `
    SELECT
      articles.id,
      articles.created_by_user_id,
      articles.title,
      articles.summary,
      articles.content,
      articles.original_url,
      articles.channel_code,
      channels.name AS channel_name,
      articles.category,
      articles.tags,
      articles.status,
      articles.author,
      articles.published_at,
      articles.created_at,
      articles.updated_at
    FROM articles
    LEFT JOIN article_channels channels ON channels.code = articles.channel_code
    WHERE ${conditions.join(" AND ")}
    ORDER BY articles.published_at DESC NULLS LAST, articles.created_at DESC
    LIMIT $${values.length}
    `,
    values
  );
  return result.rows.map(mapArticle);
}
```

- [ ] **Step 2: 实现问题关键词提取与检索触发判断**

```ts
const shouldSearchSite = (question: string): boolean => {
  const normalized = question.trim();
  return ["还有", "相关文章", "帮我找", "有没有", "类似文章", "最近发布"].some((token) =>
    normalized.includes(token)
  );
};

const buildSearchKeyword = (input: PageAgentRequestBody): string => {
  if (input.selectionText?.trim()) {
    return input.selectionText.trim().slice(0, 60);
  }
  if (typeof input.context?.["title"] === "string" && input.context["title"].trim()) {
    return input.context["title"].trim().slice(0, 60);
  }
  return input.question.trim().slice(0, 60);
};
```

- [ ] **Step 3: 实现 DeepSeek 调用服务**

```ts
const result = await axios.post(
  `${env.deepseekApiBaseUrl}/v1/chat/completions`,
  {
    model: env.deepseekModel,
    messages: [
      {
        role: "system",
        content: buildPageAgentSystemPrompt(),
      },
      {
        role: "user",
        content: buildPageAgentUserPrompt(input, searchSources),
      },
    ],
    temperature: 0.2,
  },
  {
    headers: env.deepseekApiKey
      ? {
          Authorization: `Bearer ${env.deepseekApiKey}`,
        }
      : undefined,
    timeout: 60000,
  }
);
```

- [ ] **Step 4: 实现统一问答编排返回结构**

```ts
export const answerPageQuestion = async (
  input: PageAgentRequestBody
): Promise<PageAgentResponse> => {
  const usedSiteSearch = shouldSearchSite(input.question);
  const searchKeyword = buildSearchKeyword(input);
  const searchSources = usedSiteSearch
    ? (await articleStore.searchPublished({
        keyword: searchKeyword,
        channelCode:
          typeof input.context?.["channelCode"] === "string"
            ? String(input.context["channelCode"])
            : undefined,
        limit: 3,
      })).map((item) => ({
        type: "article" as const,
        articleId: item.id,
        title: item.title,
        url: `/articles/${item.id}`,
        originalUrl: item.originalUrl,
        summary: item.summary,
      }))
    : [];
  const currentPageSource = {
    type: "current_page" as const,
    title: input.pageTitle || "当前页面",
    url: input.route,
  };
  const answer = normalizeAiContent(result.data?.choices?.[0]?.message?.content);
  return {
    answer,
    sources: [currentPageSource, ...searchSources],
    meta: {
      usedCurrentPage: true,
      usedSiteSearch,
      model: env.deepseekModel,
    },
  };
};
```

- [ ] **Step 5: 增加关键日志**

```ts
logger.info("page.agent.answer.start", {
  pageType: input.pageType,
  route: input.route,
  questionLength: input.question.length,
  hasSelectionText: Boolean(input.selectionText?.trim()),
});
```

```ts
logger.info("page.agent.answer.finish", {
  pageType: input.pageType,
  route: input.route,
  usedSiteSearch,
  sourceCount: searchSources.length + 1,
  model: env.deepseekModel,
  durationMs: Date.now() - startedAt,
});
```

- [ ] **Step 6: 运行局部检查**

Run: `sed -n '1,260p' /opt/idapps/ai_web/apps/api/src/modules/page_agent/service.ts`
Expected: 能看到检索判断、DeepSeek 调用、返回结构和日志逻辑

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/page_agent/service.ts apps/api/src/lib/store.ts
git commit -m "feat: add page agent answer service"
```

### Task 3: 新增后端路由并接入应用

**Files:**
- Create: `apps/api/src/modules/page_agent/routes.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: 写失败前的路由契约脚本**

```ts
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../app";

const run = async (): Promise<void> => {
  const response = await request(app)
    .post("/api/page-agent/qa")
    .send({});
  assert.equal(response.status, 401);
};

void run();
```

- [ ] **Step 2: 实现路由校验和调用**

```ts
const pageAgentSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  pageType: z.enum(["article_detail", "article_list", "subscription", "admin"]),
  route: z.string().trim().min(1).max(500),
  pageTitle: z.string().trim().min(1).max(200),
  selectionText: z.string().trim().max(4000).optional(),
  context: z.record(z.string(), z.unknown()),
});

pageAgentRouter.post("/qa", requireAuth, async (request, response) => {
  const parsed = pageAgentSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const result = await answerPageQuestion(parsed.data);
  response.json(result);
});
```

- [ ] **Step 3: 在应用入口注册路由**

```ts
import { pageAgentRouter } from "./modules/page_agent/routes";

app.use("/api/page-agent", pageAgentRouter);
```

- [ ] **Step 4: 运行路由级验证**

Run: `npm run build --workspace @ai-web/api`
Expected: 后端构建通过，无路由导入错误

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/page_agent/routes.ts apps/api/src/app.ts
git commit -m "feat: expose page agent qa endpoint"
```

### Task 4: 编写后端问答验证脚本

**Files:**
- Create: `apps/api/src/scripts/test_page_agent_flow.ts`

- [ ] **Step 1: 编写脚本，校验请求体与返回结构**

```ts
import assert from "node:assert/strict";
import { answerPageQuestion } from "../modules/page_agent/service";

const run = async (): Promise<void> => {
  const result = await answerPageQuestion({
    question: "这篇文章讲什么？",
    pageType: "article_detail",
    route: "/articles/mock-id",
    pageTitle: "文章详情",
    selectionText: "",
    context: {
      articleId: "mock-id",
      title: "医学 AI 研究进展",
      summary: "文章讨论了医学 AI 在教学与科研中的应用。",
      contentPreview: "医学 AI 正在用于辅助教学、科研分析和知识服务。",
      channelCode: "medical-frontier",
      channelName: "医学前沿",
    },
  });
  assert.equal(typeof result.answer, "string");
  assert.equal(Array.isArray(result.sources), true);
  assert.equal(result.meta.usedCurrentPage, true);
};

void run();
```

- [ ] **Step 2: 补充运行命令**

Run: `node --import tsx apps/api/src/scripts/test_page_agent_flow.ts`
Expected: 在配置好 `DEEPSEEK_API_BASE_URL` 和 `DEEPSEEK_API_KEY` 后脚本通过；未配置时返回明确错误

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/scripts/test_page_agent_flow.ts
git commit -m "test: add page agent flow script"
```

### Task 5: 定义前端 Page Context 类型与 API 请求

**Files:**
- Create: `apps/web/src/page_agent/types.ts`
- Modify: `apps/web/src/services/api.ts`

- [ ] **Step 1: 定义前端类型**

```ts
export type PageAgentPageType =
  | "article_detail"
  | "article_list"
  | "subscription"
  | "admin";

export interface PageAgentRequestPayload {
  question: string;
  pageType: PageAgentPageType;
  route: string;
  pageTitle: string;
  selectionText?: string;
  context: Record<string, unknown>;
}

export interface PageAgentSource {
  type: "current_page" | "article";
  title: string;
  url: string;
  articleId?: string;
  originalUrl?: string;
  summary?: string;
}

export interface PageAgentResponse {
  answer: string;
  sources: PageAgentSource[];
  meta: {
    usedCurrentPage: boolean;
    usedSiteSearch: boolean;
    model: string;
  };
}
```

- [ ] **Step 2: 在 API 服务中增加请求方法**

```ts
export const askPageAgent = async (
  payload: PageAgentRequestPayload
): Promise<PageAgentResponse> => {
  const result = await request.post<PageAgentResponse>("/page-agent/qa", payload);
  return result.data;
};
```

- [ ] **Step 3: 运行前端类型检查前的静态查看**

Run: `sed -n '1,220p' /opt/idapps/ai_web/apps/web/src/services/api.ts`
Expected: 能看到 `askPageAgent()`，且类型引用完整

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/page_agent/types.ts apps/web/src/services/api.ts
git commit -m "feat: add page agent frontend api"
```

### Task 6: 实现前端页面上下文构造器

**Files:**
- Create: `apps/web/src/page_agent/context.ts`

- [ ] **Step 1: 实现详情页上下文构造**

```ts
export const buildArticleDetailContext = (input: {
  route: string;
  title: string;
  article: {
    id: string;
    title: string;
    summary: string;
    content: string;
    author: string;
    publishedAt?: string;
    channelCode: string;
    channelName?: string;
    originalUrl?: string;
  };
  selectionText?: string;
}): PageAgentRequestPayload => ({
  question: "",
  pageType: "article_detail",
  route: input.route,
  pageTitle: input.title,
  selectionText: input.selectionText ?? "",
  context: {
    articleId: input.article.id,
    title: input.article.title,
    summary: input.article.summary,
    contentPreview: input.article.content.slice(0, 3000),
    author: input.article.author,
    publishedAt: input.article.publishedAt,
    channelCode: input.article.channelCode,
    channelName: input.article.channelName,
    originalUrl: input.article.originalUrl,
  },
});
```

- [ ] **Step 2: 实现列表页、订阅页、内容中枢页构造器**

```ts
export const buildArticleListContext = (input: {
  route: string;
  title: string;
  keyword: string;
  category: string;
  channelCode: string;
  channelName?: string;
  currentPage: number;
  pageSize: number;
  items: Array<{
    id: string;
    title: string;
    summary: string;
    author: string;
    publishedAt?: string;
  }>;
}): PageAgentRequestPayload => ({
  question: "",
  pageType: "article_list",
  route: input.route,
  pageTitle: input.title,
  context: {
    keyword: input.keyword,
    category: input.category,
    channelCode: input.channelCode,
    channelName: input.channelName,
    currentPage: input.currentPage,
    pageSize: input.pageSize,
    items: input.items,
  },
});
```

- [ ] **Step 3: 提供选中文本读取工具**

```ts
export const getSelectionText = (): string => {
  return window.getSelection?.()?.toString().trim() ?? "";
};
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/page_agent/context.ts
git commit -m "feat: add page agent context builders"
```

### Task 7: 实现前端统一面板与入口

**Files:**
- Create: `apps/web/src/components/PageAgentPanel.vue`
- Create: `apps/web/src/components/PageAgentLauncher.vue`
- Modify: `apps/web/src/App.vue`

- [ ] **Step 1: 移除第三方 `page-agent` 直接依赖的面板调用**

```ts
// 删除
import { PageAgent } from "page-agent";

// 删除 createPageAgent / ensurePageAgent / triggerAgent 中直接操作第三方面板的逻辑
```

- [ ] **Step 2: 实现自定义入口组件**

```vue
<script setup lang="ts">
defineProps<{
  onClick: () => void;
}>();
</script>

<template>
  <button
    type="button"
    class="relative flex items-center gap-3 px-6 py-3 rounded-full bg-white/95 backdrop-blur-xl border border-[#0288d1]/25 text-[#0f4f80] shadow-[0_20px_35px_-20px_rgba(2,136,209,0.45)]"
    @click="onClick"
  >
    <span class="text-sm font-medium tracking-wide">AI 智能分析与搜索</span>
  </button>
</template>
```

- [ ] **Step 3: 实现问答面板组件**

```vue
<script setup lang="ts">
import { ref } from "vue";
import type { PageAgentResponse, PageAgentRequestPayload } from "../page_agent/types";

const props = defineProps<{
  visible: boolean;
  loading: boolean;
  result: PageAgentResponse | null;
  question: string;
}>();

const emit = defineEmits<{
  close: [];
  submit: [question: string];
  updateQuestion: [question: string];
}>();
</script>
```

- [ ] **Step 4: 在 `App.vue` 中接入面板状态**

```ts
const pageAgentOpen = ref(false);
const pageAgentQuestion = ref("");
const pageAgentLoading = ref(false);
const pageAgentResult = ref<PageAgentResponse | null>(null);

const openPageAgent = (): void => {
  pageAgentOpen.value = true;
};
```

- [ ] **Step 5: 在模板中替换现有按钮和面板**

```vue
<PageAgentPanel
  :visible="pageAgentOpen"
  :loading="pageAgentLoading"
  :result="pageAgentResult"
  :question="pageAgentQuestion"
  @close="pageAgentOpen = false"
  @submit="submitPageAgentQuestion"
  @update-question="pageAgentQuestion = $event"
/>

<PageAgentLauncher :on-click="openPageAgent" />
```

- [ ] **Step 6: 运行前端构建验证**

Run: `npm run build --workspace @ai-web/web`
Expected: 前端构建通过，不再依赖第三方 `page-agent` 面板实例

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/PageAgentPanel.vue apps/web/src/components/PageAgentLauncher.vue apps/web/src/App.vue
git commit -m "feat: add custom page agent panel"
```

### Task 8: 接入各页面的上下文提供能力

**Files:**
- Modify: `apps/web/src/views/ArticleDetailPage.vue`
- Modify: `apps/web/src/views/ArticlesPage.vue`
- Modify: `apps/web/src/views/SubscriptionPage.vue`
- Modify: `apps/web/src/views/AdminPage.vue`
- Modify: `apps/web/src/App.vue`

- [ ] **Step 1: 在 `App.vue` 中增加页面上下文注册容器**

```ts
const pageAgentContext = ref<PageAgentRequestPayload | null>(null);

provide("setPageAgentContext", (payload: PageAgentRequestPayload | null) => {
  pageAgentContext.value = payload;
});
```

- [ ] **Step 2: 在详情页注册上下文**

```ts
const setPageAgentContext = inject<(payload: PageAgentRequestPayload | null) => void>(
  "setPageAgentContext"
);

watchEffect(() => {
  if (!item.value || !setPageAgentContext) {
    return;
  }
  setPageAgentContext(
    buildArticleDetailContext({
      route: route.fullPath,
      title: "文章详情",
      article: item.value,
      selectionText: getSelectionText(),
    })
  );
});
```

- [ ] **Step 3: 在列表页注册上下文**

```ts
watchEffect(() => {
  setPageAgentContext?.(
    buildArticleListContext({
      route: "/",
      title: "资讯发现",
      keyword: keyword.value,
      category: category.value,
      channelCode: channelCode.value,
      channelName: channels.value.find((item) => item.key === channelCode.value)?.label,
      currentPage: currentPage.value,
      pageSize,
      items: paginatedItems.value.map((item) => ({
        id: item.id,
        title: item.title,
        summary: item.summary,
        author: item.author,
        publishedAt: item.publishedAt,
      })),
    })
  );
});
```

- [ ] **Step 4: 在订阅页和内容中枢页注册上下文**

```ts
watchEffect(() => {
  setPageAgentContext?.({
    question: "",
    pageType: "subscription",
    route: "/subscription",
    pageTitle: "智能订阅",
    context: {
      enabled: activeDraft.value.enabled,
      frequency: frequency.value,
      channelCodes: activeDraft.value.channelCodes,
    },
  });
});
```

- [ ] **Step 5: 在 `App.vue` 中提交问题时合并上下文**

```ts
const submitPageAgentQuestion = async (question: string): Promise<void> => {
  if (!pageAgentContext.value) {
    return;
  }
  pageAgentLoading.value = true;
  try {
    pageAgentResult.value = await askPageAgent({
      ...pageAgentContext.value,
      question,
      selectionText: getSelectionText(),
    });
  } finally {
    pageAgentLoading.value = false;
  }
};
```

- [ ] **Step 6: 运行前端构建与诊断**

Run: `npm run build --workspace @ai-web/web`
Expected: 四个页面都能通过编译，且 `App.vue` 无注入/类型错误

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/views/ArticleDetailPage.vue apps/web/src/views/ArticlesPage.vue apps/web/src/views/SubscriptionPage.vue apps/web/src/views/AdminPage.vue apps/web/src/App.vue
git commit -m "feat: wire page agent contexts into pages"
```

### Task 9: 端到端验证与收尾

**Files:**
- Modify: `apps/api/src/scripts/test_page_agent_flow.ts`
- Modify: `apps/web/src/components/PageAgentPanel.vue`
- Modify: `apps/api/src/modules/page_agent/service.ts`

- [ ] **Step 1: 增强脚本覆盖检索型问题**

```ts
const result = await answerPageQuestion({
  question: "站内还有哪些相关文章？",
  pageType: "article_list",
  route: "/",
  pageTitle: "资讯发现",
  context: {
    keyword: "医学 AI",
    category: "",
    channelCode: "medical-frontier",
    channelName: "医学前沿",
    currentPage: 1,
    pageSize: 9,
    items: [],
  },
});
assert.equal(result.meta.usedSiteSearch, true);
```

- [ ] **Step 2: 运行后端验证脚本**

Run: `node --import tsx apps/api/src/scripts/test_page_agent_flow.ts`
Expected: 两类问题均返回合法结构；若未配置 DeepSeek Key，错误信息可定位

- [ ] **Step 3: 运行后端构建**

Run: `npm run build --workspace @ai-web/api`
Expected: PASS

- [ ] **Step 4: 运行前端构建**

Run: `npm run build --workspace @ai-web/web`
Expected: PASS

- [ ] **Step 5: 获取编辑后诊断**

Run: 使用编辑器诊断检查以下文件
Expected: `apps/api/src/modules/page_agent/routes.ts`、`apps/api/src/modules/page_agent/service.ts`、`apps/web/src/App.vue`、`apps/web/src/components/PageAgentPanel.vue` 无新增诊断

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/page_agent/service.ts apps/api/src/scripts/test_page_agent_flow.ts apps/web/src/components/PageAgentPanel.vue
git commit -m "test: verify page agent context qa flow"
```

## 自检

### Spec 覆盖检查

- 全站统一入口：Task 7、Task 8
- 页面上下文采集：Task 5、Task 6、Task 8
- 后端业务接口：Task 2、Task 3
- DeepSeek 主链路：Task 2
- 非详情页站内检索：Task 2、Task 9
- 来源链接返回：Task 2、Task 7
- 日志：Task 2
- 最小范围不做自动操作：Task 7、Task 8 的实现刻意避开任何写操作

### 占位扫描

- 计划中的文件路径均为明确路径
- 所有运行命令均给出
- 所有代码步骤给出实际代码片段
- 无 `TODO`、`TBD`、`类似 Task N`

### 一致性检查

- 统一使用 `POST /api/page-agent/qa`
- 统一使用 `PageAgentRequestPayload` 和 `PageAgentResponse`
- 统一使用 `article_detail`、`article_list`、`subscription`、`admin` 四类页面类型

