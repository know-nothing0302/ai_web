# Content Hub Extract Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make URL extraction return a `120-180` character summary, an LLM-written publishable article body, and a source-derived author that falls back to the current user only when the page cannot provide one.

**Architecture:** Keep the existing `/api/articles/extract-from-url` entry point and current Admin page workflow. Change the extraction service so cleaned page text becomes LLM input instead of final article content, expand the response to include source author data, and let the create-article flow accept an explicit `authorName` from the form. Verify the behavior with the existing extraction regression script plus frontend type/build checks.

**Tech Stack:** TypeScript, Express, Zod, Axios, Cheerio, Vue 3, existing script-based regression checks

---

### Task 1: Lock In The New Extraction Contract With A Failing Regression Test

**Files:**
- Modify: `/opt/idapps/ai_web/apps/api/src/scripts/test_article_extract_flow.ts`
- Test: `/opt/idapps/ai_web/apps/api/src/scripts/test_article_extract_flow.ts`

- [ ] **Step 1: Update the fixture HTML and mocked AI payload to express the new behavior**

```ts
const articleHtml = `
<!doctype html>
<html lang="zh-CN">
  <head>
    <title>医学 AI 前沿观察</title>
    <meta property="article:published_time" content="2026-04-27T08:00:00.000Z" />
    <meta name="author" content="徐医融媒中心" />
  </head>
  <body>
    <header>
      <nav>首页 | 资讯 | 关于我们</nav>
    </header>
    <main>
      <article>
        <h1>医学 AI 前沿观察</h1>
        <p>来源：徐医融媒中心</p>
        <p>这是用于提取测试的正文第一段，包含医学影像与智能辅助诊疗内容。</p>
        <p>这是用于提取测试的正文第二段，包含教学、科研与医院应用场景。</p>
        <p>这是用于提取测试的正文第三段，补充临床决策支持、数据治理与实际部署经验。</p>
        <p>免责声明：本文仅供站点演示使用。</p>
      </article>
    </main>
  </body>
</html>
`;

content: JSON.stringify({
  summary:
    "该文聚焦医学人工智能在影像分析、辅助诊疗、教学科研和医院治理中的应用进展，梳理了临床决策支持、数据治理与落地实施的关键场景，可为高校和医院推进智能化建设提供参考。",
  content:
    "医学人工智能正在从单点辅助走向教学、科研和临床协同应用。文章围绕医学影像分析、智能辅助诊疗、临床决策支持与数据治理等场景，梳理了高校和医院在落地过程中的关键能力建设。对于推进智慧医疗与医学教育协同发展，这些实践经验具有较强参考价值。",
  channelCode: "medical-frontier",
  author: "徐医融媒中心",
}),
```

- [ ] **Step 2: Add assertions that fail under the current implementation**

```ts
assert.equal(extract.data.author, "徐医融媒中心");
assert.ok(extract.data.summary.length >= 120);
assert.ok(extract.data.summary.length <= 180);
assert.match(String(extract.data.content), /医学人工智能正在从单点辅助走向/);
assert.doesNotMatch(String(extract.data.content), /免责声明|首页 \| 资讯/);
assert.notEqual(extract.data.content, [
  "来源：徐医融媒中心",
  "这是用于提取测试的正文第一段，包含医学影像与智能辅助诊疗内容。",
  "这是用于提取测试的正文第二段，包含教学、科研与医院应用场景。",
  "这是用于提取测试的正文第三段，补充临床决策支持、数据治理与实际部署经验。",
  "免责声明：本文仅供站点演示使用。",
].join("\\n\\n"));
assert.deepEqual(extract.data.meta.missingFields, []);
```

- [ ] **Step 3: Run the regression script and confirm it fails for the right reason**

Run:

```bash
npm exec tsx src/scripts/test_article_extract_flow.ts
```

Expected: FAIL because `extract.data.author` is missing and `extract.data.content` still equals the cleaned raw page text.

- [ ] **Step 4: Commit the failing test change**

```bash
git add /opt/idapps/ai_web/apps/api/src/scripts/test_article_extract_flow.ts
git commit -m "test: cover rewritten extract content and source author"
```

### Task 2: Implement The Backend Extraction Contract

**Files:**
- Modify: `/opt/idapps/ai_web/apps/api/src/modules/articles/url_extract_service.ts`
- Modify: `/opt/idapps/ai_web/apps/api/src/modules/articles/routes.ts`
- Test: `/opt/idapps/ai_web/apps/api/src/scripts/test_article_extract_flow.ts`

- [ ] **Step 1: Extend the extraction schema, result type, and page parsing helpers**

```ts
const aiExtractSchema = z.object({
  summary: z.string().trim().min(120).max(180),
  content: z.string().trim().min(80).max(5000),
  channelCode: z.string().trim().min(1).max(64),
  author: z.string().trim().min(1).max(80).optional(),
});

export interface UrlExtractResult {
  title?: string;
  content: string;
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

const parseAuthor = ($: cheerio.CheerioAPI): string | undefined => {
  const candidates = [
    $('meta[name="author"]').attr("content"),
    $('meta[property="article:author"]').attr("content"),
    $('[rel="author"]').first().text(),
    $(".author").first().text(),
    $(".byline").first().text(),
  ]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean);
  return candidates[0] || undefined;
};
```

- [ ] **Step 2: Replace the old prompt with a single structured extraction prompt**

```ts
const buildPrompt = (
  title: string | undefined,
  content: string,
  author: string | undefined,
  channels: Array<{ code: string; name: string }>
): string => `
你是内容中枢资深编辑，请基于网页素材输出可直接发布的结果，只返回 JSON。

返回结构：
{"summary":"120-180字中文摘要","content":"可发布中文正文","channelCode":"...","author":"..."}

要求：
1. summary 必须为 120-180 字。
2. content 必须是适合内容中枢发布的成稿，不要照抄网页段落。
3. 删除导航、广告、免责声明、版权尾注和无关信息。
4. 不得编造事实、时间、作者、数据。
5. author 优先依据页面作者信息；无法确认时返回空字符串。
6. channelCode 只能从下列栏目中选择一个：
${channels.map((item) => `${item.code}: ${item.name}`).join("\n")}

标题：
${title ?? ""}

页面作者候选：
${author ?? ""}

网页正文素材：
${content.slice(0, 4000)}
`;
```

- [ ] **Step 3: Return rewritten content and source author from `extractArticleFromUrl()`**

```ts
const extracted = buildPlainText(html);
logger.info("article.extract.author.detected", {
  url: input.url,
  author: extracted.author,
});

const aiResult = await requestAiExtraction(
  extracted.title,
  extracted.content,
  extracted.author
);

const missingFields = [
  !extracted.title ? "title" : "",
  !extracted.publishedAt ? "publishedAt" : "",
  !aiResult.summary ? "summary" : "",
  !aiResult.content ? "content" : "",
  !aiResult.channelCode ? "channelCode" : "",
  !(aiResult.author || extracted.author) ? "author" : "",
].filter(Boolean);

return {
  title: extracted.title,
  content: aiResult.content,
  summary: aiResult.summary,
  author: aiResult.author || extracted.author,
  channelCode: aiResult.channelCode,
  originalUrl: input.url,
  publishedAt: extracted.publishedAt,
  meta: {
    contentLength: extracted.content.length,
    missingFields,
  },
};
```

- [ ] **Step 4: Update the route schema to expose the new author field**

```ts
response.json(result);
```

Expected change: no new route is needed, but the inferred response from `extractArticleFromUrl()` now includes `author`.

- [ ] **Step 5: Run the regression script and verify it passes**

Run:

```bash
npm exec tsx src/scripts/test_article_extract_flow.ts
```

Expected: PASS with `article extract flow test passed`.

- [ ] **Step 6: Run backend type checking**

Run:

```bash
npm run typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 7: Commit the backend implementation**

```bash
git add \
  /opt/idapps/ai_web/apps/api/src/modules/articles/url_extract_service.ts \
  /opt/idapps/ai_web/apps/api/src/modules/articles/routes.ts \
  /opt/idapps/ai_web/apps/api/src/scripts/test_article_extract_flow.ts
git commit -m "feat: improve extracted article quality"
```

### Task 3: Let The Admin Form Preserve And Submit Source Author

**Files:**
- Modify: `/opt/idapps/ai_web/apps/web/src/services/api.ts`
- Modify: `/opt/idapps/ai_web/apps/web/src/views/AdminPage.vue`
- Modify: `/opt/idapps/ai_web/apps/api/src/modules/articles/routes.ts`

- [ ] **Step 1: Expand frontend API types and create payload**

```ts
export interface ArticleExtractResult {
  title?: string;
  content: string;
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

export const createArticle = async (payload: {
  title: string;
  summary: string;
  content: string;
  authorName?: string;
  originalUrl?: string;
  publishedAt?: string;
  channelCode: string;
  category?: string;
  tags: string[];
  status: "draft" | "published";
}): Promise<Article> => {
  const result = await request.post<Article>("/articles", payload);
  return result.data;
};
```

- [ ] **Step 2: Update the article create schema to accept an explicit author**

```ts
const createSchema = z.object({
  title: z.string().min(1),
  summary: z.string().trim().min(1).optional(),
  content: z.string().min(1),
  authorName: z.string().trim().min(1).max(80).optional(),
  originalUrl: originalUrlSchema,
  publishedAt: publishedAtSchema,
  channelCode: z.string().trim().min(1).max(64).optional(),
  category: z.string().trim().min(1).max(120).optional(),
  tags: z.array(z.string()).default([]),
  status: z.enum(["draft", "published"]).default("draft"),
});

author: payload.authorName?.trim() ||
  currentUser?.displayName ||
  currentUser?.username ||
  "未知用户",
```

- [ ] **Step 3: Add author state, extraction backfill, and submit wiring in the Admin page**

```ts
const authorName = ref("");

const clearForm = (): void => {
  title.value = "";
  content.value = "";
  summary.value = "";
  authorName.value = "";
  originalUrl.value = "";
  extractUrl.value = "";
  publishedAt.value = "";
  channelCode.value = channels.value[0]?.code ?? "";
  status.value = "draft";
};

if (result.author) {
  authorName.value = result.author;
}

await createArticle({
  title: title.value,
  channelCode: channelCode.value,
  content: content.value,
  summary: summary.value,
  authorName: authorName.value.trim() || undefined,
  originalUrl: originalUrl.value.trim() || undefined,
  publishedAt: normalizePublishedAt(publishedAt.value),
  status: status.value,
  tags: [],
});
```

- [ ] **Step 4: Add the author input to the existing right-hand form column**

```vue
<div class="space-y-2">
  <label class="text-sm font-medium text-[#4f6b8a]">作者</label>
  <input
    v-model="authorName"
    type="text"
    class="input-ai"
    placeholder="优先自动提取来源作者"
  />
</div>
```

- [ ] **Step 5: Run frontend build/type verification**

Run:

```bash
cd /opt/idapps/ai_web/apps/web
npm run build
```

Expected: PASS with a successful production build.

- [ ] **Step 6: Commit the form and API changes**

```bash
git add \
  /opt/idapps/ai_web/apps/web/src/services/api.ts \
  /opt/idapps/ai_web/apps/web/src/views/AdminPage.vue \
  /opt/idapps/ai_web/apps/api/src/modules/articles/routes.ts
git commit -m "feat: preserve extracted source author in content hub"
```

### Task 4: Final Verification And Cleanup

**Files:**
- Verify: `/opt/idapps/ai_web/apps/api/src/modules/articles/url_extract_service.ts`
- Verify: `/opt/idapps/ai_web/apps/api/src/modules/articles/routes.ts`
- Verify: `/opt/idapps/ai_web/apps/web/src/views/AdminPage.vue`
- Verify: `/opt/idapps/ai_web/apps/api/src/scripts/test_article_extract_flow.ts`

- [ ] **Step 1: Run the full verification sequence**

Run:

```bash
cd /opt/idapps/ai_web/apps/api
npm exec tsx src/scripts/test_article_extract_flow.ts
npm run typecheck
cd /opt/idapps/ai_web/apps/web
npm run build
```

Expected:
- `article extract flow test passed`
- backend `tsc` exits with code `0`
- frontend build finishes successfully

- [ ] **Step 2: Spot-check the runtime behavior in the Admin page**

Manual check:

```text
1. 打开内容中枢新增文章区域
2. 输入公开网页 URL 并点击“自动提取”
3. 确认作者字段被自动回填
4. 确认摘要约为 120-180 字
5. 确认正文是可发布稿，不含导航或免责声明
6. 点击“一键发布”并确认列表中的作者显示为来源作者
```

- [ ] **Step 3: Commit the verification-ready state**

```bash
git add \
  /opt/idapps/ai_web/apps/api/src/modules/articles/url_extract_service.ts \
  /opt/idapps/ai_web/apps/api/src/modules/articles/routes.ts \
  /opt/idapps/ai_web/apps/api/src/scripts/test_article_extract_flow.ts \
  /opt/idapps/ai_web/apps/web/src/services/api.ts \
  /opt/idapps/ai_web/apps/web/src/views/AdminPage.vue
git commit -m "feat: refine article extraction author summary and content"
```
