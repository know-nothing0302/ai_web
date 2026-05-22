# 文章发布接口说明（对接方版）

## 1. 适用对象

本文档面向外部系统、智能体、工作流平台和脚本调用方，聚焦以下内容：

1. 如何获取发布用 JWT
2. 如何调用文章发布接口
3. 请求参数、响应结构和错误处理

若需要查看环境变量、密钥轮换、定时脚本和运维排障，请阅读 `article_publish_api_ops.md`。

## 2. 对接流程

1. 调用 `POST /api/articles/publish/token` 获取短期 JWT
2. 使用返回的 `accessToken` 调用 `POST /api/articles/publish`
3. 收到 `401` 时重新签发一次并重试一次

推荐先调用 `GET /api/articles/publish/spec` 获取机器可读约束和当前启用栏目。

## 3. 规格接口

- 方法：`GET`
- 路径：`/api/articles/publish/spec`
- 认证：当前实现无需登录态

可获取的信息包括：

- 发布接口路径和方法
- Bearer JWT 鉴权要求
- Token 签发接口路径和 Basic 鉴权要求
- 当前 `issuer`、`audience`、`ttlSeconds`、`maxTtlSeconds`
- 当前启用栏目 `supportedChannels`

对接新系统时，建议启动前先读取一次该接口，动态同步约束。

## 4. Token 签发接口

### 4.1 基本信息

- 方法：`POST`
- 路径：`/api/articles/publish/token`
- Header：`Authorization: Basic base64(clientId:clientSecret)`
- Header：`Content-Type: application/json`

### 4.2 请求体

```json
{
  "userId": "100002013029",
  "ttlSeconds": 300
}
```

字段说明：

- `userId`：必填，`string`，长度 `1-64`
- `ttlSeconds`：可选，`integer`，最小 `1`，最大值以规格接口或服务端配置为准

### 4.3 成功响应

状态码：`201`

```json
{
  "tokenType": "Bearer",
  "accessToken": "<jwt>",
  "expiresIn": 300,
  "issuedAt": 1760000000,
  "expiresAt": 1760000300,
  "issuer": "ai_web_publish",
  "audience": "ai_web_articles",
  "subject": "100001",
  "kid": "v1",
  "algorithm": "RS256",
  "issueResult": {
    "acceptedUserId": "100002013029",
    "acceptedClientId": "workbuddy"
  }
}
```

说明：

- 后续发布时应使用 `accessToken`
- `subject` 即 JWT 的 `sub`
- `issuedAt`、`expiresAt` 为秒级 Unix 时间戳

### 4.4 常见失败

- `400`：参数错误或 `ttlSeconds` 超限
- `401`：Basic 凭据无效
- `403`：`userId` 不在允许列表
- `500`：服务端签发配置错误

## 5. 文章发布接口

### 5.1 基本信息

- 方法：`POST`
- 路径：`/api/articles/publish`
- Header：`Authorization: Bearer <jwt>`
- Header：`Content-Type: application/json`

### 5.2 请求示例

```json
{
  "userId": "100002013029",
  "article": {
    "title": "高校医学 AI 课程改革观察",
    "channelCode": "edu-plus-ai",
    "originalUrl": "https://news.example.edu/article/ai-course-reform",
    "tags": ["课程改革", "医学教育"],
    "status": "draft",
    "layout": {
      "lead": "本期聚焦医学教育与 AI 的结合。",
      "sections": [
        {
          "heading": "课程设计",
          "body": ["加强案例驱动。", "补充工具实训。"],
          "highlights": ["教学场景", "课程资源"]
        }
      ],
      "conclusion": "建议结合院校现状分阶段推进。"
    }
  }
}
```

### 5.3 `article` 字段

- `title`：必填，`string`，`1-180`
- `channelCode`：可选，`string`，`1-64`
- `category`：可选，`string`，`1-120`
- `tags`：可选，`string[]`，最多 `20` 项，每项 `1-40`
- `status`：可选，仅允许 `draft`，默认 `draft`
- `summary`：可选，`string`，`1-400`
- `content`：可选，`string`
- `originalUrl`：可选，`string`，合法 URL，最大 `1000`
- `layout`：可选，`object`
- `authorName`：可选，`string`，`1-80`，来源信息源名称，如教育部、“中国医学教育网”等

### 5.4 组合约束

- `content` 与 `layout` 至少提供一个
- `channelCode` 与 `category` 至少提供一个
- 若同时提供 `channelCode` 和 `category`，以 `channelCode` 为准
- 若同时提供 `layout` 和 `content`，服务端以 `layout` 渲染结果作为最终正文
- `originalUrl` 用于记录文章来源原始链接，详情页“原文链接”即使用该字段
- `userId` 必须与 Bearer JWT 的 `sub` 完全一致

推荐优先传 `channelCode`，不要长期依赖 `category` 兼容映射。

## 6. `layout` 排版规则

当传入 `layout` 时，服务端会自动渲染正文：

1. `lead` 作为开场段落
2. `sections[].heading` 渲染为二级标题
3. `sections[].body` 按自然段展开
4. `sections[].highlights` 渲染为无序列表
5. `conclusion` 渲染为“总结”章节

`layout` 结构如下：

```json
{
  "lead": "导语",
  "sections": [
    {
      "heading": "章节标题",
      "body": ["段落1", "段落2"],
      "highlights": ["要点1", "要点2"]
    }
  ],
  "conclusion": "结语"
}
```

字段限制：

- `lead`：可选，`1-1200`
- `sections`：必填，`1-20`
- `sections[].heading`：可选，`1-80`
- `sections[].body`：必填，`1-8` 项，每项 `1-1200`
- `sections[].highlights`：可选，最多 `8` 项，每项 `1-300`
- `conclusion`：可选，`1-1200`

## 7. 栏目传参建议

推荐直接读取规格接口中的 `supportedChannels`，并传递其中的 `code` 作为 `channelCode`。

`supportedChannels` 来自服务端 `article_channels` 表中 `enabled=true` 的实时数据，不应在调用方硬编码。

当前系统默认初始化栏目包括：

- `daily-ai-summary`
- `policy-ethics`
- `medical-frontier`
- `campus-news`
- `edu-plus-ai`
- `tools-recommend`
- `student-zone`

若只传 `category`，服务端仅对少量中文名称做兼容映射；未命中映射时会返回 `400`。

## 8. 成功响应

状态码：`201`

```json
{
  "article": {
    "id": "uuid",
    "createdByUserId": "100001",
    "title": "高校医学 AI 课程改革观察",
    "summary": "本期聚焦医学教育与 AI 的结合。",
    "content": "排版后的正文",
    "originalUrl": "https://news.example.edu/article/ai-course-reform",
    "channelCode": "edu-plus-ai",
    "channelName": "AI+医学教育",
    "category": "AI+医学教育",
    "tags": ["课程改革", "医学教育"],
    "status": "draft",
    "author": "agent:100001",
    "createdAt": "2026-04-12T00:00:00.000Z",
    "updatedAt": "2026-04-12T00:00:00.000Z"
  },
  "publishResult": {
    "acceptedUserId": "100001",
    "acceptedKid": "v1",
    "renderedBy": "layout"
  }
}
```

说明：

- `article.category` 为最终栏目名称
- 外部推送创建的文章固定为草稿，不会直接写入 `publishedAt`
- `publishResult.renderedBy` 取值为 `layout` 或 `plain-content`
- 未传 `summary` 时，服务端会自动根据最终正文生成摘要
- 若传入 `originalUrl`，响应中的 `article.originalUrl` 会原样返回
- `article.channelName` 来自 `article_channels` 关联结果，`article.category` 返回最终栏目名称（兼容历史数据时可能回退为旧 `category`）

## 9. JWT 使用要求

JWT 必须满足：

- 算法为 `RS256`
- 包含 `iss`、`aud`、`sub`、`iat`、`exp`
- `sub` 与请求体 `userId` 完全一致
- `exp` 未过期

虽然服务端存在 `kid` 未命中时的回退验签逻辑，但调用方仍应始终使用服务端签发的完整 Token，不要自行改写 Header 或 Payload。

## 10. 错误处理建议

### 10.1 常见状态码

- `400`：参数错误、缺少正文、缺少栏目标识、栏目不可用
- `401`：Basic 凭据无效、Bearer Token 缺失或失效
- `403`：`userId` 无权限
- `500`：服务端配置错误

### 10.2 推荐重试策略

1. 签发接口返回 `401` 时，不自动重试，先检查 `clientId`、`clientSecret`
2. 发布接口返回 `401` 时，重新签发一次 Token 后重试一次
3. 发布接口返回 `400` 或 `403` 时，直接修正请求，不做盲目重试
4. 发布接口返回 `500` 时，联系服务端管理员排查配置

## 11. 最小接入清单

对接前至少准备：

- 服务端 `baseUrl`
- `clientId`
- `clientSecret`
- 业务 `userId`
- 可用 `channelCode`

建议实现：

- Token 缓存
- `401` 自动重签
- 发布前读取或缓存 `supportedChannels`
- 业务侧请求日志和错误日志
