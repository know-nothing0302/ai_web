<!-- OMC:START -->
<!-- OMC:VERSION:4.14.4 -->

# oh-my-claudecode - Intelligent Multi-Agent Orchestration

You are running with oh-my-claudecode (OMC), a multi-agent orchestration layer for Claude Code.
Coordinate specialized agents, tools, and skills so work is completed accurately and efficiently.

<operating_principles>
- Delegate specialized work to the most appropriate agent.
- Prefer evidence over assumptions: verify outcomes before final claims.
- Choose the lightest-weight path that preserves quality.
- Consult official docs before implementing with SDKs/frameworks/APIs.
</operating_principles>

<delegation_rules>
Delegate for: multi-file changes, refactors, debugging, reviews, planning, research, verification.
Work directly for: trivial ops, small clarifications, single commands.
Route code to `executor` (use `model=opus` for complex work). Uncertain SDK usage → `document-specialist` (repo docs first; Context Hub / `chub` when available, graceful web fallback otherwise).
</delegation_rules>

<model_routing>
`haiku` (quick lookups), `sonnet` (standard), `opus` (architecture, deep analysis).
Direct writes OK for: `~/.claude/**`, `.omc/**`, `.claude/**`, `CLAUDE.md`, `AGENTS.md`.
</model_routing>

<skills>
Invoke via `/oh-my-claudecode:<name>`. Trigger patterns auto-detect keywords.
Tier-0 workflows include `autopilot`, `ultrawork`, `ralph`, `team`, and `ralplan`.
Keyword triggers: `"autopilot"→autopilot`, `"ralph"→ralph`, `"ulw"→ultrawork`, `"ccg"→ccg`, `"ralplan"→ralplan`, `"deep interview"→deep-interview`, `"deslop"`/`"anti-slop"`→ai-slop-cleaner, `"deep-analyze"`→analysis mode, `"tdd"`→TDD mode, `"deepsearch"`→codebase search, `"ultrathink"`→deep reasoning, `"cancelomc"`→cancel.
Team orchestration is explicit via `/team`.
Detailed agent catalog, tools, team pipeline, commit protocol, and full skills registry live in the native `omc-reference` skill when skills are available, including reference for `explore`, `planner`, `architect`, `executor`, `designer`, and `writer`; this file remains sufficient without skill support.
</skills>

<verification>
Verify before claiming completion. Size appropriately: small→haiku, standard→sonnet, large/security→opus.
If verification fails, keep iterating.
</verification>

<execution_protocols>
Broad requests: explore first, then plan. 2+ independent tasks in parallel. `run_in_background` for builds/tests.
Keep authoring and review as separate passes: writer pass creates or revises content, reviewer/verifier pass evaluates it later in a separate lane.
Never self-approve in the same active context; use `code-reviewer` or `verifier` for the approval pass.
Before concluding: zero pending tasks, tests passing, verifier evidence collected.
</execution_protocols>

<hooks_and_context>
Hooks inject `<system-reminder>` tags. Key patterns: `hook success: Success` (proceed), `[MAGIC KEYWORD: ...]` (invoke skill), `The boulder never stops` (ralph/ultrawork active).
Persistence: `<remember>` (7 days), `<remember priority>` (permanent).
Kill switches: `DISABLE_OMC`, `OMC_SKIP_HOOKS` (comma-separated).
</hooks_and_context>

<cancellation>
`/oh-my-claudecode:cancel` ends execution modes. Cancel when done+verified or blocked. Don't cancel if work incomplete.
</cancellation>

<worktree_paths>
State: `.omc/state/`, `.omc/state/sessions/{sessionId}/`, `.omc/notepad.md`, `.omc/project-memory.json`, `.omc/plans/`, `.omc/research/`, `.omc/logs/`
</worktree_paths>

## Setup

Say "setup omc" or run `/oh-my-claudecode:omc-setup`.

<!-- OMC:END -->

<!-- User customizations -->
## AI 徐医主站 — 项目约定

### 安全铁律
- **SQL 注入**：只用参数化查询 `query("...WHERE col = $1", [value])`。绝对禁止字符串拼接。
- **输入校验**：所有 API 入参必须经 Zod schema 校验，`schema.safeParse()` 失败返回 400。
- **鉴权**：路由层面中间件控制（`requireAuth`/`requireAdmin`/`requireInternalToken`等），禁止 handler 内手动检查。
- **XSS**：`v-html` 仅用于可信内容（如 markdown 渲染），用户输入不直接 `v-html`。
- **敏感信息**：`.env` 不入库，不硬编码密钥/token/密码。新变量先注册到 `config/env.ts`。

### 项目结构
- 后端：`apps/api/src/modules/<name>/routes.ts` → Express Router，挂载在 `app.ts`
- 数据库：pg Pool 原生 SQL，无 ORM。Schema 变更在 `db.ts` 的 `schemaSql` 末尾追加 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`
- 环境变量：集中在 `apps/api/src/config/env.ts`，不直接读 `process.env`
- 前端：`views/` 放页面组件，`components/` 放可复用组件，base path `/ai-web/`

### 常见低级错误
- ❌ `process.env.X` 直接读 → ✅ `import { env } from "../config/env"`
- ❌ SQL 拼接 → ✅ `query("...WHERE id = $1", [id])`
- ❌ 新路由不加 Zod → ✅ 先写 schema 再写 handler
- ❌ handler 内手动鉴权 → ✅ 路由定义时加中间件
- ❌ 新增环境变量不更新 `env.ts` → ✅ 先在 env.ts 注册
- ❌ `apps/api` 和 `apps/web` 互相 import 类型 → ✅ 各自定义

### 关键路径
| 路径 | 说明 |
|---|---|
| CAS 登录 | `/api/auth/cas/login` → CAS → `/api/auth/cas/callback` → Session |
| 文章发布 | `POST /api/articles` (admin) |
| 订阅推送 | cron 定时（daily 20:00 / weekly 周日 20:00）→ 企微推送 |
| PageAgent | `PageAgentPanel.vue` ↔ `POST /api/page-agent/messages` ↔ DeepSeek |

### 开发命令
```bash
npm run dev:api     # 后端开发（端口 3000）
npm run dev:web     # 前端开发（端口 5173）
npm run build:api   # 后端编译（tsc）
npm run build:web   # 前端编译（vue-tsc + vite build）
```

### 通知 Hermes
```bash
CC_TASK_ID=<TASK> cc-notify done "<简述>"
CC_TASK_ID=<TASK> cc-notify blocked "<原因>"
CC_TASK_ID=<TASK> cc-notify failed "<失败原因>"
```
