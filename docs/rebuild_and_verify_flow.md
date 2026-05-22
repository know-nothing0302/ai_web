# ai_web 修改后重构建与效果验收流程

## 1. 适用范围

用于 `ai_web` 项目在代码修改后执行以下动作：

- 重新构建后端与前端
- 检查关键修改是否生效
- 通过服务脚本重启后端服务

项目根目录：`/opt/idapps/ai_web`

---

## 2. 标准执行步骤

### 2.1 进入项目根目录

```bash
cd /opt/idapps/ai_web
```

### 2.2 重新构建后端

```bash
npm run build:api
```

预期结果：

- 命令退出码为 `0`
- 终端无 TypeScript 编译错误

### 2.3 重新构建前端

```bash
npm run build:web
```

预期结果：

- 命令退出码为 `0`
- 终端显示 `vite build` 成功

说明：

- 若仅出现第三方依赖告警（例如 `eval` 风险告警），不影响本次构建通过。
- 若出现 TS 报错（未使用变量、类型不匹配等），必须先修复再继续。

### 2.4 重启后端服务

```bash
/opt/idapps/ai_web/ai_web_service.sh restart
```

预期结果：

- 日志包含“服务启动成功”
- 监听端口为 `3000`
- 产生新 PID 并写入 `/opt/idapps/ai_web/ai_web.pid`

### 2.5 检查服务状态

```bash
/opt/idapps/ai_web/ai_web_service.sh status
```

预期结果：

- 显示 `ai_web_api 服务正在运行`
- 进程命令为 `node dist/server.js`

---

## 3. 修改效果检查（建议最少执行）

### 3.1 检查关键文案是否已落盘到源码

```bash
grep -R -n "内容由AI生成\|原文链接\|返回列表\|内容中枢" /opt/idapps/ai_web/apps/web/src/views
```

用途：

- 快速确认本次改动的关键内容确实在当前源码中。

### 3.2 检查构建产物是否更新

```bash
ls -lt /opt/idapps/ai_web/apps/web/dist/assets | head -n 5
```

用途：

- 确认前端构建产物时间戳已更新。

### 3.3 手工页面验收（浏览器）

至少核验以下页面：

1. 内容中枢（`/admin`）
2. 资讯首页（`/`）
3. 文章详情页（`/articles/:id`）
4. 聚合页（`/push-digests/today`）

重点检查项：

- 内容中枢：列表文章可点击、分页可用、栏目过滤可用、手动推送按钮已移除
- 内容中枢：用户白名单限制生效（非指定 `userid` 无法进入）
- 首页：已移除“智能分析/资讯总览/订阅中心”模块
- 文章详情：关键词位于标题下方、Markdown 渲染正常、发布时间后有“原文链接”、页底有“内容由AI生成”
- 聚合页：返回列表按钮可用

---

## 4. 常见问题与处理

### 4.1 `restart` 提示无法停止 PID

现象示例：

- 提示“无法停止 PID”
- PID 文件存在，但对应进程可能已变化

处理方式：

```bash
rm -f /opt/idapps/ai_web/ai_web.pid
/opt/idapps/ai_web/ai_web_service.sh start
```

如果仍异常，先定位当前服务进程再处理：

```bash
ps aux | grep "node dist/server.js" | grep -v grep
```

### 4.2 前端构建失败（TS6133 等）

处理方式：

- 删除未使用的 import 或变量
- 修复类型错误后重新执行 `npm run build:web`

---

## 5. 推荐执行顺序（可复制）

```bash
cd /opt/idapps/ai_web
npm run build:api
npm run build:web
/opt/idapps/ai_web/ai_web_service.sh restart
/opt/idapps/ai_web/ai_web_service.sh status
```

如遇 `restart` 异常再执行：

```bash
rm -f /opt/idapps/ai_web/ai_web.pid
/opt/idapps/ai_web/ai_web_service.sh start
/opt/idapps/ai_web/ai_web_service.sh status
```
