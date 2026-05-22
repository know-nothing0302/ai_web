# Page Agent Conversation Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `page agent` 增加显式会话、连续对话、用户侧写快照和侧写分析任务，在脱敏前提下提升回答连续性与个性化效果。

**Architecture:** 后端新增会话表、消息表、用户侧写表和分析任务表，通过 `store + page_agent service` 串联会话持久化、历史消息拼接和用户专属提示词注入。侧写分析走独立 prompt 与独立服务，支持手动接口和定时脚本，前端仅补 `conversationId` 创建与复用，不扩展复杂历史会话 UI。

**Tech Stack:** TypeScript、Express、PostgreSQL、Vue 3、Axios、Zod、DeepSeek Chat Completions、现有 Session 鉴权、现有 `store` / `page_agent` 模块

---

> 当前 `/opt/idapps/ai_web` 未检测到 Git 仓库，本计划不包含 commit 步骤，只保留可执行的实现与验证步骤。

## 文件结构

### 后端数据层

- `apps/api/src/lib/db.ts`
  - 运行时建表 SQL 增加 `page_agent_conversations`、`page_agent_messages`、`user_profiles`、`user_profile_analysis_jobs`
- `apps/api/sql/001_init.sql`
  - 初始化 SQL 同步增加上述表和索引
- `apps/api/src/lib/types.ts`
  - 增加会话、消息、侧写、分析任务类型
- `apps/api/src/lib/store.ts`
  - 增加对应 row 映射与 store 方法

### 后端业务层

- `apps/api/src/modules/page_agent/types.ts`
  - 为问答请求增加 `conversationId`，为响应增加 `usedHistory`、`usedUserProfile`
- `apps/api/src/modules/page_agent/prompts.ts`
  - 调整问答 prompt，支持用户侧写和历史消息
- `apps/api/src/modules/page_agent/sanitize.ts`
  - 新增共用脱敏函数
- `apps/api/src/modules/page_agent/service.ts`
  - 读取会话、历史消息、用户侧写，写入消息记录
- `apps/api/src/modules/page_agent/profile_prompts.ts`
  - 新增侧写分析 prompt
- `apps/api/src/modules/page_agent/profile_service.ts`
  - 新增侧写分析 service 和任务执行逻辑
- `apps/api/src/modules/page_agent/routes.ts`
  - 增加会话、消息、反馈、侧写分析路由

### 后端脚本

- `apps/api/src/scripts/test_page_agent_persistence_flow.ts`
  - 验证数据层会话/消息/侧写写入与读取
- `apps/api/src/scripts/test_page_agent_flow.ts`
  - 验证连续对话、用户侧写注入和问答主链路
- `apps/api/src/scripts/test_page_agent_routes.ts`
  - 验证创建会话、问答、消息读取和反馈接口
- `apps/api/src/scripts/test_page_agent_profile_analysis.ts`
  - 验证侧写任务可写回 `user_profiles`
- `apps/api/src/scripts/run_user_profile_analysis.ts`
  - 定时任务脚本入口

### 前端

- `apps/web/src/page_agent/types.ts`
  - 增加页面上下文类型、会话类型和增强后的问答响应类型
- `apps/web/src/page_agent/context.ts`
  - 让页面上下文构造器返回不含 `conversationId` 的上下文载荷
- `apps/web/src/services/api.ts`
  - 增加创建会话、读取会话列表和提交问答接口调用
- `apps/web/src/App.vue`
  - 持有并复用 `conversationId`

## 任务拆分

### Task 1: 打通会话、消息、侧写的数据层

**Files:**
- Modify: `apps/api/src/lib/db.ts`
- Modify: `apps/api/sql/001_init.sql`
- Modify: `apps/api/src/lib/types.ts`
- Modify: `apps/api/src/lib/store.ts`
- Create: `apps/api/src/scripts/test_page_agent_persistence_flow.ts`

- [ ] **Step 1: 先写失败前验证脚本**

在 `apps/api/src/scripts/test_page_agent_persistence_flow.ts` 中先写对未来 store 的调用，故意让当前代码报错：

```ts
import assert from "node:assert/strict";

import { initDb } from "../lib/db";
import {
  pageAgentConversationStore,
  pageAgentMessageStore,
  userProfileStore,
} from "../lib/store";

const run = async (): Promise<void> => {
  await initDb();
  const userId = `plan-store-${Date.now()}`;
  const conversation = await pageAgentConversationStore.create({
    userId,
    pageType: "article_detail",
    route: "/articles/mock-id",
    pageTitle: "文章详情",
  });
  assert.equal(conversation.userId, userId);

  await pageAgentMessageStore.create({
    conversationId: conversation.id,
    userId,
    role: "user",
    messageType: "question",
    content: "第一问",
    sanitizedContent: "第一问",
    pageType: "article_detail",
    route: "/articles/mock-id",
    pageTitle: "文章详情",
    contextPayload: {},
    sourcesPayload: [],
  });

  const history = await pageAgentMessageStore.listRecentByConversation(conversation.id, 10);
  assert.equal(history.length, 1);

  const profile = await userProfileStore.upsertByUser(userId, {
    profileVersion: 1,
    preferenceSummary: "偏好结构化回答",
    personaPrompt: "回答时先给结论，再给步骤。",
    interestTopics: ["医学AI"],
    responsePreferences: {
      style: "structured",
    },
    evidenceStats: {
      questionCount: 1,
    },
  });
  assert.equal(profile.userId, userId);
};

void run();
```

- [ ] **Step 2: 运行脚本确认 RED**

Run: `npx tsx src/scripts/test_page_agent_persistence_flow.ts`
Working directory: `/opt/idapps/ai_web/apps/api`
Expected: FAIL，提示 `pageAgentConversationStore`、`pageAgentMessageStore` 或 `userProfileStore` 不存在

- [ ] **Step 3: 为数据库 schema 增加四张表和索引**

在 `apps/api/src/lib/db.ts` 与 `apps/api/sql/001_init.sql` 中补以下结构：

```sql
CREATE TABLE IF NOT EXISTS page_agent_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(64) NOT NULL,
  title VARCHAR(200),
  page_type VARCHAR(32),
  route VARCHAR(500),
  page_title VARCHAR(200),
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS page_agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES page_agent_conversations(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'feedback')),
  message_type VARCHAR(20) NOT NULL
    CHECK (message_type IN ('question', 'answer', 'feedback')),
  content TEXT NOT NULL,
  sanitized_content TEXT,
  page_type VARCHAR(32),
  route VARCHAR(500),
  page_title VARCHAR(200),
  context_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  sources_payload JSONB NOT NULL DEFAULT '[]'::jsonb,
  model VARCHAR(100),
  tokens_input INT,
  tokens_output INT,
  parent_message_id UUID,
  feedback_score SMALLINT,
  feedback_tag VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(64) NOT NULL UNIQUE,
  profile_version INT NOT NULL DEFAULT 1,
  preference_summary TEXT NOT NULL DEFAULT '',
  persona_prompt VARCHAR(500) NOT NULL DEFAULT '',
  interest_topics TEXT[] NOT NULL DEFAULT '{}',
  response_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_analyzed_at TIMESTAMPTZ,
  last_source_window_start TIMESTAMPTZ,
  last_source_window_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_profile_analysis_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_mode VARCHAR(20) NOT NULL CHECK (trigger_mode IN ('manual', 'scheduled')),
  target_user_id VARCHAR(64),
  status VARCHAR(20) NOT NULL
    CHECK (status IN ('pending', 'running', 'success', 'failed')),
  processed_count INT NOT NULL DEFAULT 0,
  success_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_agent_conversations_user_id
  ON page_agent_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_page_agent_conversations_last_message_at
  ON page_agent_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_agent_messages_conversation_created_at
  ON page_agent_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_agent_messages_user_created_at
  ON page_agent_messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_profile_analysis_jobs_status_created_at
  ON user_profile_analysis_jobs(status, created_at DESC);
```

- [ ] **Step 4: 在共享类型和 store 中补最小实现**

在 `apps/api/src/lib/types.ts` 中增加类型：

```ts
export type PageAgentConversationStatus = "active" | "archived";
export type PageAgentMessageRole = "user" | "assistant" | "feedback";
export type PageAgentMessageType = "question" | "answer" | "feedback";
export type UserProfileAnalysisTriggerMode = "manual" | "scheduled";
export type UserProfileAnalysisJobStatus = "pending" | "running" | "success" | "failed";

export interface PageAgentConversation {
  id: string;
  userId: string;
  title?: string;
  pageType?: string;
  route?: string;
  pageTitle?: string;
  status: PageAgentConversationStatus;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PageAgentMessage {
  id: string;
  conversationId: string;
  userId: string;
  role: PageAgentMessageRole;
  messageType: PageAgentMessageType;
  content: string;
  sanitizedContent?: string;
  pageType?: string;
  route?: string;
  pageTitle?: string;
  contextPayload: Record<string, unknown>;
  sourcesPayload: unknown[];
  model?: string;
  tokensInput?: number;
  tokensOutput?: number;
  parentMessageId?: string;
  feedbackScore?: number;
  feedbackTag?: string;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  userId: string;
  profileVersion: number;
  preferenceSummary: string;
  personaPrompt: string;
  interestTopics: string[];
  responsePreferences: Record<string, unknown>;
  evidenceStats: Record<string, unknown>;
  lastAnalyzedAt?: string;
  lastSourceWindowStart?: string;
  lastSourceWindowEnd?: string;
  createdAt: string;
  updatedAt: string;
}
```

在 `apps/api/src/lib/store.ts` 中增加 store：

```ts
export const pageAgentConversationStore = {
  async create(input: {
    userId: string;
    pageType?: string;
    route?: string;
    pageTitle?: string;
    title?: string;
  }): Promise<PageAgentConversation> {
    const result = await query<PageAgentConversationRow>(
      `
      INSERT INTO page_agent_conversations (
        user_id,
        page_type,
        route,
        page_title,
        title
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [input.userId, input.pageType ?? null, input.route ?? null, input.pageTitle ?? null, input.title ?? null]
    );
    return mapPageAgentConversation(result.rows[0]);
  },
  async getById(id: string): Promise<PageAgentConversation | undefined> {
    const result = await query<PageAgentConversationRow>(
      `SELECT * FROM page_agent_conversations WHERE id = $1 LIMIT 1`,
      [id]
    );
    return result.rows[0] ? mapPageAgentConversation(result.rows[0]) : undefined;
  },
  async listByUser(userId: string, limit: number): Promise<PageAgentConversation[]> {
    const result = await query<PageAgentConversationRow>(
      `
      SELECT *
      FROM page_agent_conversations
      WHERE user_id = $1
      ORDER BY last_message_at DESC
      LIMIT $2
      `,
      [userId, Math.max(1, Math.min(limit, 50))]
    );
    return result.rows.map(mapPageAgentConversation);
  },
  async touch(id: string): Promise<void> {
    await query(
      `
      UPDATE page_agent_conversations
      SET last_message_at = NOW(), updated_at = NOW()
      WHERE id = $1
      `,
      [id]
    );
  },
};

export const pageAgentMessageStore = {
  async create(input: {
    conversationId: string;
    userId: string;
    role: PageAgentMessageRole;
    messageType: PageAgentMessageType;
    content: string;
    sanitizedContent?: string;
    pageType?: string;
    route?: string;
    pageTitle?: string;
    contextPayload: Record<string, unknown>;
    sourcesPayload: unknown[];
    model?: string;
    feedbackScore?: number;
    feedbackTag?: string;
  }): Promise<PageAgentMessage> {
    const result = await query<PageAgentMessageRow>(
      `
      INSERT INTO page_agent_messages (
        conversation_id,
        user_id,
        role,
        message_type,
        content,
        sanitized_content,
        page_type,
        route,
        page_title,
        context_payload,
        sources_payload,
        model,
        feedback_score,
        feedback_tag
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
      `,
      [
        input.conversationId,
        input.userId,
        input.role,
        input.messageType,
        input.content,
        input.sanitizedContent ?? null,
        input.pageType ?? null,
        input.route ?? null,
        input.pageTitle ?? null,
        input.contextPayload,
        JSON.stringify(input.sourcesPayload),
        input.model ?? null,
        input.feedbackScore ?? null,
        input.feedbackTag ?? null,
      ]
    );
    return mapPageAgentMessage(result.rows[0]);
  },
  async listRecentByConversation(conversationId: string, limit: number): Promise<PageAgentMessage[]> {
    const result = await query<PageAgentMessageRow>(
      `
      SELECT *
      FROM page_agent_messages
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT $2
      `,
      [conversationId, Math.max(1, Math.min(limit, 20))]
    );
    return result.rows.reverse().map(mapPageAgentMessage);
  },
};

export const userProfileStore = {
  async getByUserId(userId: string): Promise<UserProfile | undefined> {
    const result = await query<UserProfileRow>(
      `SELECT * FROM user_profiles WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    return result.rows[0] ? mapUserProfile(result.rows[0]) : undefined;
  },
  async upsertByUser(
    userId: string,
    input: {
      profileVersion: number;
      preferenceSummary: string;
      personaPrompt: string;
      interestTopics: string[];
      responsePreferences: Record<string, unknown>;
      evidenceStats: Record<string, unknown>;
    }
  ): Promise<UserProfile> {
    const result = await query<UserProfileRow>(
      `
      INSERT INTO user_profiles (
        user_id,
        profile_version,
        preference_summary,
        persona_prompt,
        interest_topics,
        response_preferences,
        evidence_stats,
        last_analyzed_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        profile_version = EXCLUDED.profile_version,
        preference_summary = EXCLUDED.preference_summary,
        persona_prompt = EXCLUDED.persona_prompt,
        interest_topics = EXCLUDED.interest_topics,
        response_preferences = EXCLUDED.response_preferences,
        evidence_stats = EXCLUDED.evidence_stats,
        last_analyzed_at = NOW(),
        updated_at = NOW()
      RETURNING *
      `,
      [
        userId,
        input.profileVersion,
        input.preferenceSummary,
        input.personaPrompt.slice(0, 500),
        input.interestTopics,
        input.responsePreferences,
        input.evidenceStats,
      ]
    );
    return mapUserProfile(result.rows[0]);
  },
};
```

- [ ] **Step 5: 运行脚本确认 GREEN**

Run: `npx tsx src/scripts/test_page_agent_persistence_flow.ts`
Working directory: `/opt/idapps/ai_web/apps/api`
Expected: PASS

### Task 2: 实现问答主链路的会话拼接、脱敏和用户侧写注入

**Files:**
- Modify: `apps/api/src/modules/page_agent/types.ts`
- Modify: `apps/api/src/modules/page_agent/prompts.ts`
- Create: `apps/api/src/modules/page_agent/sanitize.ts`
- Modify: `apps/api/src/modules/page_agent/service.ts`
- Modify: `apps/api/src/scripts/test_page_agent_flow.ts`

- [ ] **Step 1: 先扩展问答脚本，写出连续对话的失败前验证**

在 `apps/api/src/scripts/test_page_agent_flow.ts` 中改为先创建会话和画像，再连续提两次问题：

```ts
import assert from "node:assert/strict";

import {
  pageAgentConversationStore,
  userProfileStore,
} from "../lib/store";
import { answerPageQuestion } from "../modules/page_agent/service";

const run = async (): Promise<void> => {
  const userId = `plan-flow-${Date.now()}`;
  const conversation = await pageAgentConversationStore.create({
    userId,
    pageType: "article_detail",
    route: "/articles/mock-id",
    pageTitle: "文章详情",
  });

  await userProfileStore.upsertByUser(userId, {
    profileVersion: 1,
    preferenceSummary: "偏好结构化、步骤化回答",
    personaPrompt: "回答时先给结论，再给步骤，必要时补充示例。",
    interestTopics: ["医学AI", "政策解读"],
    responsePreferences: {
      style: "structured",
      preferExamples: true,
    },
    evidenceStats: {
      questionCount: 2,
    },
  });

  const first = await answerPageQuestion(
    {
      conversationId: conversation.id,
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
        sourceContent:
          "医学 AI 正在用于辅助教学、科研分析和知识服务，并覆盖课程设计、科研辅助、临床知识整理、病例推演与院校协同创新等多个具体场景。",
        channelCode: "medical-frontier",
        channelName: "医学前沿",
      },
    },
    userId
  );
  assert.equal(first.conversationId, conversation.id);
  assert.equal(first.meta.usedHistory, false);
  assert.equal(first.meta.usedUserProfile, true);

  const second = await answerPageQuestion(
    {
      conversationId: conversation.id,
      question: "再结合上一问，给我一个三点总结。",
      pageType: "article_detail",
      route: "/articles/mock-id",
      pageTitle: "文章详情",
      selectionText: "",
      context: {
        articleId: "mock-id",
        title: "医学 AI 研究进展",
        summary: "文章讨论了医学 AI 在教学与科研中的应用。",
        contentPreview: "医学 AI 正在用于辅助教学、科研分析和知识服务。",
        sourceContent:
          "医学 AI 正在用于辅助教学、科研分析和知识服务，并覆盖课程设计、科研辅助、临床知识整理、病例推演与院校协同创新等多个具体场景。",
        channelCode: "medical-frontier",
        channelName: "医学前沿",
      },
    },
    userId
  );
  assert.equal(second.meta.usedHistory, true);
  assert.equal(second.meta.usedUserProfile, true);
};

void run();
```

- [ ] **Step 2: 运行脚本确认 RED**

Run: `npx tsx src/scripts/test_page_agent_flow.ts`
Working directory: `/opt/idapps/ai_web/apps/api`
Expected: FAIL，提示 `conversationId`、`usedHistory`、`usedUserProfile` 或新签名尚未实现

- [ ] **Step 3: 增加问答请求/响应类型和脱敏函数**

在 `apps/api/src/modules/page_agent/types.ts` 中扩展：

```ts
export interface PageAgentRequestBody {
  conversationId: string;
  question: string;
  pageType: PageAgentPageType;
  route: string;
  pageTitle: string;
  selectionText?: string;
  context: Record<string, unknown>;
}

export interface PageAgentResponse {
  conversationId: string;
  answer: string;
  sources: PageAgentSource[];
  meta: {
    usedCurrentPage: boolean;
    usedSiteSearch: boolean;
    usedHistory: boolean;
    usedUserProfile: boolean;
    model: string;
  };
}
```

在 `apps/api/src/modules/page_agent/sanitize.ts` 中新增：

```ts
const sensitivePatterns: RegExp[] = [
  /\b1\d{10}\b/g,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\b(?:工号|学号|编号)[:：]?\s*[A-Za-z0-9_-]{4,}\b/g,
  /\b(?:我是|姓名是|我叫)[\u4e00-\u9fa5A-Za-z·]{2,20}\b/g,
];

export const sanitizeForModel = (value: string): string => {
  return sensitivePatterns.reduce(
    (result, pattern) => result.replace(pattern, "[REDACTED]"),
    value
  ).trim();
};

export const truncateForModel = (value: string, maxLength: number): string => {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
};
```

- [ ] **Step 4: 调整 prompt 组装，显式注入历史和侧写**

在 `apps/api/src/modules/page_agent/prompts.ts` 中新增消息组装函数：

```ts
import { PageAgentMessage, UserProfile } from "../../lib/types";
import { PageAgentRequestBody, PageAgentSource } from "./types";

export const buildPageAgentMessages = (input: {
  request: PageAgentRequestBody;
  historyMessages: PageAgentMessage[];
  userProfile?: UserProfile;
  searchSources: PageAgentSource[];
}): Array<{ role: "system" | "user" | "assistant"; content: string }> => {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    {
      role: "system",
      content: buildPageAgentSystemPrompt(),
    },
  ];

  if (input.userProfile?.personaPrompt.trim()) {
    messages.push({
      role: "system",
      content: `用户专属回答偏好：${input.userProfile.personaPrompt.trim()}`,
    });
  }

  if (
    input.userProfile?.preferenceSummary.trim() ||
    (input.userProfile?.interestTopics.length ?? 0) > 0
  ) {
    messages.push({
      role: "system",
      content: JSON.stringify(
        {
          preferenceSummary: input.userProfile?.preferenceSummary ?? "",
          interestTopics: input.userProfile?.interestTopics ?? [],
          responsePreferences: input.userProfile?.responsePreferences ?? {},
        },
        null,
        2
      ),
    });
  }

  input.historyMessages.forEach((message) => {
    if (message.role === "user" || message.role === "assistant") {
      messages.push({
        role: message.role,
        content: message.sanitizedContent || message.content,
      });
    }
  });

  messages.push({
    role: "user",
    content: buildPageAgentUserPrompt(input.request, input.searchSources),
  });

  return messages;
};
```

- [ ] **Step 5: 在问答 service 中接入会话校验、历史读取、消息写入**

在 `apps/api/src/modules/page_agent/service.ts` 中将主函数改为：

```ts
import {
  pageAgentConversationStore,
  pageAgentMessageStore,
  userProfileStore,
} from "../../lib/store";
import { sanitizeForModel, truncateForModel } from "./sanitize";

export const answerPageQuestion = async (
  input: PageAgentRequestBody,
  userId: string
): Promise<PageAgentResponse> => {
  const startedAt = Date.now();
  const conversation = await pageAgentConversationStore.getById(input.conversationId);
  if (!conversation || conversation.userId !== userId) {
    throw new Error("会话不存在或无权限访问");
  }

  const userProfile = await userProfileStore.getByUserId(userId);
  const historyMessages = (
    await pageAgentMessageStore.listRecentByConversation(input.conversationId, 8)
  )
    .filter((item) => item.role === "user" || item.role === "assistant")
    .map((item) => ({
      ...item,
      sanitizedContent: truncateForModel(item.sanitizedContent ?? item.content, 1200),
    }));

  const sanitizedQuestion = sanitizeForModel(input.question);
  await pageAgentMessageStore.create({
    conversationId: input.conversationId,
    userId,
    role: "user",
    messageType: "question",
    content: input.question,
    sanitizedContent: sanitizedQuestion,
    pageType: input.pageType,
    route: input.route,
    pageTitle: input.pageTitle,
    contextPayload: input.context,
    sourcesPayload: [],
  });

  const usedSiteSearch = shouldSearchSite(input.question);
  const searchSources = usedSiteSearch ? await searchPublishedArticles(input, 3) : [];
  const messages = buildPageAgentMessages({
    request: {
      ...input,
      question: sanitizedQuestion,
    },
    historyMessages,
    userProfile,
    searchSources,
  });

  const result = env.deepseekApiBaseUrl
    ? await axios.post(
        `${env.deepseekApiBaseUrl}/v1/chat/completions`,
        {
          model: env.deepseekModel,
          messages,
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
      )
    : undefined;

  const answer = normalizeAiContent(result?.data?.choices?.[0]?.message?.content)
    || buildFallbackAnswer(input);

  await pageAgentMessageStore.create({
    conversationId: input.conversationId,
    userId,
    role: "assistant",
    messageType: "answer",
    content: answer,
    sanitizedContent: answer,
    pageType: input.pageType,
    route: input.route,
    pageTitle: input.pageTitle,
    contextPayload: input.context,
    sourcesPayload: searchSources,
    model: env.deepseekModel,
  });
  await pageAgentConversationStore.touch(input.conversationId);

  return {
    conversationId: input.conversationId,
    answer,
    sources: [
      {
        type: "current_page",
        title: input.pageTitle || "当前页面",
        url: input.route,
      },
      ...searchSources,
    ],
    meta: {
      usedCurrentPage: true,
      usedSiteSearch,
      usedHistory: historyMessages.length > 0,
      usedUserProfile: Boolean(userProfile),
      model: env.deepseekModel,
    },
  };
};
```

- [ ] **Step 6: 运行脚本确认 GREEN**

Run: `npx tsx src/scripts/test_page_agent_flow.ts`
Working directory: `/opt/idapps/ai_web/apps/api`
Expected: PASS

### Task 3: 暴露会话、问答和反馈接口

**Files:**
- Modify: `apps/api/src/modules/page_agent/routes.ts`
- Create: `apps/api/src/scripts/test_page_agent_routes.ts`

- [ ] **Step 1: 先写失败前验证脚本**

在 `apps/api/src/scripts/test_page_agent_routes.ts` 中直接启动 `app.listen(0)`，验证会话、问答、消息和反馈路由：

```ts
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";

import { app } from "../app";

const run = async (): Promise<void> => {
  const server = app.listen(0);
  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}/api/page-agent`;

    const createResponse = await fetch(`${baseUrl}/conversations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        pageType: "article_detail",
        route: "/articles/mock-id",
        pageTitle: "文章详情",
      }),
    });
    assert.equal(createResponse.status, 200);
    const conversation = await createResponse.json();
    assert.equal(typeof conversation.id, "string");

    const qaResponse = await fetch(`${baseUrl}/qa`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        conversationId: conversation.id,
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
        },
      }),
    });
    assert.equal(qaResponse.status, 200);
    const qaResult = await qaResponse.json();
    assert.equal(qaResult.conversationId, conversation.id);

    const listResponse = await fetch(`${baseUrl}/conversations`);
    assert.equal(listResponse.status, 200);
    const listResult = await listResponse.json();
    assert.equal(Array.isArray(listResult.items), true);

    const messagesResponse = await fetch(`${baseUrl}/conversations/${conversation.id}/messages`);
    assert.equal(messagesResponse.status, 200);
    const messages = await messagesResponse.json();
    assert.equal(Array.isArray(messages.items), true);

    const assistantMessage = messages.items.find((item: { role: string }) => item.role === "assistant");
    assert.equal(typeof assistantMessage?.id, "string");

    const feedbackResponse = await fetch(`${baseUrl}/messages/${assistantMessage.id}/feedback`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        score: 1,
        tag: "回答清晰",
        content: "希望以后多给步骤",
      }),
    });
    assert.equal(feedbackResponse.status, 200);
  } finally {
    server.close();
  }
};

void run();
```

- [ ] **Step 2: 运行脚本确认 RED**

Run: `npx tsx src/scripts/test_page_agent_routes.ts`
Working directory: `/opt/idapps/ai_web/apps/api`
Expected: FAIL，提示路由不存在或请求参数不匹配

- [ ] **Step 3: 在路由层增加会话、消息和反馈接口**

在 `apps/api/src/modules/page_agent/routes.ts` 中补以下 schema 和路由：

```ts
import {
  pageAgentConversationStore,
  pageAgentMessageStore,
} from "../../lib/store";
import { requireAuth } from "../../middleware/auth";
import { answerPageQuestion } from "./service";

const createConversationSchema = z.object({
  pageType: z.enum(["article_detail", "article_list", "subscription", "admin"]),
  route: z.string().trim().min(1).max(500),
  pageTitle: z.string().trim().min(1).max(200),
});

const pageAgentSchema = z.object({
  conversationId: z.string().uuid(),
  question: z.string().trim().min(1).max(2000),
  pageType: z.enum(["article_detail", "article_list", "subscription", "admin"]),
  route: z.string().trim().min(1).max(500),
  pageTitle: z.string().trim().min(1).max(200),
  selectionText: z.string().trim().max(4000).optional(),
  context: z.record(z.string(), z.unknown()),
});

const feedbackSchema = z.object({
  score: z.union([z.literal(1), z.literal(-1)]),
  tag: z.string().trim().min(1).max(50),
  content: z.string().trim().min(1).max(1000),
});

pageAgentRouter.post("/conversations", requireAuth, async (request, response) => {
  const parsed = createConversationSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const userId = request.session.user!.id;
  const conversation = await pageAgentConversationStore.create({
    userId,
    pageType: parsed.data.pageType,
    route: parsed.data.route,
    pageTitle: parsed.data.pageTitle,
  });
  response.json(conversation);
});

pageAgentRouter.get("/conversations", requireAuth, async (request, response) => {
  const items = await pageAgentConversationStore.listByUser(
    request.session.user!.id,
    20
  );
  response.json({ items });
});

pageAgentRouter.get("/conversations/:id/messages", requireAuth, async (request, response) => {
  const conversation = await pageAgentConversationStore.getById(request.params.id);
  if (!conversation || conversation.userId !== request.session.user!.id) {
    response.status(404).json({ message: "会话不存在" });
    return;
  }
  const items = await pageAgentMessageStore.listRecentByConversation(conversation.id, 100);
  response.json({ items });
});

pageAgentRouter.post("/qa", requireAuth, async (request, response) => {
  const parsed = pageAgentSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const result = await answerPageQuestion(parsed.data, request.session.user!.id);
  response.json(result);
});

pageAgentRouter.post("/messages/:id/feedback", requireAuth, async (request, response) => {
  const parsed = feedbackSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const message = await pageAgentMessageStore.getById(request.params.id);
  if (!message || message.userId !== request.session.user!.id || message.role !== "assistant") {
    response.status(404).json({ message: "消息不存在" });
    return;
  }
  const feedback = await pageAgentMessageStore.create({
    conversationId: message.conversationId,
    userId: message.userId,
    role: "feedback",
    messageType: "feedback",
    content: parsed.data.content,
    sanitizedContent: parsed.data.content,
    pageType: message.pageType,
    route: message.route,
    pageTitle: message.pageTitle,
    contextPayload: {},
    sourcesPayload: [],
    feedbackScore: parsed.data.score,
    feedbackTag: parsed.data.tag,
  });
  response.json(feedback);
});
```

- [ ] **Step 4: 为反馈接口补一个按 ID 查询方法**

在 `apps/api/src/lib/store.ts` 为 `pageAgentMessageStore` 增加：

```ts
async getById(id: string): Promise<PageAgentMessage | undefined> {
  const result = await query<PageAgentMessageRow>(
    `SELECT * FROM page_agent_messages WHERE id = $1 LIMIT 1`,
    [id]
  );
  return result.rows[0] ? mapPageAgentMessage(result.rows[0]) : undefined;
},
```

- [ ] **Step 5: 运行脚本确认 GREEN**

Run: `npx tsx src/scripts/test_page_agent_routes.ts`
Working directory: `/opt/idapps/ai_web/apps/api`
Expected: PASS

### Task 4: 实现用户侧写分析 prompt、service 与调度入口

**Files:**
- Create: `apps/api/src/modules/page_agent/profile_prompts.ts`
- Create: `apps/api/src/modules/page_agent/profile_service.ts`
- Modify: `apps/api/src/modules/page_agent/routes.ts`
- Create: `apps/api/src/scripts/test_page_agent_profile_analysis.ts`
- Create: `apps/api/src/scripts/run_user_profile_analysis.ts`

- [ ] **Step 1: 先写失败前验证脚本**

在 `apps/api/src/scripts/test_page_agent_profile_analysis.ts` 中写出单用户侧写分析校验：

```ts
import assert from "node:assert/strict";

import {
  pageAgentConversationStore,
  pageAgentMessageStore,
  subscriptionStore,
  userProfileStore,
} from "../lib/store";
import { runUserProfileAnalysisJob } from "../modules/page_agent/profile_service";

const run = async (): Promise<void> => {
  const userId = `plan-profile-${Date.now()}`;

  await subscriptionStore.upsertByUser(userId, {
    channelCodes: ["medical-frontier", "policy-ethics"],
    categories: ["医学AI前沿", "AI政策与伦理"],
    frequency: "daily",
    qywxUserId: userId,
    qywxUserName: "plan-user",
    enabled: true,
  });

  const conversation = await pageAgentConversationStore.create({
    userId,
    pageType: "article_detail",
    route: "/articles/mock-id",
    pageTitle: "文章详情",
  });

  await pageAgentMessageStore.create({
    conversationId: conversation.id,
    userId,
    role: "user",
    messageType: "question",
    content: "请结合政策背景解释这篇文章。",
    sanitizedContent: "请结合政策背景解释这篇文章。",
    pageType: "article_detail",
    route: "/articles/mock-id",
    pageTitle: "文章详情",
    contextPayload: {},
    sourcesPayload: [],
  });

  await pageAgentMessageStore.create({
    conversationId: conversation.id,
    userId,
    role: "feedback",
    messageType: "feedback",
    content: "希望多给步骤和示例。",
    sanitizedContent: "希望多给步骤和示例。",
    pageType: "article_detail",
    route: "/articles/mock-id",
    pageTitle: "文章详情",
    contextPayload: {},
    sourcesPayload: [],
    feedbackScore: 1,
    feedbackTag: "更具体",
  });

  const job = await runUserProfileAnalysisJob({
    triggerMode: "manual",
    targetUserId: userId,
  });
  assert.equal(job.status, "success");

  const profile = await userProfileStore.getByUserId(userId);
  assert.equal(typeof profile?.personaPrompt, "string");
  assert.equal((profile?.personaPrompt.length ?? 0) <= 500, true);
};

void run();
```

- [ ] **Step 2: 运行脚本确认 RED**

Run: `npx tsx src/scripts/test_page_agent_profile_analysis.ts`
Working directory: `/opt/idapps/ai_web/apps/api`
Expected: FAIL，提示 `runUserProfileAnalysisJob` 未实现

- [ ] **Step 3: 编写侧写分析 prompt**

在 `apps/api/src/modules/page_agent/profile_prompts.ts` 中新增：

```ts
export const buildUserProfileAnalysisSystemPrompt = (): string => `
你是用户偏好分析器，不是聊天助手。
规则：
- 只输出 JSON。
- 禁止输出姓名、工号、邮箱、手机号、企业微信用户标识。
- 只能总结关注主题、回答风格偏好、内容深度偏好、是否偏好步骤和示例。
- 若证据不足，必须降低确定性，不得臆断。
- personaPrompt 必须控制在 500 字以内。
`.trim();

export const buildUserProfileAnalysisUserPrompt = (input: {
  subscriptions: {
    channelCodes: string[];
    frequencies: string[];
  };
  questionStats: {
    total: number;
    followUpCount: number;
    pageTypeDistribution: Record<string, number>;
  };
  recentQuestions: string[];
  recentFeedback: Array<{
    score?: number;
    tag?: string;
    content: string;
  }>;
}): string => JSON.stringify(input, null, 2);
```

- [ ] **Step 4: 实现侧写分析 service 与任务执行**

在 `apps/api/src/modules/page_agent/profile_service.ts` 中新增：

```ts
import axios from "axios";
import { z } from "zod";

import { env } from "../../config/env";
import {
  pageAgentMessageStore,
  subscriptionStore,
  userProfileAnalysisJobStore,
  userProfileStore,
} from "../../lib/store";
import { sanitizeForModel } from "./sanitize";
import {
  buildUserProfileAnalysisSystemPrompt,
  buildUserProfileAnalysisUserPrompt,
} from "./profile_prompts";

const profileOutputSchema = z.object({
  preferenceSummary: z.string().trim().default(""),
  interestTopics: z.array(z.string().trim()).default([]),
  responsePreferences: z.record(z.string(), z.unknown()).default({}),
  personaPrompt: z.string().trim().max(500).default(""),
  confidence: z.enum(["low", "medium", "high"]).default("low"),
});

const buildFallbackProfile = (input: {
  channelCodes: string[];
  recentQuestions: string[];
  recentFeedback: string[];
}) => {
  const interestTopics = input.channelCodes.slice(0, 3);
  return {
    preferenceSummary:
      input.recentFeedback.length > 0
        ? "用户倾向于更具体、结构化的回答。"
        : "用户偏好需要结合后续提问和反馈继续观察。",
    interestTopics,
    responsePreferences: {
      style: "structured",
    },
    personaPrompt:
      input.recentFeedback.length > 0
        ? "回答时优先分点说明，先给结论，再给步骤，必要时补充示例。"
        : "回答时保持简洁清晰，必要时分点说明。",
    confidence: "low" as const,
  };
};

export const runUserProfileAnalysisJob = async (input: {
  triggerMode: "manual" | "scheduled";
  targetUserId?: string;
}) => {
  const job = await userProfileAnalysisJobStore.create({
    triggerMode: input.triggerMode,
    targetUserId: input.targetUserId,
  });

  try {
    await userProfileAnalysisJobStore.markRunning(job.id);
    const userIds = input.targetUserId
      ? [input.targetUserId]
      : await pageAgentMessageStore.listDistinctUserIdsForProfileAnalysis(50);

    let processedCount = 0;
    let successCount = 0;

    for (const userId of userIds) {
      const subscriptions = await subscriptionStore.listByUser(userId);
      const messages = await pageAgentMessageStore.listRecentByUser(userId, 30);
      const recentQuestions = messages
        .filter((item) => item.role === "user")
        .map((item) => sanitizeForModel(item.content))
        .slice(-10);
      const recentFeedback = messages
        .filter((item) => item.role === "feedback")
        .map((item) => ({
          score: item.feedbackScore,
          tag: item.feedbackTag,
          content: sanitizeForModel(item.content),
        }))
        .slice(-10);

      const payload = {
        subscriptions: {
          channelCodes: subscriptions.flatMap((item) => item.channelCodes),
          frequencies: subscriptions.map((item) => item.frequency),
        },
        questionStats: {
          total: messages.filter((item) => item.role === "user").length,
          followUpCount: Math.max(messages.filter((item) => item.role === "user").length - 1, 0),
          pageTypeDistribution: messages.reduce<Record<string, number>>((result, item) => {
            if (!item.pageType) {
              return result;
            }
            result[item.pageType] = (result[item.pageType] ?? 0) + 1;
            return result;
          }, {}),
        },
        recentQuestions,
        recentFeedback,
      };

      const llmResult = env.deepseekApiBaseUrl
        ? await axios.post(
            `${env.deepseekApiBaseUrl}/v1/chat/completions`,
            {
              model: env.deepseekModel,
              messages: [
                {
                  role: "system",
                  content: buildUserProfileAnalysisSystemPrompt(),
                },
                {
                  role: "user",
                  content: buildUserProfileAnalysisUserPrompt(payload),
                },
              ],
              temperature: 0.2,
              response_format: {
                type: "json_object",
              },
            },
            {
              headers: env.deepseekApiKey
                ? {
                    Authorization: `Bearer ${env.deepseekApiKey}`,
                  }
                : undefined,
              timeout: 60000,
            }
          )
        : undefined;

      const parsed = llmResult
        ? profileOutputSchema.parse(
            JSON.parse(llmResult.data?.choices?.[0]?.message?.content ?? "{}")
          )
        : buildFallbackProfile({
            channelCodes: payload.subscriptions.channelCodes,
            recentQuestions,
            recentFeedback: recentFeedback.map((item) => item.content),
          });

      await userProfileStore.upsertByUser(userId, {
        profileVersion: 1,
        preferenceSummary: parsed.preferenceSummary,
        personaPrompt: parsed.personaPrompt.slice(0, 500),
        interestTopics: parsed.interestTopics,
        responsePreferences: parsed.responsePreferences,
        evidenceStats: {
          questionCount: payload.questionStats.total,
          feedbackCount: recentFeedback.length,
          confidence: parsed.confidence,
        },
      });

      processedCount += 1;
      successCount += 1;
      await userProfileAnalysisJobStore.updateCounters(job.id, {
        processedCount,
        successCount,
        failedCount: processedCount - successCount,
      });
    }

    return await userProfileAnalysisJobStore.markSuccess(job.id);
  } catch (error) {
    return await userProfileAnalysisJobStore.markFailed(
      job.id,
      error instanceof Error ? error.message : "unknown_error"
    );
  }
};
```

- [ ] **Step 5: 为分析任务补 store 和内部接口**

在 `apps/api/src/lib/store.ts` 增加任务 store 和消息辅助方法：

```ts
export const userProfileAnalysisJobStore = {
  async create(input: {
    triggerMode: UserProfileAnalysisTriggerMode;
    targetUserId?: string;
  }): Promise<UserProfileAnalysisJob> {
    const result = await query<UserProfileAnalysisJobRow>(
      `
      INSERT INTO user_profile_analysis_jobs (
        trigger_mode,
        target_user_id,
        status
      )
      VALUES ($1, $2, 'pending')
      RETURNING *
      `,
      [input.triggerMode, input.targetUserId ?? null]
    );
    return mapUserProfileAnalysisJob(result.rows[0]);
  },
  async markRunning(id: string): Promise<void> {
    await query(
      `
      UPDATE user_profile_analysis_jobs
      SET status = 'running', started_at = NOW()
      WHERE id = $1
      `,
      [id]
    );
  },
  async updateCounters(
    id: string,
    input: { processedCount: number; successCount: number; failedCount: number }
  ): Promise<void> {
    await query(
      `
      UPDATE user_profile_analysis_jobs
      SET processed_count = $2, success_count = $3, failed_count = $4
      WHERE id = $1
      `,
      [id, input.processedCount, input.successCount, input.failedCount]
    );
  },
  async markSuccess(id: string): Promise<UserProfileAnalysisJob> {
    const result = await query<UserProfileAnalysisJobRow>(
      `
      UPDATE user_profile_analysis_jobs
      SET status = 'success', finished_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );
    return mapUserProfileAnalysisJob(result.rows[0]);
  },
  async markFailed(id: string, errorMessage: string): Promise<UserProfileAnalysisJob> {
    const result = await query<UserProfileAnalysisJobRow>(
      `
      UPDATE user_profile_analysis_jobs
      SET status = 'failed', error_message = $2, finished_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [id, errorMessage]
    );
    return mapUserProfileAnalysisJob(result.rows[0]);
  },
  async getById(id: string): Promise<UserProfileAnalysisJob | undefined> {
    const result = await query<UserProfileAnalysisJobRow>(
      `SELECT * FROM user_profile_analysis_jobs WHERE id = $1 LIMIT 1`,
      [id]
    );
    return result.rows[0] ? mapUserProfileAnalysisJob(result.rows[0]) : undefined;
  },
};
```

并为 `pageAgentMessageStore` 增加：

```ts
async listRecentByUser(userId: string, limit: number): Promise<PageAgentMessage[]> {
  const result = await query<PageAgentMessageRow>(
    `
    SELECT *
    FROM page_agent_messages
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [userId, Math.max(1, Math.min(limit, 100))]
  );
  return result.rows.reverse().map(mapPageAgentMessage);
},

async listDistinctUserIdsForProfileAnalysis(limit: number): Promise<string[]> {
  const result = await query<{ user_id: string }>(
    `
    SELECT DISTINCT user_id
    FROM page_agent_messages
    ORDER BY user_id ASC
    LIMIT $1
    `,
    [Math.max(1, Math.min(limit, 200))]
  );
  return result.rows.map((item) => item.user_id);
},
```

在 `apps/api/src/modules/page_agent/routes.ts` 增加：

```ts
import { requireAdminOrInternalToken } from "../../middleware/auth";
import { runUserProfileAnalysisJob } from "./profile_service";

const profileAnalysisSchema = z.object({
  userId: z.string().trim().min(1).optional(),
  mode: z.enum(["manual"]).default("manual"),
});

pageAgentRouter.post(
  "/profile-analysis/run",
  requireAdminOrInternalToken,
  async (request, response) => {
    const parsed = profileAnalysisSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
      return;
    }
    const job = await runUserProfileAnalysisJob({
      triggerMode: "manual",
      targetUserId: parsed.data.userId,
    });
    response.json(job);
  }
);

pageAgentRouter.get(
  "/profile-analysis/jobs/:id",
  requireAdminOrInternalToken,
  async (request, response) => {
    const job = await userProfileAnalysisJobStore.getById(request.params.id);
    if (!job) {
      response.status(404).json({ message: "任务不存在" });
      return;
    }
    response.json(job);
  }
);
```

在 `apps/api/src/scripts/run_user_profile_analysis.ts` 中新增：

```ts
import { initDb } from "../lib/db";
import { runUserProfileAnalysisJob } from "../modules/page_agent/profile_service";

const run = async (): Promise<void> => {
  await initDb();
  const job = await runUserProfileAnalysisJob({
    triggerMode: "scheduled",
  });
  process.stdout.write(`${job.id} ${job.status}\n`);
};

void run();
```

- [ ] **Step 6: 运行脚本确认 GREEN**

Run: `npx tsx src/scripts/test_page_agent_profile_analysis.ts`
Working directory: `/opt/idapps/ai_web/apps/api`
Expected: PASS

### Task 5: 在前端接入显式 conversationId

**Files:**
- Modify: `apps/web/src/page_agent/types.ts`
- Modify: `apps/web/src/page_agent/context.ts`
- Modify: `apps/web/src/services/api.ts`
- Modify: `apps/web/src/App.vue`

- [ ] **Step 1: 先让前端引用未来字段，制造构建失败**

在 `apps/web/src/App.vue` 中先写出会话变量和创建调用，但暂不补类型：

```ts
const pageAgentConversationId = ref("");

const ensurePageAgentConversation = async (): Promise<string> => {
  if (pageAgentConversationId.value) {
    return pageAgentConversationId.value;
  }
  const conversation = await createPageAgentConversation({
    pageType: currentPageAgentContext.value?.pageType ?? "article_list",
    route: currentPageAgentContext.value?.route ?? route.fullPath,
    pageTitle: currentPageAgentContext.value?.pageTitle ?? "当前页面",
  });
  pageAgentConversationId.value = conversation.id;
  return conversation.id;
};
```

- [ ] **Step 2: 运行前端构建确认 RED**

Run: `npm run build`
Working directory: `/opt/idapps/ai_web/apps/web`
Expected: FAIL，提示 `createPageAgentConversation` 或 `conversationId` 相关类型缺失

- [ ] **Step 3: 为前端类型和 API 方法补最小实现**

在 `apps/web/src/page_agent/types.ts` 中调整：

```ts
export interface PageAgentContextPayload {
  pageType: PageAgentPageType;
  route: string;
  pageTitle: string;
  selectionText?: string;
  context: Record<string, unknown>;
}

export interface PageAgentRequestPayload extends PageAgentContextPayload {
  conversationId: string;
  question: string;
}

export interface PageAgentConversation {
  id: string;
  pageType?: string;
  route?: string;
  pageTitle?: string;
  status: "active" | "archived";
  createdAt: string;
}

export interface PageAgentResponse {
  conversationId: string;
  answer: string;
  sources: PageAgentSource[];
  meta: {
    usedCurrentPage: boolean;
    usedSiteSearch: boolean;
    usedHistory: boolean;
    usedUserProfile: boolean;
    model: string;
  };
}
```

在 `apps/web/src/page_agent/context.ts` 中统一返回 `PageAgentContextPayload`：

```ts
import { type PageAgentContextPayload } from "./types";

export const currentPageAgentContext = ref<PageAgentContextPayload | null>(null);

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
}): PageAgentContextPayload => ({
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

在 `apps/web/src/services/api.ts` 中增加：

```ts
import {
  type PageAgentConversation,
  type PageAgentRequestPayload,
  type PageAgentResponse,
} from "../page_agent/types";

export const createPageAgentConversation = async (payload: {
  pageType: PageAgentContextPayload["pageType"];
  route: string;
  pageTitle: string;
}): Promise<PageAgentConversation> => {
  const result = await request.post<PageAgentConversation>("/page-agent/conversations", payload);
  return result.data;
};

export const listPageAgentConversations = async (): Promise<PageAgentConversation[]> => {
  const result = await request.get<{ items: PageAgentConversation[] }>(
    "/page-agent/conversations"
  );
  return result.data.items;
};
```

在 `apps/web/src/App.vue` 中接入：

```ts
import { askPageAgent, createPageAgentConversation } from "./services/api";

const pageAgentConversationId = ref("");

const ensurePageAgentConversation = async (): Promise<string> => {
  if (pageAgentConversationId.value) {
    return pageAgentConversationId.value;
  }
  if (!currentPageAgentContext.value) {
    throw new Error("当前页面上下文缺失");
  }
  const conversation = await createPageAgentConversation({
    pageType: currentPageAgentContext.value.pageType,
    route: currentPageAgentContext.value.route,
    pageTitle: currentPageAgentContext.value.pageTitle,
  });
  pageAgentConversationId.value = conversation.id;
  return conversation.id;
};

const submitPageAgentQuestion = async (): Promise<void> => {
  const text = pageAgentQuestion.value.trim();
  if (!currentPageAgentContext.value || !text) {
    return;
  }
  const conversationId = await ensurePageAgentConversation();
  const token = Date.now();
  pageAgentRequestToken.value = token;
  appendUserMessage(text);
  pageAgentQuestion.value = "";
  pageAgentLoading.value = true;
  try {
    const result = await askPageAgent({
      ...currentPageAgentContext.value,
      conversationId,
      question: text,
      selectionText: getSelectionText(),
    });
    if (pageAgentRequestToken.value !== token) {
      return;
    }
    pageAgentConversationId.value = result.conversationId;
    appendAssistantMessage(result);
  } finally {
    if (pageAgentRequestToken.value === token) {
      pageAgentLoading.value = false;
    }
  }
};

watch(
  () => route.fullPath,
  () => {
    pageAgentConversationId.value = "";
    pageAgentRequestToken.value = Date.now();
    pageAgentQuestion.value = "";
    pageAgentMessages.value = [];
    pageAgentLoading.value = false;
  }
);
```

- [ ] **Step 4: 运行前端构建确认 GREEN**

Run: `npm run build`
Working directory: `/opt/idapps/ai_web/apps/web`
Expected: PASS

### Task 6: 最终验证与诊断

**Files:**
- Modify: `apps/api/src/scripts/test_page_agent_persistence_flow.ts`
- Modify: `apps/api/src/scripts/test_page_agent_flow.ts`
- Modify: `apps/api/src/scripts/test_page_agent_routes.ts`
- Modify: `apps/api/src/scripts/test_page_agent_profile_analysis.ts`

- [ ] **Step 1: 运行数据层验证**

Run: `npx tsx src/scripts/test_page_agent_persistence_flow.ts`
Working directory: `/opt/idapps/ai_web/apps/api`
Expected: PASS

- [ ] **Step 2: 运行问答主链路验证**

Run: `npx tsx src/scripts/test_page_agent_flow.ts`
Working directory: `/opt/idapps/ai_web/apps/api`
Expected: PASS

- [ ] **Step 3: 运行路由验证**

Run: `npx tsx src/scripts/test_page_agent_routes.ts`
Working directory: `/opt/idapps/ai_web/apps/api`
Expected: PASS

- [ ] **Step 4: 运行侧写任务验证**

Run: `npx tsx src/scripts/test_page_agent_profile_analysis.ts`
Working directory: `/opt/idapps/ai_web/apps/api`
Expected: PASS

- [ ] **Step 5: 运行后端构建**

Run: `npm run build`
Working directory: `/opt/idapps/ai_web/apps/api`
Expected: PASS

- [ ] **Step 6: 运行前端构建**

Run: `npm run build`
Working directory: `/opt/idapps/ai_web/apps/web`
Expected: PASS

- [ ] **Step 7: 获取编辑器诊断**

Run: 使用编辑器诊断检查以下文件
Expected:
- `apps/api/src/lib/store.ts` 无新增错误
- `apps/api/src/modules/page_agent/service.ts` 无新增错误
- `apps/api/src/modules/page_agent/profile_service.ts` 无新增错误
- `apps/api/src/modules/page_agent/routes.ts` 无新增错误
- `apps/api/src/modules/page_agent/prompts.ts` 无新增错误
- `apps/api/src/modules/page_agent/sanitize.ts` 无新增错误
- `apps/web/src/services/api.ts` 无新增错误
- `apps/web/src/App.vue` 无新增错误

## 自检

### Spec 覆盖检查

- 显式 `conversationId`：Task 1、Task 2、Task 3、Task 5
- 对话记录表：Task 1
- 用户侧写表：Task 1、Task 4
- 用户专属提示词注入：Task 2
- 姓名、工号等脱敏：Task 2、Task 4
- 手动执行与定时执行：Task 4
- 反馈写入与复用：Task 3、Task 4
- 前端接入连续对话：Task 5

### 占位扫描

- 所有任务都给出明确文件路径
- 所有命令都给出工作目录和预期结果
- 所有代码步骤都给出可直接抄写的代码片段
- 无 `TODO`、`TBD`、`类似 Task N`

### 一致性检查

- 后端问答请求统一使用 `conversationId`
- 问答响应统一返回 `usedHistory` 和 `usedUserProfile`
- 用户侧写快照统一使用 `personaPrompt`、`preferenceSummary`、`interestTopics`
- 脱敏函数统一使用 `sanitizeForModel`
