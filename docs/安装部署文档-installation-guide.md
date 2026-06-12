---
title: "AI在徐医 — 安装部署文档"
author: "徐州医科大学"
date: "2026-06-12"
lang: "zh-CN"
---

# AI在徐医 — 安装部署文档

**版本**: v3.0  
**最后更新**: 2026年6月12日  
**受众**: 系统管理员、运维工程师

---

## 1. 系统要求

### 1.1 硬件要求

| 组件 | 最低配置 | 推荐配置 |
|------|----------|----------|
| CPU | 2 核 | 4 核 |
| 内存 | 4 GB | 8 GB |
| 磁盘 | 20 GB | 50 GB SSD |
| 网络 | 内网可达 | 内网可达 + 外网（访问 DeepSeek API） |

### 1.2 软件依赖

| 软件 | 版本 | 用途 |
|------|------|------|
| Node.js | ≥ 22.x | 运行时 |
| npm | ≥ 10.x | 包管理 |
| PostgreSQL | ≥ 14 | 主数据库 |
| Nginx | ≥ 1.24 | 反向代理 |
| Docker + Compose | ≥ 24 + v2 | 开发环境（可选） |
| Python | ≥ 3.9 | 生日卡片生成脚本 |
| git | ≥ 2.x | 版本管理 |

---

## 2. 项目结构

```
/opt/idapps/ai_web/
├── apps/
│   ├── api/                  # Express 5 后端
│   │   ├── src/
│   │   │   ├── server.ts     # 入口文件
│   │   │   ├── app.ts        # Express 应用装配
│   │   │   ├── config/env.ts # 环境变量配置
│   │   │   ├── lib/          # 数据库、日志、缓存
│   │   │   ├── middleware/    # 鉴权、限流中间件
│   │   │   ├── modules/      # 业务模块
│   │   │   ├── routes/       # 路由
│   │   │   └── jobs/         # 定时任务
│   │   ├── dist/             # 编译产物
│   │   └── image/            # 静态资源（PSD 模板、字体）
│   └── web/                  # Vue 3 前端
│       └── src/
│           ├── views/        # 页面组件
│           ├── components/   # 通用组件
│           ├── services/     # API 调用
│           └── stores/       # 状态管理
├── deploy/nginx/             # Nginx 配置
├── docker-compose.yml        # 开发环境
└── ai_web_service.sh         # 服务管理脚本
```

---

## 3. 开发环境部署 (Docker Compose)

### 3.1 克隆项目

```bash
git clone git@github.com:know-nothing0302/ai_web.git
cd ai_web
git checkout main
```

### 3.2 配置环境变量

```bash
cp apps/api/.env.example apps/api/.env
# 编辑 .env 文件，配置必要的环境变量
```

最少需要的环境变量：

```
# 数据库
POSTGRES_HOST=your-pg-host
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-password
POSTGRES_DB=ai_web

# Session
SESSION_SECRET=your-random-secret

# CAS 认证
CAS_LOGIN_URL=https://cas.xzhmu.edu.cn/login
CAS_VALIDATE_URL=https://cas.xzhmu.edu.cn/serviceValidate
CAS_SERVICE_URL=http://your-domain/api/auth/cas/callback
CAS_LOGOUT_URL=https://cas.xzhmu.edu.cn/logout

# DeepSeek API
DEEPSEEK_API_BASE_URL=https://api.deepseek.com
DEEPSEEK_API_KEY=sk-your-key
DEEPSEEK_MODEL=deepseek-chat
```

### 3.3 启动开发环境

```bash
docker compose up
```

启动后：
- API: http://localhost:3000
- Web: http://localhost:5173
- Nginx: http://localhost:8080

### 3.4 单独启动前后端

```bash
# 后端（支持热重载）
npm run dev:api     # tsx watch，端口 3000

# 前端（支持 HMR）
npm run dev:web     # Vite，端口 5173
```

---

## 4. 生产环境部署

### 4.1 目标服务器

- 主机: `172.30.4.45` (xyd-45)
- 操作系统: Ubuntu 22.04 LTS
- 部署用户: `ubuntu`
- 项目路径: `/opt/idapps/ai_web`

### 4.2 初始部署步骤

```bash
# 1. 克隆项目
cd /opt
git clone git@github.com:know-nothing0302/ai_web.git
cd ai_web

# 2. 安装依赖
cd apps/api && npm install --include=dev && cd ../..

# 3. 配置环境变量
cp apps/api/.env.example apps/api/.env
vim apps/api/.env      # 按实际环境修改

# 4. 构建
npm run build:api

# 5. 确保非 TS 资源就位
mkdir -p apps/api/dist/scripts
cp apps/api/image/ apps/api/dist/image/ -r
cp apps/api/src/scripts/gen_birthday_card.py apps/api/dist/scripts/

# 6. 配置 systemd
sudo cp /opt/idapps/ai_web/deploy/systemd/idapps-ai-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable idapps-ai-web
sudo systemctl start idapps-ai-web
```

### 4.3 Systemd 服务管理

生产环境通过 systemd 管理，**禁止直接运行 `node dist/server.js` 或 `ai_web_service.sh`**。

```bash
# 启动
sudo systemctl start idapps-ai-web

# 停止
sudo systemctl stop idapps-ai-web

# 重启
sudo systemctl restart idapps-ai-web

# 查看状态
sudo systemctl status idapps-ai-web

# 查看日志
sudo journalctl -u idapps-ai-web -f        # 实时
sudo journalctl -u idapps-ai-web --since today  # 当日
```

### 4.4 部署更新

```bash
# 在开发机上
git push origin feature/xxx

# 在服务器上
cd /opt/idapps/ai_web
git pull origin feature/xxx
npm run build:api
sudo systemctl restart idapps-ai-web

# 验证
curl http://127.0.0.1:3000/api/health
```

> **注意**: PSD 模板文件不会随 git 推送（已加入 .gitignore），需要手动同步：
> ```bash
> scp apps/api/image/*.psd xyd-45:/opt/idapps/ai_web/apps/api/image/
> ```

---

## 5. Nginx 配置

### 5.1 Docker Compose 环境

```nginx
server {
    listen 80;
    server_name _;

    location /api/ {
        proxy_pass http://api:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        proxy_pass http://web:5173/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```

### 5.2 生产环境建议

```nginx
server {
    listen 80;
    server_name ai.xzhmu.edu.cn;

    # 前端静态文件（构建后）
    location /ai-web/ {
        alias /opt/idapps/ai_web/apps/web/dist/;
        try_files $uri $uri/ /ai-web/index.html;
    }

    # API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

---

## 6. 数据库

### 6.1 Schema 管理

数据库 Schema 与部署耦合——应用启动时自动执行增量迁移（`db.ts` 中的 `schemaSql` 包含 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 语句）。

```typescript
// apps/api/src/lib/db.ts
// 应用启动时自动执行：
await pool.query(schemaSql);  // 建表 + 增量迁移
await pool.query(seedSql);    // 种子数据
```

### 6.2 核心表

| 表名 | 用途 |
|------|------|
| `users` | 用户信息（从 Oracle 同步） |
| `articles` | 文章 |
| `channels` | 文章频道/分类 |
| `page_agent_conversations` | PageAgent 对话会话 |
| `page_agent_messages` | PageAgent 对话消息 |
| `subscriptions` | 用户订阅 |
| `feedback` | 用户反馈 |
| `user_profiles` | 用户画像 |

### 6.3 备份建议

```bash
# 每日全量备份
pg_dump -U postgres ai_web > /backup/ai_web_$(date +%Y%m%d).sql

# 保留最近 7 天
find /backup/ -name "ai_web_*.sql" -mtime +7 -delete
```

---

## 7. 完整环境变量参考

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NODE_ENV` | development | 运行环境 |
| `PORT` | 3000 | API 端口 |
| `SESSION_SECRET` | - | Session 加密密钥 (**必填**) |
| `APP_BASE_URL` | http://localhost:3000 | API 基础 URL |
| `WEB_BASE_URL` | http://localhost:5173 | 前端基础 URL |
| `CAS_LOGIN_URL` | - | CAS 登录地址 |
| `CAS_VALIDATE_URL` | - | CAS 验证地址 |
| `CAS_SERVICE_URL` | - | CAS 回调地址 |
| `CAS_LOGOUT_URL` | - | CAS 登出地址 |
| `DEV_AUTH_BYPASS` | true | 开发环境跳过认证 |
| `POSTGRES_HOST` | localhost | 数据库主机 |
| `POSTGRES_PORT` | 5432 | 数据库端口 |
| `POSTGRES_USER` | postgres | 数据库用户 |
| `POSTGRES_PASSWORD` | - | 数据库密码 |
| `POSTGRES_DB` | ai_web | 数据库名 |
| `DEEPSEEK_API_BASE_URL` | - | DeepSeek API 地址 |
| `DEEPSEEK_API_KEY` | - | DeepSeek API 密钥 |
| `DEEPSEEK_MODEL` | deepseek-chat | 模型名称 |
| `DEEPSEEK_USER_ID_SECRET` | - | 用户 ID 哈希密钥 |
| `PAGE_AGENT_DEBUG` | true | PageAgent 调试日志 |
| `WECOM_CORP_ID` | - | 企业微信 CorpID |
| `WECOM_AGENT_ID` | - | 企业微信应用 AgentID |
| `WECOM_SECRET` | - | 企业微信应用 Secret |
| `WECOM_PUSH_AGENT_ID` | - | 推送专用应用 AgentID |
| `WECOM_PUSH_SECRET` | - | 推送专用应用 Secret |
| `WECOM_INTERNAL_AUTH_TOKEN` | - | 内部 API 认证 Token |
| `ADMIN_USER_IDS` | - | 管理员学工号（逗号分隔） |
| `ORACLE_USER` | - | Oracle 数据库用户（用户同步） |
| `ORACLE_PASSWORD` | - | Oracle 数据库密码 |
| `ORACLE_CONNECT_STRING` | - | Oracle 连接串 |
| `DAILY_PUSH_CRON` | 0 20 * * * | 每日推送 cron |
| `DAILY_PUSH_CRON_2` | 0 11 * * * | 第二次每日推送 cron |
| `WEEKLY_PUSH_CRON` | 0 20 * * 0 | 每周推送 cron |
| `PROFILE_ANALYSIS_CRON` | 0 3 * * 0 | 用户画像分析 cron |
| `BIRTHDAY_PUSH_MODE` | test | 生日推送模式 (test/production) |

---

## 8. 验证清单

部署完成后，依次检查：

```bash
# 1. 进程存活
pgrep -f "node dist/server.js"

# 2. 端口监听
ss -tlnp | grep 3000

# 3. 健康检查
curl http://127.0.0.1:3000/api/health
# 预期: {"ok":true,"service":"ai_web_api"}

# 4. CAS 登录流程
# 浏览器访问首页 → 自动跳转 CAS → 登录 → 返回首页
# 开发者工具 Network 面板确认无 401/403

# 5. PageAgent 功能
# 登录后打开任意文章 → 点击底部 AI 按钮 → 提问 → 收到回答

# 6. 订阅推送
# 订阅管理页面设置推送 → 等待定时任务触发 → 检查企微消息
```

---

## 9. 故障排查

### 服务无法启动

```bash
# 查看详细日志
sudo journalctl -u idapps-ai-web -n 50 --no-pager

# 检查数据库连接
psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT 1"

# 检查端口占用
ss -tlnp | grep 3000
```

### PageAgent 无响应

```bash
# 确认 DeepSeek API 可达
curl -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
  $DEEPSEEK_API_BASE_URL/v1/models

# 查看 PageAgent 调试日志
sudo journalctl -u idapps-ai-web | grep "page.agent"
```

### 企微推送未收到

```bash
# 检查企微 Token
# 查看推送相关日志
sudo journalctl -u idapps-ai-web | grep "push"
```
