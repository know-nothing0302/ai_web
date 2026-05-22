# Page Agent Source Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为文章新增 `sourceContent` 字段，保存抓取后的完整正文文本，并在文章详情页 `page agent` 分析时优先使用该字段。

**Architecture:** 数据层在 `articles` 表新增 `source_content`，通过 `Article` 类型、store 和文章路由贯通到前端详情接口。抓取链路在保留现有 `content` 的同时额外生成 `sourceContent`，前端详情页仅把该字段放进 `page agent` 上下文，后端 prompt 在 `article_detail` 场景优先消费该字段并保留降级逻辑。

**Tech Stack:** TypeScript、Express、PostgreSQL、Vue 3、Axios、Zod、现有 `articleStore` / `page_agent` 模块

---

## 文件结构

### 主要修改

- `apps/api/src/lib/db.ts`
  - 为运行时建表 SQL 增加 `source_content`
- `apps/api/sql/001_init.sql`
  - 为初始化 SQL 增加 `source_content`
- `apps/api/src/lib/types.ts`
  - 为 `Article` 增加 `sourceContent`
- `apps/api/src/lib/store.ts`
  - 为查询、创建、更新映射 `source_content`
- `apps/api/src/modules/articles/url_extract_service.ts`
  - 抽取结果增加 `sourceContent`
- `apps/api/src/modules/articles/routes.ts`
  - 创建、发布、详情、提取链路携带 `sourceContent`
- `apps/api/src/modules/page_agent/prompts.ts`
  - 文章详情场景优先使用 `sourceContent`
- `apps/web/src/services/api.ts`
  - 前端文章类型和提取结果增加 `sourceContent`
- `apps/web/src/page_agent/context.ts`
  - 文章详情上下文增加 `sourceContent`

### 测试与验证

- `apps/api/src/scripts/test_article_extract_flow.ts`
  - 验证抽取结果包含 `sourceContent`
- `apps/api/src/scripts/test_page_agent_flow.ts`
  - 验证详情页上下文包含 `sourceContent` 并可用于问答

## 任务拆分

### Task 1: 为数据层增加 `sourceContent` 字段

**Files:**
- Modify: `apps/api/src/lib/db.ts`
- Modify: `apps/api/sql/001_init.sql`
- Modify: `apps/api/src/lib/types.ts`
- Modify: `apps/api/src/lib/store.ts`

- [ ] **Step 1: 先写出数据层失败前验证**

在 `apps/api/src/lib/types.ts` 中先让 `Article` 引用 `sourceContent`，但不修改 store 查询。

```ts
export interface Article {
  id: string;
  createdByUserId?: string;
  title: string;
  summary: string;
  content: string;
  sourceContent?: string;
  originalUrl?: string;
  channelCode: string;
  channelName?: string;
  category: string;
  tags: string[];
  status: ArticleStatus;
  author: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: 运行 API 构建验证 RED**

Run: `npm run build`
Working directory: `/opt/idapps/ai_web/apps/api`
Expected: FAIL，提示 `mapArticle` 或 `create/update` 与 `Article` 字段不匹配，证明字段尚未贯通

- [ ] **Step 3: 为库表、类型和 store 补最小实现**

在 `apps/api/src/lib/db.ts` 和 `apps/api/sql/001_init.sql` 中增加：

```sql
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS source_content TEXT;
```

在 `apps/api/src/lib/store.ts` 中补字段：

```ts
interface ArticleRow {
  id: string;
  created_by_user_id: string | null;
  title: string;
  summary: string;
  content: string;
  source_content: string | null;
  original_url: string | null;
  ...
}
```

```ts
const mapArticle = (row: ArticleRow): Article => ({
  id: row.id,
  createdByUserId: row.created_by_user_id ?? undefined,
  title: row.title,
  summary: row.summary,
  content: row.content,
  sourceContent: row.source_content ?? undefined,
  originalUrl: row.original_url ?? undefined,
  ...
});
```

并在 `SELECT`、`INSERT`、`UPDATE` 中补上 `source_content`：

```sql
articles.source_content,
```

```sql
INSERT INTO articles (
  created_by_user_id,
  title,
  summary,
  content,
  source_content,
  original_url,
  ...
)
VALUES ($1, $2, $3, $4, $5, $6, ...)
```

- [ ] **Step 4: 运行 API 构建验证 GREEN**

Run: `npm run build`
Working directory: `/opt/idapps/ai_web/apps/api`
Expected: PASS

### Task 2: 让抓取与文章接口贯通 `sourceContent`

**Files:**
- Modify: `apps/api/src/modules/articles/url_extract_service.ts`
- Modify: `apps/api/src/modules/articles/routes.ts`
- Modify: `apps/web/src/services/api.ts`

- [ ] **Step 1: 先写失败前验证**

在 `apps/web/src/services/api.ts` 中先给前端提取结果和文章类型加入 `sourceContent`，但暂不改后端抽取结果类型。

```ts
export interface Article {
  id: string;
  title: string;
  summary: string;
  content: string;
  sourceContent?: string;
  originalUrl?: string;
  ...
}

export interface ArticleExtractResult {
  title?: string;
  content: string;
  sourceContent?: string;
  summary?: string;
  ...
}
```

- [ ] **Step 2: 运行 API 构建验证 RED**

Run: `npm run build`
Working directory: `/opt/idapps/ai_web/apps/api`
Expected: FAIL，`UrlExtractResult` 或文章路由创建参数与 `Article` 新字段未对齐

- [ ] **Step 3: 为抽取结果与创建/发布/更新链路补最小实现**

在 `apps/api/src/modules/articles/url_extract_service.ts` 中补类型：

```ts
export interface UrlExtractResult {
  title?: string;
  content: string;
  sourceContent?: string;
  summary?: string;
  author?: string;
  channelCode?: string;
  originalUrl: string;
  publishedAt?: string;
  meta: {
    contentLength: number;
    missingFields: string[];
  };
}
```

在返回抽取结果时让 `sourceContent` 使用抓取后的完整正文文本：

```ts
return {
  title: rewritten.title,
  content: rewritten.content,
  sourceContent: plainText.content,
  summary,
  author: rewritten.author,
  channelCode: rewritten.channelCode,
  originalUrl: input.url,
  publishedAt: plainText.publishedAt,
  meta: {
    contentLength: plainText.content.length,
    missingFields,
  },
};
```

在 `apps/api/src/modules/articles/routes.ts` 的 `createSchema`、`publishSchema` 中补可选字段：

```ts
sourceContent: z.string().trim().min(1).optional(),
```

并在创建/发布时写入：

```ts
sourceContent: payload.sourceContent?.trim(),
```

```ts
sourceContent: payload.article.sourceContent?.trim(),
```

在 `patch("/:id")` 保持兼容：

```ts
if ("sourceContent" in input) {
  values.push(input.sourceContent ?? null);
  updates.push(`source_content = $${values.length}`);
}
```

- [ ] **Step 4: 运行 API 构建验证 GREEN**

Run: `npm run build`
Working directory: `/opt/idapps/ai_web/apps/api`
Expected: PASS

### Task 3: 在文章详情页上下文中传递 `sourceContent`

**Files:**
- Modify: `apps/web/src/services/api.ts`
- Modify: `apps/web/src/page_agent/context.ts`

- [ ] **Step 1: 先写失败前验证**

在 `apps/web/src/page_agent/context.ts` 的文章详情上下文里先引用 `input.article.sourceContent`，但不更新传入类型。

```ts
context: {
  articleId: input.article.id,
  title: input.article.title,
  summary: input.article.summary,
  contentPreview: input.article.content.slice(0, 3000),
  sourceContent: input.article.sourceContent,
  ...
}
```

- [ ] **Step 2: 运行前端构建验证 RED**

Run: `npm run build`
Working directory: `/opt/idapps/ai_web/apps/web`
Expected: FAIL，提示 `sourceContent` 不存在于文章输入类型

- [ ] **Step 3: 为详情页上下文补最小实现**

在 `apps/web/src/services/api.ts` 的 `Article` 类型补 `sourceContent?: string`，并保持详情接口继续使用 `getArticle()`。

在 `apps/web/src/page_agent/context.ts` 中完成文章详情上下文：

```ts
export const buildArticleDetailContext = (input: {
  route: string;
  pageTitle: string;
  article: {
    id: string;
    title: string;
    summary: string;
    content: string;
    sourceContent?: string;
    author: string;
    publishedAt?: string;
    channelCode: string;
    channelName?: string;
    originalUrl?: string;
  };
}): PageAgentRequestPayload => ({
  question: "",
  pageType: "article_detail",
  route: input.route,
  pageTitle: input.pageTitle,
  selectionText: getSelectionText(),
  context: {
    articleId: input.article.id,
    title: input.article.title,
    summary: input.article.summary,
    contentPreview: input.article.content.slice(0, 3000),
    sourceContent: input.article.sourceContent,
    author: input.article.author,
    publishedAt: input.article.publishedAt,
    channelCode: input.article.channelCode,
    channelName: input.article.channelName,
    originalUrl: input.article.originalUrl,
  },
});
```

- [ ] **Step 4: 运行前端构建验证 GREEN**

Run: `npm run build`
Working directory: `/opt/idapps/ai_web/apps/web`
Expected: PASS

### Task 4: 让 `page agent` 优先消费 `sourceContent`

**Files:**
- Modify: `apps/api/src/modules/page_agent/prompts.ts`
- Modify: `apps/api/src/modules/page_agent/service.ts`
- Modify: `apps/api/src/modules/page_agent/types.ts`

- [ ] **Step 1: 先写失败前验证**

在 prompt 中先引用 `sourceContent` 相关结构，但不补类型。

```ts
{
  articleContext: {
    sourceContent:
      typeof input.context.sourceContent === "string" ? input.context.sourceContent : "",
  }
}
```

- [ ] **Step 2: 运行 API 构建验证 RED**

Run: `npm run build`
Working directory: `/opt/idapps/ai_web/apps/api`
Expected: FAIL，提示 `PageAgentRequestBody` 或相关类型未对齐

- [ ] **Step 3: 为 page agent 类型与 prompt 补最小实现**

在 `apps/api/src/modules/page_agent/types.ts` 中把 `context` 收敛为允许包含 `sourceContent` 的记录类型，保持现有兼容：

```ts
export interface PageAgentRequestBody {
  question: string;
  pageType: PageAgentPageType;
  route: string;
  pageTitle: string;
  selectionText?: string;
  context: Record<string, unknown>;
}
```

在 `apps/api/src/modules/page_agent/prompts.ts` 中让 `article_detail` 场景优先构造更明确的提示：

```ts
const buildArticleDetailContext = (input: PageAgentRequestBody) => ({
  title: typeof input.context.title === "string" ? input.context.title : "",
  summary: typeof input.context.summary === "string" ? input.context.summary : "",
  sourceContent:
    typeof input.context.sourceContent === "string" ? input.context.sourceContent : "",
  contentPreview:
    typeof input.context.contentPreview === "string" ? input.context.contentPreview : "",
});
```

```ts
export const buildPageAgentUserPrompt = (
  input: PageAgentRequestBody,
  searchSources: PageAgentSource[]
): string => {
  const payload =
    input.pageType === "article_detail"
      ? {
          question: input.question,
          pageType: input.pageType,
          route: input.route,
          pageTitle: input.pageTitle,
          selectionText: input.selectionText ?? "",
          articleContext: buildArticleDetailContext(input),
          searchSources,
        }
      : {
          question: input.question,
          pageType: input.pageType,
          route: input.route,
          pageTitle: input.pageTitle,
          selectionText: input.selectionText ?? "",
          context: input.context,
          searchSources,
        };
  return JSON.stringify(payload, null, 2);
};
```

并增强系统提示：

```ts
- 若当前页面是文章详情页且提供 sourceContent，应优先依据 sourceContent 回答细节问题。
- summary 仅作概览，不得仅复述 summary 作为完整回答。
- 若 sourceContent 为空，再退回 contentPreview 或 summary。
```

- [ ] **Step 4: 运行 API 构建验证 GREEN**

Run: `npm run build`
Working directory: `/opt/idapps/ai_web/apps/api`
Expected: PASS

### Task 5: 增加脚本验证并做最终检查

**Files:**
- Modify: `apps/api/src/scripts/test_article_extract_flow.ts`
- Modify: `apps/api/src/scripts/test_page_agent_flow.ts`
- Modify: `apps/web/src/services/api.ts`
- Modify: `apps/web/src/page_agent/context.ts`

- [ ] **Step 1: 为抽取结果增加断言**

在 `apps/api/src/scripts/test_article_extract_flow.ts` 中增加：

```ts
assert.ok(
  typeof extract.data.sourceContent === "string" && extract.data.sourceContent.length > 0,
  "sourceContent 应返回完整抓取正文"
);
```

- [ ] **Step 2: 为详情页问答上下文增加断言**

在 `apps/api/src/scripts/test_page_agent_flow.ts` 中调整文章详情请求体：

```ts
context: {
  title: "统一身份认证平台",
  summary: "账号激活与登录说明。",
  contentPreview: "当前页面说明账号尚未激活，需要激活后登录。",
  sourceContent:
    "当前页面说明账号尚未激活，需要先完成账号激活后再登录系统，并提供微信扫码、账号登录、验证码登录等入口。",
  author: "系统管理员",
  channelCode: "campus-news",
},
```

并增加断言：

```ts
assert.equal(articleDetail.data.meta.usedCurrentPage, true);
assert.equal(articleDetail.data.meta.usedSiteSearch, false);
```

- [ ] **Step 3: 运行脚本验证**

Run: `npx tsx src/scripts/test_article_extract_flow.ts`
Working directory: `/opt/idapps/ai_web/apps/api`
Expected: PASS，抽取结果包含 `sourceContent`

Run: `npx tsx src/scripts/test_page_agent_flow.ts`
Working directory: `/opt/idapps/ai_web/apps/api`
Expected: PASS，详情页请求可带 `sourceContent`

- [ ] **Step 4: 运行最终构建与诊断**

Run: `npm run build`
Working directory: `/opt/idapps/ai_web/apps/api`
Expected: PASS

Run: `npm run build`
Working directory: `/opt/idapps/ai_web/apps/web`
Expected: PASS

Run: 使用编辑器诊断检查以下文件
Expected:
- `apps/api/src/lib/store.ts` 无新增错误
- `apps/api/src/modules/articles/url_extract_service.ts` 无新增错误
- `apps/api/src/modules/articles/routes.ts` 无新增错误
- `apps/api/src/modules/page_agent/prompts.ts` 无新增错误
- `apps/web/src/page_agent/context.ts` 无新增错误
- `apps/web/src/services/api.ts` 无新增错误

## 自检

### Spec 覆盖检查

- 新字段 `sourceContent`：Task 1
- 抓取链路写入：Task 2
- 详情接口返回：Task 2
- 前端详情页上下文传递：Task 3
- page agent 优先使用：Task 4
- 为空时降级：Task 4
- 不扩到其他页面：本计划仅修改详情页 context 与 page agent article_detail 场景

### 占位扫描

- 所有文件路径明确
- 每个任务都有具体命令
- 每个代码步骤都给出实际片段
- 无 `TODO`、`TBD`、模糊占位

### 一致性检查

- 数据库字段统一为 `source_content`
- 前后端字段统一为 `sourceContent`
- 仅在 `article_detail` 上下文里新增该字段
