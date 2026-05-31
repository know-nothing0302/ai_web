# CLAUDE.md — AI 徐医主站

## 项目概要

徐州医科大学内部 AI 资讯平台。面向教师、职工、学生（大多对 AI 了解有限），集资讯浏览、AI 交互面板（PageAgent）、内容管理后台、订阅推送于一体的教育 AI 工作台。

日活 100-200 人，内网部署，CAS 单点登录 + 企业微信推送。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 (Composition API) + Vite 8 + TypeScript 6 + Tailwind CSS 4 + Pinia + Vue Router 5 |
| 后端 | Node.js + Express 5 + TypeScript 6 + `pg` (原生 SQL，无 ORM) |
| 数据库 | PostgreSQL（唯一主库，Schema 内联 SQL 管理） |
| AI | PageAgent（阿里开源前端 GUI Agent）+ DeepSeek（通过 ai_xy 代理） |
| 部署 | Docker Compose（API:3000 / Web:5173 / Nginx:8080） |

## 项目结构

```
ai_web/                    # npm workspaces 根
├── apps/
│   ├── api/               # Express 5 后端
│   │   └── src/
│   │       ├── server.ts          # 入口：initDb → listen → initPushJobs
│   │       ├── app.ts             # Express 应用装配（CORS/Helmet/Session/路由挂载）
│   │       ├── config/env.ts      # 所有环境变量集中定义（dotenv）
│   │       ├── lib/
│   │       │   ├── db.ts          # Pool + schema SQL + seed + 迁移（ALTER TABLE 追加）
│   │       │   ├── logger.ts      # 结构化日志
│   │       │   ├── store.ts       # 内存缓存（wecom config/token）
│   │       │   └── types.ts       # SessionUser 等共享类型
│   │       ├── middleware/auth.ts  # 鉴权中间件（requireAuth/Admin/ContentHubOperator/InternalToken）
│   │       ├── modules/           # 业务模块，每个模块一个目录
│   │       │   ├── articles/      # 文章 CRUD + AI 优化 + URL 提取 + 发布 JWT
│   │       │   ├── auth/cas.ts    # CAS 登录/回调/登出
│   │       │   ├── subscriptions/ # 订阅管理
│   │       │   ├── push/          # 推送服务 + 企微标签同步
│   │       │   ├── wecom/         # 企微 client（token + 消息发送）
│   │       │   ├── page_agent/    # PageAgent 对话管理 + 用户画像
│   │       │   ├── channels/      # 频道管理
│   │       │   ├── feedback/      # 用户反馈
│   │       │   ├── stats/         # 统计看板
│   │       │   └── aixy/          # AI 知识库对话代理
│   │       ├── routes/health.ts   # 健康检查
│   │       ├── jobs/push.ts       # node-cron 定时推送任务
│   │       └── scripts/           # 测试脚本 + 迁移脚本
│   └── web/               # Vue 3 前端
│       └── src/
│           ├── main.ts / App.vue / router.ts / style.css
│           ├── views/             # 页面组件
│           │   ├── ArticlesPage.vue / ArticleDetailPage.vue
│           │   ├── AdminPage.vue / AdminPublishPage.vue / AdminStatsPage.vue
│           │   ├── SubscriptionPage.vue / TodayPushDigestPage.vue
│           └── components/        # 通用组件
│               ├── PageAgentPanel.vue / PageAgentLauncher.vue
│               ├── FeedbackPanel.vue / NeuralBackground.vue
│           ├── services/api.ts    # axios 封装
│           ├── page_agent/        # PageAgent 前端类型与上下文
│           └── shared/            # markdown 渲染、文本净化
├── sql/                   # 增量迁移脚本（001_init.sql, 002_xxx.sql）
├── deploy/nginx/          # Nginx 配置
├── docs/                  # 设计文档
├── docker-compose.yml     # 开发环境一键启动
└── ai_web_service.sh      # 生产服务管理脚本
```

## 关键约定

### 模块路由组织
- 每个业务模块目录下必须有 `routes.ts`，导出 Express Router
- 路由标准前缀 `/api/<module>`，在 `app.ts` 中统一挂载
- 鉴权在路由层面通过中间件控制，不在业务逻辑里散落

```typescript
// 典型路由文件模式
import { Router } from "express";
import { requireAuth, requireAdmin } from "../../middleware/auth";

export const xyzRouter = Router();
xyzRouter.get("/", requireAuth, handler);
xyzRouter.post("/", requireAdmin, handler);
// POST /api/xyz/
```

### 数据库操作
- 直接用 `pg` Pool 写 SQL，无 ORM。导入 `query()` 和 `withTransaction()`
- Schema 变更方式：`db.ts` 内 `schemaSql` 追加 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`
- 参数化查询，禁止拼接 SQL
- 类型泛型：`query<MyRow>("SELECT ...", [param])`

### 环境变量
- 所有配置集中在 `apps/api/src/config/env.ts`，其他地方不直接读 `process.env`
- `.env` 不入库（gitignore 已覆盖）
- 新增变量：先在 `env.ts` 添加解析逻辑，再在 `.env.example` 添加说明

### 前端视图归属
- `views/` 只放页面级组件（对应路由的一个页面）
- `components/` 放可复用组件
- 前端路由 `/ai-web/` 为生产 base path（`vite.config.ts` 的 `base`）

### 类型
- 后端用 Zod 4 做 API 入参校验
- 前端 TypeScript 严格模式
- 共享类型不跨项目引用，各自维护

## 关键路径

| 路径 | 说明 |
|---|---|
| CAS 登录 | `/api/auth/cas/login` → CAS Server → `/api/auth/cas/callback` → Session |
| 文章发布 | `POST /api/articles` (admin) → 支持 JWT 签发外部发布权限 |
| 订阅推送 | 用户订阅 → cron 定时（daily 20:00 / weekly 周日 20:00）→ 企微 tag/个人推送 |
| PageAgent | 前端 `PageAgentPanel.vue` ↔ `POST /api/page-agent/messages` ↔ DeepSeek |
| AI 知识库 | `/api/ai/*` → 代理转发到 ai_xy 项目的知识库 API |

## 开发命令

```bash
npm run dev:api     # 后端开发（tsx watch，端口 3000）
npm run dev:web     # 前端开发（Vite，端口 5173）
npm run build:api   # 后端编译（tsc）
npm run build:web   # 前端编译（vue-tsc + vite build）
docker compose up   # 完整开发环境一键启动
```

## Pipeline 任务约束（feedback 自动化流水线）

以下约束在 feedback 流水线派发任务时生效。任务文档由 fb-dispatch.sh 生成，指令通过 tmux send-keys 送达。

### 硬约束
- ⛔ 禁止修改任务文档未列出的文件
- ⛔ 禁止重命名任何已有 API 路由或函数
- ⛔ 禁止添加任务文档未要求的"优化"或"加固"
- ✅ 只做任务文档明确列出的修改项

### 完成后必须
1. **写 inbox 文件（不可跳过）：**

   ```bash
   mkdir -p /home/ubuntu/hermes-cc-cowork/inbox
   cat > /home/ubuntu/hermes-cc-cowork/inbox/{任务ID}.done.json << 'EOF'
   {
     "task_id": "{任务ID}",
     "feedback_ids": ["uuid-1", "uuid-2"],
     "status": "fixed",
     "summary": "<一句话描述做了什么改动>",
     "completed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
   }
   EOF
   ```

2. **输出格式化状态块**（让 `capture-pane` 一目了然）：

   ```
   ╔══════════════════════════════════════════════╗
   ║  ✅ TASK COMPLETE — {任务ID}                 ║
   ╠══════════════════════════════════════════════╣
   ║  修复: N 条 feedback                        ║
   ║  状态: fixed → inbox 已写入                  ║
   ║  改动的文件:                                 ║
   ║    • path/to/file.tsx                        ║
   ║  耗时: Xmin                                  ║
   ║  git diff: +N -M (K files)                   ║
   ╠══════════════════════════════════════════════╣
   ║  ⏳ 等待新任务中...                           ║
   ╚══════════════════════════════════════════════╝
   ```

### 通信方式
- cron 通过 `tmux send-keys` 派发任务，**不使用 `cc-notify`**
- **完成信号是 inbox 文件**，不是 cc-notify 命令
- 任务文档中不会出现 `CC_TASK_ID=... cc-notify done` 指令——忽略它如果出现

source: feedback-pipeline
通知规范见 `/opt/hermes/docs/superpowers/specs/2026-05-31-feedback-pipeline-design.md`

## Development Progress

| 日期 | 版本 | 状态 | 变更 |
|------|------|------|------|
| 2026-05-28 | v3 修复 | 已完成 | 删除微信分享按钮、拖拽 TouchEvent 支持+阈值 5px、手机标题响应式、对话标题 console.error、路由空白 fallback load + transition in-out + 错误分级、生日页具体错误提示 |
| 2026-05-28 | v4 修复 | 已完成 | 回滚 transition mode="out-in" 修复布局回归、移除 fallback 重复 load、浏览历史去重（DELETE+INSERT 事务） |
| 2026-05-28 | v5 修复 | 已完成 | loadChannels try/catch 隔离、全局 401 拦截器（session 过期跳 CAS）、auth store clearUser() |
| 2026-05-28 | v6 修复 | 已完成 | onActivated await load() + try/catch、load() catch 块 + items 回退、onErrorCaptured 恢复全错误显示、getReadingHistory pageSize 200→50 |
| 2026-05-28 | trace-logging | 已完成 | App.vue/ArticlesPage/ArticleDetailPage/AdminBirthdayPage 全生命周期 [AIWEB] 日志链，覆盖路由导航、KeepAlive、数据加载、错误捕获 |

