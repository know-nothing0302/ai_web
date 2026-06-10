# DeepSeek `user_id` 伪匿名化方案

**日期**: 2026-06-10
**状态**: 待实现

## 1. 背景

DeepSeek API 支持 `user_id` 参数，在同一 API Key 下实现三层隔离：

| 隔离类型 | 说明 |
|---|---|
| 内容安全隔离 | 区分用户身份进行内容安全处理 |
| KVCache 隔离 | 隔离 prompt 前缀缓存，防止隐私串扰 |
| 调度隔离 | 扩容账号下每个 `user_id` 独立并发限制 |

当前所有 LLM 调用均未传 `user_id`，所有用户合并计算并发，且无任何隔离。

## 2. 全部 LLM 调用点

| # | 文件 | 函数 | 有 userId？ | 应注入？ | 原因 |
|---|---|---|---|---|---|
| 1 | `page_agent/service.ts:316` | `answerPageQuestion()` | ✅ | ✅ | 面向最终用户 |
| 2 | `page_agent/service.ts:577` | `streamPageAnswer()` | ✅ | ✅ | 面向最终用户 |
| 3 | `page_agent/profile_service.ts:193` | `runUserProfileAnalysisJob()` | ✅ | ✅ | 每用户独立分析 |
| 4 | `articles/ai_optimize_service.ts:84` | `optimizeArticleDraft()` | ✅ | ✅ | 有用户上下文 |
| 5 | `articles/url_extract_service.ts:365` | `requestAiExtraction()` | ❌ | ❌ | 管理员服务操作 |
| 6 | `articles/url_extract_service.ts:434` | `requestAiSummary()` | ❌ | ❌ | 管理员服务操作 |
| 7 | `aixy/routes.ts:166` | `/summary` | ❌ | ❌ | 管理员服务操作 |

## 3. 伪匿名化方案

### 3.1 算法：HMAC-SHA256

```
pseudonym = HMAC-SHA256(secret, userId) → hex digest (64 chars, [a-f0-9])
```

- **确定性**：同一输入 → 同一输出，保证 KVCache 和调度隔离持续生效
- **不可逆**：不知 secret 无法反推学工号
- **格式兼容**：hex 输出匹配 `[a-zA-Z0-9\-_]+`
- **防长度扩展**：HMAC 优于 SHA256(userId+secret) 拼接

### 3.2 Secret 管理

新增 `DEEPSEEK_USER_ID_SECRET` 环境变量，fallback 到 `SESSION_SECRET`。

Secret 轮换时所有 pseudonym 同步变化 → DeepSeek 视为全新用户 → 一次性 KVCache 冷启动，可接受。

### 3.3 工具函数

位置：`apps/api/src/modules/page_agent/user_id_hash.ts`

```typescript
import { createHmac } from "node:crypto";
import { env } from "../../config/env";

export const hashUserIdForDeepSeek = (userId: string): string =>
  createHmac("sha256", env.deepseekUserIdSecret)
    .update(userId)
    .digest("hex");
```

### 3.4 注入方式

在 axios POST body 顶层添加 `user_id` 字段（与 `model`/`messages` 同级）。

### 3.5 边界情况

- `ai_optimize_service` 的 `requestUserId` 可选：为空时**不传** `user_id`（DeepSeek 文档："空 id 为一个特殊的 user_id"，不传优于传 ""）
- `profile_service` 循环：HMAC 计算 ~1μs，50 用户增加 50μs，可忽略
- `dev-mock-id`：与真实学工号同样处理，HMAC 后不可区分

## 4. 潜在风险

| 问题 | 等级 | 对策 |
|---|---|---|
| Secret 泄露 | 🔴 高 | `.env` 不入库，`user_id` 不记日志 |
| Secret 轮换 → KVCache 全量失效 | 🟡 中 | 一次性代价，运维文档记录 |
| DeepSeek 不识别字段 | 🟢 低 | 官方文档确认，且 API 忽略不识别字段 |

## 5. 实现步骤

1. `env.ts` — 新增 `deepseekUserIdSecret`
2. `user_id_hash.ts` — 实现 HMAC 工具函数
3. `service.ts` — `answerPageQuestion` + `streamPageAnswer` 注入
4. `profile_service.ts` — `runUserProfileAnalysisJob` 注入
5. `ai_optimize_service.ts` — `optimizeArticleDraft` 条件注入
6. 单元测试 — 确定性/格式/不可逆
7. 编译闸门 — `tsc --noEmit` + `build:api`

## 6. 不做

- ❌ URL extract/summary、aixy routes 注入 — 无最终用户上下文
- ❌ UUID 映射表 — 增加存储开销，HMAC 已满足
- ❌ 日志记录 `user_id` hash — 日志最小化原则
