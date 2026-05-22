# 企业微信推送接口说明（对接方版）

## 1. 适用对象

本文档面向内部脚本、联调人员、工作流平台和验收执行人员，聚焦以下内容：

1. 如何触发日报、周报和 08:00 补发
2. 如何调用推送验证接口
3. 如何查看标签映射与标签成员差异
4. 如何查询最近推送记录

若需要查看环境变量、服务重启方式、正式推送动作和排障建议，请阅读 `wecom_push_api_ops.md`。

## 2. 对接流程

1. 获取内部认证令牌
2. 调用 `GET /api/push/tags/mappings` 确认目标栏目是否已有标签映射
3. 调用 `GET /api/push/tags/state` 查看数据库订阅用户与企微标签成员差异
4. 如需修正成员，调用 `POST /api/push/tags/sync`
5. 调用 `POST /api/push/verify` 做单目标真实发送验证
6. 调用 `POST /api/push/daily`、`POST /api/push/weekly` 或 `POST /api/push/instant/deferred` 联调聚合推送
7. 调用 `GET /api/push/records` 核对最近推送记录

推荐先用标签接口确认映射和成员状态，再使用 `verify` 做最小副作用验证，最后再触发聚合推送接口。

## 2.1 订阅模型说明

- 同一用户可同时存在 `instant`、`daily`、`weekly` 三条订阅记录，三种频率互不覆盖。
- 聚合推送按“用户 + 频率”命中订阅，再按用户组合合并成一条消息。
- 当前验证消息与聚合消息统一发送为 `template_card.news_notice`，不再发送 `text_notice`。
- 聚合消息点击“查看详情”后跳转到站内聚合页，聚合页按当天实际推送记录展示文章列表。

## 3. 认证方式

当前对接方版接口不依赖 CAS 会话，支持以下两种 Header 写法：

- `X-Internal-Auth-Token: <token>`
- `Authorization: Bearer <token>`

说明：

- 两种写法任选其一
- 内部令牌由服务端维护人员发放和轮换
- 不要把内部令牌暴露给浏览器前端或公开页面

命令行联调提示：

- 若通过 `source .env` 读取内部令牌，请先执行 `set -a`，例如：`set -a && source apps/api/.env && set +a`
- 若未导出环境变量，Header 中可能实际上传空令牌，并返回 `403 内部认证令牌无效`

## 4. 聚合推送接口

### 4.1 `POST /api/push/daily`

用途：

- 触发一次每日聚合推送
- 目标是让同一用户只收到一条日报消息

请求 Header：

- `Content-Type: application/json`
- `X-Internal-Auth-Token: <token>` 或 `Authorization: Bearer <token>`

请求体：

```json
{
  "referenceAt": "2026-04-15T12:00:00Z"
}
```

字段说明：

- `referenceAt`：可选，ISO8601 时间；不传时使用服务端当前时间；服务端会统计该时间点前 24 小时内的已发布文章
- 聚合结果以 `news_notice` 卡片发送
- 推送记录会写入 `push_records`，其 `deliveryMode` 通常为 `batch_user`
- 聚合推送的目标用户列表写在 `requestPayload.touser` 中，`qywxUserId` 可能显示为 `batch:n`

成功响应：

```json
{
  "frequency": "daily",
  "referenceAt": "2026-04-15T12:00:00Z",
  "pushedCount": 128
}
```

### 4.2 `POST /api/push/weekly`

用途：

- 触发一次每周聚合推送
- 默认对应每周日 `20:00` 的正式任务

请求体：

```json
{
  "referenceAt": "2026-04-19T12:00:00Z"
}
```

成功响应：

```json
{
  "frequency": "weekly",
  "referenceAt": "2026-04-19T12:00:00Z",
  "pushedCount": 256
}
```

说明：

- 服务端会统计 `referenceAt` 前 7 天内的已发布文章
- 同一用户按订阅组合合并为一条周报消息
- 聚合结果以 `news_notice` 卡片发送

### 4.3 `POST /api/push/instant/deferred`

用途：

- 触发一次 08:00 的补发聚合推送
- 处理前一晚 `20:00` 到当日 `08:00` 之间发布的文章

请求体：

```json
{
  "referenceAt": "2026-04-16T00:00:00Z"
}
```

成功响应：

```json
{
  "frequency": "instant",
  "mode": "deferred_digest",
  "referenceAt": "2026-04-16T00:00:00Z",
  "pushedCount": 64
}
```

说明：

- 工作时段外发布的文章不会立即发送给 `instant` 订阅用户
- 这些文章会归入下一次 `08:00` 的补发聚合消息
- 补发聚合结果以 `news_notice` 卡片发送

## 5. 标签映射查询接口

### 5.1 基本信息

- 方法：`GET`
- 路径：`/api/push/tags/mappings`
- Header：`X-Internal-Auth-Token: <token>` 或 `Authorization: Bearer <token>`

### 5.2 Query 参数

- `channelCode`：可选，栏目编码
- `frequency`：可选，`daily`、`instant`、`weekly`
- `enabledOnly`：可选，`true` 或 `false`；默认 `false`

### 5.3 成功响应

```json
{
  "items": [
    {
      "id": "mapping-id",
      "channelCode": "tools-recommend",
      "frequency": "daily",
      "tagId": 3255,
      "tagName": "AI订阅-工具与应用推荐每日订阅",
      "enabled": true,
      "lastSyncStatus": "success",
      "lastSyncError": null,
      "lastSyncedAt": "2026-04-14T13:06:01.238Z",
      "createdAt": "2026-04-14T13:06:00.799Z",
      "updatedAt": "2026-04-14T13:06:01.239Z"
    }
  ],
  "total": 1
}
```

## 6. 标签状态查看接口

### 6.1 基本信息

- 方法：`GET`
- 路径：`/api/push/tags/state`
- Header：`X-Internal-Auth-Token: <token>` 或 `Authorization: Bearer <token>`

### 6.2 Query 参数

- `channelCode`：必填，栏目编码
- `frequency`：必填，`daily`、`instant`、`weekly`

### 6.3 成功响应

```json
{
  "channelCode": "tools-recommend",
  "frequency": "daily",
  "tagId": 3255,
  "tagName": "AI订阅-工具与应用推荐每日订阅",
  "dbUserIds": ["100002020047"],
  "remoteUserIds": ["100002020047"],
  "toAddUserIds": [],
  "toRemoveUserIds": []
}
```

## 7. 标签映射确保接口

### 7.1 基本信息

- 方法：`POST`
- 路径：`/api/push/tags/ensure`
- Header：`Content-Type: application/json`
- Header：`X-Internal-Auth-Token: <token>` 或 `Authorization: Bearer <token>`

### 7.2 请求体

```json
{
  "channelCode": "tools-recommend",
  "frequency": "daily"
}
```

### 7.3 成功响应

返回结构与 `GET /api/push/tags/mappings` 中单个 `item` 一致。

## 8. 标签同步接口

### 8.1 基本信息

- 方法：`POST`
- 路径：`/api/push/tags/sync`
- Header：`Content-Type: application/json`
- Header：`X-Internal-Auth-Token: <token>` 或 `Authorization: Bearer <token>`

### 8.2 单标签同步请求

```json
{
  "syncAll": false,
  "channelCode": "tools-recommend",
  "frequency": "daily"
}
```

### 8.3 全量同步请求

```json
{
  "syncAll": true
}
```

### 8.4 单标签同步成功响应

```json
{
  "mode": "single",
  "item": {
    "channelCode": "tools-recommend",
    "frequency": "daily",
    "tagId": 3255,
    "tagName": "AI订阅-工具与应用推荐每日订阅",
    "dbUserCount": 1,
    "remoteUserCount": 0,
    "addedCount": 1,
    "removedCount": 0,
    "invalidUserIds": [],
    "status": "success"
  }
}
```

### 8.5 全量同步成功响应

```json
{
  "mode": "all",
  "items": [
    {
      "channelCode": "tools-recommend",
      "frequency": "daily",
      "tagId": 3255,
      "tagName": "AI订阅-工具与应用推荐每日订阅",
      "dbUserCount": 1,
      "remoteUserCount": 0,
      "addedCount": 1,
      "removedCount": 0,
      "invalidUserIds": [],
      "status": "success"
    }
  ],
  "total": 1
}
```

## 9. 推送验证接口

### 9.1 基本信息

- 方法：`POST`
- 路径：`/api/push/verify`
- Header：`Content-Type: application/json`
- Header：`X-Internal-Auth-Token: <token>` 或 `Authorization: Bearer <token>`

### 9.2 请求体

```json
{
  "channelCode": "policy-ethics",
  "frequency": "daily",
  "subscriptionUserId": "100002020047"
}
```

### 9.3 成功响应

```json
{
  "articleId": "a9a19c9a-d8e4-4041-a7b8-b586b36572e0",
  "channelCode": "policy-ethics",
  "attemptedCount": 1,
  "successCount": 1,
  "failedCount": 0,
  "results": [
    {
      "recordId": "7a5e64e7-b539-410c-bc07-59bb05400fe4",
      "subscriptionUserId": "100002020047",
      "qywxUserId": "100002020047",
      "deliveryMode": "user",
      "status": "success",
      "wecomMsgid": "provider-msg-id"
    }
  ]
}
```

说明：

- `verify` 保持单目标验证语义
- `results[].recordId` 可直接用于到 `push_records` 中核对落库结果

## 10. 推送记录查询接口

### 10.1 基本信息

- 方法：`GET`
- 路径：`/api/push/records`
- Query：`limit`
- Header：`X-Internal-Auth-Token: <token>` 或 `Authorization: Bearer <token>`

### 10.2 查询参数

- `limit`：可选，`integer`，默认 `20`，最小 `1`，最大 `100`

### 10.3 成功响应

```json
{
  "items": [
    {
      "id": "record-id",
      "articleId": "article-anchor-id",
      "channelCode": "digest-daily",
      "qywxUserId": "batch:100",
      "deliveryMode": "batch_user",
      "messageType": "template_card.news_notice",
      "title": "【每日速览】3个栏目更新，共5篇",
      "summary": "医学AI前沿、工具与应用推荐、AI政策与伦理：1.标题A；2.标题B",
      "status": "success",
      "wecomErrcode": 0,
      "wecomErrmsg": "ok",
      "wecomMsgid": "provider-msg-id",
      "requestPayload": {
        "channelCodes": ["medical-frontier", "policy-ethics", "tools-recommend"],
        "touser": ["100002020047", "100002020048"],
        "articleIds": ["article-anchor-id", "article-id-2", "article-id-3"],
        "frequency": "daily"
      },
      "responsePayload": {
        "invalidUserIds": []
      },
      "sentAt": "2026-04-15T12:00:00Z"
    }
  ]
}
```

重点字段：

- `deliveryMode`：`user`、`tag`、`fallback_user`、`batch_user`
- `requestPayload.channelCodes`：本次聚合消息覆盖的栏目组合
- `requestPayload.touser`：聚合消息的实际目标用户列表
- `requestPayload.articleIds`：聚合消息覆盖的完整文章 ID 列表
- `articleId`：聚合消息锚点文章 ID，不代表仅发送单篇
- `responsePayload.invalidUserIds`：批量发送时企微返回的非法用户
- `wecomMsgid`：企业微信消息 ID

## 11. 常见失败

- `400`：参数错误，例如 `referenceAt` 不是合法 ISO 时间、`frequency` 不合法、`syncAll=false` 但缺少必要字段
- `401`：缺少内部认证令牌
- `403`：内部认证令牌无效
- `500`：统计窗口内无已发布文章、未找到符合条件的启用订阅，或企业微信配置异常

## 11.1 2026-04-15 联调结论

- 已验证 `instant`、`daily`、`weekly`、`instant/deferred` 四条推送链路均可真实发送成功。
- 验证用户为 `100002013029`，其 `instant`、`daily`、`weekly` 三条订阅已并存生效。
- `GET /api/push/tags/state?channelCode=student-zone&frequency=instant` 返回数据库用户与企微标签成员一致。
- `POST /api/push/daily`、`POST /api/push/weekly`、`POST /api/push/instant/deferred` 在联调时均返回 `pushedCount=1`，即同一用户只收到一条聚合消息。

## 12. 调用建议

### 12.1 联调建议

1. 先调用 `GET /api/push/tags/mappings` 查看是否已有映射
2. 再调用 `GET /api/push/tags/state` 观察标签成员差异
3. 若存在差异，调用 `POST /api/push/tags/sync`
4. 调用 `POST /api/push/verify` 做单目标真实验证
5. 最后调用 `POST /api/push/daily`、`POST /api/push/weekly` 或 `POST /api/push/instant/deferred`
6. 通过 `GET /api/push/records` 核对落库结果

### 12.2 重试建议

1. 返回 `401` 或 `403` 时，不做盲目重试，先检查内部令牌
2. 返回 `400` 时，直接修正请求参数
3. 返回 `500` 时，先查 `records` 和 `tags/mappings`，再联系运维人员排障
