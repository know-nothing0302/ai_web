# 内容中枢 URL 自动提取 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为内容中枢新增文章区域增加 URL 自动抓取、正文清洗、AI 摘要与 AI 栏目判定，并提供一键发布与一键清除能力。

**Architecture:** 后端新增独立的 URL 提取服务文件，负责网页抓取、HTML 清洗、发布时间提取和 AI 结构化提取，再由文章路由暴露受保护的 `POST /api/articles/extract-from-url` 接口。前端继续复用现有 `AdminPage.vue` 表单，只增加 URL 输入、自动提取、一键发布和一键清除，不改动现有文章列表与手工保存流程。

**Tech Stack:** TypeScript, Express, Axios, Zod, Cheerio, Vue 3, Axios

---

### Task 1: 先用回归脚本锁定 URL 提取接口契约

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/scripts/test_article_extract_flow.ts`
- Test: `apps/api/src/scripts/test_article_extract_flow.ts`

- [ ] **Step 1: 在 `package.json` 增加提取流测试脚本和 HTML 解析依赖**

```json
{
  "scripts": {
    "test:article-extract-flow": "tsx src/scripts/test_article_extract_flow.ts"
  },
  "dependencies": {
    "cheerio": "^1.1.2"
  }
}
```

- [ ] **Step 2: 新建失败优先的回归脚本，启动一个本地伪文章页面**

```ts
import assert from "node:assert/strict";
import http from "node:http";
import axios from "axios";

const articleHtml = `
<!doctype html>
<html lang="zh-CN">
  <head>
    <title>医学 AI 前沿观察</title>
    <meta property="article:published_time" content="2026-04-27T08:00:00.000Z" />
  </head>
  <body>
    <main>
      <article>
        <h1>医学 AI 前沿观察</h1>
        <p>这是用于提取测试的正文第一段，包含医学影像与智能辅助诊疗内容。</p>
        <p>这是用于提取测试的正文第二段，包含教学、科研与医院应用场景。</p>
      </article>
    </main>
  </body>
</html>
`;
```

- [ ] **Step 3: 在脚本里 stub AI 返回，先断言新接口返回结构**

```ts
const originalPost = axios.post;
axios.post = async (url, body) => {
  if (String(url).includes("/v1/chat/completions")) {
    return {
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: "医学 AI 文章摘要",
                channelCode: "medical-frontier"
              })
            }
          }
        ]
      }
    };
  }
  return originalPost(url, body);
};
```

```ts
const extract = await axios.post(
  `${baseUrl}/api/articles/extract-from-url`,
  { url: articleUrl },
  {
    headers: { Cookie: "sid=test" },
    validateStatus: () => true
  }
);
assert.equal(extract.status, 200);
assert.equal(extract.data.title, "医学 AI 前沿观察");
assert.equal(extract.data.summary, "医学 AI 文章摘要");
assert.equal(extract.data.channelCode, "medical-frontier");
assert.ok(extract.data.content.includes("智能辅助诊疗"));
assert.equal(extract.data.originalUrl, articleUrl);
assert.equal(extract.data.publishedAt, "2026-04-27T08:00:00.000Z");
assert.deepEqual(extract.data.meta.missingFields, []);
```

- [ ] **Step 4: 再补一个正文不足的失败断言**

```ts
const shortPage = await axios.post(
  `${baseUrl}/api/articles/extract-from-url`,
  { url: `${contentBaseUrl}/short` },
  {
    headers: { Cookie: "sid=test" },
    validateStatus: () => true
  }
);
assert.equal(shortPage.status, 422);
assert.match(shortPage.data.message, /正文|内容/);
```

- [ ] **Step 5: 运行脚本，确认在接口未实现前失败**

Run: `npm run test:article-extract-flow`

Expected: 失败，至少报出 `404` 或接口返回结构不符合预期。

- [ ] **Step 6: Commit**

```bash
git add apps/api/package.json apps/api/src/scripts/test_article_extract_flow.ts
git commit -m "test: cover article extract from url flow"
```

### Task 2: 抽离后端 URL 提取服务

**Files:**
- Create: `apps/api/src/modules/articles/url_extract_service.ts`
- Modify: `apps/api/src/modules/articles/routes.ts`
- Modify: `apps/api/src/lib/logger.ts`

- [ ] **Step 1: 新建提取结果类型和入口函数**

```ts
export interface UrlExtractResult {
  title?: string;
  content: string;
  summary?: string;
  channelCode?: string;
  originalUrl: string;
  publishedAt?: string;
  meta: {
    contentLength: number;
    missingFields: string[];
  };
}

export const extractArticleFromUrl = async (
  input: { url: string; requestUserId?: string }
): Promise<UrlExtractResult> => {
  // implementation here
};
```

- [ ] **Step 2: 用 `cheerio` 做最小 HTML 清洗，不引入站点规则库**

```ts
import axios from "axios";
import * as cheerio from "cheerio";

const buildPlainText = (html: string): {
  title?: string;
  content: string;
  publishedAt?: string;
} => {
  const $ = cheerio.load(html);
  $("script, style, nav, footer, header, aside, noscript").remove();
  const title =
    $("article h1").first().text().trim() ||
    $("main h1").first().text().trim() ||
    $("h1").first().text().trim() ||
    $("title").first().text().trim();
  const publishedAt =
    $('meta[property="article:published_time"]').attr("content") ||
    $("time[datetime]").first().attr("datetime") ||
    undefined;
  const blocks = $("article p, main p, p")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((item) => item.length >= 12);
  return {
    title: title || undefined,
    content: blocks.join("\n\n").trim(),
    publishedAt
  };
};
```

- [ ] **Step 3: 为抓取、清洗、AI 阶段打详细日志**

```ts
logger.info("article.extract.start", {
  url: input.url,
  requestUserId: input.requestUserId
});
```

```ts
logger.info("article.extract.fetch.success", {
  url: input.url,
  fetchDurationMs,
  htmlLength: html.length
});
```

```ts
logger.error("article.extract.ai.summary.failed", {
  url: input.url,
  error
});
```

- [ ] **Step 4: 将 AI 提示词压成单次结构化返回，限定栏目只能来自启用栏目**

```ts
const prompt = `
你是内容中枢编辑助手。请根据标题和正文，从给定栏目中选择最合适的唯一 channelCode，
并生成简短中文摘要。只返回 JSON：
{"summary":"...","channelCode":"..."}

栏目候选：
${channels.map((item) => `${item.code}: ${item.name}`).join("\n")}

标题：
${title ?? ""}

正文：
${content.slice(0, 4000)}
`;
```

- [ ] **Step 5: 在内容长度不足时直接抛 `422` 语义错误，不调用 AI**

```ts
if (content.length < 80) {
  const error = new Error("正文内容不足，无法完成自动提取");
  (error as Error & { status?: number }).status = 422;
  throw error;
}
```

- [ ] **Step 6: 运行类型检查，确认新服务可编译**

Run: `npm run typecheck`

Expected: `tsc -p tsconfig.json --noEmit` 退出码为 `0`。

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/articles/url_extract_service.ts apps/api/src/modules/articles/routes.ts apps/api/src/lib/logger.ts
git commit -m "feat: add article url extract service"
```

### Task 3: 在文章路由暴露受保护的提取接口

**Files:**
- Modify: `apps/api/src/modules/articles/routes.ts`
- Test: `apps/api/src/scripts/test_article_extract_flow.ts`

- [ ] **Step 1: 在路由文件添加 URL 请求 schema**

```ts
const extractFromUrlSchema = z.object({
  url: z.string().trim().url().max(1000)
});
```

- [ ] **Step 2: 增加 `POST /extract-from-url` 路由并复用内容中枢权限**

```ts
articleRouter.post("/extract-from-url", requireContentHubOperator, async (request, response) => {
  const parsed = extractFromUrlSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  try {
    const result = await extractArticleFromUrl({
      url: parsed.data.url,
      requestUserId: request.session.user?.id
    });
    response.json(result);
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 502;
    response.status(status).json({ message: (error as Error).message || "自动提取失败" });
  }
});
```

- [ ] **Step 3: 确认路由位置在 `/:id` 之前，避免命中参数路由**

```ts
articleRouter.post("/extract-from-url", requireContentHubOperator, async (...) => {
  ...
});

articleRouter.get("/:id", requireAuth, async (request, response) => {
  ...
});
```

- [ ] **Step 4: 运行提取流脚本，确认新增接口通过**

Run: `npm run test:article-extract-flow`

Expected: 输出通过，成功提取文章页面并命中 `medical-frontier`。

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/articles/routes.ts apps/api/src/scripts/test_article_extract_flow.ts
git commit -m "feat: expose article extract from url endpoint"
```

### Task 4: 补前端 API 类型与请求封装

**Files:**
- Modify: `apps/web/src/services/api.ts`

- [ ] **Step 1: 增加 URL 提取响应类型**

```ts
export interface ArticleExtractResult {
  title?: string;
  content: string;
  summary?: string;
  channelCode?: string;
  originalUrl: string;
  publishedAt?: string;
  meta: {
    contentLength: number;
    missingFields: string[];
  };
}
```

- [ ] **Step 2: 增加前端提取请求方法**

```ts
export const extractArticleFromUrl = async (url: string): Promise<ArticleExtractResult> => {
  const result = await request.post<ArticleExtractResult>("/articles/extract-from-url", { url });
  return result.data;
};
```

- [ ] **Step 3: 运行前端类型检查**

Run: `npm run build`

Expected: 至少通过 `vue-tsc -b`，不出现 `api.ts` 新增类型错误。

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/services/api.ts
git commit -m "feat: add article extract api client"
```

### Task 5: 增强内容中枢新增文章表单

**Files:**
- Modify: `apps/web/src/views/AdminPage.vue`
- Modify: `apps/web/src/services/api.ts`

- [ ] **Step 1: 在脚本区增加 URL 输入值、提取 loading 和表单清空函数**

```ts
const extractUrl = ref("");
const loadingExtract = ref(false);

const clearForm = (): void => {
  title.value = "";
  content.value = "";
  summary.value = "";
  originalUrl.value = "";
  publishedAt.value = "";
  channelCode.value = channels.value[0]?.code ?? "";
  status.value = "draft";
  extractUrl.value = "";
};
```

- [ ] **Step 2: 增加提取动作，按“有值才覆盖”回填字段**

```ts
const handleExtract = async (): Promise<void> => {
  if (!extractUrl.value.trim()) {
    message.value = "请输入有效的 URL";
    return;
  }
  loadingExtract.value = true;
  try {
    const result = await extractArticleFromUrl(extractUrl.value.trim());
    if (result.title) title.value = result.title;
    if (result.content) content.value = result.content;
    if (result.summary) summary.value = result.summary;
    if (result.channelCode) channelCode.value = result.channelCode;
    if (result.originalUrl) originalUrl.value = result.originalUrl;
    if (result.publishedAt) {
      publishedAt.value = result.publishedAt.slice(0, 16);
    }
    message.value = "内容提取完成";
  } catch (error: any) {
    message.value = error.response?.data?.message || "自动提取失败";
  } finally {
    loadingExtract.value = false;
  }
};
```

- [ ] **Step 3: 增加一键发布，复用现有创建接口但强制 `published`**

```ts
const submitAsPublished = async (): Promise<void> => {
  const previous = status.value;
  status.value = "published";
  try {
    await submit();
  } finally {
    status.value = previous;
  }
};
```

- [ ] **Step 4: 在模板中加入 URL 输入、自动提取、一键清除、一键发布**

```vue
<div class="space-y-3">
  <label class="text-sm font-medium text-[#4f6b8a]">文章来源 URL</label>
  <div class="flex gap-2">
    <input v-model="extractUrl" type="url" class="input-ai flex-1" placeholder="https://example.com/article" />
    <button type="button" class="btn-secondary whitespace-nowrap" :disabled="loadingExtract" @click="handleExtract">
      {{ loadingExtract ? "提取中..." : "自动提取" }}
    </button>
    <button type="button" class="btn-secondary whitespace-nowrap" @click="clearForm">一键清除</button>
  </div>
</div>
```

```vue
<div class="flex flex-col gap-3 mt-auto">
  <button @click="submitAsPublished" :disabled="loadingSave || loadingExtract" class="w-full btn-primary">
    一键发布
  </button>
  <button @click="submit" :disabled="loadingSave || loadingExtract" class="w-full btn-secondary">
    保存为草稿
  </button>
</div>
```

- [ ] **Step 5: 确认保留现有 AI 摘要按钮和文章管理区，不动已存在的删除/分页逻辑**

```vue
<button
  @click="generateSummary"
  :disabled="loadingAI || loadingExtract"
  class="text-xs text-[#0288d1] hover:text-[#01579b] flex items-center gap-1 disabled:opacity-50"
>
  <Sparkles class="w-3 h-3" :class="{ 'animate-spin': loadingAI }" />
  {{ loadingAI ? "提炼中..." : "AI 提炼" }}
</button>
```

- [ ] **Step 6: 运行前端构建，确认页面类型通过**

Run: `npm run build`

Expected: 构建成功，`AdminPage.vue` 无新报错。

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/views/AdminPage.vue apps/web/src/services/api.ts
git commit -m "feat: add content hub url extract actions"
```

### Task 6: 做端到端回归和诊断检查

**Files:**
- Modify: `apps/api/src/scripts/test_article_extract_flow.ts`
- Modify: `apps/api/src/modules/articles/routes.ts`
- Modify: `apps/api/src/modules/articles/url_extract_service.ts`
- Modify: `apps/web/src/services/api.ts`
- Modify: `apps/web/src/views/AdminPage.vue`

- [ ] **Step 1: 运行 API 提取回归脚本**

Run: `npm run test:article-extract-flow`

Expected: 输出通过，成功用本地 HTML 页验证标题、正文、摘要、栏目与发布时间回填。

- [ ] **Step 2: 运行 API 类型检查**

Run: `npm run typecheck`

Expected: 退出码为 `0`。

- [ ] **Step 3: 运行前端构建**

Run: `npm run build`

Expected: 构建成功，Vite 无新增错误。

- [ ] **Step 4: 检查已改文件诊断**

Run: VS Code diagnostics on:
- `apps/api/src/modules/articles/routes.ts`
- `apps/api/src/modules/articles/url_extract_service.ts`
- `apps/web/src/services/api.ts`
- `apps/web/src/views/AdminPage.vue`

Expected: 无新增错误级问题。

- [ ] **Step 5: Commit**

```bash
git add apps/api/package.json apps/api/src/scripts/test_article_extract_flow.ts apps/api/src/modules/articles/routes.ts apps/api/src/modules/articles/url_extract_service.ts apps/web/src/services/api.ts apps/web/src/views/AdminPage.vue
git commit -m "feat: support content hub article extraction from url"
```

## Self-Review

- Spec coverage:
  - URL 输入框、自动提取、一键发布、一键清除由 Task 5 覆盖
  - 后端统一提取接口由 Task 2-3 覆盖
  - 正文清洗、发布时间提取、AI 摘要与 AI 栏目判定由 Task 2 覆盖
  - 错误处理与 `400/422/502/504` 路径由 Task 1、Task 3 覆盖
  - 日志链路由 Task 2 覆盖
- Placeholder scan:
  - 未使用 `TODO`、`TBD`、`适当处理` 之类占位描述
- Type consistency:
  - 后端和前端统一使用 `ArticleExtractResult` / `UrlExtractResult` 结构，字段名保持 `title`、`content`、`summary`、`channelCode`、`originalUrl`、`publishedAt`、`meta`
