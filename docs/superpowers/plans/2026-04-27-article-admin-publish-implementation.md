# 内容中枢与文章发布改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正文章状态切换与发布时间语义，补充删除能力、摘要 Markdown 展示和内容中枢默认排序。

**Architecture:** 后端继续沿用 `articles` 表的 `published_at` 字段，但仅作为外部传入或人工录入的真实发布时间，不再由状态切换自动改写。前端在内容中枢增加发布时间输入与删除入口，详情页将摘要与正文统一为 Markdown 渲染，列表排序改为 `created_at DESC`。

**Tech Stack:** TypeScript, Express, Zod, PostgreSQL, Vue 3, Axios, Marked, DOMPurify

---

### Task 1: 后端回归脚本先锁定发布时间与删除行为

**Files:**
- Modify: `apps/api/src/scripts/test_publish_flow.ts`
- Test: `apps/api/src/scripts/test_publish_flow.ts`

- [ ] **Step 1: 写失败用例，覆盖 `publishedAt` 保留和删除能力**

```ts
    const createdPublishedAt = "2026-01-29T08:00:00.000Z";
    const publishWithPublishedAt = await axios.post(
      `${baseUrl}/api/articles/publish`,
      {
        userId: "100002",
        article: {
          title: "真实发布时间测试",
          channelCode: "policy-ethics",
          content: "发布时间应来自外部传入",
          publishedAt: createdPublishedAt,
        },
      },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        validateStatus: () => true,
      }
    );
    assertStatus(
      publishWithPublishedAt.status,
      201,
      "publish with explicit publishedAt",
      publishWithPublishedAt.data
    );
    assert.equal(publishWithPublishedAt.data.article.publishedAt, createdPublishedAt);
```

- [ ] **Step 2: 再写状态切换不改写发布时间的回归脚本**

```ts
    const updatedToDraft = await axios.patch(
      `${baseUrl}/api/articles/${publishWithPublishedAt.data.article.id}`,
      { status: "draft" },
      { validateStatus: () => true, headers: sessionHeaders }
    );
    assertStatus(updatedToDraft.status, 200, "set draft keeps publishedAt", updatedToDraft.data);
    assert.equal(updatedToDraft.data.publishedAt, createdPublishedAt);

    const updatedToPublished = await axios.patch(
      `${baseUrl}/api/articles/${publishWithPublishedAt.data.article.id}`,
      { status: "published" },
      { validateStatus: () => true, headers: sessionHeaders }
    );
    assertStatus(updatedToPublished.status, 200, "set published keeps publishedAt", updatedToPublished.data);
    assert.equal(updatedToPublished.data.publishedAt, createdPublishedAt);
```

- [ ] **Step 3: 再加删除回归脚本**

```ts
    const deleteArticle = await axios.delete(
      `${baseUrl}/api/articles/${publishWithPublishedAt.data.article.id}`,
      { validateStatus: () => true, headers: sessionHeaders }
    );
    assertStatus(deleteArticle.status, 204, "delete article", deleteArticle.data);

    const getDeletedArticle = await axios.get(
      `${baseUrl}/api/articles/${publishWithPublishedAt.data.article.id}`,
      { validateStatus: () => true, headers: sessionHeaders }
    );
    assertStatus(getDeletedArticle.status, 404, "deleted article not found", getDeletedArticle.data);
```

- [ ] **Step 4: 运行脚本，确认先失败**

Run: `npm run test:publish-flow`

Expected: 至少一项因 `publishedAt` 未透传、状态切换改写时间、或缺少删除接口而失败。

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/scripts/test_publish_flow.ts
git commit -m "test: cover article publish time and delete behavior"
```

### Task 2: 后端模型与路由改成显式发布时间语义

**Files:**
- Modify: `apps/api/src/lib/types.ts`
- Modify: `apps/api/src/modules/articles/routes.ts`

- [ ] **Step 1: 为创建、更新、外部发布 schema 增加 `publishedAt`**

```ts
const publishedAtSchema = z.string().trim().datetime().optional();

const createSchema = z.object({
  title: z.string().min(1),
  summary: z.string().trim().min(1).optional(),
  content: z.string().min(1),
  originalUrl: originalUrlSchema,
  publishedAt: publishedAtSchema,
  channelCode: z.string().trim().min(1).max(64).optional(),
  category: z.string().trim().min(1).max(120).optional(),
  tags: z.array(z.string()).default([]),
  status: z.enum(["draft", "published"]).default("draft"),
});
```

- [ ] **Step 2: 外部发布请求也允许 `article.publishedAt`**

```ts
article: z.object({
  title: z.string().trim().min(1).max(180),
  channelCode: z.string().trim().min(1).max(64).optional(),
  category: z.string().trim().min(1).max(120).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  status: z.enum(["draft"]).default("draft"),
  summary: z.string().trim().min(1).max(400).optional(),
  content: z.string().trim().min(1).optional(),
  originalUrl: originalUrlSchema,
  publishedAt: publishedAtSchema,
  layout: layoutSchema.optional(),
  authorName: z.string().trim().min(1).max(80).optional(),
})
```

- [ ] **Step 3: 创建与外部发布都直接使用传入的 `publishedAt`**

```ts
  const item = await articleStore.create({
    ...payload,
    summary: payload.summary?.trim() || buildSummary(payload.content),
    originalUrl: payload.originalUrl?.trim(),
    publishedAt: payload.publishedAt?.trim(),
    channelCode: channel.code,
    category: channel.name,
    createdByUserId: currentUser?.id,
    author: currentUser?.displayName ?? currentUser?.username ?? "未知用户",
  });
```

```ts
  const item = await articleStore.create({
    createdByUserId: payload.userId,
    title: payload.article.title.trim(),
    summary,
    content: formattedContent,
    originalUrl: payload.article.originalUrl?.trim() ?? payload.originalUrl?.trim(),
    publishedAt: payload.article.publishedAt?.trim(),
    channelCode: channel.code,
    category: channel.name,
    tags: payload.article.tags.map((tag) => tag.trim()),
    status: payload.article.status,
    author: payload.article.authorName?.trim() || `agent:${payload.userId}`,
  });
```

- [ ] **Step 4: 状态切换时不再自动改写 `publishedAt`**

```ts
  const item = await articleStore.update(id, {
    ...payload,
    ...channelPatch,
  });
```

- [ ] **Step 5: 同步规格接口文档字段**

```ts
publishedAt: { type: "string", format: "date-time" }
```

- [ ] **Step 6: 运行类型检查，确认路由层通过**

Run: `npm run typecheck`

Expected: `tsc -p tsconfig.json --noEmit` 退出码为 `0`

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/lib/types.ts apps/api/src/modules/articles/routes.ts
git commit -m "feat: accept explicit article publish time"
```

### Task 3: 后端补删除接口与列表默认排序

**Files:**
- Modify: `apps/api/src/lib/store.ts`
- Modify: `apps/api/src/modules/articles/routes.ts`

- [ ] **Step 1: 将文章列表排序从 `updated_at DESC` 改为 `created_at DESC`**

```ts
      ORDER BY articles.created_at DESC
```

- [ ] **Step 2: 在 store 增加删除方法**

```ts
  async remove(id: string): Promise<boolean> {
    const result = await query<{ id: string }>(
      `
      DELETE FROM articles
      WHERE id = $1
      RETURNING id
      `,
      [id]
    );
    return result.rows.length > 0;
  },
```

- [ ] **Step 3: 在路由增加删除接口**

```ts
articleRouter.delete("/:id", requireContentHubOperator, async (request, response) => {
  const id = request.params.id.toString();
  const removed = await articleStore.remove(id);
  if (!removed) {
    response.status(404).json({ message: "文章不存在" });
    return;
  }
  response.status(204).send();
});
```

- [ ] **Step 4: 运行发布流脚本，确认删除与排序相关行为通过**

Run: `npm run test:publish-flow`

Expected: 通过，且删除相关断言通过。

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/store.ts apps/api/src/modules/articles/routes.ts
git commit -m "feat: add article delete and default created order"
```

### Task 4: 前端 API 类型与内容中枢操作能力补齐

**Files:**
- Modify: `apps/web/src/services/api.ts`
- Modify: `apps/web/src/views/AdminPage.vue`

- [ ] **Step 1: API 类型补 `publishedAt`、`createdAt`、`updatedAt` 与删除方法**

```ts
export interface Article {
  id: string;
  title: string;
  summary: string;
  content: string;
  originalUrl?: string;
  channelCode: string;
  channelName?: string;
  category: string;
  tags: string[];
  status: "draft" | "published";
  author: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export const deleteArticle = async (id: string): Promise<void> => {
  await request.delete(`/articles/${id}`);
};
```

- [ ] **Step 2: 内容中枢表单增加发布时间输入**

```vue
<div class="space-y-2">
  <label class="text-sm font-medium text-[#4f6b8a]">发布时间</label>
  <input
    v-model="publishedAt"
    type="datetime-local"
    class="input-ai"
  />
</div>
```

- [ ] **Step 3: 提交创建与状态切换时只提交需要的字段**

```ts
await createArticle({
  title: title.value,
  channelCode: channelCode.value,
  content: content.value,
  summary: summary.value,
  originalUrl: originalUrl.value.trim() || undefined,
  publishedAt: normalizeDateTimeLocal(publishedAt.value),
  status: status.value,
  tags: [],
});
```

```ts
await updateArticle(item.id, { status: nextStatus });
```

- [ ] **Step 4: 列表操作区增加删除按钮**

```vue
<div class="flex items-center gap-2 shrink-0">
  <button
    type="button"
    class="btn-secondary text-xs whitespace-nowrap"
    @click="toggleArticleStatus(item)"
  >
    {{ item.status === "published" ? "转为草稿" : "设为发布" }}
  </button>
  <button
    type="button"
    class="text-xs px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
    @click="removeArticle(item)"
  >
    删除
  </button>
</div>
```

- [ ] **Step 5: 删除后刷新列表并清晰提示**

```ts
const removeArticle = async (item: Article): Promise<void> => {
  if (!window.confirm(`确认删除《${item.title}》吗？`)) {
    return;
  }
  try {
    await deleteArticle(item.id);
    message.value = "文章已删除";
    await loadArticles();
  } catch (error: any) {
    message.value = error.response?.data?.message || "删除失败";
  }
};
```

- [ ] **Step 6: 运行类型检查**

Run: `npm run typecheck`

Expected: 前端 TypeScript 校验通过。

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/services/api.ts apps/web/src/views/AdminPage.vue
git commit -m "feat: add article publish time input and delete action"
```

### Task 5: 文章详情页摘要支持 Markdown，发布时间只显示真实值

**Files:**
- Modify: `apps/web/src/views/ArticleDetailPage.vue`

- [ ] **Step 1: 为摘要增加独立 Markdown 渲染结果**

```ts
const parsedSummary = computed(() => {
  if (!item.value?.summary) {
    return "";
  }
  const rawHtml = marked.parse(item.value.summary, { breaks: true }) as string;
  return DOMPurify.sanitize(rawHtml);
});
```

- [ ] **Step 2: 摘要区改为安全 HTML 渲染**

```vue
<div
  class="prose prose-slate max-w-none text-[#355878] leading-relaxed
         prose-headings:text-[#0f4069] prose-p:my-3 prose-ul:my-3 prose-ol:my-3"
  v-html="parsedSummary"
></div>
```

- [ ] **Step 3: 发布时间仅显示真实值，不再伪造兜底值**

```ts
const formatDate = (isoString?: string) => {
  if (!isoString) return "未提供";
  const date = new Date(isoString);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};
```

- [ ] **Step 4: 本地人工验证**

Run: `npm run dev`

Expected:
- 摘要中的标题、列表、链接可正确显示
- `publishedAt` 为空时显示“未提供”
- 正文渲染行为不受影响

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/views/ArticleDetailPage.vue
git commit -m "feat: render article summary as markdown"
```

### Task 6: 最终验证与收尾

**Files:**
- Modify: `apps/api/src/scripts/test_publish_flow.ts`
- Modify: `apps/api/src/modules/articles/routes.ts`
- Modify: `apps/api/src/lib/store.ts`
- Modify: `apps/web/src/services/api.ts`
- Modify: `apps/web/src/views/AdminPage.vue`
- Modify: `apps/web/src/views/ArticleDetailPage.vue`

- [ ] **Step 1: 运行后端回归脚本**

Run: `npm run test:publish-flow`

Expected: `publish flow test passed`

- [ ] **Step 2: 运行 API 类型检查**

Run: `npm run typecheck`

Expected: 退出码 `0`

- [ ] **Step 3: 运行前端构建或类型检查**

Run: `npm run build`

Expected: 构建成功，无新增错误

- [ ] **Step 4: 检查已改文件诊断**

Run: VS Code diagnostics on:
- `apps/api/src/modules/articles/routes.ts`
- `apps/api/src/lib/store.ts`
- `apps/web/src/views/AdminPage.vue`
- `apps/web/src/views/ArticleDetailPage.vue`
- `apps/web/src/services/api.ts`

Expected: 无新增错误级问题。

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/scripts/test_publish_flow.ts apps/api/src/modules/articles/routes.ts apps/api/src/lib/store.ts apps/web/src/services/api.ts apps/web/src/views/AdminPage.vue apps/web/src/views/ArticleDetailPage.vue
git commit -m "feat: align article publish semantics and admin actions"
```
