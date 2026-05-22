# 企业微信推送接口说明（运维版）

## 1. 适用对象

本文档面向服务端维护人员、运维人员和管理员，聚焦以下内容：

1. 正式推送接口、聚合推送接口与标签接口的职责边界
2. CAS 与接口鉴权的分工
3. 定时规则、配置项和服务重启要求
4. 标签映射表、推送记录、批量发送记录与常见故障排查

若只需要调用接口，请阅读 `wecom_push_api_integrator.md`。

## 2. 当前实现范围

当前实现包含以下接口：

- `POST /api/push/instant`
- `POST /api/push/daily`
- `POST /api/push/weekly`
- `POST /api/push/instant/deferred`
- `POST /api/push/verify`
- `GET /api/push/records`
- `GET /api/push/tags/mappings`
- `GET /api/push/tags/state`
- `POST /api/push/tags/ensure`
- `POST /api/push/tags/sync`

实现特征：

- 企业微信发送能力由 `ai_web` 内置模块直接完成
- 即时推送仍优先按“栏目+频率”标签发送，异常时降级为逐用户发送
- 日报、周报、08:00 补发改为按“用户订阅组合”聚合，再按用户列表批量发送
- 所有真实发送卡片统一为 `template_card.news_notice`
- 聚合消息的推送记录会以 `delivery_mode=batch_user` 写入 `push_records`
- 标签同步结果会写入 `wecom_tag_mappings.last_sync_status`
- `daily`、`weekly`、`instant/deferred`、`verify`、`records`、`tags/*` 已支持“管理员会话或内部令牌”
- `instant` 仍保持管理员接口语义

## 3. 接口职责边界

### 3.1 `POST /api/push/instant`

用途：

- 对单个栏目执行即时推送
- 面向管理员手动触发
- 按 `frequency=instant` 的订阅对象发送

特点：

- 有真实发送副作用
- 推送前会先执行对应标签的差异同步
- 仅在调用时针对单栏目处理，不参与日报、周报聚合
- 当前要求管理员会话

### 3.2 `POST /api/push/daily`

用途：

- 执行一次每日聚合推送
- 通常由每日 `20:00` 定时任务触发，也可人工联调触发
- 将窗口内文章按用户订阅组合合并为“一人一条”日报

特点：

- 有真实发送副作用
- 按用户组合分组后批量发送，不走企微标签发送
- 支持可选 `referenceAt`，用于联调时指定统计窗口结束时间
- 允许内部令牌直接调用

### 3.3 `POST /api/push/weekly`

用途：

- 执行一次每周聚合推送
- 通常由每周日 `20:00` 定时任务触发，也可人工联调触发
- 将近 7 天窗口内文章按用户订阅组合合并为“一人一条”周报

特点：

- 有真实发送副作用
- 按用户组合分组后批量发送，不走企微标签发送
- 支持可选 `referenceAt`
- 允许内部令牌直接调用

### 3.4 `POST /api/push/instant/deferred`

用途：

- 执行一次 08:00 的补发聚合推送
- 处理前一晚 `20:00` 至当日 `08:00` 之间发布的文章
- 面向定时任务触发和人工联调触发

特点：

- 有真实发送副作用
- 仅处理工作时间外发布、应顺延到次日 `08:00` 的文章
- 按用户组合分组后批量发送
- 支持可选 `referenceAt`
- 允许内部令牌直接调用

### 3.5 `POST /api/push/verify`

用途：

- 执行单目标真实验证
- 用于联调、验收、故障复现和最小副作用排查
- 不应替代正式推送任务

特点：

- 保持单用户验证语义
- 会真实调用企业微信并写入 `push_records`
- 允许内部令牌直接调用

### 3.6 `GET /api/push/records`

用途：

- 查询最近推送记录
- 用于审计、排障、验收回看

特点：

- 无发送副作用
- 返回内容包含目标用户、标签信息、消息 ID、错误码、请求快照和响应快照
- 聚合发送时可看到 `delivery_mode=batch_user`
- 允许内部令牌直接调用

### 3.7 `GET /api/push/tags/mappings`

用途：

- 查询标签映射表中的当前状态
- 用于确认某个栏目和频率是否已完成映射

特点：

- 无发送副作用
- 允许按 `channelCode`、`frequency`、`enabledOnly` 过滤
- 允许内部令牌直接调用

### 3.8 `GET /api/push/tags/state`

用途：

- 查看数据库订阅用户和企微标签成员的实时差异
- 用于同步前排查与同步后核验

特点：

- 无持久化写入副作用
- 若映射不存在，会先确保标签映射存在
- 允许内部令牌直接调用

### 3.9 `POST /api/push/tags/ensure`

用途：

- 确保指定栏目和频率存在标签映射
- 用于预热、联调前准备和异常恢复

特点：

- 有映射写入副作用
- 会在必要时创建企业微信标签
- 允许内部令牌直接调用

### 3.10 `POST /api/push/tags/sync`

用途：

- 触发单标签或全量标签同步
- 用于推送前校准、故障恢复和人工干预

特点：

- 有真实的标签成员增删副作用
- 支持单标签同步和全量同步两种模式
- 允许内部令牌直接调用

## 4. 鉴权原则

### 4.1 CAS 与接口鉴权分工

当前项目遵循以下原则：

- CAS 只负责用户身份认证与单点登录
- 后端接口必须具备独立鉴权方式
- 运维、任务触发、回执查询类接口不应强依赖 CAS 会话

### 4.2 当前接口鉴权矩阵

- `POST /api/push/instant`：管理员会话
- `POST /api/push/daily`：管理员会话或内部令牌
- `POST /api/push/weekly`：管理员会话或内部令牌
- `POST /api/push/instant/deferred`：管理员会话或内部令牌
- `POST /api/push/verify`：管理员会话或内部令牌
- `GET /api/push/records`：管理员会话或内部令牌
- `GET /api/push/tags/mappings`：管理员会话或内部令牌
- `GET /api/push/tags/state`：管理员会话或内部令牌
- `POST /api/push/tags/ensure`：管理员会话或内部令牌
- `POST /api/push/tags/sync`：管理员会话或内部令牌

### 4.3 内部令牌传递方式

支持以下两种 Header：

- `X-Internal-Auth-Token: <token>`
- `Authorization: Bearer <token>`

处理逻辑见 [auth.ts](file:///opt/idapps/ai_web/apps/api/src/middleware/auth.ts)。

## 5. 调度与配置

### 5.1 鉴权相关

- `DEV_AUTH_BYPASS`：开发绕过开关；生产环境应为 `false`
- `WECOM_INTERNAL_AUTH_TOKEN`：内部令牌；用于 `daily`、`weekly`、`instant/deferred`、`verify`、`records`、`tags/*`

### 5.2 企业微信相关

- `WECOM_APP_CODE`
- `WECOM_BASE_URL`
- `WECOM_CORP_ID` 或 `WX_CORP_ID`
- `WECOM_AGENT_ID` 或 `WX_AGENT_ID`
- `WECOM_SECRET`
- `WECOM_REQUEST_TIMEOUT_MS`
- `WECOM_TOKEN_REFRESH_SKEW_SECONDS`
- `WECOM_TAG_SYNC_CRON`
- `WECOM_TAG_NAME_PREFIX`

### 5.3 推送调度相关

- `PUSH_TIMEZONE`：默认 `Asia/Shanghai`
- `DAILY_PUSH_CRON`：默认 `0 20 * * *`
- `WEEKLY_PUSH_CRON`：默认 `0 20 * * 0`
- `DEFERRED_INSTANT_PUSH_CRON`：默认 `0 8 * * *`
- `INSTANT_PUSH_WINDOW_START_HOUR`：默认 `8`
- `INSTANT_PUSH_WINDOW_END_HOUR`：默认 `20`

### 5.4 实际生效规则

- 若 `DEV_AUTH_BYPASS=true`，所有依赖会话用户的鉴权中间件都会放行
- 若 `WECOM_INTERNAL_AUTH_TOKEN` 为空，则会回退读取 `wecom_app_configs.internal_auth_token`
- 若令牌缺失且无管理员会话，`daily`、`weekly`、`instant/deferred`、`verify`、`records`、`tags/*` 返回 `401`
- 若令牌不匹配，以上接口返回 `403`
- 文章在 `08:00-20:00` 内发布时，才会触发即时推送
- 文章在 `20:00-次日08:00` 之间发布时，不会即时下发，而会归入下一次 `08:00` 补发
- 日报统计窗口为 `referenceAt` 前 24 小时，周报统计窗口为 `referenceAt` 前 7 天
- 同一用户可同时存在 `instant`、`daily`、`weekly` 三条订阅记录，数据库唯一键为 `(user_id, frequency)`

## 6. 标签映射与同步

### 6.1 `wecom_tag_mappings` 关键字段

重点关注：

- `channel_code`
- `frequency`
- `tag_id`
- `tag_name`
- `enabled`
- `last_sync_status`
- `last_sync_error`
- `last_synced_at`

### 6.2 同步状态含义

- `idle`：尚未执行过同步或仅完成映射创建
- `success`：同步成功且未出现非法用户
- `partial`：同步成功，但企微返回了 `invalidUserIds`
- `failed`：同步过程出现异常，需结合日志与错误信息排查

### 6.3 标签名规则

标签名生成规则由以下信息组成：

- `WECOM_TAG_NAME_PREFIX`
- 栏目名称
- 频率标签，例如“每日订阅”“即时订阅”“每周订阅”

若同名标签已存在，则优先复用现有标签，不重复创建。

## 7. 推送记录与日志

### 7.1 `push_records` 写入时机

写入顺序如下：

1. 发送前先插入一条 `pending` 记录
2. 企业微信返回成功时更新为 `success`
3. 企业微信返回失败或本地异常时更新为 `failed`

### 7.2 关键字段

- `delivery_mode`
- `article_id`
- `wecom_tag_id`
- `wecom_tag_name`
- `wecom_msgid`
- `wecom_errcode`
- `wecom_errmsg`
- `request_payload`
- `response_payload`
- `sent_at`

### 7.3 `delivery_mode` 含义

- `tag`：按企微标签发送
- `user`：按单用户发送
- `fallback_user`：标签同步异常或标签发送失败后，降级逐用户发送
- `batch_user`：按用户列表批量发送聚合消息

### 7.3.1 聚合记录补充说明

- `batch_user` 记录中的 `qywx_user_id` 可能写为 `batch:n`，不代表真实接收者丢失
- 聚合消息的真实接收用户列表应从 `request_payload.touser` 读取
- 聚合消息的完整文章集合应从 `request_payload.articleIds` 读取
- `article_id` 在聚合消息中作为锚点文章 ID 使用，便于索引和联表，不代表仅发送该一篇

### 7.4 日志事件

当前可重点关注：

- `push.instant.publish.start`
- `push.instant.publish.finish`
- `push.instant.deferred`
- `push.instant.deferred.start`
- `push.instant.deferred.finish`
- `push.daily.digest.start`
- `push.daily.digest.finish`
- `push.weekly.digest.start`
- `push.weekly.digest.finish`
- `push.send.batch.success`
- `push.send.batch.failed`
- `push.send.tag.success`
- `push.send.tag.failed`
- `push.send.tag.degrade.partial_sync`
- `push.send.tag.degrade.send_failed`
- `push.send.tag.degrade.sync_failed`
- `push.send.user.success`
- `push.send.user.failed`
- `push.job.daily.start`
- `push.job.weekly.start`
- `push.job.instant.deferred.start`

## 8. 运维动作建议

### 8.1 联调或验收

推荐顺序：

1. 调用 `GET /api/push/tags/mappings` 确认映射是否存在
2. 调用 `GET /api/push/tags/state` 查看成员差异
3. 如有差异，执行 `POST /api/push/tags/sync`
4. 使用 `POST /api/push/verify` 做单目标验证
5. 使用 `POST /api/push/daily`、`POST /api/push/weekly` 或 `POST /api/push/instant/deferred` 联调聚合推送
6. 调用 `GET /api/push/records` 核对 `delivery_mode`、`wecom_msgid`、`invalidUserIds` 和 `sent_at`

2026-04-15 实际联调结果：

- `instant`：通过正式服务链路成功发送，记录写入 `delivery_mode=tag`
- `daily`：`pushedCount=1`
- `weekly`：`pushedCount=1`
- `instant/deferred`：`pushedCount=1`
- `GET /api/push/tags/state?channelCode=student-zone&frequency=instant` 返回数据库成员与企微标签成员一致

### 8.2 正式手动推送

推荐顺序：

1. 确认文章已发布且 `published_at` 正确写入
2. 确认目标订阅对象已启用且频率正确
3. 如需校准即时标签，先执行一次 `POST /api/push/tags/sync`
4. 根据场景执行 `instant`、`daily`、`weekly` 或 `instant/deferred`
5. 立刻查看 `push_records` 与 `api.log`

### 8.3 重启服务

建议使用：

```bash
cd /opt/idapps/ai_web
./ai_web_service.sh restart
```

说明：

- 启动脚本会在重启前归档旧 `api.log`
- 新会话日志会重新写入 `/opt/idapps/ai_web/api.log`
- 定时任务变更或接口路由变更后必须重启服务才会生效

## 9. 故障排查

### 9.1 `401 未登录`

优先检查：

- 是否误把 `daily`、`weekly`、`instant/deferred`、`verify`、`records`、`tags/*` 当成开放接口直接调用
- 是否遗漏内部令牌 Header
- 是否仍在使用旧服务进程，尚未重启

### 9.2 `403 内部认证令牌无效`

优先检查：

- 请求 Header 中的令牌值是否完整
- `.env` 中的 `WECOM_INTERNAL_AUTH_TOKEN` 是否已更新
- 是否存在数据库中的 `wecom_app_configs.internal_auth_token` 与当前预期不一致
- 若通过 shell 联调，请确认已执行 `set -a && source apps/api/.env && set +a`，否则变量可能未导出

### 9.3 `500` 且提示无已发布文章

优先检查：

- 指定统计窗口内是否确实存在已发布文章
- `articles.published_at` 是否已正确写入
- `referenceAt` 是否传到了错误时区或错误时间点

### 9.4 `500` 且提示未找到启用订阅

优先检查：

- `subscriptions.enabled` 是否为 `true`
- `channel_codes` 是否包含目标栏目
- `frequency` 是否与本次调用一致
- `subscriptionUserId` 是否传入了无效用户

### 9.5 聚合消息未合并为“一人一条”

优先检查：

- 订阅记录中的 `channel_codes` 是否正确维护
- 同一用户是否出现重复的 `qywx_user_id`
- `push_records.delivery_mode` 是否为 `batch_user`
- `request_payload.channelCodes` 是否符合预期组合

### 9.6 标签同步异常

优先检查：

- `wecom_tag_mappings.last_sync_status` 和 `last_sync_error`
- `GET /api/push/tags/state` 返回的 `toAddUserIds`、`toRemoveUserIds`
- 企业微信应用可见范围是否覆盖目标用户
- 企业可信 IP 是否已配置

### 9.7 企业微信返回失败

优先检查：

- `WECOM_CORP_ID`、`WECOM_AGENT_ID`、`WECOM_SECRET`
- 应用可见范围是否包含目标用户或目标标签
- `push_records.wecom_errcode` 与 `push_records.wecom_errmsg`
- `push_records.delivery_mode` 是否为 `tag`、`fallback_user` 或 `batch_user`

## 10. 运行期建议

- 生产环境保持 `DEV_AUTH_BYPASS=false`
- 定期轮换 `WECOM_INTERNAL_AUTH_TOKEN`
- 只将内部令牌提供给脚本、运维任务和受控调用方
- 每次联调后至少核对一次 `wecom_tag_mappings` 与 `push_records`
- 服务升级后优先用 `verify`、`daily`、`weekly` 和 `instant/deferred` 做最小范围回归
