# Page Agent 连续对话与用户侧写设计

## 目标

本次设计聚焦为 `ai_web` 的 `page agent` 补齐连续对话与用户侧写能力，满足以下目标：

1. 为 `page agent` 增加显式 `conversationId` 会话能力，支持连续问答
2. 在问答时拼接当前会话最近若干轮上下文，实现对话连续性
3. 设计 `user_profiles` 表，沉淀用户偏好、关注主题和回答风格偏好
4. 设计对话记录表，记录提问、回答、反馈和必要的页面上下文
5. 在会话开始和问答过程中读取用户侧写快照，提升回答相关性
6. 严格限制入模信息，禁止姓名、工号、邮箱、手机号等身份信息进入模型
7. 提供用户侧写手动执行和定时执行两种分析方式

## 范围

### 本次包含

- `page agent` 显式会话创建、读取和连续问答
- 会话消息持久化与最近历史拼接
- 用户反馈记录与后续分析复用
- 用户侧写快照表和侧写分析任务表
- 问答主链路读取用户专属提示词
- 独立的用户侧写分析 prompt
- 手动触发接口与定时脚本入口
- 关键日志与审计信息

### 本次不包含

- 全量长期记忆或无限历史拼接
- 向量数据库、语义检索和知识库重构
- 基于侧写的主动推送编排调整
- 历史会话的自动摘要压缩
- 复杂的前端历史会话管理界面
- 对外公开的画像查询接口

## 背景

当前 `page agent` 后端实现已经具备以下基础：

- 已有统一 `POST /api/page-agent/qa` 问答接口
- 已接入 `DeepSeek Chat Completions`
- 已支持基于页面上下文和站内文章的单轮回答
- 已有 `subscriptions` 表，可作为用户兴趣偏好的部分事实来源
- 已有 CAS 登录态和后端鉴权中间件

当前缺失的能力包括：

- 只有单轮问答，没有显式会话与历史消息拼接
- 没有专门的对话消息持久化表
- 没有用户侧写快照，无法稳定复用用户偏好
- 没有独立的侧写分析链路和调度入口

因此，本次采用“会话记录 + 侧写快照”的方案，将问答主链路和侧写分析链路拆开，以最小改动补齐连续问答和个性化回答能力。

## 设计原则

- 连续问答优先保证稳定和可审计，不做无限历史拼接
- 用户侧写用于回答优化，不用于权限判断
- 入模信息必须遵循最小必要原则
- 姓名、工号、邮箱、手机号、企业微信用户标识不得进入模型
- 问答主链路只读取快照，不在请求中现场重算用户侧写
- 侧写分析使用独立 prompt，避免与问答 prompt 混用
- 保持最小范围改造，优先复用现有鉴权、日志和数据访问方式

## 总体方案

### 主链路

用户在前端创建或复用 `conversationId` 后发起提问。后端校验会话归属，读取当前会话最近若干轮消息、用户侧写快照和当前页面上下文，按 `DeepSeek` 的 `messages` 结构组织请求。回答完成后，将用户消息和助手消息持久化，并更新会话时间。

### 侧写链路

侧写分析不在问答请求中执行，而是通过独立 service 收集用户订阅、提问、追问、反馈等数据，调用单独的分析 prompt 生成脱敏后的 `preferenceSummary`、`interestTopics`、`responsePreferences` 和 `personaPrompt`，再写回 `user_profiles`。

### 隐私边界

会话数据允许保存系统内部关联键，但进入模型前必须使用脱敏版本。问答和侧写共用一套脱敏函数，统一产出 `sanitized_content`，并保证用户专属提示词只包含兴趣、风格和回答偏好，不包含任何直接身份标识。

## 数据模型

### `user_profiles`

用途：

- 保存用户侧写快照
- 供问答主链路直接读取
- 避免每次问答动态重算

建议字段：

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `user_id VARCHAR(64) NOT NULL UNIQUE`
- `profile_version INT NOT NULL DEFAULT 1`
- `preference_summary TEXT NOT NULL DEFAULT ''`
- `persona_prompt VARCHAR(500) NOT NULL DEFAULT ''`
- `interest_topics TEXT[] NOT NULL DEFAULT '{}'`
- `response_preferences JSONB NOT NULL DEFAULT '{}'::jsonb`
- `evidence_stats JSONB NOT NULL DEFAULT '{}'::jsonb`
- `last_analyzed_at TIMESTAMPTZ`
- `last_source_window_start TIMESTAMPTZ`
- `last_source_window_end TIMESTAMPTZ`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

约束：

- `persona_prompt` 最大 500 字
- 不在该表保存姓名、工号、邮箱、手机号
- `user_id` 仅用于系统内部关联，不进入模型

### `page_agent_conversations`

用途：

- 作为显式会话容器
- 串联连续问答和消息历史

建议字段：

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `user_id VARCHAR(64) NOT NULL`
- `title VARCHAR(200)`
- `page_type VARCHAR(32)`
- `route VARCHAR(500)`
- `page_title VARCHAR(200)`
- `status VARCHAR(20) NOT NULL DEFAULT 'active'`
- `last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

索引建议：

- `idx_page_agent_conversations_user_id`
- `idx_page_agent_conversations_last_message_at`

### `page_agent_messages`

用途：

- 保存提问、回答、反馈和必要页面快照
- 为连续问答和侧写分析提供事实来源

建议字段：

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `conversation_id UUID NOT NULL`
- `user_id VARCHAR(64) NOT NULL`
- `role VARCHAR(20) NOT NULL`
- `message_type VARCHAR(20) NOT NULL`
- `content TEXT NOT NULL`
- `sanitized_content TEXT`
- `page_type VARCHAR(32)`
- `route VARCHAR(500)`
- `page_title VARCHAR(200)`
- `context_payload JSONB NOT NULL DEFAULT '{}'::jsonb`
- `sources_payload JSONB NOT NULL DEFAULT '[]'::jsonb`
- `model VARCHAR(100)`
- `tokens_input INT`
- `tokens_output INT`
- `parent_message_id UUID`
- `feedback_score SMALLINT`
- `feedback_tag VARCHAR(50)`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

约束建议：

- `role` 允许值：`user`、`assistant`、`feedback`
- `message_type` 允许值：`question`、`answer`、`feedback`
- `feedback_score` 允许值：`1`、`-1` 或空

索引建议：

- `idx_page_agent_messages_conversation_created_at`
- `idx_page_agent_messages_user_created_at`

### `user_profile_analysis_jobs`

用途：

- 记录手动和定时侧写分析任务
- 便于审计、失败重跑和运维排查

建议字段：

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `trigger_mode VARCHAR(20) NOT NULL`
- `target_user_id VARCHAR(64)`
- `status VARCHAR(20) NOT NULL`
- `processed_count INT NOT NULL DEFAULT 0`
- `success_count INT NOT NULL DEFAULT 0`
- `failed_count INT NOT NULL DEFAULT 0`
- `error_message TEXT`
- `started_at TIMESTAMPTZ`
- `finished_at TIMESTAMPTZ`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

约束建议：

- `trigger_mode` 允许值：`manual`、`scheduled`
- `status` 允许值：`pending`、`running`、`success`、`failed`

## 接口设计

### 会话接口

#### `POST /api/page-agent/conversations`

用途：

- 创建新会话
- 返回 `conversationId` 供后续连续问答复用

请求体：

```json
{
  "pageType": "article_detail",
  "route": "/articles/123",
  "pageTitle": "文章详情"
}
```

响应体：

```json
{
  "id": "uuid",
  "pageType": "article_detail",
  "route": "/articles/123",
  "pageTitle": "文章详情",
  "status": "active",
  "createdAt": "2026-05-13T10:00:00Z"
}
```

#### `GET /api/page-agent/conversations`

用途：

- 获取当前用户最近会话列表
- 支持前端恢复最近会话

建议查询参数：

- `limit`
- `status`

#### `GET /api/page-agent/conversations/:id/messages`

用途：

- 获取指定会话的消息历史
- 仅返回当前用户自己的会话数据

### 问答接口

继续使用 `POST /api/page-agent/qa`，但升级为显式会话模式。

请求体：

```json
{
  "conversationId": "uuid",
  "question": "这篇文章和前面提到的政策有什么关系？",
  "pageType": "article_detail",
  "route": "/articles/123",
  "pageTitle": "文章详情",
  "selectionText": "",
  "context": {}
}
```

响应体：

```json
{
  "conversationId": "uuid",
  "answer": "……",
  "sources": [],
  "meta": {
    "usedCurrentPage": true,
    "usedSiteSearch": false,
    "usedHistory": true,
    "usedUserProfile": true,
    "model": "deepseek-chat"
  }
}
```

### 反馈接口

#### `POST /api/page-agent/messages/:id/feedback`

用途：

- 对指定助手回答写入反馈
- 为后续侧写分析提供结构化依据

请求体：

```json
{
  "score": 1,
  "tag": "回答清晰",
  "content": "希望以后多给步骤"
}
```

### 侧写分析接口

#### `POST /api/page-agent/profile-analysis/run`

用途：

- 手动触发用户侧写分析
- 支持单用户与批量执行

鉴权：

- 使用独立接口鉴权
- 建议使用 `requireAdminOrInternalToken`

请求体：

```json
{
  "userId": "100001",
  "mode": "manual"
}
```

或：

```json
{
  "mode": "manual"
}
```

#### `GET /api/page-agent/profile-analysis/jobs/:id`

用途：

- 查询分析任务状态和统计结果

## 问答主链路设计

主链路处理步骤如下：

1. 校验请求体和登录态
2. 校验 `conversationId` 是否属于当前用户
3. 将当前问题写入 `page_agent_messages`
4. 读取 `user_profiles`
5. 读取当前会话最近若干轮消息
6. 读取当前页面上下文和必要的站内检索结果
7. 组装 `DeepSeek` `messages`
8. 调用模型生成回答
9. 将助手回复和来源信息写入 `page_agent_messages`
10. 更新 `page_agent_conversations.last_message_at`

### `messages` 组织顺序

建议顺序如下：

1. 基础 `system prompt`
2. 用户专属 `personaPrompt`
3. 用户偏好摘要和关注主题
4. 最近若干轮历史消息
5. 当前问题和当前页面上下文

### 历史消息边界

- 最多读取最近 4 轮对话
- 单条历史消息截断到 1200 字以内
- 超长时优先丢弃更早历史，不丢当前页面上下文

## 用户侧写设计

### 数据来源

用户侧写分析仅使用以下数据：

- `subscriptions` 中的栏目偏好和频率
- 最近一段时间的提问
- 最近一段时间的追问行为
- 最近一段时间的反馈
- 页面类型访问分布

本次不纳入以下数据：

- CAS 原始属性
- 姓名、工号、邮箱、手机号
- 企业微信用户标识

### 分析结果

侧写分析结果至少包括：

- `preferenceSummary`
- `interestTopics`
- `responsePreferences`
- `personaPrompt`
- `confidence`

### `personaPrompt` 要求

- 不超过 500 字
- 只描述回答偏好和关注主题
- 不包含身份信息
- 证据不足时使用弱约束表达

## 侧写分析 Prompt 设计

### system prompt 要求

- 角色是用户偏好分析器，不是聊天助手
- 只输出 JSON
- 不得输出姓名、工号、手机号、邮箱等身份信息
- 只能总结兴趣偏好、回答风格偏好和内容深度偏好
- 证据不足时必须降低确定性，不得臆断

### user prompt 输入结构

```json
{
  "subscriptions": {
    "channelCodes": ["medical-frontier", "policy-ethics"],
    "frequencies": ["daily"]
  },
  "questionStats": {
    "total": 32,
    "followUpCount": 11,
    "pageTypeDistribution": {
      "article_detail": 20,
      "subscription": 8
    }
  },
  "recentQuestions": [
    "这篇文章核心观点是什么？",
    "请结合政策背景解释",
    "能给出更具体的实施建议吗？"
  ],
  "recentFeedback": [
    {
      "score": 1,
      "tag": "希望更具体",
      "content": "多给一些步骤"
    }
  ]
}
```

### 模型输出结构

```json
{
  "preferenceSummary": "用户更关注医学AI与政策解读，偏好结构化、可执行、不过度冗长的回答。",
  "interestTopics": ["医学AI", "政策解读", "实施建议"],
  "responsePreferences": {
    "style": "结构化",
    "depth": "中等偏深",
    "preferExamples": true
  },
  "personaPrompt": "回答时优先结合医学AI和政策应用场景，使用清晰分点，先给结论再给步骤，必要时补充具体建议，避免空泛表述。",
  "confidence": "medium"
}
```

## 脱敏与隐私控制

### 禁止进入模型的数据

- 姓名
- 工号
- 用户名原文
- 邮箱
- 手机号
- 企业微信用户 ID
- CAS 原始属性
- 任何可直接识别自然人的唯一标识

### 允许进入模型的数据

- 栏目偏好
- 常见提问主题
- 回答风格偏好
- 反馈中体现的结构偏好
- 当前页面上下文
- 当前会话最近若干轮脱敏消息

### 脱敏策略

- 身份字段直接丢弃，不做掩码后入模
- 问题和反馈文本做规则型清洗
- 清洗目标包括手机号、邮箱、明显工号样式编号和自报身份表达
- 原文允许落库，但入模只用 `sanitized_content`

## 调度与执行方式

### 手动执行

- 通过内部接口触发侧写分析
- 适用于单用户重算、批量初始化和效果排查

### 定时执行

- 提供独立脚本入口，例如 `run_user_profile_analysis`
- 通过系统级调度或部署环境定时任务触发
- 建议按天执行增量分析，只处理最近有新问答、反馈或订阅变化的用户

## 日志与审计

### 问答日志

建议记录以下事件：

- `page.agent.conversation.create`
- `page.agent.answer.start`
- `page.agent.answer.context_loaded`
- `page.agent.answer.finish`
- `page.agent.answer.failed`

建议字段：

- `userId`
- `conversationId`
- `pageType`
- `route`
- `questionLength`
- `historyMessageCount`
- `usedUserProfile`
- `usedSiteSearch`
- `durationMs`

### 反馈日志

建议记录：

- `page.agent.feedback.recorded`

### 侧写任务日志

建议记录以下事件：

- `page.agent.profile_analysis.start`
- `page.agent.profile_analysis.user_finish`
- `page.agent.profile_analysis.finish`
- `page.agent.profile_analysis.failed`

## 风险控制

### Prompt 长度控制

- `personaPrompt` 不超过 500 字
- 最近历史只取最近 4 轮
- 单条历史消息不超过 1200 字
- 当前页面 `sourceContent` 继续保留长度上限
- 站内检索来源最多 3 条

### 鉴权要求

- 聊天接口继续要求登录态
- 会话、消息、反馈必须校验归属用户
- 侧写分析接口必须使用独立接口鉴权
- 不允许将跳过 CAS 视为无鉴权

### 降级策略

- 没有 `user_profiles` 时仍可正常回答
- 历史消息为空时退化为当前页面问答
- 侧写分析失败时不影响问答主链路

## API 文档要求

后续实现完成后，接口文档应拆分为两个版本：

- 内部运维接口文档
- 外部调用接口文档

本次设计中的 `profile-analysis` 手动触发和任务查询接口归入内部运维接口范围。

## 影响范围

预计涉及以下区域：

- `apps/api/src/lib/db.ts`
- `apps/api/src/lib/store.ts`
- `apps/api/src/lib/types.ts`
- `apps/api/src/modules/page_agent/routes.ts`
- `apps/api/src/modules/page_agent/service.ts`
- `apps/api/src/modules/page_agent/prompts.ts`
- `apps/api/src/modules/page_agent/types.ts`
- `apps/api/src/modules/subscriptions`
- `apps/api/src/scripts`
- `apps/web/src/page_agent`
- `apps/web/src/services/api.ts`
- `apps/web/src/App.vue`

## 验收标准

### 会话能力

- 可创建显式 `conversationId`
- 同一会话下第二问可读取最近历史
- 不允许跨用户读取或续用会话

### 问答能力

- 问答主链路可读取用户侧写快照
- 无侧写时仍可正常回答
- 回答结果可标记是否使用历史和用户侧写

### 侧写能力

- 可手动触发单用户或批量侧写分析
- 可通过定时任务入口执行增量分析
- `personaPrompt` 严格控制在 500 字以内

### 隐私与安全

- 姓名、工号、邮箱、手机号不进入模型
- 脱敏内容可审计，原文和入模版本边界清晰
- 内部接口具备独立可轮换鉴权

## 结论

本次采用“显式会话 + 消息持久化 + 侧写快照”的方案。

该方案在当前 `page agent` 基础上补齐连续问答和个性化回答能力，同时将问答主链路与侧写分析链路分离，确保链路稳定、边界清晰、便于审计，并满足隐私控制要求。
