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

## Development Progress

### 2026-05-23: 搜索结果持久化 + 搜索历史

**TASK-1 (P0)**: 搜索结果不丢失
- 搜索关键词、分类、栏目、页码同步到 URL query string（`router.replace`），浏览器回退/返回按钮可恢复搜索状态
- `<KeepAlive include="ArticlesPage">` 缓存组件状态作为第二层保障
- `onMounted` 中从 URL 恢复搜索参数后加载数据
- 涉及文件：`apps/web/src/views/ArticlesPage.vue`, `apps/web/src/App.vue`

**TASK-2 (P1)**: 搜索历史记录
- 新增 `apps/web/src/composables/useSearchHistory.ts`——localStorage 封装，存最近 20 条
- 搜索输入框 focus 时展示历史标签 chip，点击即搜索
- 支持"清除历史"

### 2026-05-23: 对话历史恢复 + 原文链接优化

**TASK-3 (P1)**: PageAgent 对话历史记录恢复
- 后端已完整支持（`page_agent_conversations` + `page_agent_messages` 表），纯前端任务
- `api.ts` 新增 `getPageAgentConversationMessages()` 调用 `GET /api/page-agent/conversations/:id/messages`
- `PageAgentPanel.vue` 新增历史对话列表 UI：打开面板时加载最近 20 条对话，点击加载完整消息
- 修复 `App.vue` 路由切换清零问题：路由切换不再清空消息，仅当关闭面板时才清空
- 新增"新建对话"按钮，重置当前会话状态
- 涉及文件：`apps/web/src/components/PageAgentPanel.vue`, `apps/web/src/App.vue`, `apps/web/src/services/api.ts`

**TASK-4 (P1)**: 原文链接容错
- `ArticleDetailPage.vue` 中原文链接已配置 `target="_blank" rel="noopener noreferrer"`（此前已存在）
- 链接旁添加提示文字"（外部链接）"
- 涉及文件：`apps/web/src/views/ArticleDetailPage.vue`

### 2026-05-23: 个人中心（收藏 + 浏览历史 + 对话历史）

**TASK-5 (P2)**: 个人中心页面
- 新表 `user_favorites`（用户收藏）和 `reading_history`（浏览历史），schema 追加到 `db.ts`
- 新增 `apps/api/src/modules/profile/routes.ts`：收藏 CRUD、浏览历史记录/查询，全部用 `requireAuth`
- 在 `app.ts` 挂载 `profileRouter`（`/api/profile`）
- 新增 `apps/web/src/views/ProfilePage.vue`：三个 Tab（我的收藏 / 浏览历史 / 对话历史），分页加载
- 前端 `api.ts` 新增：`addFavorite`、`removeFavorite`、`checkFavorite`、`getFavorites`、`getReadingHistory`、`reportReadingHistory`
- `ArticleDetailPage.vue`：文章标题旁收藏按钮（⭐/★），`onMounted` 检查收藏状态 + 记录浏览历史
- 顶部导航栏新增"个人中心"入口（`User` 图标），路由 `/profile`
- 涉及文件：`apps/api/src/lib/db.ts`, `apps/api/src/app.ts`, `apps/api/src/modules/profile/routes.ts`, `apps/web/src/views/ProfilePage.vue`, `apps/web/src/views/ArticleDetailPage.vue`, `apps/web/src/App.vue`, `apps/web/src/router.ts`, `apps/web/src/services/api.ts`

### 2026-05-24: 第二轮用户反馈修复

**TASK-1 (P0 Bug)**: 对话历史刷新后自动恢复
- PageAgent 面板打开时自动加载最近一次对话的消息，不再需要手动点击
- `App.vue` 中 `loadPageAgentConversations` 在加载对话列表后自动获取最新对话消息
- 涉及文件：`apps/web/src/App.vue`

**TASK-2 (P1)**: 回到顶部按钮
- 新增 `BackToTop.vue` 组件：右下角浮动按钮，滚动超过一屏显示，平滑滚动到顶部
- 在 `ArticlesPage.vue` 和 `ArticleDetailPage.vue` 中引入
- 涉及文件：`apps/web/src/components/BackToTop.vue`, `apps/web/src/views/ArticlesPage.vue`, `apps/web/src/views/ArticleDetailPage.vue`

**TASK-3 (P1)**: 已读标识
- `ArticlesPage.vue` 在激活时获取已读文章 ID 列表，已读文章卡片背景色变暗
- `api.ts` 中 `getReadingHistory` 增加 `pageSize` 参数
- 涉及文件：`apps/web/src/views/ArticlesPage.vue`, `apps/web/src/services/api.ts`

### 2026-05-24: 第三轮反馈修复（导航调整 + AI 试验场）

**TASK-1**: 个人中心移到 header 最右侧
- 从 `navItems` 中移除「个人中心」，主导航只保留「资讯发现」「AI 试验场」「智能订阅」
- header 右侧显示用户姓名首字圆形头像 + 姓名，点击进入 `/profile`
- 涉及文件：`apps/web/src/App.vue`

**TASK-2**: AI 试验场栏目
- 新路由 `/ai-lab`，新建 `AiLabPage.vue`——暗色科幻风格，CSS 网格背景 + glow 卡片
- 4 个占位卡片：智能问答、文档助手、创意生成、数据分析，均标注「即将上线」
- 响应式网格：移动端 1 列 → 桌面 4 列
- 导航中「资讯发现」后新增「AI 试验场」入口
- 涉及文件：`apps/web/src/views/AiLabPage.vue`, `apps/web/src/router.ts`, `apps/web/src/App.vue`
