# 内容中枢提取质量与批量操作 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提升自动提取内容质量（摘要容错、正文结构化、作者机构化）并为内容中枢列表增加多选批量发布/删除/转草稿能力。

**Architecture:** 后端继续以 `url_extract_service` 为提取核心，调整提示词与字段提取优先级，保持创建/更新/删除接口不变。前端在 `AdminPage` 增加多选状态与批量动作，复用现有单篇接口进行批处理。通过回归脚本和类型检查验证全链路行为。

**Tech Stack:** TypeScript, Express, Zod, Axios, Cheerio, Vue 3, tsx

---

### Task 1: 调整摘要容错与正文结构化提示词

**Files:**
- Modify: `apps/api/src/modules/articles/url_extract_service.ts`
- Test: `apps/api/src/scripts/test_article_extract_flow.ts`

- [ ] **Step 1: 在回归脚本中先写失败断言（RED）**

```ts
assert.ok(extract.data.summary.length <= 250);
assert.match(String(extract.data.content), /^##\s+/m);
assert.match(String(extract.data.content), /\*\*.+\*\*/);
```

- [ ] **Step 2: 运行回归脚本确认失败**

Run: `cd /opt/idapps/ai_web/apps/api && npm exec tsx src/scripts/test_article_extract_flow.ts`  
Expected: FAIL，提示正文缺少小标题或加粗标记，或摘要超限处理不符合断言。

- [ ] **Step 3: 最小实现：放宽摘要上限到 250，保持 LLM 目标 180**

```ts
const normalizeSummary = (content: string): string => {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= 250) return normalized;
  return `${normalized.slice(0, 249).trim().replace(/[，、；：,.]*$/, "")}。`;
};
```

- [ ] **Step 4: 最小实现：正文提示词改为“自适应分段+小标题+段内加粗”**

```ts
const buildPrompt = (...) => `
你是内容中枢资深编辑。请输出可直接发布的中文正文，只返回 JSON：
{"content":"...","channelCode":"...","author":"..."}

要求：
1. 根据文章内容自适应分段，不固定段数和标题名称。
2. 每段必须有 Markdown 小标题（## 标题）。
3. 段内对关键事实/数字/结论使用 **加粗**。
4. 不编造事实，不保留导航广告免责声明等噪音。
...`;
```

- [ ] **Step 5: 运行回归脚本验证通过（GREEN）**

Run: `cd /opt/idapps/ai_web/apps/api && npm exec tsx src/scripts/test_article_extract_flow.ts`  
Expected: PASS，且断言中摘要 `<=250`、正文包含小标题和加粗。

- [ ] **Step 6: 提交**

```bash
cd /opt/idapps/ai_web
git add \
  /opt/idapps/ai_web/apps/api/src/modules/articles/url_extract_service.ts \
  /opt/idapps/ai_web/apps/api/src/scripts/test_article_extract_flow.ts
git commit -m "feat: improve extract summary tolerance and structured content prompt"
```

### Task 2: 作者改为机构优先、站点兜底

**Files:**
- Modify: `apps/api/src/modules/articles/url_extract_service.ts`
- Test: `apps/api/src/scripts/test_article_extract_flow.ts`

- [ ] **Step 1: 在回归脚本新增失败断言（RED）**

```ts
assert.equal(pmcPage.data.author, "Institute of Advanced Clinical Medicine");
```

- [ ] **Step 2: 运行回归脚本确认失败**

Run: `cd /opt/idapps/ai_web/apps/api && npm exec tsx src/scripts/test_article_extract_flow.ts`  
Expected: FAIL，当前作者仍可能为个人姓名或机构/个人混合文本。

- [ ] **Step 3: 最小实现：机构字段优先抽取**

```ts
const pickAuthor = ($: cheerio.CheerioAPI): string | undefined => {
  const institutions = [...new Set(collectMetaValues($, "citation_author_institution"))];
  if (institutions.length > 0) return institutions[0];
  const siteName =
    $('meta[property="og:site_name"]').attr("content")?.trim() ||
    $('meta[name="application-name"]').attr("content")?.trim() ||
    undefined;
  if (siteName) return siteName;
  return /* 现有个人作者选择器兜底 */;
};
```

- [ ] **Step 4: 最小实现：提示词同步声明作者为机构/站点名称**

```ts
author 要求：
优先返回机构名称；若无法确认机构，返回站点名称；都无法确认时返回空字符串。
```

- [ ] **Step 5: 运行回归脚本验证通过（GREEN）**

Run: `cd /opt/idapps/ai_web/apps/api && npm exec tsx src/scripts/test_article_extract_flow.ts`  
Expected: PASS，PMC 场景作者为机构名称，`missingFields` 不包含 `author`。

- [ ] **Step 6: 提交**

```bash
cd /opt/idapps/ai_web
git add \
  /opt/idapps/ai_web/apps/api/src/modules/articles/url_extract_service.ts \
  /opt/idapps/ai_web/apps/api/src/scripts/test_article_extract_flow.ts
git commit -m "feat: prioritize institution or site name for extracted author"
```

### Task 3: 内容中枢列表多选与批量操作

**Files:**
- Modify: `apps/web/src/views/AdminPage.vue`
- Modify: `apps/web/src/services/api.ts`

- [ ] **Step 1: 先写失败场景（RED，手工验收步骤）**

```text
1. 进入内容中枢文章管理
2. 尝试多选两篇文章
3. 预期应出现批量发布/转草稿/删除按钮
4. 当前版本不存在上述能力（失败）
```

- [ ] **Step 2: 最小实现：增加选择状态与全选当前页**

```ts
const selectedIds = ref<string[]>([]);
const toggleSelect = (id: string): void => { ... };
const toggleSelectCurrentPage = (): void => { ... };
const clearSelection = (): void => { selectedIds.value = []; };
```

- [ ] **Step 3: 最小实现：增加三个批量动作**

```ts
const batchSetStatus = async (status: "draft" | "published"): Promise<void> => {
  await Promise.all(selectedIds.value.map((id) => updateArticle(id, { status })));
  clearSelection();
  await loadArticles();
};

const batchDelete = async (): Promise<void> => {
  if (!window.confirm("确认批量删除所选文章吗？")) return;
  await Promise.all(selectedIds.value.map((id) => deleteArticle(id)));
  clearSelection();
  await loadArticles();
};
```

- [ ] **Step 4: 最小实现：在列表区域新增复选框和批量按钮**

```vue
<input type="checkbox" ... />
<button @click="batchSetStatus('published')" :disabled="selectedIds.length===0">一键发布</button>
<button @click="batchSetStatus('draft')" :disabled="selectedIds.length===0">转为草稿</button>
<button @click="batchDelete" :disabled="selectedIds.length===0">删除</button>
```

- [ ] **Step 5: 前端构建验证（GREEN）**

Run: `cd /opt/idapps/ai_web/apps/web && npm run build`  
Expected: PASS，无新增 TS 错误。

- [ ] **Step 6: 手工验收批量能力**

```text
1. 勾选多篇文章
2. 点击一键发布，确认状态变为已发布
3. 再勾选多篇点击转为草稿，确认状态变更
4. 勾选多篇点击删除，确认删除并刷新后列表减少
```

- [ ] **Step 7: 提交**

```bash
cd /opt/idapps/ai_web
git add \
  /opt/idapps/ai_web/apps/web/src/views/AdminPage.vue \
  /opt/idapps/ai_web/apps/web/src/services/api.ts
git commit -m "feat: support multi-select batch operations in content hub"
```

### Task 4: 端到端验证与收尾

**Files:**
- Verify: `apps/api/src/modules/articles/url_extract_service.ts`
- Verify: `apps/api/src/scripts/test_article_extract_flow.ts`
- Verify: `apps/web/src/views/AdminPage.vue`

- [ ] **Step 1: 执行后端回归与类型检查**

Run:

```bash
cd /opt/idapps/ai_web/apps/api
npm exec tsx src/scripts/test_article_extract_flow.ts
npm run typecheck
```

Expected:
- `article extract flow test passed`
- `tsc --noEmit` 退出码为 `0`

- [ ] **Step 2: 执行前端构建检查**

Run:

```bash
cd /opt/idapps/ai_web/apps/web
npm run build
```

Expected: 构建成功。

- [ ] **Step 3: 使用真实链接手工验收提取效果**

```text
URL: https://pmc.ncbi.nlm.nih.gov/articles/PMC12558038/
检查项：
1. 摘要长度 <= 250（目标仍接近 120-180）
2. 正文有自适应小标题分段
3. 段内存在加粗重点
4. 作者显示为机构或站点名称
```

- [ ] **Step 4: 最终提交**

```bash
cd /opt/idapps/ai_web
git add \
  /opt/idapps/ai_web/apps/api/src/modules/articles/url_extract_service.ts \
  /opt/idapps/ai_web/apps/api/src/scripts/test_article_extract_flow.ts \
  /opt/idapps/ai_web/apps/web/src/views/AdminPage.vue \
  /opt/idapps/ai_web/apps/web/src/services/api.ts
git commit -m "feat: optimize extract quality and add batch operations in content hub"
```
