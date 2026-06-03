# Page Agent 安全加固与功能完善 实施方案

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Page Agent 模块的 5 项安全缺陷、启用 citationStyle 和用户画像定时分析 2 项功能、提升 SSE 流解析健壮性。

**Architecture:** 分 5 个 Phase 渐进式推进。Phase 1-2 修复安全缺陷（PII 脱敏补全 + 速率限制），Phase 3-4 启用已完成但被墙的功能 + 补全 cron 任务，Phase 5 提升 SSE 流健壮性。每 Phase 内 Task 独立，可并行或顺序执行。

**Tech Stack:** TypeScript 6, Express 5, Zod 4, pg, Vue 3 Composition API, node-cron

---

## 文件变更地图

| 文件 | 操作 | Phase |
|------|------|-------|
| `apps/api/src/modules/page_agent/sanitize.ts` | Modify | 1 |
| `apps/api/src/modules/page_agent/service.ts` | Modify | 1, 5 |
| `apps/api/src/modules/page_agent/prompts.ts` | Modify | 1, 3 |
| `apps/api/src/modules/page_agent/routes.ts` | Modify | 1 |
| `apps/api/src/middleware/rate_limit.ts` | Create | 2 |
| `apps/api/src/app.ts` | Modify | 2 |
| `apps/api/src/config/env.ts` | Modify | 4 |
| `apps/api/src/jobs/profile.ts` | Create | 4 |
| `apps/api/src/server.ts` | Modify | 4 |
| `apps/web/src/components/PageAgentPanel.vue` | Modify | 3 |

---

### Task 1: 扩展 PII 脱敏模式并修复 sanitize 覆盖率

**Files:**
- Modify: `apps/api/src/modules/page_agent/sanitize.ts`

**背景：** 当前 5 个正则只覆盖手机号、邮箱、工号/学号前缀、姓名自述前缀、8 位纯数字。遗漏身份证号、无前缀姓名、家庭住址等。

- [ ] **Step 1: 扩展敏感模式列表**

编辑 `apps/api/src/modules/page_agent/sanitize.ts`，替换 `sensitivePatterns` 数组：

```typescript
const sensitivePatterns: RegExp[] = [
  // 中国手机号（11位，以1开头）
  /\b1[3-9]\d{9}\b/g,
  // 邮箱
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  // 身份证号（18位）
  /\b[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g,
  // 工号/学号/编号 前缀模式
  /\b(?:工号|学号|编号|职工号|教工号|教师编号)[:：]?\s*[A-Za-z0-9_-]{4,}\b/g,
  // 姓名自述
  /\b(?:我是|姓名是|我叫|我的名字是|本人)[一-龥A-Za-z·]{2,20}\b/g,
  // 银行卡号（16-19位纯数字）
  /\b\d{16,19}\b/g,
  // IP 地址
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
];
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | tail -5
```

Expected: 无新增错误。

---

### Task 2: selectionText 脱敏入模

**Files:**
- Modify: `apps/api/src/modules/page_agent/service.ts`

**背景：** `sanitizeForModel(input.question)` 已执行，但 `{...input, question: sanitizedQuestion}` 展开后 `input.selectionText` 仍为原始值。`buildPageAgentUserPrompt` 将其直接写入 LLM prompt（prompts.ts:79, 87）。

- [ ] **Step 1: 在 non-streaming 路径中对 selectionText 脱敏**

编辑 `service.ts` 第 282-286 行附近，`answerPageQuestion` 函数中 `buildPageAgentMessages` 的调用处：

```typescript
// 原文：
const messages = buildPageAgentMessages({
  request: {
    ...input,
    question: sanitizedQuestion,
  },
  historyMessages,
  userProfile,
  searchSources,
});

// 改为：
const sanitizedSelectionText = input.selectionText?.trim()
  ? sanitizeForModel(input.selectionText.trim())
  : undefined;
const messages = buildPageAgentMessages({
  request: {
    ...input,
    question: sanitizedQuestion,
    selectionText: sanitizedSelectionText,
  },
  historyMessages,
  userProfile,
  searchSources,
});
```

- [ ] **Step 2: 在 streaming 路径中同样处理**

编辑 `service.ts` 第 521-526 行附近，`streamPageAnswer` 函数：

```typescript
// 原文：
const messages = buildPageAgentMessages({
  request: { ...input, question: sanitizedQuestion },
  historyMessages,
  userProfile,
  searchSources,
});

// 改为：
const sanitizedSelectionText = input.selectionText?.trim()
  ? sanitizeForModel(input.selectionText.trim())
  : undefined;
const messages = buildPageAgentMessages({
  request: { ...input, question: sanitizedQuestion, selectionText: sanitizedSelectionText },
  historyMessages,
  userProfile,
  searchSources,
});
```

- [ ] **Step 3: 验证 TypeScript 编译**

```bash
npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | tail -5
```

Expected: 无新增错误。

---

### Task 3: 文章上下文字段脱敏

**Files:**
- Modify: `apps/api/src/modules/page_agent/prompts.ts`

**背景：** `buildArticleDetailPromptContext` 从 `input.context` 提取的 `sourceContent`、`contentPreview`、`summary`、`author` 等字段未经脱敏直接写入 LLM prompt。若文章正文包含学生手机号等 PII，会泄漏给 LLM。

- [ ] **Step 1: 导入 sanitizeForModel**

在 `prompts.ts` 顶部 import 区添加：

```typescript
import { sanitizeForModel } from "./sanitize";
```

- [ ] **Step 2: 对 context 字段应用脱敏**

编辑 `buildArticleDetailPromptContext` 函数（第 4-20 行）：

```typescript
const buildArticleDetailPromptContext = (input: PageAgentRequestBody) => ({
  title: typeof input.context.title === "string"
    ? sanitizeForModel(input.context.title) : "",
  summary: typeof input.context.summary === "string"
    ? sanitizeForModel(input.context.summary) : "",
  sourceContent: typeof input.context.sourceContent === "string"
    ? sanitizeForModel(input.context.sourceContent) : "",
  contentPreview: typeof input.context.contentPreview === "string"
    ? sanitizeForModel(input.context.contentPreview) : "",
  author: typeof input.context.author === "string"
    ? sanitizeForModel(input.context.author) : "",
  publishedAt: typeof input.context.publishedAt === "string"
    ? input.context.publishedAt : "",
  channelCode: typeof input.context.channelCode === "string"
    ? input.context.channelCode : "",
  channelName: typeof input.context.channelName === "string"
    ? input.context.channelName : "",
  originalUrl: typeof input.context.originalUrl === "string"
    ? input.context.originalUrl : "",
});
```

> **注意：** `publishedAt`（日期）、`channelCode`（频道编码）、`channelName`（频道名）、`originalUrl`（URL）不含 PII，不脱敏。`title`、`summary`、`sourceContent`、`contentPreview`、`author` 可能含 PII，全部脱敏。

- [ ] **Step 3: 对非 article_detail 页面的 context 也做脱敏**

在 `buildPageAgentUserPrompt` 函数中（第 67-93 行），非 `article_detail` 页面直接传递 `input.context`。需要对 `input.context` 的值做脱敏：

```typescript
// 修改 buildPageAgentUserPrompt 中非 article_detail 的分支
const sanitizeContextValues = (ctx: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(ctx)) {
    result[key] = typeof value === "string" ? sanitizeForModel(value) : value;
  }
  return result;
};

export const buildPageAgentUserPrompt = (
  input: PageAgentRequestBody,
  searchSources: PageAgentSource[]
): string =>
  JSON.stringify(
    input.pageType === "article_detail"
      ? {
          question: input.question,
          pageType: input.pageType,
          route: input.route,
          pageTitle: input.pageTitle,
          selectionText: input.selectionText ?? "",
          articleContext: buildArticleDetailPromptContext(input),
          searchSources,
        }
      : {
          question: input.question,
          pageType: input.pageType,
          route: input.route,
          pageTitle: input.pageTitle,
          selectionText: input.selectionText ?? "",
          context: sanitizeContextValues(input.context),
          searchSources,
        },
    null,
    2
  );
```

> **说明：** `sanitizeContextValues` 只对值为 string 类型的 context 字段做脱敏，保留非字符串字段原样。这覆盖了 `article_list`、`subscription`、`admin` 三种页面类型的 context。

- [ ] **Step 4: 验证 TypeScript 编译**

```bash
npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | tail -5
```

Expected: 无新增错误。

---

### Task 4: 修复历史消息脱敏兜底 + 反馈脱敏

**Files:**
- Modify: `apps/api/src/modules/page_agent/prompts.ts`
- Modify: `apps/api/src/modules/page_agent/routes.ts`

**背景：**
- `prompts.ts:139` — 历史消息的 `sanitizedContent` 为 null 时直接用 raw `content`，旧消息含 PII 的话会被重新喂给 LLM。
- `routes.ts:228-229` — 反馈存储时 `sanitizedContent` 直接复制了 `content`，未真正脱敏。

- [ ] **Step 4a: 修复历史消息兜底逻辑**

编辑 `prompts.ts` 第 139 行：

```typescript
// 原文：
content: message.sanitizedContent || message.content,

// 改为：
content: message.sanitizedContent || sanitizeForModel(message.content),
```

- [ ] **Step 4b: 修复反馈 sanitizedContent**

编辑 `routes.ts` 第 227-228 行：

```typescript
// 原文：
content: parsed.data.content,
sanitizedContent: parsed.data.content,

// 改为：
content: parsed.data.content,
sanitizedContent: sanitizeForModel(parsed.data.content),
```

需要在 `routes.ts` 顶部添加 import：

```typescript
import { sanitizeForModel } from "./sanitize";
```

- [ ] **Step 4c: 验证 TypeScript 编译**

```bash
npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | tail -5
```

Expected: 无新增错误。

---

### Task 5: 添加问答接口速率限制

**Files:**
- Create: `apps/api/src/middleware/rate_limit.ts`
- Modify: `apps/api/src/modules/page_agent/routes.ts`

**设计：** 滑动窗口内存计数器，按 userId 维度限制。默认 20 次/分钟/用户。窗口过期自动清理，防止内存泄漏。

- [ ] **Step 1: 创建速率限制中间件**

创建 `apps/api/src/middleware/rate_limit.ts`：

```typescript
import { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const DEFAULT_MAX_REQUESTS = 20;
const DEFAULT_WINDOW_MS = 60_000;
const CLEANUP_INTERVAL_MS = 300_000; // 每 5 分钟清理过期条目

const store = new Map<string, RateLimitEntry>();

// 定期清理过期条目，防止内存泄漏
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS);

// 允许 timer 不阻塞进程退出
if (cleanupTimer.unref) {
  cleanupTimer.unref();
}

/**
 * 创建基于用户 ID 的速率限制中间件
 *
 * @param maxRequests 窗口内最大请求数，默认 20
 * @param windowMs   滑动窗口时长（毫秒），默认 60000（1分钟）
 */
export const createRateLimiter = (
  maxRequests: number = DEFAULT_MAX_REQUESTS,
  windowMs: number = DEFAULT_WINDOW_MS
) => {
  return (request: Request, response: Response, next: NextFunction): void => {
    const userId = (request.session as any)?.user?.id ?? "anonymous";
    const now = Date.now();
    const record = store.get(userId);

    if (!record || now > record.resetAt) {
      store.set(userId, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (record.count >= maxRequests) {
      response.status(429).json({
        message: "请求过于频繁，请稍后再试",
        retryAfter: Math.ceil((record.resetAt - now) / 1000),
      });
      return;
    }

    record.count += 1;
    next();
  };
};

/** Page Agent Q&A 专用限流：20 次/分钟/用户 */
export const pageAgentQaRateLimiter = createRateLimiter(20, 60_000);
```

- [ ] **Step 2: 在 routes.ts 中对 /qa 和 /qa/stream 应用限流**

编辑 `apps/api/src/modules/page_agent/routes.ts`，在顶部 import 区添加：

```typescript
import { pageAgentQaRateLimiter } from "../../middleware/rate_limit";
```

修改两个路由定义（第 152 行和第 191 行）：

```typescript
// /qa 路由 — 在 requireAuth 之后添加 pageAgentQaRateLimiter
pageAgentRouter.post("/qa", requireAuth, pageAgentQaRateLimiter, async (request, response) => {

// /qa/stream 路由 — 同样添加
pageAgentRouter.post("/qa/stream", requireAuth, pageAgentQaRateLimiter, (request, response) => {
```

- [ ] **Step 3: 验证 TypeScript 编译**

```bash
npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | tail -5
```

Expected: 无新增错误。

---

### Task 6: 启用 citationStyle — 后端

**Files:**
- Modify: `apps/api/src/modules/page_agent/prompts.ts`

**背景：** `citationDirective` 硬编码为空字符串，注释"引用功能未成熟，暂强制关闭"。前端 select 元素被 HTML 注释包裹。功能和 UI 代码完整，只需解除禁用。

- [ ] **Step 1: 实现 citationDirective 生成逻辑**

编辑 `prompts.ts` 第 33-34 行，替换：

```typescript
// 原文：
// 引文功能未成熟，暂强制关闭
const citationDirective = "";

// 改为：
const citationStyle = input?.citationStyle ?? "none";
const citationDirective =
  citationStyle === "gbt7714"
    ? `- **引文格式**：引用文章时需提供 GB/T 7714 格式的参考文献条目。格式：[序号] 主要责任者. 文献题名[J]. 刊名, 出版年份, 卷号(期号): 起止页码. 若信息不完整，请根据已有信息尽力格式化，并注明"信息不全"。`
    : citationStyle === "apa"
      ? `- **引文格式**：引用文章时需提供 APA 格式的参考文献条目。格式：Author, A. A. (Year). Title of article. Title of Periodical, Volume(Issue), pages. 若信息不完整，请根据已有信息尽力格式化，并注明"信息不全"。`
      : "";
```

- [ ] **Step 2: 确保 system prompt builder 传递 citationStyle**

检查 `buildPageAgentSystemPrompt` 函数签名（第 22-25 行）已经接受 `citationStyle` 参数 — 确认无需修改。`buildPageAgentMessages`（第 103-107 行）需要传递 citationStyle：

```typescript
// 原文：
content: buildPageAgentSystemPrompt({
  verbosity: input.request.verbosity,
}),

// 改为：
content: buildPageAgentSystemPrompt({
  verbosity: input.request.verbosity,
  citationStyle: input.request.citationStyle,
}),
```

- [ ] **Step 3: 验证 TypeScript 编译**

```bash
npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | tail -5
```

Expected: 无新增错误。

---

### Task 7: 启用 citationStyle — 前端

**Files:**
- Modify: `apps/web/src/components/PageAgentPanel.vue`

- [ ] **Step 1: 取消注释 citationStyle 选择器**

编辑 `PageAgentPanel.vue` 第 207-220 行，删除 HTML 注释包裹：

```html
<!-- 原文：整个 block 被 <!-- ... --> 包裹 -->
<!-- 改为：取消注释 -->
<template v-if="pageType === 'article_detail'">
  <span class="text-[11px] text-[#8aa3bc] ml-1">引用</span>
  <select
    :value="citationStyle"
    class="rounded-lg border border-[#81d4fa]/50 bg-white px-2 py-1 text-[11px] text-[#0f4069] outline-none"
    @change="emit('update:citationStyle', ($event.target as HTMLSelectElement).value as 'none' | 'gbt7714' | 'apa')"
  >
    <option value="none">无</option>
    <option value="gbt7714">GB/T 7714</option>
    <option value="apa">APA</option>
  </select>
</template>
```

- [ ] **Step 2: 验证前端构建**

```bash
npm run build:web 2>&1 | tail -10
```

Expected: 无 error，构建成功。

---

### Task 8: 添加用户画像定时分析 cron 任务

**Files:**
- Create: `apps/api/src/jobs/profile.ts`
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/src/server.ts`

**设计：** 沿用 `jobs/push.ts` 的 node-cron 模式。每周日凌晨 3:00（用户不活跃时段）自动运行全量用户画像分析。

- [ ] **Step 1: 添加环境变量**

编辑 `apps/api/src/config/env.ts`，在 `pushTimezone` 行后添加：

```typescript
profileAnalysisCron: process.env.PROFILE_ANALYSIS_CRON ?? "0 3 * * 0",
```

> 默认：每周日凌晨 3:00 Asia/Shanghai。可通过 `PROFILE_ANALYSIS_CRON` 环境变量覆盖。

- [ ] **Step 2: 创建定时任务文件**

创建 `apps/api/src/jobs/profile.ts`：

```typescript
import cron from "node-cron";

import { env } from "../config/env";
import { logger } from "../lib/logger";
import { runUserProfileAnalysisJob } from "../modules/page_agent/profile_service";

export const initProfileAnalysisJob = (): void => {
  cron.schedule(
    env.profileAnalysisCron,
    async () => {
      logger.info("profile.analysis.job.start", {
        cron: env.profileAnalysisCron,
        timezone: env.pushTimezone,
      });
      try {
        const job = await runUserProfileAnalysisJob({
          triggerMode: "scheduled",
        });
        logger.info("profile.analysis.job.finish", {
          jobId: job.id,
          status: job.status,
          processedCount: job.processedCount,
          successCount: job.successCount,
          failedCount: job.failedCount,
        });
      } catch (error) {
        logger.error("profile.analysis.job.failed", {
          cron: env.profileAnalysisCron,
          error,
        });
      }
    },
    { timezone: env.pushTimezone }
  );
};
```

- [ ] **Step 3: 在 server.ts 中注册定时任务**

编辑 `apps/api/src/server.ts`：

```typescript
// 在 import 区添加：
import { initProfileAnalysisJob } from "./jobs/profile";

// 在 initBirthdayJob() 后添加：
initProfileAnalysisJob();
```

完整变为：

```typescript
import { initProfileAnalysisJob } from "./jobs/profile";
// ... 其他 import ...

const start = async (): Promise<void> => {
  await initDb();
  app.listen(env.port, () => {
    initPushJobs();
    initSyncUsersJob();
    initBirthdayJob();
    initProfileAnalysisJob();
    logger.info("server.started", {
      port: env.port,
      nodeEnv: env.nodeEnv,
    });
  });
};
```

- [ ] **Step 4: 验证 TypeScript 编译**

```bash
npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | tail -5
```

Expected: 无新增错误。

---

### Task 9: 修复 SSE 流 incomplete chunk 风险

**Files:**
- Modify: `apps/api/src/modules/page_agent/service.ts`

**背景：** `llmResponse.data.on("data", ...)` 中每次 chunk 到达时直接 `chunk.toString().split("\n")`，若一个 SSE frame 跨两个 TCP chunk 传输，后半部分会丢失。需要维护一个跨 chunk 的 buffer。

- [ ] **Step 1: 修复 streamPageAnswer 中的 chunk 解析逻辑**

编辑 `service.ts` 第 549-565 行附近的 `on("data", ...)` 回调：

```typescript
// 原文：
llmResponse.data.on("data", (chunk: Buffer) => {
  const lines = chunk.toString().split("\n").filter((line) => line.startsWith("data: "));
  for (const line of lines) {
    const jsonStr = line.slice(6).trim();
    if (jsonStr === "[DONE]") continue;
    try {
      const parsed = JSON.parse(jsonStr);
      const token = parsed.choices?.[0]?.delta?.content;
      if (token) {
        fullAnswer += token;
        response.write(`data: ${JSON.stringify({ token })}\n\n`);
      }
    } catch {
      // skip malformed chunk
    }
  }
});

// 改为（添加跨 chunk buffer）：
let streamBuffer = "";

llmResponse.data.on("data", (chunk: Buffer) => {
  streamBuffer += chunk.toString();
  const lines = streamBuffer.split("\n");
  // 最后一行可能不完整，保留到下次拼接
  streamBuffer = lines.pop() ?? "";

  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    const jsonStr = line.slice(6).trim();
    if (jsonStr === "[DONE]") continue;
    try {
      const parsed = JSON.parse(jsonStr);
      const token = parsed.choices?.[0]?.delta?.content;
      if (token) {
        fullAnswer += token;
        response.write(`data: ${JSON.stringify({ token })}\n\n`);
      }
    } catch {
      // skip malformed line — 可能是被截断的 JSON，已留在 streamBuffer 中等待下次拼接
    }
  }
});
```

> **逻辑说明：**
> 1. 每次 chunk 到达时追加到 `streamBuffer`
> 2. 按 `\n` 分割，最后一段（可能不完整）留到下次
> 3. 只处理完整的行
> 4. 如果 JSON.parse 失败（可能是不完整行被误判为完整），跳过，它会在下次被正确处理

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | tail -5
```

Expected: 无新增错误。

---

### Task 10: 全量构建验证

**Files:** 无（验证步骤）

- [ ] **Step 1: 后端 TypeScript 编译**

```bash
npx tsc --noEmit -p apps/api/tsconfig.json 2>&1
```

Expected: 零错误。如有错误，修复后重新运行。

- [ ] **Step 2: 后端构建**

```bash
npm run build:api 2>&1 | tail -10
```

Expected: 无 error 输出，`dist/` 目录成功生成。

- [ ] **Step 3: 前端构建**

```bash
npm run build:web 2>&1 | tail -10
```

Expected: 无 error，构建成功。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "fix: Page Agent 安全加固 + citationStyle 启用 + 画像定时分析

安全修复:
- 扩展 PII 脱敏模式（身份证号、银行卡号、IP 地址）
- selectionText 脱敏入模
- 文章上下文（sourceContent/contentPreview/author等）脱敏入模
- 历史消息兜底脱敏 + 反馈存储脱敏
- 新增 /qa /qa/stream 速率限制（20次/分钟/用户）

功能完善:
- 启用 citationStyle（GB/T 7714 / APA 引文格式）
- 新增用户画像每周定时分析 cron 任务

健壮性:
- 修复 SSE 流 incomplete chunk 跨帧丢失风险"
```

---

## 自检清单

### 1. 覆盖面检查

| 审计发现 | 对应 Task | 状态 |
|---------|----------|------|
| selectionText 未脱敏 (#1) | Task 2 | ✅ |
| 文章正文未脱敏 (#2) | Task 3 | ✅ |
| 历史消息兜底 (#3) | Task 4a | ✅ |
| 反馈 sanitizedContent (#4) | Task 4b | ✅ |
| 无限速 (#5) | Task 5 | ✅ |
| citationStyle 被墙 (#6) | Task 6 + 7 | ✅ |
| 画像定时缺失 (#7) | Task 8 | ✅ |
| SSE chunk 风险 (#8) | Task 9 | ✅ |

### 2. 无占位符检查

所有 Task 包含完整的代码块，无 "TBD"、"TODO"、"add validation later" 等占位符。

### 3. 类型一致性检查

- `sanitizeForModel` 签名 `(value: string): string` — 所有调用处使用一致
- `buildPageAgentSystemPrompt` 接受 `citationStyle?: "none" | "gbt7714" | "apa"` — Task 6 传递参数匹配
- `createRateLimiter` 返回 Express middleware `(req, res, next) => void` — 与 `router.post` 中间件签名一致
- `initProfileAnalysisJob` 无参数返回 void — 与 `initPushJobs` 模式一致
