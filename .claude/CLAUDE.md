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

## 元认知前置（收到任务后第一件事）

**收到任何开发指令，禁止直接动手。** 必须先完成以下自检，显式输出分析结果：

### 第一步：任务分类

判断任务属于哪种类型（单选）：

| 类型 | 标志词 |
|---|---|
| 🐛 Bug 修复 | 修/报错/不工作/异常/崩溃/空白/500 |
| 🏗 新功能 | 加/新增/实现/做一个/支持/接入 |
| 🔧 重构/清理 | 重构/整理/简化/去重/优化结构 |
| 🎨 UI 调整 | 样式/布局/响应式/颜色/间距/宽高 |
| 🔒 安全相关 | 鉴权/权限/登录/Token/SQL/注入 |
| 🚀 部署 | 部署/上线/发版/publish/release |

### 第二步：技能选择

根据任务类型，列出**必须加载**的技能（从场景路由表查）：

```
任务类型: {X}
必须加载: [skill-a, skill-b]
可选:     [skill-c]
```

如果用户指令中已包含关键词（tdd/autopilot/ralph 等），在可选列表中标出。

### 第三步：闸门预告

根据任务涉及的代码区域，预告将通过哪些闸门：

```
闸门预告:
  编译: [是/否]
  TDD:  [是/否]（涉及 {模块/函数}）
  安全: [是/否]（涉及 {敏感点}）
```

### 第四步：输出摘要，等待确认

将以上三步汇总为一段简短摘要，告知用户你的计划，然后**等待确认**再动手。

格式：
> 📋 **任务分析**: {类型} | 技能: {列表} | 闸门: {列表}
> 🎯 **执行计划**: {1-2 句话的路线}
> ⏳ 确认后开始。

**禁止在输出分析摘要前执行任何修改操作。**

---

## 场景路由

任务类型决定加载什么技能。**判定任务类型后，必须先用 Skill 工具加载对应技能，再动手。**

| 触发条件 | 必须加载的技能 | 原因 |
|---|---|---|
| 修 Bug / 异常行为 | `systematic-debugging` | 先诊断根因，禁止直觉式修改 |
| 新功能 / 多步骤改动 | `brainstorming` → `writing-plans` | 先厘清需求，再出方案，最后实现 |
| 方案已定，可并行改 | `dispatching-parallel-agents` + `subagent-driven-development` | 前后端同时改动 |
| 改动涉及 Vue 组件 | `vue` | Composition API / setup / KeepAlive 语法约束 |
| 改动涉及 Express/Node | `node` | 错误处理、async、中间件模式 |
| 涉及鉴权/SQL/Token/用户数据 | `security-review` | 防越权、注入、泄露 |
| 纯代码清理（不改逻辑） | `simplify` | 去冗余、提复用 |

### 关键词自动触发

以下关键词出现时，对应 OMC 技能自动加载（不需要手动 Skill 调用）：`autopilot` / `ralph` / `ulw` / `ccg` / `ralplan` / `tdd` / `deslop` / `deepsearch` / `ultrathink`

---

## 质量闸门

以下闸门是**硬约束**——不通过 = 不能声称"完成"，更不能部署。

### 闸门 A：编译（所有代码改动强制）

```
1. npx tsc --noEmit -p apps/api/tsconfig.json   # 后端 TypeScript
2. npm run build:api 2>&1 | tail -10             # 后端构建
3. npm run build:web 2>&1 | tail -10             # 前端构建（如涉及前端文件）
```

任一步未通过 → 修复 → 从第 1 步重跑。三步全绿 = 编译闸门通过。

### 闸门 B：TDD（触发条件）

以下场景**必须先写测试，跑红，再写实现**：
- `apps/api/src/modules/*/` 下的业务逻辑（非纯 CRUD 透传）
- `middleware/auth.ts` 的鉴权分支
- `jobs/push.ts` 的调度/时间计算
- `lib/` 下的数据处理/工具函数

不需要 TDD：Tailwind 样式、迁移脚本、文档/注释。

### 闸门 C：安全审查（触发条件）

以下场景**必须运行** `security-review` 技能：
- 新增/修改 SQL 查询
- 改动 CAS / Session / Token 逻辑
- 处理用户输入的新代码
- 企微 API 调用（Token 传递）

### 闸门 D：改动范围自检（提交前强制）

```bash
git diff --stat          # 确认范围
git diff --name-only     # 逐文件检查
```

发现修改了任务范围外的文件 → 回滚越界改动。

### 闸门 E：提交规范

**时机**：闸门 A-D 全部通过后才能 commit。禁止先 commit 再补验证。

**消息格式**：`<type>: <简述>`，type 用 `fix` / `feat` / `refactor` / `style` / `chore`。

**分支**：不在 main 上直接改。功能开发走 `feature/<描述>`，修复走 `fix/<描述>`。

**push**：commit 后立即 push，不攒多个 commit 一起推。

---

## 部署调度

cc-ai-web 直接调度 cc-ops，不经过 Hermes。

### 部署前条件

全部质量闸门通过 + git commit + git push 完成。

### 调度 cc-ops 部署

cc-ops 是部署专用 CC（tmux 会话名 `cc-ops`，工作目录 `/opt/cc-ops`）。两步：

**1. 检查 cc-ops 是否就绪**

```bash
# 会话存在？
tmux has-session -t cc-ops 2>&1

# 就绪？（❯ 提示符可见，不在执行中）
tmux capture-pane -t cc-ops -p -S -5
```

**2. 派发部署任务**

```bash
tmux send-keys -t cc-ops "部署 ai_web 到生产 .45" Enter
```

如果 cc-ops 不存在或不可用 → 告知用户需要先启动 cc-ops。

### 派发内容模板

派发给 cc-ops 的指令至少包含：

```
项目: ai_web
分支: {当前分支名}
提交: {commit hash}
部署目标: xyd-45 (172.30.4.45)
服务: /opt/idapps/ai_web/ai_web_service.sh restart
构建: npm run build:api && npm run build:web
验证: curl http://127.0.0.1:3000/api/health
```

### 部署后验证（cc-ai-web 自己验）

派发 cc-ops 后，不等通知，直接 SSH 验证：

```
1. git log 到位 → ssh xyd-45 "cd /opt/idapps/ai_web && git log --oneline -3"
2. 进程存活 → ssh xyd-45 "pgrep -f 'node dist/server.js'"
3. 健康检查 → ssh xyd-45 "curl -s http://127.0.0.1:3000/api/health"
4. 功能验证 → curl 对应端点确认修复生效
```

四步全绿 → 报告"部署成功"。任一步失败 → 精确报告哪步失败 + 输出。

---

## Pipeline 任务约束（feedback 流水线）

以下在 Hermes 通过 feedback 流水线派发任务时生效：

- ⛔ 禁止修改任务文档未列出的文件
- ⛔ 禁止重命名已有 API 路由或函数
- ⛔ 禁止添加任务文档未要求的"优化"或"加固"
- ✅ 只做任务文档明确列出的修改项

验收标准：TypeScript 编译 → 后端构建 → 前端构建 → git diff 自检 → commit+push
完成后写 inbox 文件：`/home/ubuntu/hermes-cc-cowork/inbox/{任务ID}.done.json`
